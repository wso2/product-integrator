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

import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "fs";
import * as os from "os";
import * as path from "path";
import { dirname } from "path";
import {
	WICommandIds,
	type ContextItem,
	type ICmdParamsBase,
	type ICreateDirCtxCmdParams,
	type Organization,
	type Project,
	type UserInfo,
	getComponentKindRepoSource,
	parseGitURL,
} from "@wso2/wso2-platform-core";
import * as yaml from "js-yaml";
import { type ExtensionContext, ProgressLocation, Uri, commands, window, workspace } from "vscode";
import { ext } from '../../extensionVariables';
import { getGitRemotes, getGitRoot } from "../git/util";
import { initGit } from "../git/main";
import { contextStore, getContextKey, waitForContextStoreToLoad } from "../stores/context-store";
import { webviewStateStore } from "../stores/webview-state-store";
import { convertFsPathToUriPath, isSubpath, openDirectory } from '../../utils';
import { getUserInfoForCmd, isRpcActive, selectOrg, selectProjectWithCreateNew, setExtensionName } from "./cmd-utils";

export function createDirectoryContextCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.CreateDirectoryContext, async (params: ICreateDirCtxCmdParams) => {
			setExtensionName(params?.extName);
			const extensionName = webviewStateStore.getState().state.extensionName;
			try {
				isRpcActive(ext);
				const userInfo = await getUserInfoForCmd(`link a directory with a ${extensionName} project`);
				let gitRoot: string | undefined = "";
				if (userInfo) {
					let directoryUrl: Uri;
					if (!workspace.workspaceFile && workspace.workspaceFolders?.length === 1) {
						try {
							gitRoot = await getGitRoot(context, workspace.workspaceFolders[0].uri?.fsPath);
						} catch (err) {
							// ignore error
						}
					}

					if (gitRoot) {
						directoryUrl = Uri.parse(convertFsPathToUriPath(gitRoot));
					} else if (params?.fsPath) {
						directoryUrl = Uri.parse(convertFsPathToUriPath(params.fsPath));
					} else {
						const componentDir = await window.showOpenDialog({
							canSelectFolders: true,
							canSelectFiles: false,
							canSelectMany: false,
							title: `Select directory that needs to be linked with ${extensionName}`,
							defaultUri: workspace.workspaceFolders?.[0]?.uri || Uri.file(os.homedir()),
						});

						if (componentDir === undefined || componentDir.length === 0) {
							throw new Error(`Directory is required to link with ${extensionName}`);
						}

						directoryUrl = componentDir[0];
					}

					try {
						gitRoot = await getGitRoot(context, directoryUrl.fsPath);
					} catch {
						// ignore error
					}
					if (!gitRoot) {
						if (params?.fsPath) {
							const git = await initGit(context);
							await git?.init(params?.fsPath);
							gitRoot = params?.fsPath;
						} else {
							throw new Error("Selected directory is not within a git repository");
						}
					}

					const selectedOrg = await selectOrg(userInfo, "Select organization");

					const { projectList, selectedProject } = await selectProjectWithCreateNew(
						selectedOrg,
						`Loading projects from '${selectedOrg.name}'`,
						`Select project from '${selectedOrg.name}'`,
					);

					await window.withProgress({ title: `Switching to organization ${selectedOrg.name}...`, location: ProgressLocation.Notification }, () =>
						ext?.clients?.rpcClient?.changeOrgContext(selectedOrg?.id?.toString()!),
					);

					if (!params || !params?.skipComponentExistCheck) {
						const remotes = await getGitRemotes(context, gitRoot);
						if (remotes.length === 0) {
							throw new Error("The Selected directory does not have any Git remotes");
						}
						const components = await window.withProgress(
							{
								title: `Fetching ${ext.terminologies?.componentTermPlural} of project ${selectedProject.name}...`,
								location: ProgressLocation.Notification,
							},
							() =>
								ext?.clients?.rpcClient?.getComponentList({
									orgId: selectedOrg?.id?.toString(),
									orgHandle: selectedOrg.handle,
									projectHandle: selectedProject.handler,
									projectId: selectedProject.id,
								}),
						);

						if (components.length > 0) {
							// Check if user is trying to link with the correct Git directory
							const hasMatchingRemote = components.some((componentItem) => {
								const repoUrl = getComponentKindRepoSource(componentItem.spec.source).repo;
								const parsedRepoUrl = parseGitURL(repoUrl);
								if (parsedRepoUrl) {
									const [repoOrg, repoName, repoProvider] = parsedRepoUrl;
									return remotes.some((remoteItem) => {
										const parsedRemoteUrl = parseGitURL(remoteItem.fetchUrl);
										if (parsedRemoteUrl) {
											const [repoRemoteOrg, repoRemoteName, repoRemoteProvider] = parsedRemoteUrl;
											return repoOrg === repoRemoteOrg && repoName === repoRemoteName && repoRemoteProvider === repoProvider;
										}
									});
								}
							});

							if (!hasMatchingRemote) {
								const resp = await window.showInformationMessage(
									"The selected directory does not have any Git remotes that match with the repositories associated with the selected project. Do you wish to continue?",
									{ modal: true },
									"Continue",
								);
								if (resp !== "Continue") {
									return;
								}
							}
						}
					}

					const contextFilePath = updateContextFile(gitRoot, userInfo, selectedProject, selectedOrg, projectList);

					const isWithinWorkspace = workspace.workspaceFolders?.some((item) => isSubpath(item.uri?.fsPath, gitRoot!));

					if (isWithinWorkspace || params?.fsPath) {
						contextStore.getState().refreshState();
						await waitForContextStoreToLoad();

						contextStore.getState().onSetNewContext(selectedOrg, selectedProject, {
							contextFileFsPath: contextFilePath,
							dirFsPath: directoryUrl.fsPath,
							workspaceName: path.basename(gitRoot),
							projectRootFsPath: path.dirname(path.dirname(contextFilePath)),
						});
					} else {
						ext.context.globalState.update("open-local-repo", getContextKey(selectedOrg, selectedProject));
						openDirectory(gitRoot, "Where do you want to open the project directory?");
					}
				}
			} catch (err: any) {
				console.error(`Failed to link directory with ${extensionName} project`, err);
				window.showErrorMessage(`Failed to link directory with ${extensionName} project. ${err?.message}`);
			}
		}),
	);
}

