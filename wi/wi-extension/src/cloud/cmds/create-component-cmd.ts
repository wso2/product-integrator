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
	ContextItem,
	UserInfo,
	Organization,
	Project,
	ComponentKind,
	CreateComponentReq,
} from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, Uri, commands, window, workspace } from "vscode";
import { ext } from "../../extensionVariables";
import { initGit } from "../git/main";
import { Repository } from "../git/git";
import { getGitRemotes, getGitRoot, relativePath } from "../git/util";
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
	DevantScopes.MCP,
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

					if (params?.workspaceDir && (!selectedOrg || !selectedProject)) {
						const contextFileEntry = await createProjectFromLocalMetadata(userInfo, params?.workspaceDir);
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

	const workspaceCompId: string | null | undefined = ext.context.workspaceState.get("SOURCE_COMPONENT_ID");
	if (workspaceCompId) {
		const component = dataCacheStore.getState().getComponents(org.handle, project.handler)?.find(comp => comp.metadata?.id === workspaceCompId);
		if (component?.metadata?.isPrebuilt) {
			// if its pre-built integration, we need to update the existing component with new repo details instead of creating a new component.
			return await handlePrebuiltComponentUpdate(workspaceCompId, component, org, project, createParams[0], workspaceFsPath, gitRoot!);
		}
	}

	await checkComponentLimitReached(createParams, org);

	// Verify if the source code has been pushed to remote repo
	await checkIfSourcePushedToRemoteRepo(createParams, org, gitRoot!);

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

						await updateCodeServerWithCreatedComp(createdComponent, org, repo!, project);
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
		clearCodeServerLocalStorage();
		const projectCache = dataCacheStore.getState().getProjects(org?.handle);
		updateContextFile(gitRoot, ext.authProvider?.getState().state.userInfo!, project, org, projectCache);
		contextStore.getState().refreshState();
	}

	if (result.created.length > 0) {
		let successMessage: string;
		if (result.failed?.length === 0) {
			successMessage = result.created.length === 1
				? "Successfully created integration in the cloud"
				: "Successfully created multiple integrations in the cloud";
		} else {
			successMessage = `Successfully created ${result.created.length} of ${totalCount} integrations in the cloud`;
		}

		const isWithinWorkspace = workspace.workspaceFolders?.some((item) => isSubpath(item.uri?.fsPath, workspaceFsPath));

		if (workspace.workspaceFile) {
			window.showErrorMessage("Please make sure newly created integrations are added to workspace.")
			// const workspaceContent: WorkspaceConfig = JSON.parse(readFileSync(workspace.workspaceFile.fsPath, "utf8"));
			// workspaceContent.folders = [
			// 	...workspaceContent.folders,
			// 	{
			// 		name: createdComponent.metadata.name, // name not needed?
			// 		path: path.normalize((path.dirname(workspace.workspaceFile.fsPath), createParams.componentDir)),
			// 	},
			// ];
		} else if (isWithinWorkspace) {
			showViewInConsoleMessage(successMessage, org, project, result.created);
		} else {
			showReloadWorkspaceMessage(successMessage, workspaceFsPath);
		}
	}

	if (result.failed?.length > 0) {
		const failedNames = result.failed.map(item => item.name).join(", ");
		window.showErrorMessage(`Failed to create the following integrations: ${failedNames}`);
	}
	return result;
};

