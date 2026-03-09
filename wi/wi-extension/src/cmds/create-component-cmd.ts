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

import { existsSync, readFileSync } from "fs";
import * as os from "os";
import * as path from "path";
import {
	ChoreoComponentType,
	WICommandIds,
	ComponentConfig,
	type ComponentKind,
	DevantScopes,
	type ExtensionName,
	type ICreateComponentCmdParams,
	type Organization,
	type Project,
	type SubmitBatchComponentCreateReq,
	type SubmitBatchComponentCreateResp,
	type SubmitComponentCreateReq,
	type UserInfo,
	type WorkspaceConfig,
	getComponentKindRepoSource,
	getComponentTypeText,
	getIntegrationScopeText,
	getTypeOfIntegrationType,
	parseGitURL,
} from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, type QuickPickItem, Uri, commands, window, workspace } from "vscode";
import { ext } from "../extensionVariables";
import { initGit } from "../git/main";
import { getGitRemotes, getGitRoot } from "../git/util";
import { contextStore, waitForContextStoreToLoad } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import { webviewStateStore } from "../stores/webview-state-store";
import { convertFsPathToUriPath, isSamePath, isSubpath, openDirectory } from "../utils";
import { createNewProject, getUserInfoForCmd, isRpcActive, selectOrg, selectProjectWithCreateNew, setExtensionName } from "./cmd-utils";
import { openCloudFormWebview } from "../rpc-managers/cloud/rpc-handler";
import type { WICloudFormContext, WICloudSubmitComponentsReq, WICloudSubmitComponentsResp } from "@wso2/wi-core";
import { updateContextFile } from "./create-directory-context-cmd";

// ============================================================================
// Deferred webview types
// ============================================================================

interface IComponentCreateFormParams {
	organization: Organization;
	project: Project;
	extensionName: string;
	components: ComponentConfig[];
	rootDirectory: string;
}

// ============================================================================
// Organization & Project Selection
// ============================================================================

interface OrgProjectSelection {
	org: Organization;
	project: Project;
}

async function selectOrgAndProject(userInfo: UserInfo): Promise<OrgProjectSelection> {
	await waitForContextStoreToLoad();
	const selected = contextStore.getState().state.selected;

	if (selected?.project && selected?.org) {
		return { org: selected.org, project: selected.project };
	}

	const selectedOrg = await selectOrg(userInfo, "Select organization");
	const createdProjectRes = await selectProjectWithCreateNew(
		selectedOrg,
		`Loading projects from '${selectedOrg.name}'`,
		`Select the project from '${selectedOrg.name}', to create the ${ext.terminologies?.componentTerm} in`,
	);

	return { org: selectedOrg, project: createdProjectRes.selectedProject };
}

async function selectOrgAndProjectForBatch(
	userInfo: UserInfo,
	rootDirectory: string
): Promise<OrgProjectSelection> {
	await waitForContextStoreToLoad();
	const selected = contextStore.getState().state.selected;

	if (selected?.project && selected?.org) {
		return { org: selected.org, project: selected.project };
	}

	const selectedOrg = await selectOrg(userInfo, "Select organization");

	const projectName = path.basename(rootDirectory);
	const project = await createNewProject(selectedOrg, projectName, true);
	return { org: selectedOrg, project: project };
}

// ============================================================================
// Component Type Selection
// ============================================================================

interface ComponentTypeSelection {
	type: string;
	subType?: string;
}

function getAvailableComponentTypes(isDevant: boolean): string[] {
	if (isDevant) {
		return [
			DevantScopes.AUTOMATION,
			DevantScopes.AI_AGENT,
			DevantScopes.INTEGRATION_AS_API,
			DevantScopes.EVENT_INTEGRATION,
			DevantScopes.FILE_INTEGRATION,
			DevantScopes.LIBRARY,
		];
	}
	return [
		ChoreoComponentType.Service,
		ChoreoComponentType.WebApplication,
		ChoreoComponentType.ScheduledTask,
		ChoreoComponentType.ManualTrigger,
		ChoreoComponentType.ApiProxy,
	];
}

