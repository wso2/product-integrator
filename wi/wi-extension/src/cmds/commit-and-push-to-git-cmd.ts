/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import {
	WICommandIds,
	type ComponentKind,
	type ContextStoreComponentState,
	GitProvider,
	type ICommitAndPushCmdParams,
	type Organization,
	parseGitURL,
} from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, type QuickPickItem, Uri, commands, env, window, workspace } from "vscode";
import { ext } from "../extensionVariables";
import { initGit } from "../git/main";
import { hasDirtyRepo } from "../git/util";
import { contextStore } from "../stores/context-store";
import { webviewStateStore } from "../stores/webview-state-store";
import { delay, isSamePath } from "../utils";
import { getUserInfoForCmd, isRpcActive, setExtensionName } from "./cmd-utils";

export function commitAndPushToGitCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.CommitAndPushToGit, async (params: ICommitAndPushCmdParams) => {
			setExtensionName(params?.extName);
			try {
				isRpcActive(ext);
				const userInfo = await getUserInfoForCmd("commit and push changes to Git");
				if (userInfo) {
					const selected = contextStore.getState().state.selected;
					if (!selected) {
						throw new Error("project is not associated with a component directory");
					}

					let selectedComp: ContextStoreComponentState | undefined;
					const getSelectedComponent = async (items: ContextStoreComponentState[]) => {
						const componentItems: (QuickPickItem & { item?: ContextStoreComponentState })[] = items.map((item) => ({
							label: item?.component?.metadata?.displayName!,
							item: item,
						}));
						const selectedComp = await window.showQuickPick(componentItems, {
							title: `Multiple ${ext.terminologies?.componentTermPlural} detected. Please select ${ext.terminologies?.articleComponentTerm} to push`,
						});
						return selectedComp?.item;
					};

					if (contextStore.getState().state?.components?.length === 0) {
						throw new Error(`No ${ext.terminologies?.componentTermPlural} in this workspace`);
					}

					if (params?.componentPath) {
						const matchingComponent = contextStore
							.getState()
							.state?.components?.filter((item) => isSamePath(item.componentFsPath, params?.componentPath));
						if (matchingComponent?.length === 0) {
							selectedComp = await getSelectedComponent(contextStore.getState().state?.components!);
						} else if (matchingComponent?.length === 1) {
							selectedComp = matchingComponent[0];
						} else if (matchingComponent && matchingComponent?.length > 1) {
							selectedComp = await getSelectedComponent(matchingComponent);
						}
					} else {
						selectedComp = await getSelectedComponent(contextStore.getState().state?.components!);
					}

					if (!selectedComp) {
						throw new Error(`Failed to select ${ext.terminologies?.componentTerm} to be pushed to remote`);
					}

					const haveChanges = await hasDirtyRepo(selectedComp.componentFsPath, ext.context, ["context.yaml"]);
					if (!haveChanges) {
						window.showErrorMessage("There are no new changes to push to cloud");
						return;
					}

					const newGit = await initGit(ext.context);
					if (!newGit) {
						throw new Error("failed to initGit");
					}
					const dotGit = await newGit?.getRepositoryDotGit(selectedComp.componentFsPath);
					const repoRoot = await newGit?.getRepositoryRoot(selectedComp.componentFsPath);
					const repo = newGit.open(repoRoot, dotGit);

					const remotes = await window.withProgress({ title: "Fetching remotes of the repo...", location: ProgressLocation.Notification }, () =>
						repo.getRemotes(),
					);

					if (remotes.length === 0) {
						window.showErrorMessage("No remotes found within the directory");
						return;
					}

					let matchingRemote = remotes.find((item) => {
						if (item.pushUrl) {
							const urlObj = new URL(item.pushUrl);
							if (urlObj.password) {
								return true;
							}
						}
					});

					if (!matchingRemote && remotes[0].fetchUrl) {
						const repoUrl = remotes[0].fetchUrl;
						const parsed = parseGitURL(repoUrl);
						if (parsed) {
							const [repoOrg, repoName, provider] = parsed;
							const urlObj = new URL(repoUrl);
							await enrichGitUsernamePassword(
								selected.org!,
								repoOrg,
								repoName,
								provider,
								urlObj,
								repoUrl,
								selectedComp.component?.spec?.source?.secretRef || "",
							);
							await window.withProgress({ title: "Setting new remote...", location: ProgressLocation.Notification }, async () => {
								await repo.addRemote("cloud-editor-remote", urlObj.href);
								const remotes = await repo.getRemotes();
								matchingRemote = remotes.find((item) => item.name === "cloud-editor-remote");
							});
						}
					}

					await window.withProgress({ title: "Adding changes to be committed...", location: ProgressLocation.Notification }, async () => {
						await repo.add(["."]);
					});

					const commitMessage = await window.showInputBox({
						placeHolder: "Message to describe the changes done to your integration",
						title: "Enter commit message",
						validateInput: (val) => {
							if (!val) {
								return "Commit message is required";
							}
							return null;
						},
					});

					if (!commitMessage) {
						window.showErrorMessage("Commit message is required in order to proceed");
						return;
					}

					const headRef = await window.withProgress(
						{ title: "Fetching remote repo metadata...", location: ProgressLocation.Notification },
						async () => {
							await repo.fetch({ silent: true, remote: matchingRemote?.name });
							await repo.commit(commitMessage);
							await delay(500);
							return repo.getHEADRef();
						},
					);

					if (headRef?.ahead && (headRef?.behind === 0 || headRef?.behind === undefined)) {
						await window.withProgress({ title: "Pushing changes to remote repository...", location: ProgressLocation.Notification }, () =>
							repo.push(matchingRemote?.name),
						);
						window.showInformationMessage("Your changes have been successfully pushed to cloud");
					} else {
						await commands.executeCommand("git.sync");
					}
				}
			} catch (err: any) {
				console.error("Failed to push to remote", err);
				window.showErrorMessage(err?.message || "Failed to push to remote");
			}
		}),
	);
}