const checkComponentLimitReached = async (createParams: CreateComponentReq[], org: Organization) => {
	const subscriptions = await window.withProgress(
		{ title: "Checking organization subscription...", location: ProgressLocation.Notification },
		() =>
			ext.clients?.rpcClient?.getSubscriptions({
				orgId: org.id.toString(),
				cloudType: "devant",
			})
	);
	const isSubscribed = subscriptions?.list?.some(sub => sub.subscriptionType === 'devant-subscription');
	if (!isSubscribed) {
		const FREE_COMPONENT_LIMIT = 5;
		const componentUsage = await window.withProgress(
			{ title: "Checking integration usage within your organization...", location: ProgressLocation.Notification },
			() =>
				ext.clients?.rpcClient?.getComponentUsage({
					orgId: org.id.toString(),
					orgUuid: org.uuid,
					cloudOrigin: "devant",
				})
		);
		const remainingLimit = FREE_COMPONENT_LIMIT - componentUsage?.data?.billableComponentCount;
		if (createParams?.length > remainingLimit) {
			const limitReachedMsg = remainingLimit <= 0 ?
				`Your organization has reached the free usage limit. Please upgrade your subscription to create more integrations` :
				`You can only create ${remainingLimit} more integration(s). Please upgrade your subscription to create more integrations.`
			window.showErrorMessage(limitReachedMsg, "Upgrade",).then((res) => {
				if (res === "Upgrade") {
					commands.executeCommand(
						"vscode.open",
						`${ext.config?.billingConsoleUrl}/cloud/devant/upgrade?orgId=${org.uuid.toString()}`,
					);
				}
			});
			throw new Error(limitReachedMsg);
		}
	}
}


const checkIfSourcePushedToRemoteRepo = async (createParams: CreateComponentReq[], org: Organization, gitRoot: string) => {
	const totalCount = createParams.length;
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
				const subPathDir = relativePath(gitRoot!, createParam.componentDir);
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
}

async function handlePrebuiltComponentUpdate(
	workspaceCompId: string,
	component: ComponentKind,
	org: Organization,
	project: Project,
	createParam: WICloudSubmitComponentsReq['createParams'][number],
	workspaceFsPath: string,
	gitRoot: string,
): Promise<WICloudSubmitComponentsResp> {
	const result: WICloudSubmitComponentsResp = { created: [], failed: [], total: 1 };
	try {
		await window.withProgress(
			{ title: "Updating prebuilt integration repository...", location: ProgressLocation.Notification },
			() =>
				ext.clients.rpcClient?.changePrebuiltIntegrationRepository({
					componentId: workspaceCompId,
					isPublicRepo: false,
					orgHandler: org.handle,
					orgId: org.id.toString(),
					projectId: project.id,
					srcGitRepoUrl: createParam.repoUrl,
					repositorySubPath: relativePath(workspaceFsPath, createParam.componentDir),
					originCloud: "devant",
					repositoryBranch: createParam.branch,
					secretRef: createParam.gitCredRef,
				}),
		);
		result.created.push(component);
		await ext.context.workspaceState.update("SOURCE_COMPONENT_ID", null);

		clearCodeServerLocalStorage();
		const projectCache = dataCacheStore.getState().getProjects(org?.handle);
		updateContextFile(gitRoot, ext.authProvider?.getState().state.userInfo!, project, org, projectCache);
		contextStore.getState().refreshState();

		const isWithinWorkspace = workspace.workspaceFolders?.some((item) => isSubpath(item.uri?.fsPath, workspaceFsPath));
		const successMessage = "Successfully updated the prebuilt integration repository with new repo details";
		if (isWithinWorkspace) {
			showViewInConsoleMessage(successMessage, org, project, result.created);
		} else {
			showReloadWorkspaceMessage(successMessage, workspaceFsPath);
		}
	} catch (err) {
		ext.logError(`Failed to update prebuilt integration repository for component ${component.metadata?.name}`, err as Error);
		result.failed.push({ name: component.metadata?.name || "Unknown", error: `Failed to update prebuilt integration repository: ${(err as Error).message}` });
	}
	return result;
}

async function updateCodeServerWithCreatedComp(
	createdComponent: ComponentKind,
	org: Organization,
	repo: Repository,
	project: Project,
): Promise<void> {
	try {
		const head = await repo.getHEAD();
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
	} catch (err) {
		ext.logError("Failed to updated code server after creating the component", err as Error);
	}
}

const showReloadWorkspaceMessage = (message: string, workspaceFsPath: string) => {
	window.showInformationMessage(`${message} Reload workspace to continue`, { modal: true }, "Continue").then(async (resp) => {
		if (resp === "Continue") {
			commands.executeCommand("vscode.openFolder", Uri.file(workspaceFsPath), { forceNewWindow: false });
		}
	});
}