function extractTypeFromParams(
	params: ICreateComponentCmdParams,
	componentTypes: string[],
	isDevant: boolean,
): ComponentTypeSelection | undefined {
	if (isDevant && params?.integrationType && componentTypes.includes(params.integrationType)) {
		const intType = getTypeOfIntegrationType(params.integrationType);
		if (intType.type) {
			return { type: intType.type, subType: intType.subType };
		}
	}

	if (!isDevant && params?.type && componentTypes.includes(params.type)) {
		return { type: params.type };
	}

	return undefined;
}

async function promptForComponentType(
	componentTypes: string[],
): Promise<ComponentTypeSelection | undefined> {
	const extensionName = webviewStateStore.getState().state.extensionName;
	const typeQuickPicks: (QuickPickItem & { value: string })[] = componentTypes.map((item) => ({
		label: extensionName === "Devant" ? getIntegrationScopeText(item) : getComponentTypeText(item),
		value: item,
	}));

	const selectedTypePick = await window.showQuickPick(typeQuickPicks, {
		title: `Select ${ext.terminologies?.componentTermCapitalized} Type`,
	});

	if (!selectedTypePick?.value) {
		return undefined;
	}

	if (extensionName === "Devant") {
		const intType = getTypeOfIntegrationType(selectedTypePick.value);
		if (intType.type) {
			return { type: intType.type, subType: intType.subType };
		}
		return undefined;
	}

	return { type: selectedTypePick.value };
}

async function resolveComponentType(
	params: ICreateComponentCmdParams,
): Promise<ComponentTypeSelection> {
	const componentTypes = getAvailableComponentTypes(webviewStateStore.getState().state.extensionName === "Devant");

	const typeFromParams = extractTypeFromParams(params, componentTypes, webviewStateStore.getState().state.extensionName === "Devant");
	if (typeFromParams) {
		return typeFromParams;
	}

	const selectedType = await promptForComponentType(componentTypes);
	if (!selectedType) {
		throw new Error(`${ext.terminologies?.componentTermCapitalized} type is required`);
	}

	return selectedType;
}

// ============================================================================
// Directory Selection
// ============================================================================

function getDefaultUri(): Uri {
	if (workspace.workspaceFile && workspace.workspaceFile.scheme !== "untitled") {
		return workspace.workspaceFile;
	}
	if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
		return workspace.workspaceFolders[0].uri;
	}
	return Uri.file(os.homedir());
}

async function selectComponentDirectory(
	params: ICreateComponentCmdParams,
): Promise<Uri> {
	if (params?.componentDir && existsSync(params.componentDir)) {
		return Uri.parse(convertFsPathToUriPath(params.componentDir));
	}

	const selectedPaths = await window.showOpenDialog({
		canSelectFolders: true,
		canSelectFiles: false,
		canSelectMany: false,
		title: `Select ${ext.terminologies?.componentTerm} directory`,
		defaultUri: getDefaultUri(),
	});

	if (!selectedPaths || selectedPaths.length === 0) {
		throw new Error(`${ext.terminologies?.componentTermCapitalized} directory selection is required`);
	}

	return selectedPaths[0];
}

// ============================================================================
// Git & Component Existence Checking
// ============================================================================

interface GitInfo {
	root: string | undefined;
	isInitialized: boolean;
}

async function getGitInfo(context: ExtensionContext, directoryPath: string): Promise<GitInfo> {
	try {
		const root = await getGitRoot(context, directoryPath);
		return { root, isInitialized: true };
	} catch {
		return { root: undefined, isInitialized: false };
	}
}

