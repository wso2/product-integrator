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
import {
	WICommandIds,
	DevantScopes,
	getComponentKindRepoSource,
	parseGitURL,
	GitProvider,
	ICreateNewIntegrationCmdParams,
	makeURLSafe,
	ContextItem,
	UserInfo,
	Organization,
	Project,
} from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, Uri, commands, window, workspace } from "vscode";
import { ext } from "../../extensionVariables";
import { initGit } from "../git/main";
import { getGitRemotes, getGitRoot } from "../git/util";
import { contextStore, waitForContextStoreToLoad } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import { isSamePath, isSubpath } from "../../utils/pathUtils";
import { getUserInfoForCmd, isRpcActive, selectOrg, selectProjectWithCreateNew, setExtensionName } from "./cmd-utils";
import { updateContextFile } from "./create-directory-context-cmd";
import { WICloudSubmitComponentsReq, WICloudSubmitComponentsResp } from "@wso2/wi-core";
import { openCloudFormWebview } from "../../ws-managers/cloud/ws-manager";
import { ProjectType, StateMachine, stateService } from "../../stateMachine";
import { existsSync, readFileSync, writeFileSync } from "fs";
import * as yaml from "js-yaml";


const allIntegrationTypes = [
	DevantScopes.AUTOMATION,
	DevantScopes.AI_AGENT,
	DevantScopes.INTEGRATION_AS_API,
	DevantScopes.EVENT_INTEGRATION,
	DevantScopes.FILE_INTEGRATION,
];

