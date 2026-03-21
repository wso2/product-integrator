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

import path, { join } from "path";
import {
	type ExtensionName,
	type ICloneProjectCmdParams,
	type Organization,
	type Project,
	type UserInfo,
	WICommandIds,
	getComponentKindRepoSource,
	type openClonedDirReq,
	parseGitURL,
} from "@wso2/wso2-platform-core";
import { ProgressLocation, type ProviderResult, type QuickPickItem, type Uri, commands, window, workspace } from "vscode";
import { ResponseError } from "vscode-jsonrpc";
import { ErrorCode } from "./choreo-cli-rpc/error-utils";
import { getUserInfoForCmd, isRpcActive } from "./cmds/cmd-utils";
import { updateContextFile } from "./cmds/create-directory-context-cmd";
import { ext } from "../extensionVariables";
import { getGitRemotes, getGitRoot } from "./git/util";
import { contextStore, getContextKey, waitForContextStoreToLoad } from "./stores/context-store";
import { dataCacheStore } from "./stores/data-cache-store";
import { locationStore } from "./stores/location-store";
import { webviewStateStore } from "./stores/webview-state-store";
import { isSamePath, openDirectory } from "../utils/pathUtils";
import { BridgeLayer } from "../BridgeLayer";

export function activateURIHandlers() {
	window.registerUriHandler({
		handleUri(uri: Uri): ProviderResult<void> {
			ext.log(`Handling URI: ${uri.toString()}`);
			const extName = webviewStateStore.getState().state.extensionName;

			if (uri.path === "/signin") {
				try {
					isRpcActive(ext);
					ext.log("WSO2 Integrator Login Callback hit");
					BridgeLayer.notifySignInInitiated();
					const urlParams = new URLSearchParams(uri.query);
					const authCode = urlParams.get("code");
					const region = urlParams.get("region") || "";
					if (authCode) {
						ext.log("Initiating WSO2 Integrator sign in flow from auth code");
						window.withProgress(
							{
								title: `Verifying user details and logging into ${ext.terminologies?.cloudName}...`,
								location: ProgressLocation.Notification,
							},
							async () => {
								try {
									const orgId = contextStore?.getState().state?.selected?.org?.id?.toString();
									let userInfo: UserInfo | undefined;
									if (extName === "Devant") {
										userInfo = await ext.clients.rpcClient.signInDevantWithAuthCode(authCode, region, orgId);
									} else {
										userInfo = await ext.clients.rpcClient.signInWithAuthCode(authCode, region, orgId);
									}
									if (userInfo) {
										if (contextStore?.getState().state?.selected) {
											const includesOrg = userInfo.organizations?.some((item) => item.handle === contextStore?.getState().state?.selected?.orgHandle);
											if (!includesOrg) {
												contextStore.getState().resetState();
											}
										}
										const region = await ext.clients.rpcClient.getCurrentRegion();
										await ext.authProvider?.getState().loginSuccess(userInfo, region);
										window.showInformationMessage(`Successfully signed into ${ext.terminologies?.cloudName}`);
									}
								} catch (error: any) {
									if (!(error instanceof ResponseError) || ![ErrorCode.NoOrgsAvailable, ErrorCode.NoAccountAvailable].includes(error.code)) {
										window.showErrorMessage("Sign in failed. Please check the logs for more details.");
									}
									ext.logError(`WSO2 Integrator sign in Failed: ${error.message}`, error as Error);
								}
							},
						);
					} else {
						ext.logError("WSO2 Integrator Login Failed: Authorization code not found!", new Error("No auth code"));
						window.showErrorMessage("WSO2 Integrator Login Failed: Authorization code not found!");
					}
				} catch (err: any) {
					console.error("Failed to handle /signin uri handler", err);
					window.showErrorMessage(err?.message || "Failed to handle /signin uri handler");
				}
			} else if (uri.path === "/ghapp") {
				try {
					isRpcActive(ext);
					ext.log("WSO2 Integrator Github auth Callback hit");
					const urlParams = new URLSearchParams(uri.query);
					const authCode = urlParams.get("code");
					const orgId = urlParams.get("orgId");
					if (authCode && orgId) {
						ext.clients.rpcClient.obtainGithubToken({ code: authCode, orgId });
					}
				} catch (err: any) {
					console.error("Failed to handle /ghapp uri handler", err);
					window.showErrorMessage(err?.message || "Failed to handle /ghapp uri handler");
				}
			} else if (uri.path === "/open") {
				try {
					isRpcActive(ext);
					const urlParams = new URLSearchParams(uri.query);
					const orgHandle = urlParams.get("org") || "";
					const projectHandle = urlParams.get("project") || "";
					const componentName = urlParams.get("component") || "";
					const technology = urlParams.get("technology") || "";
					const integrationType = urlParams.get("integrationType") || "";
					const integrationDisplayType = urlParams.get("integrationDisplayType") || "";
					openClonedDir({
						orgHandle,
						projectHandle,
						componentName,
						technology,
						integrationType,
						integrationDisplayType,
					});
				} catch (err: any) {
					console.error("Failed to handle /open uri handler", err);
					window.showErrorMessage(err?.message || "Failed to handle /open uri handler");
				}
			}
		},
	});
}