async function checkIfComponentExistsAtPath(
	components: ComponentKind[],
	gitRoot: string,
	selectedPath: string,
): Promise<boolean> {
	const remotes = await getGitRemotes(ext.context, gitRoot);

	for (const component of components) {
		const repoUrl = getComponentKindRepoSource(component.spec.source).repo;
		const parsedRepoUrl = parseGitURL(repoUrl);

		if (!parsedRepoUrl) {
			continue;
		}

		const [repoOrg, repoName, repoProvider] = parsedRepoUrl;

		const hasMatchingRemote = remotes.some((remote) => {
			const parsedRemoteUrl = parseGitURL(remote.fetchUrl);
			if (!parsedRemoteUrl) {
				return false;
			}
			const [remoteOrg, remoteName, remoteProvider] = parsedRemoteUrl;
			return repoOrg === remoteOrg && repoName === remoteName && repoProvider === remoteProvider;
		});

		if (hasMatchingRemote) {
			const componentPath = path.join(gitRoot, getComponentKindRepoSource(component.spec.source)?.path);
			if (isSamePath(componentPath, selectedPath)) {
				return true;
			}
		}
	}

	return false;
}

async function handleExistingComponent(
	project: Project,
	org: Organization,
	gitRoot: string,
): Promise<boolean> {
	const message =
		`${ext.terminologies?.componentTermCapitalized} for the selected directory already exists ` +
		`within your project(${project.name}). Do you want to proceed and create another ${ext.terminologies?.componentTerm}?`;

	const response = await window.showInformationMessage(message, { modal: true }, "Proceed");

	if (response === "Proceed") {
		return true;
	}

	const projectCache = dataCacheStore.getState().getProjects(org.handle);
	const userInfo = ext.authProvider?.getState().state.userInfo;

	if (!userInfo) {
		window.showErrorMessage("User information is not available. Please sign in and try again.");
		return false;
	}

	updateContextFile(gitRoot, userInfo, project, org, projectCache);
	contextStore.getState().refreshState();
	return false;
}

// ============================================================================
// Component Name Generation
// ============================================================================

function generateUniqueComponentName(
	baseName: string,
	existingComponents: ComponentKind[],
	reservedNames: Set<string> = new Set(),
): string {
	const existingNames = new Set(
		existingComponents.map((c) => c.metadata?.name?.toLowerCase?.()),
	);
	reservedNames.forEach((name) => existingNames.add(name.toLowerCase()));

	if (!existingNames.has(baseName.toLowerCase())) {
		return baseName;
	}

	let counter = 1;
	let candidateName = `${baseName}-${counter}`;

	while (existingNames.has(candidateName.toLowerCase())) {
		counter++;
		candidateName = `${baseName}-${counter}`;
	}

	return candidateName;
}

// ============================================================================
// Component Fetching
// ============================================================================

async function fetchProjectComponents(
	org: Organization,
	project: Project,
): Promise<ComponentKind[]> {
	const components = await window.withProgress(
		{
			title: `Fetching ${ext.terminologies?.componentTermPlural} of project ${project.name}...`,
			location: ProgressLocation.Notification,
		},
		() =>
			ext.clients.rpcClient.getComponentList({
				orgId: org.id.toString(),
				orgHandle: org.handle,
				projectId: project.id,
				projectHandle: project.handler,
			}),
	);

	dataCacheStore.getState().setComponents(org.handle, project.handler, components);
	return components;
}

// ============================================================================
// Form Display (webview deferred to Stage 8)
// ============================================================================

function buildCreateFormParams(
	selectedUri: Uri,
	typeSelection: ComponentTypeSelection,
	componentName: string,
	gitInfo: GitInfo,
	buildPackLang?: string,
	supportedIntegrationTypes?: string[],
): ComponentConfig {
	return {
		directoryUriPath: selectedUri.path,
		directoryFsPath: selectedUri.fsPath,
		directoryName: path.basename(selectedUri.fsPath),
		initialValues: {
			type: typeSelection.type,
			subType: typeSelection.subType,
			buildPackLang: buildPackLang,
			name: componentName,
		},
		isNewCodeServerComp: !gitInfo.isInitialized && ext.isDevantCloudEditor,
		supportedIntegrationTypes,
	};
}

