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

import type { Component, Organization, PlatformSession, Project } from "@wso2/wso2-cloud-client";
import { type ExtensionName, WICommandIds } from "@wso2/wso2-platform-core";
import { ProgressLocation, type QuickPickItem, QuickPickItemKind, type WorkspaceFolder, commands, window, workspace } from "vscode";
import { type ExtensionVariables, ext } from "../../extensionVariables";
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
			const integrations = await ext.backend.integrations.list(project.id);
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
			const projects = await ext.backend.projects.list();
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
	ext.backend.projects
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
	let projectCache = dataCacheStore.getState().getProjects(org.handle);
	try {
		projectCache = await ext.backend.projects.list();
		dataCacheStore.getState().setProjects(org.handle, projectCache);
	} catch {
		// Fall back to the cache.
	}

	const newProjectName = await window.showInputBox({
		value: projectName || "",
		placeHolder: "project-name",
		prompt: isWorkspaceMapping
			? `Your BI workspace will be mapped to a ${ext.backend.label} project. Project name is auto-picked from workspace name, you can edit if needed.\n`
			: "Enter a name for your new project",
		title: isWorkspaceMapping ? `Create ${ext.backend.label} Project for Workspace` : "New Project Name",
		validateInput: (val) => {
			if (!val) {
				return "Project name is required";
			}
			if (projectCache?.some((item) => item.name === val || item.handler === toProjectName(val))) {
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
		},
	});
	if (!newProjectName) {
		throw new CancelledError();
	}

	const project = await window.withProgress({ title: `Creating new project ${newProjectName}...`, location: ProgressLocation.Notification }, () =>
		ext.backend.projects.create(newProjectName),
	);

	dataCacheStore.getState().setProjects(org.handle, [...dataCacheStore.getState().getProjects(org.handle).filter((p) => p.id !== project.id), project]);
	return project;
};

/** The organization of the session, which every command works inside. */
export const requireOrg = (): Organization => {
	const org = ext.authProvider?.org;
	if (!org) {
		throw new Error(`You are not signed in to ${ext.backend.label}. Please sign in and retry.`);
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
	const loginSelection = await window.showInformationMessage(`You are not signed in to ${ext.backend.label}.`, { modal: true, detail: `Please sign in to continue and ${message}` }, "Sign in");
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
	const response = await window.showInformationMessage(`Signed in to ${ext.backend.label} as ${session.user.email ?? session.user.displayName}`, { modal: true, detail: `Do you want to continue and ${message}` }, "Continue");
	return response === "Continue" ? session : null;
};

export const setExtensionName = (extName?: ExtensionName) => {
	if (extName) {
		webviewStateStore.getState().setExtensionName(extName);
	}
};

/** Refuses a command that runs before the cloud layer finished activating. */
export const isPlatformReady = (ext: ExtensionVariables) => {
	if (!ext.backend) {
		throw new Error(`${webviewStateStore.getState().state.extensionName} extension still hasn't been initialized...`);
	}
};

