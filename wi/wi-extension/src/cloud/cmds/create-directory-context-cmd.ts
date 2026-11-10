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

import * as os from "os";
import * as path from "path";
import type { Project } from "@wso2/wso2-cloud-client";
import { type ICreateDirCtxCmdParams, WICommandIds, parseGitURL } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, Uri, commands, window, workspace } from "vscode";
import { ext } from "../../extensionVariables";
import { convertFsPathToUriPath, isSubpath, openDirectory } from "../../utils";
import { linkContext } from "../context-file";
import { initGit } from "../git/main";
import { getGitRemotes, getGitRoot } from "../git/util";
import { handleCloudError } from "../platform/error-handler";
import { contextStore, getContextKey, repositoryUrlOf, waitForContextStoreToLoad } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import { webviewStateStore } from "../stores/webview-state-store";
import { isPlatformReady, requireSession, selectProjectWithCreateNew, setExtensionName } from "./cmd-utils";

export function createDirectoryContextCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.CreateDirectoryContext, async (params: ICreateDirCtxCmdParams) => {
			setExtensionName(params?.extName);
			const extensionName = webviewStateStore.getState().state.extensionName;
			try {
				isPlatformReady(ext);
				const session = await requireSession(`link a directory with a ${extensionName} project`);
				if (!session) {
					return;
				}
				let gitRoot: string | undefined = "";
				let directoryUrl: Uri;
				if (!workspace.workspaceFile && workspace.workspaceFolders?.length === 1) {
					try {
						gitRoot = await getGitRoot(context, workspace.workspaceFolders[0].uri?.fsPath);
					} catch {
						// not a git repository
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
					// not a git repository
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

				const { selectedProject } = await selectProjectWithCreateNew(`Loading projects from '${session.org.name}'`, `Select project from '${session.org.name}'`);

				if (!params?.skipComponentExistCheck) {
					const remotes = await getGitRemotes(context, gitRoot);
					if (remotes.length === 0) {
						throw new Error("The Selected directory does not have any Git remotes");
					}
					const cloud = ext.clients.platform.cloud;
					const integrations = await window.withProgress(
						{ title: `Fetching ${ext.terminologies?.componentTermPlural} of project ${selectedProject.name}...`, location: ProgressLocation.Notification },
						() => cloud.components.list(selectedProject.id),
					);
					dataCacheStore.getState().setIntegrations(session.org.handle, selectedProject.id, integrations);

					if (integrations.length > 0) {
						// Check whether the directory's remotes match any of the project's repositories.
						const repositories = await Promise.all(
							integrations.map((integration) => cloud.components.repository(integration.id, selectedProject.id).catch((): undefined => undefined)),
						);
						const hasMatchingRemote = repositories.some((repository) => {
							const parsedRepoUrl = parseGitURL(repositoryUrlOf(repository) ?? "");
							if (!parsedRepoUrl) {
								return false;
							}
							const [repoOrg, repoName, repoProvider] = parsedRepoUrl;
							return remotes.some((remote) => {
								const parsed = parseGitURL(remote.fetchUrl);
								return !!parsed && parsed[0] === repoOrg && parsed[1] === repoName && parsed[2] === repoProvider;
							});
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

				const contextFilePath = linkContext(gitRoot, { org: session.org.handle, project: selectedProject.id });
				const isWithinWorkspace = workspace.workspaceFolders?.some((item) => isSubpath(item.uri?.fsPath, gitRoot!));

				if (isWithinWorkspace || params?.fsPath) {
					contextStore.getState().refreshState();
					await waitForContextStoreToLoad();
					contextStore.getState().onSetNewContext(selectedProject, {
						contextFileFsPath: contextFilePath,
						dirFsPath: directoryUrl.fsPath,
						workspaceName: path.basename(gitRoot),
						projectRootFsPath: path.dirname(path.dirname(contextFilePath)),
					});
				} else {
					ext.context.globalState.update("open-local-repo", getContextKey(session.org.handle, selectedProject));
					openDirectory(gitRoot, "Where do you want to open the project directory?");
				}
			} catch (err) {
				ext.logError(`Failed to link directory with ${extensionName} project`, err as Error);
				handleCloudError(err, `Failed to link directory with ${extensionName} project.`);
			}
		}),
	);
}

/** Links a repository to a project, writing `.wso2/context.yaml`; answers the file's path. */
export const updateContextFile = (gitRoot: string, project: Project, env?: string): string => {
	const org = ext.authProvider?.org;
	if (!org) {
		throw new Error("Not signed in to WSO2 Cloud.");
	}
	return linkContext(gitRoot, { org: org.handle, project: project.id, env });
};