async function buildComponentConfigWithoutExistenceCheck(
	context: ExtensionContext,
	param: ICreateComponentCmdParams,
	components: ComponentKind[],
	reservedNames: Set<string> = new Set(),
): Promise<ComponentConfig | null> {
	const typeSelection = await resolveComponentType(param);
	const selectedUri = await selectComponentDirectory(param);
	const gitInfo = await getGitInfo(context, selectedUri.fsPath);

	const baseName = param?.name || path.basename(selectedUri.fsPath) || typeSelection.type;
	const componentName = generateUniqueComponentName(baseName, components, reservedNames);

	return buildCreateFormParams(
		selectedUri,
		typeSelection,
		componentName,
		gitInfo,
		param?.buildPackLang,
		param?.supportedIntegrationTypes,
	);
}

async function buildComponentConfig(
	context: ExtensionContext,
	param: ICreateComponentCmdParams,
	org: Organization,
	project: Project,
	components: ComponentKind[],
): Promise<ComponentConfig | null> {
	const typeSelection = await resolveComponentType(param);
	const selectedUri = await selectComponentDirectory(param);
	const gitInfo = await getGitInfo(context, selectedUri.fsPath);

	if (gitInfo.root) {
		const componentExists = await checkIfComponentExistsAtPath(components, gitInfo.root, selectedUri.fsPath);
		if (componentExists) {
			const shouldProceed = await handleExistingComponent(project, org, gitInfo.root);
			if (!shouldProceed) {
				return null;
			}
		}
	}

	const baseName = param?.name || path.basename(selectedUri.fsPath) || typeSelection.type;
	const componentName = generateUniqueComponentName(baseName, components);

	return buildCreateFormParams(
		selectedUri,
		typeSelection,
		componentName,
		gitInfo,
		param?.buildPackLang,
		param?.supportedIntegrationTypes,
	);
}

function buildCloudFormContext(
	formParams: IComponentCreateFormParams,
): WICloudFormContext {
	return {
		orgName: formParams.organization.name,
		projectName: formParams.project.name,
		extensionName: formParams.extensionName,
		components: formParams.components.map((c) => ({
			directoryFsPath: c.directoryFsPath,
			directoryName: c.directoryName,
			componentName: c.initialValues?.name ?? path.basename(c.directoryFsPath),
			componentType: c.initialValues?.type ?? "",
			componentSubType: c.initialValues?.subType,
			buildPackLang: c.initialValues?.buildPackLang ?? "",
			isService: c.initialValues?.type === ChoreoComponentType.Service,
		})),
	};
}

function makeCloudSubmitHandler(
	formParams: IComponentCreateFormParams,
): (req: WICloudSubmitComponentsReq) => Promise<WICloudSubmitComponentsResp> {
	return async (req) => {
		const total = req.components.length;
		let created = 0;
		let failed = 0;
		const errors: Array<{ index: number; message: string }> = [];

		for (const entry of req.components) {
			const comp = formParams.components[entry.index];
			try {
				await submitCreateComponentHandler({
					org: formParams.organization,
					project: formParams.project,
					type: comp.initialValues?.type ?? "",
					createParams: {
						orgId: formParams.organization.id.toString(),
						orgUUID: formParams.organization.uuid ?? "",
						projectId: formParams.project.id,
						projectHandle: formParams.project.handler,
						componentDir: comp.directoryFsPath,
						type: comp.initialValues?.type ?? "",
						componentSubType: comp.initialValues?.subType ?? "",
						buildPackLang: comp.initialValues?.buildPackLang ?? "",
						name: entry.displayName,
						displayName: entry.displayName,
						// git fields resolved by CLI from componentDir
						repoUrl: "",
						gitProvider: "",
						gitCredRef: "",
						branch: "",
						langVersion: "",
						port: 0,
						spaBuildCommand: "",
						spaNodeVersion: "",
						spaOutputDir: "",
					},
				});
				created++;
			} catch (err) {
				failed++;
				errors.push({ index: entry.index, message: err instanceof Error ? err.message : String(err) });
			}
		}

		return { created, failed, total, errors: errors.length > 0 ? errors : undefined };
	};
}

function showComponentFormInWorkspace(
	formParams: IComponentCreateFormParams,
): void {
	openCloudFormWebview(
		buildCloudFormContext(formParams),
		makeCloudSubmitHandler(formParams),
	);
}

