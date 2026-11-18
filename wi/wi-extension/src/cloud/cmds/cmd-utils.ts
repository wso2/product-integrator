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

import * as path from "path";
import type { WICloudDeployReq } from "@wso2/wi-core";
import { type Component, type Organization, type PlatformSession, type Project, RESOURCE_NAME, parseGitHubRepoUrl } from "@wso2/wso2-cloud-client";
import { type ExtensionName, type GetLocalGitDataResp, WICommandIds } from "@wso2/wso2-platform-core";
import { ProgressLocation, type QuickPickItem, QuickPickItemKind, type WorkspaceFolder, commands, window, workspace } from "vscode";
import { type ExtensionVariables, ext } from "../../extensionVariables";
import { isSubpath } from "../../utils/pathUtils";
import { CancelledError } from "../platform/error-handler";
import { dataCacheStore } from "../stores/data-cache-store";
import { webviewStateStore } from "../stores/webview-state-store";

export const selectIntegration = async (
	project: Project,
	loadingTitle = "Loading integrations...",
	selectTitle = "Select integration",
): Promise<Component> => {
	const orgHandle = requireOrg().handle;
	const selected = await quickPickWithLoader({
		cacheQuickPicks: dataCacheStore
			.getState()
			.getIntegrations(orgHandle, project.id)
			.map((item) => ({ label: item.displayName || item.name, detail: item.id, item })),
		loadQuickPicks: async () => {
			const integrations = await ext.clients.platform.cloud.components.list(project.id);
			dataCacheStore.getState().setIntegrations(orgHandle, project.id, integrations);
			if (integrations.length === 0) {
				throw new Error(`You do not have any existing ${ext.terminologies?.componentTermPlural} in your project. Please retry after creating one.`);
			}
			return integrations.map((item) => ({ label: item.displayName || item.name, detail: item.id, item }));
		},
		loadingTitle,
		selectTitle,
		placeholder: `${ext.terminologies?.componentTermCapitalized} Name`,
	});
	if (!selected) {
		throw new CancelledError();
	}
	return selected;
};

export const selectProject = async (loadingTitle = "Loading projects...", selectTitle = "Select project"): Promise<Project> => {
	const orgHandle = requireOrg().handle;
	const selected = await quickPickWithLoader({
		cacheQuickPicks: dataCacheStore
			.getState()
			.getProjects(orgHandle)
			.map((item) => ({ label: item.name, detail: `Name: ${item.id}`, item })),
		loadQuickPicks: async () => {
			const projects = await ext.clients.platform.cloud.projects.list();
			dataCacheStore.getState().setProjects(orgHandle, projects);
			if (projects.length === 0) {
				throw new Error("You do not have any existing projects. Please try creating one.");
			}
			return projects.map((item) => ({ label: item.name, detail: `Name: ${item.id}`, item }));
		},
		loadingTitle,
		selectTitle,
		placeholder: "Project Name",
	});
	if (!selected) {
		throw new CancelledError();
	}
	return selected;
};

export const selectProjectWithCreateNew = async (
	loadingTitle = "Loading projects...",
	selectTitle = "Select project",
): Promise<{ selectedProject: Project; projectList: Project[] }> => {
	const org = requireOrg();
	type ProjectQuickPick = QuickPickItem & { item?: Project };
	const toPicks = (projects: Project[]): ProjectQuickPick[] => {
		const picks: ProjectQuickPick[] = [];
		if (projects.length > 0) {
			picks.push({ kind: QuickPickItemKind.Separator, label: "Existing projects" }, ...projects.map((item) => ({ label: item.name, detail: `Name: ${item.id}`, item })));
		}
		picks.push({ kind: QuickPickItemKind.Separator, label: "New Project" }, { label: "Create New", detail: `Create new project within ${org.name} organization`, alwaysShow: true });
		return picks;
	};

	const quickPick = window.createQuickPick<ProjectQuickPick>();
	quickPick.busy = true;
	quickPick.title = loadingTitle;
	quickPick.ignoreFocusOut = true;
	quickPick.placeholder = "Project Name";
	let projectList = dataCacheStore.getState().getProjects(org.handle);
	quickPick.items = toPicks(projectList);
	quickPick.show();

	let listError: unknown;
	ext.clients.platform.cloud.projects
		.list()
		.then((projects) => {
			dataCacheStore.getState().setProjects(org.handle, projects);
			projectList = projects;
			quickPick.busy = false;
			quickPick.title = selectTitle;
			quickPick.items = toPicks(projects);
		})
		.catch((err) => {
			// Closing the pick resolves the wait below; the error is what the caller then gets.
			listError = err;
			quickPick.dispose();
		});

	const selection = await new Promise<ProjectQuickPick | null>((resolve) => {
		quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0] ?? null));
		quickPick.onDidHide(() => resolve(null));
	});
	quickPick.dispose();
	if (listError) {
		throw listError;
	}

	if (selection?.label === "Create New") {
		return { projectList, selectedProject: await createNewProject() };
	}
	if (selection?.item) {
		return { projectList, selectedProject: selection.item };
	}
	throw new CancelledError();
};