export const updateContextFile = (
	gitRoot: string,
	userInfo: UserInfo,
	selectedProject: Project,
	selectedOrg: Organization,
	projectList: Project[],
) => {
	const wso2ContextPath = path.join(gitRoot, ".wso2", "context.yaml");
	const choreoContextPath = path.join(gitRoot, ".choreo", "context.yaml");
	const contextFilePath = existsSync(wso2ContextPath) ? wso2ContextPath
		: existsSync(choreoContextPath) ? choreoContextPath
			: wso2ContextPath;
	if (existsSync(contextFilePath)) {
		let parsedData: ContextItem[] = yaml.load(readFileSync(contextFilePath, "utf8")) as any;
		if (!Array.isArray(parsedData) && (parsedData as any)?.org && (parsedData as any)?.project) {
			parsedData = [{ org: (parsedData as any).org, project: (parsedData as any).project }];
		}

		const newList = parsedData.filter(
			(item) =>
				userInfo.organizations.some((org) => org.handle === item.org) ||
				(item.org === selectedOrg.handle && projectList.some((project) => project.handler === item.project)),
		);
		if (!newList.some((item) => item.org === selectedOrg.handle && item.project === selectedProject.handler)) {
			newList.push({ org: selectedOrg.handle, project: selectedProject.handler });
		}
		writeFileSync(contextFilePath, yaml.dump(newList));
	} else {
		const wso2Dir = path.join(gitRoot, ".wso2");
		if (!existsSync(wso2Dir)) {
			mkdirSync(wso2Dir);
		}
		const contextYamlData: ContextItem[] = [{ org: selectedOrg.handle, project: selectedProject.handler }];
		writeFileSync(path.join(wso2Dir, "context.yaml"), yaml.dump(contextYamlData));
	}

	return contextFilePath;
};

export const removeContext = (selectedProject: Project, selectedOrg: Organization, projectRootsFsPaths: string[]) => {
	for (const projectRootPath of projectRootsFsPaths) {
		const wso2ContextPath = path.join(projectRootPath, ".wso2", "context.yaml");
		const contextFilePath = existsSync(wso2ContextPath) ? wso2ContextPath : path.join(projectRootPath, ".choreo", "context.yaml");
		if (existsSync(contextFilePath)) {
			let parsedData: ContextItem[] = yaml.load(readFileSync(contextFilePath, "utf8")) as any;
			if (!Array.isArray(parsedData) && (parsedData as any)?.org && (parsedData as any)?.project) {
				parsedData = [{ org: (parsedData as any).org, project: (parsedData as any).project }];
			}

			const newList = parsedData.filter((item) => item.project !== selectedProject.handler && item.org !== selectedOrg.handle);
			if (newList.length > 0) {
				writeFileSync(contextFilePath, yaml.dump(newList));
			} else {
				unlinkSync(contextFilePath);
				const choreoDirPath = dirname(contextFilePath);
				const choreoDirFiles = readdirSync(choreoDirPath);
				if (choreoDirFiles.length === 0) {
					rmdirSync(choreoDirPath);
				}
			}
		}
	}
};