function showComponentFormOutsideWorkspace(
	formParams: IComponentCreateFormParams,
	gitRoot: string | undefined,
	directoryPath: string,
): void {
	// Store params for resumption after directory is opened
	ext.context.globalState.update("create-comp-params", JSON.stringify(formParams));
	openDirectory(
		gitRoot || directoryPath,
		"Where do you want to open the selected directory?",
	);
}

// ============================================================================
// Component Preparation Helper
// ============================================================================

interface PreparedComponentResult {
	formParams: IComponentCreateFormParams;
	gitRoot: string | undefined;
	directoryPath: string;
	isWithinWorkspace: boolean;
}

async function prepareComponentFormParams(
	context: ExtensionContext,
	params: ICreateComponentCmdParams,
	org: Organization,
	project: Project,
	components: ComponentKind[],
): Promise<PreparedComponentResult | null> {

	const componentConfig = await buildComponentConfig(context, params, org, project, components);
	if (!componentConfig) {
		return null;
	}

	const formParams: IComponentCreateFormParams = {
		organization: org,
		project: project,
		extensionName: webviewStateStore.getState().state.extensionName,
		components: [componentConfig],
		rootDirectory: params?.componentDir ? convertFsPathToUriPath(params.componentDir) : "",
	};

	const isWithinWorkspace = workspace.workspaceFolders?.some((folder) =>
		isSubpath(folder.uri?.fsPath, componentConfig.directoryFsPath),
	) ?? false;

	const gitInfo = await getGitInfo(context, componentConfig.directoryFsPath);

	return {
		formParams: formParams,
		gitRoot: gitInfo.root,
		directoryPath: componentConfig.directoryUriPath,
		isWithinWorkspace: isWithinWorkspace
	};
}

async function prepareComponentFormParamsBatch(
	context: ExtensionContext,
	params: ICreateComponentCmdParams[],
	org: Organization,
	project: Project,
	components: ComponentKind[],
	rootDirectory: string,
): Promise<PreparedComponentResult | null> {
	if (rootDirectory === "" || params?.length === 0) {
		return null;
	}

	let directoryUri: Uri;
	if (rootDirectory !== "" && existsSync(rootDirectory)) {
		directoryUri = Uri.parse(convertFsPathToUriPath(rootDirectory));
	} else {
		return null;
	}

	const componentConfigs: ComponentConfig[] = [];
	const reservedNames = new Set<string>();
	const gitInfo = await getGitInfo(context, directoryUri.fsPath);

	// Pre-check: identify which components already exist and filter to only new ones
	const newComponentParams: ICreateComponentCmdParams[] = [];

	if (gitInfo.root) {
		for (const param of params) {
			const selectedUri = await selectComponentDirectory(param);
			const componentExists = await checkIfComponentExistsAtPath(components, gitInfo.root, selectedUri.fsPath);

			if (!componentExists) {
				newComponentParams.push(param);
			}
		}

		// If no new components to deploy, silently update context and return
		if (newComponentParams.length === 0) {
			const userInfo = ext.authProvider?.getState().state.userInfo;
			if (userInfo) {
				const projectCache = dataCacheStore.getState().getProjects(org.handle);
				updateContextFile(gitInfo.root, userInfo, project, org, projectCache);
				contextStore.getState().refreshState();
			}
			return null;
		}
	}

	// Process only new components (or all if git root not found)
	const paramsToProcess = gitInfo.root && newComponentParams.length > 0 ? newComponentParams : params;

	for (const param of paramsToProcess) {
		const componentConfig = await buildComponentConfigWithoutExistenceCheck(
			context,
			param,
			components,
			reservedNames
		);
		if (!componentConfig) {
			continue;
		}
		if (componentConfig.initialValues?.name) {
			reservedNames.add(componentConfig.initialValues.name);
		}
		componentConfigs.push(componentConfig);
	}

	if (componentConfigs.length === 0) {
		return null;
	}

	const formParams: IComponentCreateFormParams = {
		organization: org,
		project: project,
		extensionName: webviewStateStore.getState().state.extensionName,
		components: componentConfigs,
		rootDirectory: convertFsPathToUriPath(rootDirectory),
	};

	const isWithinWorkspace = workspace.workspaceFolders?.some((folder) =>
		isSubpath(folder.uri?.fsPath, directoryUri.fsPath),
	) ?? false;

	return {
		formParams: formParams,
		gitRoot: gitInfo.root,
		directoryPath: directoryUri.path,
		isWithinWorkspace: isWithinWorkspace
	};
}