/** A name the platform accepts for a project or an integration, derived from what a person typed. */
export const toResourceName = (displayName: string): string =>
	displayName
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63)
		.replace(/-+$/, ""); // the cut can end on a hyphen

export const toProjectName = toResourceName;

export const createNewProject = async (projectName?: string, isWorkspaceMapping?: boolean): Promise<Project> => {
	const org = requireOrg();
	const cloud = ext.clients.platform.cloud;
	let projectCache = dataCacheStore.getState().getProjects(org.handle);
	try {
		projectCache = await cloud.projects.list();
		dataCacheStore.getState().setProjects(org.handle, projectCache);
	} catch {
		// Fall back to the cache.
	}

	const newProjectName = await window.showInputBox({
		value: projectName || "",
		placeHolder: "project-name",
		prompt: isWorkspaceMapping
			? "Your BI workspace will be mapped to a Choreo Cloud project. Project name is auto-picked from workspace name, you can edit if needed.\n"
			: "Enter a name for your new project",
		title: isWorkspaceMapping ? "Create Choreo Cloud Project for Workspace" : "New Project Name",
		validateInput: (val) => validateProjectName(val, projectCache),
	});
	if (!newProjectName) {
		throw new CancelledError();
	}
	return createProjectNamed(newProjectName);
};

export const validateProjectName = (val: string, projectCache?: Project[]): string | null => {
	if (!val) {
		return "Project name is required";
	}
	if (projectCache?.some((item) => item.name === val || item.id === toProjectName(val))) {
		return "Project name already exists";
	}
	if (val.length > 60 || val.length < 3) {
		return "Project name must be between 3 and 60 characters";
	}
	if (!/^[A-Za-z]/.test(val)) {
		return "Project name must start with an alphabetic letter";
	}
	if (!/^[A-Za-z\s\d\-_]+$/.test(val)) {
		return "Project name cannot have any special characters";
	}
	return null;
};

/** Creates a project whose display name has already been validated, picking a free handler. */
export const createProjectNamed = async (newProjectName: string): Promise<Project> => {
	const org = requireOrg();
	const cloud = ext.clients.platform.cloud;
	const project = await window.withProgress({ title: `Creating new project ${newProjectName}...`, location: ProgressLocation.Notification }, async () => {
		let name = toProjectName(newProjectName);
		try {
			const availability = await cloud.projects.checkHandler(name);
			if (!availability.handlerUnique && availability.alternateHandlerCandidate) {
				name = availability.alternateHandlerCandidate;
			}
		} catch {
			// The check is advisory; the create answers 409 when the name is taken.
		}
		if (!RESOURCE_NAME.test(name)) {
			throw new Error(`${name} is not a name the platform accepts.`);
		}
		return cloud.projects.create({ name, displayName: newProjectName });
	});

	dataCacheStore.getState().setProjects(org.handle, [...dataCacheStore.getState().getProjects(org.handle).filter((p) => p.id !== project.id), project]);
	return project;
};

/** The project id a deploy created, by organization and name, so a retry after a failed deploy reuses that project only. */
const projectsCreatedForDeploy = new Map<string, string>();