export const enrichGitUsernamePassword = async (
	org: Organization,
	repoOrg: string,
	repoName: string,
	provider: string,
	urlObj: URL,
	fetchUrl: string,
	secretRef: string,
) => {
	if (ext.isDevantCloudEditor && provider === GitProvider.GITHUB && !urlObj.password) {
		try {
			ext.log(`Fetching PAT for org ${repoOrg} and repo ${repoName}`);
			const gitPat = await window.withProgress(
				{ title: `Accessing the repository ${repoOrg}/${repoName}...`, location: ProgressLocation.Notification },
				() =>
					ext.clients.rpcClient.getGitTokenForRepository({
						orgId: org?.id?.toString()!,
						gitOrg: repoOrg,
						gitRepo: repoName,
						secretRef: secretRef,
					}),
			);
			urlObj.username = gitPat.username || "x-access-token";
			urlObj.password = gitPat.token;
		} catch {
			ext.log(`Failed to get token for ${fetchUrl}`);
		}
	}

	if (!urlObj.username) {
		const username = await window.showInputBox({
			title: "Git Username",
			ignoreFocusOut: true,
			placeHolder: "username",
			validateInput: (val) => {
				if (!val) {
					return "Git username is required";
				}
				return null;
			},
		});
		if (!username) {
			throw new Error("Git username is required");
		}
		urlObj.username = username;
	}
	if (!urlObj.password) {
		const password = await window.showInputBox({
			title: "Git Password",
			ignoreFocusOut: true,
			placeHolder: "password",
			password: true,
			validateInput: (val) => {
				if (!val) {
					return "Git password is required";
				}
				return null;
			},
		});
		if (!password) {
			throw new Error("Git password is required");
		}
		urlObj.password = password;
	}
};