function showComponentForm(prepared: PreparedComponentResult): void {
	if (prepared.isWithinWorkspace || workspace.workspaceFile) {
		showComponentFormInWorkspace(prepared.formParams);
	} else {
		showComponentFormOutsideWorkspace(prepared.formParams, prepared.gitRoot, prepared.directoryPath);
	}
}

// ============================================================================
// Main Command Handler
// ============================================================================

async function executeCreateComponentCommand(
	context: ExtensionContext,
	params: ICreateComponentCmdParams,
): Promise<void> {
	setExtensionName(params?.extName);

	isRpcActive(ext);

	const userInfo = await getUserInfoForCmd(`create ${ext.terminologies?.articleComponentTerm}`);
	if (!userInfo) {
		return;
	}

	const { org, project } = await selectOrgAndProject(userInfo);
	const components = await fetchProjectComponents(org, project);

	const prepared = await prepareComponentFormParams(context, params, org, project, components);
	if (!prepared) {
		return;
	}

	showComponentForm(prepared);
}

async function executeCreateMultipleNewComponentsCommand(
	context: ExtensionContext,
	params: ICreateComponentCmdParams[],
	rootDirectory: string,
): Promise<void> {
	if (!params || params.length === 0) {
		return;
	}

	// Use the first param's extName for setup
	setExtensionName(params[0]?.extName);
	const extName = webviewStateStore.getState().state.extensionName;

	isRpcActive(ext);

	const userInfo = await getUserInfoForCmd(`create multiple ${ext.terminologies?.componentTerm}s`);
	if (!userInfo) {
		return;
	}

	// Select org and project once for all components
	const { org, project } = extName === "Devant"
		? await selectOrgAndProjectForBatch(userInfo, rootDirectory)
		: await selectOrgAndProject(userInfo);
	const components = await fetchProjectComponents(org, project);

	// Prepare all components first, collecting form params
	const preparedComponents = await prepareComponentFormParamsBatch(
		context,
		params,
		org,
		project,
		components,
		rootDirectory
	);
	if (!preparedComponents) {
		return;
	}

	showComponentForm(preparedComponents);
}

export function createNewComponentCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.CreateNewComponent, async (params: ICreateComponentCmdParams) => {
			try {
				await executeCreateComponentCommand(context, params);
			} catch (err: any) {
				console.error(`Failed to create ${ext.terminologies?.componentTerm}`, err);
				window.showErrorMessage(err?.message || `Failed to create ${ext.terminologies?.componentTerm}`);
			}
		}),
	);
}

export function createMultipleNewComponentsCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(
			WICommandIds.CreateMultipleNewComponents,
			async (params: ICreateComponentCmdParams[], rootDirectory: string) => {
				try {
					await executeCreateMultipleNewComponentsCommand(context, params, rootDirectory);
				} catch (err: any) {
					console.error(`Failed to create multiple ${ext.terminologies?.componentTerm}s`, err);
					window.showErrorMessage(err?.message || `Failed to create multiple ${ext.terminologies?.componentTerm}s`);
				}
			}
		),
	);
}

/** Continue create component flow if user chooses a directory outside his/her workspace. */
export const continueCreateComponent = () => {
	const compParams: string | null | undefined = ext.context.globalState.get("create-comp-params");
	if (compParams) {
		ext.context.globalState.update("create-comp-params", null);
		const createCompParams: IComponentCreateFormParams = JSON.parse(compParams);
		if (createCompParams?.rootDirectory) {
			createCompParams.rootDirectory = convertFsPathToUriPath(createCompParams.rootDirectory);
		}
		if (createCompParams?.extensionName) {
			webviewStateStore.getState().setExtensionName(createCompParams?.extensionName as ExtensionName);
		}
		openCloudFormWebview(
			buildCloudFormContext(createCompParams),
			makeCloudSubmitHandler(createCompParams),
		);
	}
};