const showViewInConsoleMessage = (successMessage: string, org: Organization, project: Project, created: ComponentKind[]) => {
	window.showInformationMessage(successMessage, `View in console`).then(async (resp) => {
		if (resp === `View in console`) {
			let consoleProjectPath = `${ext.config?.devantConsoleUrl}/organizations/${org.handle}/projects/${project.handler}`;
			if (created.length === 1) {
				consoleProjectPath += `/components/${created[0]?.metadata.handler}/overview`;
			}
			commands.executeCommand("vscode.open", consoleProjectPath,);
		}
	});
}

const clearCodeServerLocalStorage = async () => {
	if (ext.isDevantCloudEditor) {
		// Clear code server local storage data data
		try {
			await commands.executeCommand("devantEditor.clearLocalStorage");
		} catch (err) {
			ext.logError(`Failed to execute devantEditor.clearLocalStorage command: ${err}`, err as Error);
		}
	}
}

/** If the context.yaml exists with `local: true`, create project from its data, automatically  */
const createProjectFromLocalMetadata = async (userInfo: UserInfo, workspacePath?: string): Promise<{ org?: Organization; project?: Project }> => {
	try {
		const wso2ContextPath = path.join(workspacePath, ".wso2", "context.yaml");
		const contextFilePath = existsSync(wso2ContextPath) ? wso2ContextPath : path.join(workspacePath, ".choreo", "context.yaml");
		if (!existsSync(contextFilePath)) {
			return undefined;
		}

		type LocalContextItem = ContextItem & { local?: boolean };
		const contextList: LocalContextItem[] = (yaml.load(readFileSync(contextFilePath, "utf8")) as LocalContextItem[]) ?? [];
		const localEntry = contextList.find((entry) => entry.local === true);
		if (!localEntry) {
			return undefined;
		}

		let selectedOrg = userInfo.organizations.find((org) => org.handle === localEntry.org);
		if (!selectedOrg) {
			selectedOrg = await selectOrg(userInfo, "Select organization");
		}

		const projects = await window.withProgress(
			{
				title: `Fetching cloud projects of organization ${selectedOrg.name}...`,
				location: ProgressLocation.Notification,
			},
			() => ext.clients.rpcClient.getProjects(selectedOrg.id.toString()),
		);
		dataCacheStore.getState().setProjects(selectedOrg.handle, projects);

		// Strip the `local` flag from the matched entry and write the updated list back in-place.
		const stripLocalFlag = (list: LocalContextItem[]): ContextItem[] =>
			list.map(({ local: _local, ...rest }) => rest);

		const matchingProject = projects.find((project) => project.handler === localEntry.project);
		if (matchingProject) {
			writeFileSync(contextFilePath, yaml.dump(stripLocalFlag(contextList)));
			return { org: selectedOrg, project: matchingProject };
		}

		// Derive a human-readable name from Ballerina.toml [workspace].title, falling back to the handler.
		let projectName: string | undefined;
		const ballerinaTomlPath = path.join(workspacePath, "Ballerina.toml");
		if (existsSync(ballerinaTomlPath)) {
			const tomlContent = readFileSync(ballerinaTomlPath, "utf8");
			const titleMatch = tomlContent.match(/^\[workspace\][^\[]*title\s*=\s*"([^"]+)"/ms);
			projectName = titleMatch?.[1];
		}
		if (!projectName) {
			projectName = localEntry.project
				.split("-")
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ");
		}

		const createdProject = await window.withProgress(
			{
				title: `Creating new cloud project ${selectedOrg.name}...`,
				location: ProgressLocation.Notification,
			},
			() => ext.clients.rpcClient.createProject({
				orgId: selectedOrg.id.toString(),
				orgHandler: selectedOrg.handle,
				projectName,
				projectHandler: localEntry.project,
				region: ext.authProvider?.getState().state.region || "US"
			}),
		);

		writeFileSync(contextFilePath, yaml.dump(stripLocalFlag(contextList)));
		return { org: selectedOrg, project: createdProject };
	} catch (err) {
		ext.logError(`Failed to get context file entry`, err as Error);
		return
	}
}