export const openClonedDir = async (params: openClonedDirReq) => {
	if (!params.orgHandle || !params.projectHandle) {
		return;
	}
	getUserInfoForCmd("open project").then(async (userInfo) => {
		const org = userInfo?.organizations.find((item) => item.handle === params.orgHandle);
		if (!org) {
			window.showErrorMessage(`Failed to find project organization for ${params.orgHandle}`);
			return;
		}
		const cacheProjects = dataCacheStore.getState().getProjects(params.orgHandle);
		let project = cacheProjects?.find((item) => item.handler === params.projectHandle);
		if (!project) {
			const projects = await window.withProgress(
				{ title: `Fetching projects of organization ${org.name}...`, location: ProgressLocation.Notification },
				() => ext.clients.rpcClient.getProjects(org.id.toString()),
			);
			project = projects?.find((item) => item.handler === params.projectHandle);
		}
		if (!project) {
			window.showErrorMessage(`Failed to find project for ${params.projectHandle}`);
			return;
		}

		await waitForContextStoreToLoad();

		await cloneOrOpenDir(org, project, params.componentName, params.technology, params.integrationType, params.integrationDisplayType);
	});
};

export const cloneOrOpenDir = async (
	org: Organization,
	project: Project,
	componentName: string | null,
	technology: string | null,
	integrationType: string | null,
	integrationDisplayType: string | null,
	extName?: ExtensionName,
) => {
	const projectLocations = locationStore.getState().getLocations(project.handler, org.handle);

	if (componentName) {
		const componentCache = dataCacheStore?.getState().getComponents(org.handle, project.handler);
		let matchingComp = componentCache?.find((item) => item.metadata.name === componentName);
		if (!matchingComp) {
			matchingComp = await window.withProgress(
				{ title: `Fetching ${ext.terminologies?.componentTerm} details...`, location: ProgressLocation.Notification },
				() => ext.clients.rpcClient.getComponentItem({ componentName, orgId: org.id.toString(), projectHandle: project.handler }),
			);
		}
		if (!matchingComp) {
			window.showErrorMessage(`Failed to find ${ext.terminologies?.componentTerm} matching ${componentName}`);
			return;
		}

		const selectedPaths = new Set<string>();
		const subDir = matchingComp?.spec?.source ? getComponentKindRepoSource(matchingComp?.spec?.source)?.path || "" : "";
		const repoUrl = getComponentKindRepoSource(matchingComp.spec.source).repo;
		const parsedRepoUrl = parseGitURL(repoUrl);
		if (parsedRepoUrl) {
			const [repoOrg, repoName, repoProvider] = parsedRepoUrl;
			for (const projectLocation of projectLocations) {
				if (projectLocation.componentItems.some((item) => item.component?.metadata?.name === componentName)) {
					const gitRoot = await getGitRoot(ext.context, projectLocation.fsPath);
					if (gitRoot) {
						const remotes = await getGitRemotes(ext.context, gitRoot);
						const hasMatchingRemote = remotes.some((remote) => {
							const parsedRemoteUrl = parseGitURL(remote.fetchUrl);
							if (parsedRemoteUrl) {
								const [remoteRepoOrg, remoteRepoName, remoteRepoProvider] = parsedRemoteUrl;
								return remoteRepoOrg === repoOrg && remoteRepoName === repoName && remoteRepoProvider === repoProvider;
							}
						});
						if (hasMatchingRemote) {
							selectedPaths.add(projectLocation.fsPath);
						}
					}
				}
			}
		}
		if (selectedPaths.size > 0) {
			const selectedPath = await getSelectedPath(Array.from(selectedPaths));
			if (selectedPath) {
				await switchContextAndOpenDir(join(selectedPath, subDir), org, project, matchingComp ? componentName : null);
			}
		} else {
			commands.executeCommand(WICommandIds.CloneProject, {
				organization: org,
				project,
				componentName,
				component: matchingComp,
				technology,
				integrationType,
				integrationDisplayType,
				extName,
			} as ICloneProjectCmdParams);
		}
	} else if (projectLocations.length > 0) {
		const selectedPath = await getSelectedPath(projectLocations.map((item) => item.fsPath));
		if (selectedPath) {
			await switchContextAndOpenDir(selectedPath, org, project);
		}
	} else {
		commands.executeCommand(WICommandIds.CloneProject, {
			organization: org,
			project,
			componentName,
			technology,
			integrationType,
			integrationDisplayType,
		} as ICloneProjectCmdParams);
	}
};