export const submitCreateComponentHandler = async ({ createParams, org, project }: SubmitComponentCreateReq) => {
	const extensionName = webviewStateStore.getState().state?.extensionName;
	const createdComponent = await window.withProgress(
		{
			title: `Creating new ${ext.terminologies?.componentTerm} ${createParams.displayName}...`,
			location: ProgressLocation.Notification,
		},
		() => ext.clients.rpcClient.createComponent(createParams),
	);

	if (createdComponent) {
		// TODO: enable autoBuildOnCommit once its stable

		const compCache = dataCacheStore.getState().getComponents(org.handle, project.handler);
		dataCacheStore.getState().setComponents(org.handle, project.handler, [createdComponent, ...compCache]);

		// update the context file if needed
		try {
			const newGit = await initGit(ext.context);
			const gitRoot = await newGit?.getRepositoryRoot(createParams.componentDir);
			const dotGit = await newGit?.getRepositoryDotGit(createParams.componentDir);
			const projectCache = dataCacheStore.getState().getProjects(org.handle);
			if (newGit && gitRoot && dotGit) {
				if (ext.isDevantCloudEditor) {
					// update the code server, to attach itself to the created component
					const repo = newGit.open(gitRoot, dotGit);
					const head = await repo.getHEAD();
					if (head.name) {
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

						// Clear code server local storage data
						try {
							await commands.executeCommand("devantEditor.clearLocalStorage");
						} catch (err) {
							ext.logError(`Failed to execute devantEditor.clearLocalStorage command: ${err}`, err as Error);
						}
					}
				} else {
					const userInfo = ext.authProvider?.getState().state.userInfo;
					if (userInfo) {
						updateContextFile(gitRoot, userInfo, project, org, projectCache);
						contextStore.getState().refreshState();
					} else {
						ext.logError("Cannot update context file: userInfo is undefined.", new Error("userInfo is undefined"));
					}
				}
			}
		} catch (err) {
			console.error("Failed to get git details of ", createParams.componentDir);
		}

		// Note: showComponentDetailsView not available in wi (webview deferred - Stage 8)

		const successMessage = `${ext.terminologies?.componentTermCapitalized} '${createdComponent.metadata.name}' was successfully created.`;

		const isWithinWorkspace = workspace.workspaceFolders?.some((item) => isSubpath(item.uri?.fsPath, createParams.componentDir));

		if (ext.isDevantCloudEditor) {
			await ext.context.globalState.update("code-server-component-id", createdComponent.metadata?.id);
		}

		if (workspace.workspaceFile) {
			const workspaceContent: WorkspaceConfig = JSON.parse(readFileSync(workspace.workspaceFile.fsPath, "utf8"));
			workspaceContent.folders = [
				...workspaceContent.folders,
				{
					name: createdComponent.metadata.name,
					path: path.normalize(path.relative(path.dirname(workspace.workspaceFile.fsPath), createParams.componentDir)),
				},
			];
		} else if (isWithinWorkspace) {
			window.showInformationMessage(successMessage, `Open in ${extensionName}`).then(async (resp) => {
				if (resp === `Open in ${extensionName}`) {
					commands.executeCommand(
						"vscode.open",
						`${extensionName === "Devant" ? ext.config?.devantConsoleUrl : ext.config?.choreoConsoleUrl}/organizations/${org.handle}/projects/${extensionName === "Devant" ? project.id : project.handler}/components/${createdComponent.metadata.handler}/overview`,
					);
				}
			});
		} else {
			window.showInformationMessage(`${successMessage} Reload workspace to continue`, { modal: true }, "Continue").then(async (resp) => {
				if (resp === "Continue") {
					commands.executeCommand("vscode.openFolder", Uri.file(createParams.componentDir), { forceNewWindow: false });
				}
			});
		}

		contextStore.getState().refreshState();
	}

	return createdComponent;
};

/**
 * Handler for batch component creation - optimized for creating multiple components at once.
 */