export function createNewComponentCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.CreateNewComponent, async (params: ICreateNewIntegrationCmdParams) => {
			try {
				isRpcActive(ext);
				const userInfo = await getUserInfoForCmd(`Deploy Integration`);
				if (userInfo) {
					await waitForContextStoreToLoad();
					const selected = contextStore.getState().state.selected;
					let selectedProject = selected?.project;
					let selectedOrg = selected?.org;

					if (!selectedOrg || !selectedOrg) {
						const contextFileEntry = await createProjectFromContext(userInfo, params?.workspaceDir);
						selectedOrg = contextFileEntry?.org;
						selectedProject = contextFileEntry?.project;
					}

					if (!selectedOrg) {
						selectedOrg = await selectOrg(userInfo, "Select organization");
					}

					if (!selectedProject) {
						const createdProjectRes = await selectProjectWithCreateNew(
							selectedOrg,
							`Loading projects from '${selectedOrg.name}'`,
							`Select the project from '${selectedOrg.name}', to deploy the integration in`,
						);
						selectedProject = createdProjectRes.selectedProject;
					}

					let integrations = params?.integrations || [];
					let workspaceDir = params?.workspaceDir;
					let buildPackLang = params?.buildPackLang;
					if (!buildPackLang) {
						if (StateMachine.getContext().projectType === ProjectType.BI_BALLERINA) {
							buildPackLang = "ballerina";
						} else if (StateMachine.getContext().projectType === ProjectType.MI) {
							buildPackLang = "microintegrator";
						} else {
							throw new Error(`Please ensure that you are within a valid Ballerina or MI project to deploy an integration in the cloud`);
						}
					}

					if (ext.isDevantCloudEditor && params?.integrations?.length > 1) {
						// todo: need to add support for workspace deployments in cloud editor
						throw new Error(`Workspace deployments are not yet supported in the cloud editor. Please select individual integration to deploy.`);
					}

					if (!params?.workspaceDir || integrations.length === 0) {
						let defaultUri: Uri;
						if (workspace.workspaceFile && workspace.workspaceFile.scheme !== "untitled") {
							defaultUri = workspace.workspaceFile;
						} else if (workspace.workspaceFolders && workspace.workspaceFolders?.length > 0) {
							defaultUri = workspace.workspaceFolders[0].uri;
						} else {
							defaultUri = Uri.file(os.homedir());
						}
						const supPathUri = await window.showOpenDialog({
							canSelectFolders: true,
							canSelectFiles: false,
							canSelectMany: true,
							title: `Select integration directory`,
							defaultUri: defaultUri,
						});
						if (!supPathUri || supPathUri.length === 0) {
							throw new Error(`Integration directory selection is required`);
						}

						supPathUri.forEach(item => {
							integrations.push({
								fsPath: item.fsPath,
								name: path.basename(item.fsPath),
								supportedIntegrationTypes: allIntegrationTypes,
							})
						})

						workspaceDir = workspace.workspaceFolders?.find((folder) => isSubpath(folder.uri.fsPath, supPathUri[0].fsPath))?.uri.fsPath;
					}

					const components = await window.withProgress(
						{
							title: `Fetching integrations of cloud project ${selectedProject.name}...`,
							location: ProgressLocation.Notification,
						},
						() =>
							ext.clients.rpcClient.getComponentList({
								orgId: selectedOrg?.id?.toString()!,
								orgHandle: selectedOrg?.handle!,
								projectId: selectedProject?.id!,
								projectHandle: selectedProject?.handler!,
							}),
					);
					dataCacheStore.getState().setComponents(selectedOrg.handle, selectedProject.handler, components);

					let gitRoot: string | undefined;
					let isGitInitialized = false;
					try {
						gitRoot = await getGitRoot(context, workspaceDir);
						isGitInitialized = true;
					} catch (err) {
						// ignore error
					}

					// check if user already has a component in the same path
					let componentAlreadyExists = false;
					for (const componentItem of components) {
						if (gitRoot) {
							const remotes = await getGitRemotes(ext.context, gitRoot);
							const repoUrl = getComponentKindRepoSource(componentItem.spec.source).repo;
							const parsedRepoUrl = parseGitURL(repoUrl);
							if (parsedRepoUrl) {
								const [repoOrg, repoName, repoProvider] = parsedRepoUrl;
								const hasMatchingRemote = remotes.some((remoteItem) => {
									const parsedRemoteUrl = parseGitURL(remoteItem.fetchUrl);
									if (parsedRemoteUrl) {
										const [repoRemoteOrg, repoRemoteName, repoRemoteProvider] = parsedRemoteUrl;
										return repoOrg === repoRemoteOrg && repoName === repoRemoteName && repoRemoteProvider === repoProvider;
									}
								});

								if (hasMatchingRemote) {
									const subPathDir = path.join(gitRoot, getComponentKindRepoSource(componentItem.spec.source)?.path);
									if (integrations.some(item => isSamePath(subPathDir, item.fsPath))) {
										componentAlreadyExists = true;
										break;
									}
								}
							}
						}
					}

					if (componentAlreadyExists && gitRoot && selectedProject && selectedOrg) {
						const resp = await window.showInformationMessage(
							`An integration for the selected directory already exists within you project(${selectedProject?.name}). Do you want to proceed and create another integration?`,
							{ modal: true },
							"Proceed",
						);
						if (resp !== "Proceed") {
							const projectCache = dataCacheStore.getState().getProjects(selectedOrg?.handle);
							updateContextFile(gitRoot, ext.authProvider?.getState().state.userInfo!, selectedProject, selectedOrg, projectCache);
							contextStore.getState().refreshState();
							return;
						}
					}

					const isWithinWorkspace = workspace.workspaceFolders?.some((item) => integrations.every(int => isSubpath(item.uri?.fsPath, int.fsPath)));

					for (const integration of integrations) {
						let compInitialName = integration?.name || path.basename(integration.fsPath);
						compInitialName = makeURLSafe(compInitialName);
						const existingNames = components.map((c) => c.metadata?.name?.toLowerCase?.());
						const baseIntName = compInitialName;
						let counter = 1;
						while (existingNames.includes(compInitialName.toLowerCase())) {
							compInitialName = `${baseIntName}-${counter}`;
							counter++;
						}
						integration.name = compInitialName;
					}

					if (isWithinWorkspace || workspace.workspaceFile) {
						openCloudFormWebview({
							org: selectedOrg,
							project: selectedProject,
							workspaceFsPath: workspaceDir!,
							isNewCodeServerComp: !isGitInitialized && ext.isDevantCloudEditor,
							buildPackLang: buildPackLang!,
							integrations: integrations,
						})
					} else {
						throw new Error(`Selected directory is outside of the workspace. Please select a directory within the workspace to create the integration.`);
					}
				}
			} catch (err: any) {
				console.error(`Failed to deploy integration`, err);
				window.showErrorMessage(err?.message || "Failed to create component");
			}
		}),
	);
}