const switchContextAndOpenDir = async (selectedPath: string, org: Organization, project: Project, componentName?: string | null) => {
	const gitRoot = await getGitRoot(ext.context, selectedPath);
	if (!gitRoot) {
		window.showErrorMessage(`Failed to find Git root of ${selectedPath}`);
		return;
	}
	const projectCache = dataCacheStore.getState().getProjects(org?.handle);
	const userInfo = ext.authProvider?.getState().state.userInfo;
	if (!userInfo) {
		window.showErrorMessage("User information is not available. Please sign in and try again.");
		return;
	}
	const contextFilePath = updateContextFile(gitRoot, userInfo, project, org, projectCache);

	const isWithinWorkspace = workspace.workspaceFolders?.some((item) => isSamePath(item.uri?.fsPath, selectedPath));
	if (isWithinWorkspace) {
		if (
			contextStore.getState().state?.selected?.orgHandle === org.handle &&
			contextStore.getState().state?.selected?.projectHandle === project.handler
		) {
			window.showInformationMessage(
				`You are already within the ${componentName ? ext.terminologies?.componentTerm : "project"} directory`,
			);
		} else {
			const matching = contextStore.getState().state.items[getContextKey(org, project)];
			if (matching) {
				contextStore.getState().changeContext(matching);
			} else {
				contextStore.getState().refreshState();
				await waitForContextStoreToLoad();
				if (contextStore.getState().state?.selected?.orgHandle !== org.handle) {
					await window.withProgress({ title: `Switching to organization ${org.name}...`, location: ProgressLocation.Notification }, () =>
						ext?.clients?.rpcClient?.changeOrgContext(org?.id?.toString()!),
					);
				}

				contextStore.getState().onSetNewContext(org, project, {
					contextFileFsPath: contextFilePath,
					dirFsPath: selectedPath,
					workspaceName: path.basename(gitRoot),
					projectRootFsPath: path.dirname(path.dirname(contextFilePath)),
				});
			}
			window.showInformationMessage(`Switching to ${project.name} within organization ${org.name}`);
		}
	} else {
		ext.context.globalState.update("open-local-repo", getContextKey(org, project));
		openDirectory(
			selectedPath,
			`Where do you want to open the ${componentName ? ext.terminologies?.componentTerm : "project"} directory ${selectedPath} ?`,
		);
	}
};

const getSelectedPath = async (paths: string[]): Promise<string | undefined | null> => {
	if (paths.length === 0) {
		return null;
	}
	if (paths?.length === 1) {
		return paths[0];
	}
	const items: QuickPickItem[] = paths.map((item) => ({ label: item }));
	const directorySelection = await window.showQuickPick(items, { title: "Multiple directories detected", ignoreFocusOut: true });
	return directorySelection?.label;
};