export const submitBatchCreateComponentsHandler = async ({
	org,
	project,
	components,
}: SubmitBatchComponentCreateReq): Promise<SubmitBatchComponentCreateResp> => {
	const extensionName = webviewStateStore.getState().state?.extensionName;
	const totalCount = components.length;

	const result: SubmitBatchComponentCreateResp = {
		created: [],
		failed: [],
		total: totalCount,
	};

	// Show a single progress notification for the entire batch
	await window.withProgress(
		{
			title: totalCount === 1
				? `Creating ${ext.terminologies?.componentTerm} '${components[0].createParams.displayName || components[0].createParams.name}'... `
				: `Creating ${totalCount} ${ext.terminologies?.componentTermPlural}... `,
			location: ProgressLocation.Notification,
			cancellable: false,
		},
		async (progress) => {
			for (let i = 0; i < components.length; i++) {
				const componentReq = components[i];
				const componentName = componentReq.createParams.displayName || componentReq.createParams.name;

				if (totalCount > 1) {
					// Update progress
					progress.report({
						message: `(${i + 1}/${totalCount}) ${componentName}`,
						increment: (100 / totalCount),
					});
				}

				try {
					const createdComponent = await ext.clients.rpcClient.createComponent(componentReq.createParams);

					if (createdComponent) {
						result.created.push(createdComponent);

						// Update component cache
						const compCache = dataCacheStore.getState().getComponents(org.handle, project.handler);
						dataCacheStore.getState().setComponents(org.handle, project.handler, [createdComponent, ...compCache]);
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

	// Update context file once for the batch (using the first successfully created component's directory)
	if (result.created.length > 0) {
		try {
			const firstCreated = result.created[0];
			const firstComponentDir = components.find(
				(c) => c.createParams.name === firstCreated.metadata.name,
			)?.createParams?.componentDir;

			if (firstComponentDir) {
				const newGit = await initGit(ext.context);
				const gitRoot = await newGit?.getRepositoryRoot(firstComponentDir);
				const dotGit = await newGit?.getRepositoryDotGit(firstComponentDir);
				const projectCache = dataCacheStore.getState().getProjects(org.handle);

				if (newGit && gitRoot && dotGit && !ext.isDevantCloudEditor) {
					const userInfo = ext.authProvider?.getState().state.userInfo;
					if (userInfo) {
						updateContextFile(gitRoot, userInfo, project, org, projectCache);
					}
				}
			}
		} catch (err) {
			ext.logError("Failed to update context file after batch creation:", err as Error);
		}

		contextStore.getState().refreshState();
	}

	// Show summary message
	const successCount = result.created.length;
	const failCount = result.failed.length;

	if (failCount === 0) {
		// All succeeded
		window.showInformationMessage(
			`Successfully created ${successCount} ${successCount === 1 ? ext.terminologies?.componentTerm : ext.terminologies?.componentTermPlural}.`,
			`Open in ${extensionName}`,
		).then((resp) => {
			if (resp === `Open in ${extensionName}`) {
				const consoleUrl = extensionName === "Devant" ? ext.config?.devantConsoleUrl : ext.config?.choreoConsoleUrl;
				const projectPath = extensionName === "Devant" ? project.id : project.handler;
				commands.executeCommand(
					"vscode.open",
					`${consoleUrl}/organizations/${org.handle}/projects/${projectPath}/components`,
				);
			}
		});
	} else if (successCount === 0) {
		// All failed
		window.showErrorMessage(
			`Failed to create all ${totalCount} ${ext.terminologies?.componentTermPlural}. Check the output for details.`,
		);
	} else {
		// Partial success
		window.showWarningMessage(
			`Created ${successCount} of ${totalCount} ${ext.terminologies?.componentTermPlural}. ${failCount} failed.`,
			"View Details",
		).then((resp) => {
			if (resp === "View Details") {
				const failedNames = result.failed.map((f) => `• ${f.name}: ${f.error}`).join("\n");
				window.showErrorMessage(`Failed ${ext.terminologies?.componentTermPlural}:\n${failedNames}`, { modal: true });
			}
		});
	}

	return result;
};
