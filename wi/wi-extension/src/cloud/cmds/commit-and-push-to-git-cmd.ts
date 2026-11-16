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

import type { DirectoryIntegration } from "@wso2/wso2-cloud-client";
import { type ICommitAndPushCmdParams, WICommandIds } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, type QuickPickItem, commands, window } from "vscode";
import { ext } from "../../extensionVariables";
import { handleCloudError } from "../platform/error-handler";
import { delay, isSamePath } from "../../utils";
import { initGit } from "../git/main";
import { hasDirtyRepo } from "../git/util";
import { contextStore } from "../stores/context-store";
import { isPlatformReady, requireSession, setExtensionName } from "./cmd-utils";

export function commitAndPushToGitCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.CommitAndPushToGit, async (params: ICommitAndPushCmdParams) => {
			setExtensionName(params?.extName);
			try {
				isPlatformReady(ext);
				const session = await requireSession("commit and push changes to Git");
				if (!session) {
					return;
				}
				const selected = contextStore.getState().state.selected;
				if (!selected) {
					throw new Error("project is not associated with a component directory");
				}
				const integrations = contextStore.getState().state?.integrations ?? [];
				if (integrations.length === 0) {
					throw new Error(`No ${ext.terminologies?.componentTermPlural} in this workspace`);
				}

				const pickIntegration = async (items: DirectoryIntegration[]) => {
					const picks: (QuickPickItem & { item?: DirectoryIntegration })[] = items.map((item) => ({ label: item.integration.displayName || item.integration.name, item }));
					const choice = await window.showQuickPick(picks, {
						title: `Multiple ${ext.terminologies?.componentTermPlural} detected. Please select ${ext.terminologies?.articleComponentTerm} to push`,
					});
					return choice?.item;
				};

				let selectedIntegration: DirectoryIntegration | undefined;
				if (params?.componentPath) {
					const matching = integrations.filter((item) => isSamePath(item.fsPath, params.componentPath!));
					selectedIntegration = matching.length === 1 ? matching[0] : await pickIntegration(matching.length > 1 ? matching : integrations);
				} else {
					selectedIntegration = await pickIntegration(integrations);
				}
				if (!selectedIntegration) {
					throw new Error(`Failed to select ${ext.terminologies?.componentTerm} to be pushed to remote`);
				}

				if (!(await hasDirtyRepo(selectedIntegration.fsPath, ext.context))) {
					window.showErrorMessage("There are no new changes to push to cloud");
					return;
				}

				const newGit = await initGit(ext.context);
				if (!newGit) {
					throw new Error("failed to initGit");
				}
				const dotGit = await newGit.getRepositoryDotGit(selectedIntegration.fsPath);
				const repoRoot = await newGit.getRepositoryRoot(selectedIntegration.fsPath);
				const repo = newGit.open(repoRoot, dotGit);

				const remotes = await window.withProgress({ title: "Fetching remotes of the repo...", location: ProgressLocation.Notification }, () => repo.getRemotes());
				if (remotes.length === 0) {
					window.showErrorMessage("No remotes found within the directory");
					return;
				}

				let matchingRemote = remotes.find((item) => {
					if (item.pushUrl) {
						try {
							return !!new URL(item.pushUrl).password;
						} catch {
							return false; // an SSH remote (git@host:owner/repo.git) carries no password
						}
					}
					return false;
				});
				// Earlier versions could leave the cloud editor's remote behind, credentials and all; it goes after this push too.
				let addedRemote: string | undefined = remotes.some((item) => item.name === CLOUD_EDITOR_REMOTE) ? CLOUD_EDITOR_REMOTE : undefined;
				try {
					const httpsRemote = httpUrlOf(remotes[0]?.fetchUrl);
					if (!matchingRemote && httpsRemote && ext.isDevantCloudEditor) {
						// The cloud editor has no credential helper; ask, push through a remote that carries
						// the credentials, and take that remote away again below so nothing stays in .git/config.
						// An SSH remote needs none of this: it is pushed to as it is.
						const urlObj = httpsRemote;
						await enrichGitUsernamePassword(urlObj);
						await window.withProgress({ title: "Setting new remote...", location: ProgressLocation.Notification }, async () => {
							addedRemote = CLOUD_EDITOR_REMOTE;
							await repo.addRemote(CLOUD_EDITOR_REMOTE, urlObj.href);
							const refreshed = await repo.getRemotes();
							matchingRemote = refreshed.find((item) => item.name === CLOUD_EDITOR_REMOTE);
						});
					}

					await window.withProgress({ title: "Adding changes to be committed...", location: ProgressLocation.Notification }, async () => {
						await repo.add(["."]);
					});

					const commitMessage = await window.showInputBox({
						placeHolder: "Message to describe the changes done to your integration",
						title: "Enter commit message",
						validateInput: (val) => (val ? null : "Commit message is required"),
					});
					if (!commitMessage) {
						window.showErrorMessage("Commit message is required in order to proceed");
						return;
					}

					const headRef = await window.withProgress({ title: "Fetching remote repo metadata...", location: ProgressLocation.Notification }, async () => {
						await repo.fetch({ silent: true, remote: matchingRemote?.name });
						await repo.commit(commitMessage);
						await delay(500);
						return repo.getHEADRef();
					});

					if (headRef?.ahead && (headRef?.behind === 0 || headRef?.behind === undefined)) {
						await window.withProgress({ title: "Pushing changes to remote repository...", location: ProgressLocation.Notification }, () => repo.push(matchingRemote?.name));
						window.showInformationMessage("Your changes have been successfully pushed to cloud");
					} else {
						await commands.executeCommand("git.sync");
					}
				} finally {
					if (addedRemote) {
						await repo.removeRemote(addedRemote).catch((error: unknown) => ext.logError("Could not remove the temporary remote", error as Error));
					}
				}
			} catch (err) {
				ext.logError("Failed to push to remote", err as Error);
				handleCloudError(err, "Failed to push to remote");
			}
		}),
	);
}

/**
 * Fills a clone URL's credentials in, asking the person. The platform's git
 * integration mints no push tokens for the editor (its `/build-secret` route
 * is refused by design), so there is nothing to ask the platform for.
 */
/** The remote the cloud editor pushes through; it carries credentials and lives for one push. */
const CLOUD_EDITOR_REMOTE = "cloud-editor-remote";

export const enrichGitUsernamePassword = async (urlObj: URL) => {
	if (!urlObj.username) {
		const username = await window.showInputBox({
			title: "Git Username",
			ignoreFocusOut: true,
			placeHolder: "username",
			validateInput: (val) => (val ? null : "Git username is required"),
		});
		if (!username) {
			throw new Error("Git username is required");
		}
		urlObj.username = username;
	}
	if (!urlObj.password) {
		const password = await window.showInputBox({
			title: "Git Password or Token",
			ignoreFocusOut: true,
			placeHolder: "password",
			password: true,
			validateInput: (val) => (val ? null : "Git password is required"),
		});
		if (!password) {
			throw new Error("Git password is required");
		}
		urlObj.password = password;
	}
};

/** `url` as a URL when it is an http(s) one; an SSH remote (git@host:owner/repo.git) and anything else answer undefined. */
function httpUrlOf(url: string | undefined): URL | undefined {
	if (!url) {
		return undefined;
	}
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : undefined;
	} catch {
		return undefined;
	}
}