/** The project a deploy goes to: an existing one by id, or a new one by name, which a retry finds empty after a failed deploy and reuses. */
export async function resolveDeployProject(choice: WICloudDeployReq["project"], projects: Project[]): Promise<Project> {
	if ("id" in choice) {
		const project = projects.find((item) => item.id === choice.id);
		if (!project) {
			throw new Error(`The project ${choice.id} no longer exists in Choreo Cloud.`);
		}
		return project;
	}
	const key = `${requireOrg().handle}/${choice.newName}`;
	const earlier = projects.find((item) => item.id === projectsCreatedForDeploy.get(key) && !item.deleting);
	if (earlier && (await ext.clients.platform.cloud.components.list(earlier.id)).length === 0) {
		return earlier;
	}
	const error = validateProjectName(choice.newName, projects);
	if (error) {
		throw new Error(error);
	}
	const project = await createProjectNamed(choice.newName);
	projectsCreatedForDeploy.set(key, project.id);
	return project;
}

/** The git root a deploy builds from, once its directory, remote and branch are the workspace repository's own. */
export async function deploySourceRoot(req: WICloudDeployReq, gitData: GetLocalGitDataResp | undefined, listBranches: () => Promise<string[]>): Promise<string> {
	if (!isSubpath(req.workspaceDir, req.integration.fsPath)) {
		throw new Error("The integration directory is outside the workspace directory.");
	}
	if (!gitData?.gitRoot) {
		throw new Error("The workspace is not in a Git repository. Initialize one, push it to GitHub, then deploy from it.");
	}
	if (!gitData.remotes?.some((remote) => sameRepository(remote, req.gitRemote))) {
		throw new Error(`${req.gitRemote} is not a remote of the workspace repository.`);
	}
	const branches = await listBranches().catch((err: unknown) => {
		throw new Error(`Couldn't read the branches of ${req.gitRemote}: ${err instanceof Error ? err.message : String(err)}`);
	});
	if (!branches.includes(req.branch)) {
		throw new Error(`${req.branch} is not a branch Choreo Cloud can read in ${req.gitRemote}.`);
	}
	return gitData.gitRoot;
}

/** Whether two remote URLs, in any form git reports, name the same GitHub repository; GitHub names are case-insensitive. */
function sameRepository(a: string, b: string): boolean {
	const [x, y] = [parseGitHubRepoUrl(a), parseGitHubRepoUrl(b)];
	return x && y ? `${x.owner}/${x.repo}`.toLowerCase() === `${y.owner}/${y.repo}`.toLowerCase() : a === b;
}

/** A project name `validateProjectName` accepts, made from a title such as a Ballerina.toml's; undefined when none can be. */
export function toValidProjectName(title: string): string | undefined {
	const name = title.replace(/[^A-Za-z\d\s_-]+/g, " ").replace(/^[^A-Za-z]+/, "").replace(/\s+/g, " ").slice(0, 60).trim();
	return name.length >= 3 ? name : undefined;
}

/** The names the project's integrations use as ids, names and display names, lower-cased. */
export const integrationNames = (existing: Component[]): Set<string> =>
	new Set(existing.flatMap((item) => [item.id, item.name, item.displayName ?? ""].filter(Boolean).map((name) => name.toLowerCase())));

/** A name is taken when it, or the resource name the platform derives from it, is one of `taken`. */
export const isIntegrationNameTaken = (taken: Set<string>, name: string): boolean => taken.has(name.trim().toLowerCase()) || taken.has(toResourceName(name));

/** Suffixes each name that an existing integration of the project already uses. */
export function assignUniqueNames(existing: Component[], integrations: { name?: string; fsPath: string }[]): void {
	const taken = integrationNames(existing);
	for (const integration of integrations) {
		const baseName = integration?.name || path.basename(integration.fsPath);
		let candidate = baseName;
		let counter = 1;
		while (isIntegrationNameTaken(taken, candidate)) {
			candidate = `${baseName}-${counter++}`;
		}
		integration.name = candidate;
		taken.add(candidate.toLowerCase());
		taken.add(toResourceName(candidate));
	}
}

/** The first of `preferred`, then main or master, that the remote has; else its first branch. */
export function pickBranch(branches: string[], ...preferred: (string | undefined | null)[]): string | null {
	return [...preferred, "main", "master"].find((branch) => !!branch && branches.includes(branch)) ?? branches[0] ?? null;
}

/** The organization of the session, which every command works inside. */
export const requireOrg = (): Organization => {
	const org = ext.authProvider?.org;
	if (!org) {
		throw new Error("You are not signed in to Choreo Cloud. Please sign in and retry.");
	}
	return org;
};