export const submitCreateComponentHandler = async ({ createParams, org, project, workspaceFsPath }: WICloudSubmitComponentsReq): Promise<WICloudSubmitComponentsResp> => {
	const totalCount = createParams.length;
	const result: WICloudSubmitComponentsResp = {
		created: [],
		failed: [],
		total: totalCount,
	};

	const newGit = await initGit(ext.context);
	const gitRoot = await newGit?.getRepositoryRoot(workspaceFsPath);
	const dotGit = await newGit?.getRepositoryDotGit(workspaceFsPath);
	const repo = newGit.open(gitRoot, dotGit);
	const head = await repo.getHEAD();

	// Show a single progress notification for the entire batch
	await window.withProgress(
		{
			title: `Verifying source in remote repo`,
			location: ProgressLocation.Notification,
			cancellable: false,
		},
		async (progress) => {
			for (let i = 0; i < totalCount; i++) {
				const createParam = createParams[i];
				const componentName = createParam.displayName || createParam.name;

				if (totalCount > 1) {
					// Update progress
					progress.report({
						message: `(${i + 1}/${totalCount}) ${componentName}`,
						increment: (100 / totalCount),
					});
				}

				const parsedGit = parseGitURL(createParam.repoUrl);
				if (!parsedGit) {
					throw new Error(`Failed to parse git URL: ${createParam.repoUrl}`);
				}
				const [repoOrg, repoName, repoProvider] = parsedGit;
				const subPathDir = path.relative(gitRoot!, createParam.componentDir);
				if (!ext.isDevantCloudEditor && repoProvider === GitProvider.GITHUB) {
					// This check is not needed in cloud editor, as we have pushed the changes to remote repo
					const repoMetadata = await ext.clients.rpcClient?.getGitRepoMetadata({
						branch: createParam.branch,
						gitOrgName: repoOrg,
						gitRepoName: repoName,
						orgId: org.id.toString(),
						relativePath: subPathDir,
						secretRef: createParam.gitCredRef,
					})
					if (subPathDir) {
						if (repoMetadata?.metadata?.isSubPathEmpty || !repoMetadata?.metadata?.isSubPathValid) {
							throw new Error(`The selected directory ${subPathDir} appears to be empty or invalid. Please push your changes to remote repo and try again.`);
						}
					} else if (repoMetadata?.metadata?.isBareRepo) {
						throw new Error(`The selected repository appears to be empty. Please push your changes to remote repo and try again.`);
					}

				}
			}
		},
	);

	// Show a single progress notification for the entire batch
	await window.withProgress(
		{
			title: totalCount === 1
				? `Creating integration '${createParams[0].displayName || createParams[0].name}'... `
				: `Creating ${totalCount} integrations... `,
			location: ProgressLocation.Notification,
			cancellable: false,
		},
		async (progress) => {
			for (let i = 0; i < totalCount; i++) {
				const createParam = createParams[i];
				const componentName = createParam.displayName || createParam.name;

				if (totalCount > 1) {
					// Update progress
					progress.report({
						message: `(${i + 1}/${totalCount}) ${componentName}`,
						increment: (100 / totalCount),
					});
				}

				try {
					const createdComponent = await ext.clients.rpcClient.createComponent(createParam);

					if (createdComponent?.metadata?.id) {
						result.created.push(createdComponent);

						// Update component cache
						const compCache = dataCacheStore.getState().getComponents(org.handle, project.handler);
						dataCacheStore.getState().setComponents(org.handle, project.handler, [createdComponent, ...compCache]);

						if (ext.isDevantCloudEditor && head?.name) {
							const commit = await repo.getCommit(head.name);
							try {
								await window.withProgress(
									{ title: "Updating cloud editor with newly created component...", location: ProgressLocation.Notification },
									() =>
										ext.clients.rpcClient.updateCodeServer({
											componentId: createdComponent.metadata.id,
											orgHandle: org.handle,
											orgId: org.id.toString(),
											orgUuid: org.uuid,
											projectId: project.id,
											sourceCommitHash: commit.hash,
										}),
								);
							} catch (err) {
								ext.logError("Failed to updated code server after creating the component", err as Error);
							}
						}
					} else {
						result.failed.push({ name: componentName, error: "Creation returned null" });
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					result.failed.push({ name: componentName, error: errorMessage });
					ext.logError(`Failed to create ${ext.terminologies?.componentTerm} ${componentName}:`, error as Error);
				}
			}
		},
	);

	if (result.created.length > 0) {
		if (ext.isDevantCloudEditor) {
			// Clear code server local storage data data
			try {
				await commands.executeCommand("devantEditor.clearLocalStorage");
			} catch (err) {
				ext.logError(`Failed to execute devantEditor.clearLocalStorage command: ${err}`, err as Error);
			}
		}

		const projectCache = dataCacheStore.getState().getProjects(org?.handle);
		updateContextFile(gitRoot, ext.authProvider?.getState().state.userInfo!, project, org, projectCache);
		contextStore.getState().refreshState();
	}

	if (result.failed?.length === 0 && result.created.length > 0) {
		let successMessage = "Successfully create integration in the cloud";
		if (result.created.length > 1) {
			successMessage = "Successfully created all integrations in the cloud";
		}

		const isWithinWorkspace = workspace.workspaceFolders?.some((item) => isSubpath(item.uri?.fsPath, workspaceFsPath));

		if (ext.isDevantCloudEditor) {
			// TODO: this will not work when creating multiple components in the cloud editor
			await ext.context.globalState.update("code-server-component-id", result.created[0]?.metadata?.id);
		}

		if (workspace.workspaceFile) {
			window.showErrorMessage("Please make sure newly created integrations are added to workspace.")
			// const workspaceContent: WorkspaceConfig = JSON.parse(readFileSync(workspace.workspaceFile.fsPath, "utf8"));
			// workspaceContent.folders = [
			// 	...workspaceContent.folders,
			// 	{
			// 		name: createdComponent.metadata.name, // name not needed?
			// 		path: path.normalize(path.relative(path.dirname(workspace.workspaceFile.fsPath), createParams.componentDir)),
			// 	},
			// ];
		} else if (isWithinWorkspace) {
			window.showInformationMessage(successMessage, `View in console`).then(async (resp) => {
				if (resp === `View in console`) {
					let consoleProjectPath = `${ext.config?.devantConsoleUrl}/organizations/${org.handle}/projects/${project.handler}`;
					if (result.created.length === 1) {
						consoleProjectPath += `/components/${result.created[0]?.metadata.handler}/overview`;
					}
					commands.executeCommand("vscode.open", consoleProjectPath,);
				}
			});
		} else {
			window.showInformationMessage(`${successMessage} Reload workspace to continue`, { modal: true }, "Continue").then(async (resp) => {
				if (resp === "Continue") {
					commands.executeCommand("vscode.openFolder", Uri.file(workspaceFsPath), { forceNewWindow: false });
				}
			});
		}

	} else if (result.failed?.length > 0) {
		const failedNames = result.failed.map(item => item.name).join(", ");
		window.showErrorMessage(`Failed to create the following integrations: ${failedNames}`);
	}
	return result;
};

/** If project in context.yaml doesn't exist, create it automatically */
const createProjectFromContext = async (userInfo: UserInfo, workspacePath?: string): Promise<{ org?: Organization; project?: Project }> => {
	try {
		const contextFilePath = path.join(workspacePath || "", ".choreo", "context.yaml");
		if (existsSync(contextFilePath)) {
			let parsedData: ContextItem[] = yaml.load(readFileSync(contextFilePath, "utf8")) as any;
			if (!Array.isArray(parsedData) && (parsedData as any)?.org && (parsedData as any)?.project) {
				parsedData = [{ org: (parsedData as any).org, project: (parsedData as any).project }];
			}

			if (!parsedData || parsedData.length !== 1) {
				return;
			}

			const newContextItem = parsedData[0];
			const matchingOrg = userInfo.organizations.find((org) => org.handle === newContextItem.org);
			if (!matchingOrg) {
				return;
			}

			const projects = await window.withProgress(
				{
					title: `Fetching cloud projects of organization ${matchingOrg.name}...`,
					location: ProgressLocation.Notification,
				},
				() => ext.clients.rpcClient.getProjects(matchingOrg.id.toString()),
			);
			dataCacheStore.getState().setProjects(matchingOrg.handle, projects);

			let projectName = newContextItem.project;
			let suffix = 1;
			while (projects.some((project) => project.handler === projectName || project.name === projectName)) {
				projectName = `${newContextItem.project}-${suffix}`;
				suffix++;
			}

			const createdProject = await window.withProgress(
				{
					title: `Creating new cloud project ${matchingOrg.name}...`,
					location: ProgressLocation.Notification,
				},
				() => ext.clients.rpcClient.createProject({
					orgId: matchingOrg.id.toString(),
					orgHandler: matchingOrg.handle,
					projectName: projectName,
					region: ext.authProvider?.getState().state.region || "US"
				}),
			);

			const newList: ContextItem[] = [{ org: matchingOrg.handle, project: createdProject.handler }];
			writeFileSync(contextFilePath, yaml.dump(newList));
			return { org: matchingOrg, project: createdProject };
		}
	} catch (err) {
		ext.logError(`Failed to get context file entry`, err as Error);
		return
	}
}