export const resolveWorkspaceDirectory = async (): Promise<WorkspaceFolder> => {
	if (!workspace.workspaceFolders || workspace.workspaceFolders?.length === 0) {
		throw new Error("Directory is required in order to proceed");
	}
	if (workspace.workspaceFolders?.length === 1) {
		return workspace.workspaceFolders[0];
	}
	const items: QuickPickItem[] = workspace.workspaceFolders!.map((item) => ({ label: item.name, detail: item.uri.path }));
	const directorySelection = await window.showQuickPick(items, { title: "Select Workspace", ignoreFocusOut: true });
	return workspace.workspaceFolders?.find((item) => item.name === directorySelection?.label)!;
};

export const resolveQuickPick = async <T>(items: (QuickPickItem & { item: T })[] = [], quickPickTitle = "selectItem", emptyError = "No items found to pick"): Promise<T> => {
	if (!items || items?.length === 0) {
		throw new Error(emptyError);
	}
	if (items?.length === 1) {
		return items[0]?.item;
	}
	const itemSelection = await window.showQuickPick(items, { title: quickPickTitle, ignoreFocusOut: true });
	if (!itemSelection?.item) {
		throw new Error("No items selected");
	}
	return itemSelection?.item;
};

export async function quickPickWithLoader<T>(params: {
	cacheQuickPicks?: (QuickPickItem & { item?: T })[];
	loadQuickPicks: () => Promise<(QuickPickItem & { item?: T })[]>;
	loadingTitle?: string;
	selectTitle?: string;
	placeholder?: string;
}): Promise<T | undefined | null> {
	const quickPick = window.createQuickPick();
	quickPick.busy = true;
	quickPick.title = params.loadingTitle || "Loading...";
	quickPick.ignoreFocusOut = true;
	quickPick.placeholder = params.placeholder;
	if (params.cacheQuickPicks) {
		quickPick.items = params.cacheQuickPicks;
	}
	quickPick.show();
	let parentErr: Error | undefined;

	params
		.loadQuickPicks()
		.then((quickPickItems) => {
			quickPick.items = quickPickItems;
			quickPick.busy = false;
			quickPick.title = params.selectTitle || "Select an option";
		})
		.catch((err) => {
			quickPick.dispose();
			parentErr = err;
		});
	const selectedQuickPick = await new Promise((resolve) => {
		quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0]));
		quickPick.onDidHide(() => resolve(null));
	});
	quickPick.dispose();
	if (parentErr) {
		throw parentErr;
	}
	return (selectedQuickPick as QuickPickItem & { item?: T })?.item;
}

/**
 * The session a command needs. Offers to sign in when there is none, and
 * answers `null` when the person declines or does not want to continue.
 */
export const requireSession = async (message: string): Promise<PlatformSession | null> => {
	// A command run while the extension starts would otherwise see no session yet.
	await ext.cloudReady;
	const current = ext.authProvider?.state;
	if (current?.session && current.status === "signed-in") {
		return current.session;
	}
	const loginSelection = await window.showInformationMessage("You are not signed in to Choreo Cloud.", { modal: true, detail: `Please sign in to continue and ${message}` }, "Sign in");
	if (loginSelection !== "Sign in") {
		return null;
	}
	try {
		await commands.executeCommand(WICommandIds.SignIn);
	} catch {
		// The sign-in command has already said what went wrong.
		return null;
	}
	// The command returns once the sign-in ended, completed or not; the state says which.
	const after = ext.authProvider?.state;
	if (!after?.session || after.status !== "signed-in") {
		return null;
	}
	const session = after.session;
	const response = await window.showInformationMessage(`Signed in to Choreo Cloud as ${session.user.email ?? session.user.displayName}`, { modal: true, detail: `Do you want to continue and ${message}` }, "Continue");
	return response === "Continue" ? session : null;
};

export const setExtensionName = (extName?: ExtensionName) => {
	if (extName) {
		webviewStateStore.getState().setExtensionName(extName);
	}
};

/** Refuses a command that runs before the cloud layer finished activating. */
export const isPlatformReady = (ext: ExtensionVariables) => {
	if (!ext.clients?.platform) {
		throw new Error(`${webviewStateStore.getState().state.extensionName} extension still hasn't been initialized...`);
	}
};

