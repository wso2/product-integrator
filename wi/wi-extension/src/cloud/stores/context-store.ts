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

import { existsSync, rmSync } from "fs";
import * as path from "path";
import {
	type Component,
	type ComponentRepository,
	type ContextEntry,
	type ContextItemDir,
	type ContextItemEnriched,
	type ContextStoreState,
	type DirectoryIntegration,
	type Project,
	contextKey,
	isCloudError,
} from "@wso2/wso2-cloud-client";
import { parseGitURL } from "@wso2/wso2-platform-core";
import { ProgressLocation, window, workspace } from "vscode";
import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { ext } from "../../extensionVariables";
import { isSamePath, isSubpath } from "../../utils";
import { findContextFile, readContextFile } from "../context-file";
import { getGitRemotes, getGitRoot, relativePath } from "../git/util";
import { dataCacheStore } from "./data-cache-store";
import { locationStore } from "./location-store";
import { getWorkspaceStateStore } from "./store-utils";

interface ContextStore {
	state: ContextStoreState;
	resetState: () => void;
	getValidItems: () => ContextItemEnriched[];
	refreshState: () => Promise<void>;
	changeContext: (selected: ContextItemEnriched) => Promise<void>;
	onSetNewContext: (project: Project, contextDir: ContextItemDir, env?: string) => void;
}

const initialState: ContextStoreState = { items: {}, integrations: [], loading: false };

export const contextStore = createStore(
	persist<ContextStore>(
		(set, get) => ({
			state: initialState,
			resetState: () => {
				changeGeneration++;
				set(() => ({ state: initialState }));
			},
			refreshState: async () => {
				// A refresh that is overtaken by another, or by a sign-out, stops writing.
				const run = ++refreshGeneration;
				const stale = () => run !== refreshGeneration || !ext.authProvider?.isLoggedIn;
				const write = (change: (state: ContextStoreState) => ContextStoreState) => {
					if (!stale()) {
						set(({ state }) => ({ state: change(state) }));
					}
				};
				try {
					if (stale()) {
						return;
					}
					write((state) => ({ ...state, loading: true }));
					let items = await getAllContexts(get().state?.items);
					let selected = await getSelected(items, get().state?.selected);
					write((state) => ({ ...state, items, selected }));
					let integrations = await getIntegrationsFromCache(selected);
					write((state) => ({ ...state, items, selected, integrations }));
					items = await getEnrichedContexts(get().state?.items);
					selected = await getSelected(items, selected);
					integrations = await getIntegrationsFromCache(selected);
					write((state) => ({ ...state, items, selected, integrations }));
					integrations = await getIntegrationsFromPlatform(selected);
					write((state) => ({ ...state, loading: false, items, selected, integrations }));
					if (selected && !stale()) {
						locationStore.getState().setLocation(selected, integrations);
					}
				} catch (err) {
					ext.logError("Failed to refresh the project context", err as Error);
					write((state) => ({ ...state, loading: false }));
				}
			},
			getValidItems: () => Object.values(get().state.items).filter((item) => item.project && !item.foreignOrg),
			onSetNewContext: async (project, contextDir, env) => {
				const orgHandle = ext.authProvider?.org?.handle;
				if (!orgHandle) {
					return;
				}
				const item: ContextItemEnriched = { orgHandle, projectName: project.id, project, contextDirs: [contextDir], defaultEnv: env };
				changeGeneration++;
				set(({ state }) => ({
					state: { ...state, items: { ...state.items, [contextKey({ org: orgHandle, project: project.id })]: item }, selected: item },
				}));
				void get().refreshState();
			},
			changeContext: async (selected) => {
				// A change overtaken by a newer selection, or by a sign-out, stops writing.
				const run = ++changeGeneration;
				const write = (change: (state: ContextStoreState) => ContextStoreState) => {
					if (run === changeGeneration && ext.authProvider?.isLoggedIn) {
						set(({ state }) => ({ state: change(state) }));
					}
				};
				try {
					let integrations = await getIntegrationsFromCache(selected);
					write((state) => ({ ...state, selected, loading: true, integrations }));
					integrations = await getIntegrationsFromPlatform(selected);
					write((state) => ({ ...state, selected, loading: false, integrations }));
				} catch (err) {
					ext.logError("Failed to change the project context", err as Error);
					write((state) => ({ ...state, loading: false }));
				}
			},
		}),
		getWorkspaceStateStore("dir-context-zustand-storage"),
	),
);

let refreshGeneration = 0;
let changeGeneration = 0;

/** Reads every context file in the workspace and, for a workspace folder without one, the one at its git root. */
const getAllContexts = async (previousItems: { [key: string]: ContextItemEnriched }) => {
	const contextFiles = (await workspace.findFiles("**/.wso2/context.yaml")).map((uri) => uri.fsPath);
	const contextItems: { [key: string]: ContextItemEnriched } = {};
	const sessionOrg = ext.authProvider?.org?.handle;

	const addEntries = (contextFilePath: string, dirPath?: string, workspaceName?: string) => {
		for (const entry of readContextFile(contextFilePath)) {
			const key = contextKey(entry);
			const workspaceDir = dirPath ?? path.dirname(path.dirname(contextFilePath));
			const projectRootFsPath = path.dirname(path.dirname(contextFilePath));
			const contextDir: ContextItemDir = {
				contextFileFsPath: contextFilePath,
				dirFsPath: workspaceDir,
				workspaceName: workspaceName ?? path.basename(workspaceDir),
				projectRootFsPath,
			};
			if (contextItems[key]) {
				contextItems[key] = { ...contextItems[key], contextDirs: [...contextItems[key].contextDirs, contextDir] };
			} else if (previousItems?.[key]?.project) {
				contextItems[key] = { ...previousItems[key], contextDirs: [contextDir], defaultEnv: entry.env ?? previousItems[key].defaultEnv };
			} else {
				contextItems[key] = {
					orgHandle: entry.org,
					projectName: entry.project,
					project: dataCacheStore.getState().getProjects(entry.org).find((p) => p.id === entry.project),
					contextDirs: [contextDir],
					defaultEnv: entry.env,
					local: entry.local,
					foreignOrg: !!sessionOrg && entry.org !== sessionOrg,
				};
			}
		}
	};

	for (const contextFile of contextFiles) {
		addEntries(contextFile);
	}
	// A workspace folder with no context file of its own may sit in a repository that has one at its root.
	for (const workspaceFolder of workspace.workspaceFolders ?? []) {
		if (!contextFiles.some((contextFile) => isSubpath(workspaceFolder.uri.fsPath, contextFile))) {
			try {
				const gitRoot = await getGitRoot(ext.context, workspaceFolder.uri.fsPath);
				const contextPath = gitRoot ? findContextFile(gitRoot) : undefined;
				if (contextPath) {
					addEntries(contextPath, workspaceFolder.uri.fsPath, workspaceFolder.name);
				}
			} catch {
				// not a git repository
			}
		}
	}
	return contextItems;
};

const getSelected = async (items: { [key: string]: ContextItemEnriched }, prevSelected?: ContextItemEnriched) => {
	const orgHandle = ext.authProvider?.org?.handle;
	// The cloud editor names the project it was opened for.
	if (ext.isDevantCloudEditor && orgHandle && process.env.CLOUD_INITIAL_PROJECT_ID) {
		let projectsCache = dataCacheStore.getState().getProjects(orgHandle);
		if (projectsCache.length === 0) {
			projectsCache = await ext.clients.platform.cloud.projects.list();
			dataCacheStore.getState().setProjects(orgHandle, projectsCache);
		}
		const wanted = process.env.CLOUD_INITIAL_PROJECT_ID;
		const matchingProject = projectsCache.find((item) => item.id === wanted || item.handler === wanted);
		if (matchingProject) {
			return {
				orgHandle,
				projectName: matchingProject.id,
				project: matchingProject,
				contextDirs:
					workspace.workspaceFolders?.map((item) => ({
						workspaceName: item.name,
						projectRootFsPath: item.uri.fsPath,
						dirFsPath: item.uri.fsPath,
						contextFileFsPath: "",
					})) ?? [],
			} as ContextItemEnriched;
		}
	}

	const globalCompId: string | null | undefined = ext.context.globalState.get("SOURCE_COMPONENT_ID");
	if (globalCompId) {
		await ext.context.globalState.update("SOURCE_COMPONENT_ID", null);
		await ext.context.workspaceState.update("SOURCE_COMPONENT_ID", globalCompId);
	}

	const matchingItem = Object.values(items).find(
		(item) => prevSelected?.orgHandle === item.orgHandle && prevSelected?.projectName === item.projectName && item.project && !item.foreignOrg,
	);

	const openKey: string | null | undefined = ext.context.globalState.get("open-local-repo");
	void ext.context.globalState.update("open-local-repo", null);
	if (openKey && items[openKey]?.project) {
		return items[openKey];
	}

	if (!prevSelected || !matchingItem) {
		const filtered = Object.values(items).filter((item) => item.project && !item.foreignOrg);
		return filtered[0] ?? matchingItem;
	}
	return matchingItem;
};

/** Fills each entry's project in from the platform, once per refresh. */
const getEnrichedContexts = async (items: { [key: string]: ContextItemEnriched }) => {
	const orgHandle = ext.authProvider?.org?.handle;
	if (!orgHandle) {
		return items;
	}
	let projects: Project[] = [];
	try {
		projects = await ext.clients.platform.cloud.projects.list();
		dataCacheStore.getState().setProjects(orgHandle, projects);
	} catch (err) {
		ext.logError("Failed to list the organization's projects", err as Error);
		projects = dataCacheStore.getState().getProjects(orgHandle);
	}
	const enriched: { [key: string]: ContextItemEnriched } = {};
	for (const [key, item] of Object.entries(items)) {
		const foreignOrg = item.orgHandle !== orgHandle;
		const project = foreignOrg ? undefined : projects.find((p) => p.id === item.projectName || p.handler === item.projectName);
		enriched[key] = { ...item, project, foreignOrg };
	}
	return enriched;
};

const getIntegrationsFromCache = async (selected?: ContextItemEnriched): Promise<DirectoryIntegration[]> => {
	if (!selected) {
		return [];
	}
	const cache = dataCacheStore.getState();
	const integrations = cache.getIntegrations(selected.orgHandle, selected.projectName);
	return mapIntegrationList(integrations, selected, (id) => cache.getRepository(selected.orgHandle, selected.projectName, id));
};

const getIntegrationsFromPlatform = async (selected?: ContextItemEnriched): Promise<DirectoryIntegration[]> => {
	if (!selected?.project || selected.foreignOrg) {
		return getIntegrationsFromCache(selected);
	}
	const cloud = ext.clients.platform.cloud;
	const integrations = await cloud.components.list(selected.projectName);
	dataCacheStore.getState().setIntegrations(selected.orgHandle, selected.projectName, integrations);
	// The listing carries no repository; each is read once and cached.
	const repositories = new Map<string, ComponentRepository | undefined>();
	await Promise.all(
		integrations.map(async (integration) => {
			const cached = dataCacheStore.getState().getRepository(selected.orgHandle, selected.projectName, integration.id);
			if (cached) {
				repositories.set(integration.id, cached);
				return;
			}
			try {
				const repository = await cloud.components.repository(integration.id, selected.projectName);
				dataCacheStore.getState().setRepository(selected.orgHandle, selected.projectName, integration.id, repository);
				repositories.set(integration.id, repository);
			} catch (error) {
				if (!(isCloudError(error) && error.code === "not_found")) {
					ext.logError(`Failed to read the repository of ${integration.id}`, error as Error);
				}
			}
		}),
	);
	return mapIntegrationList(integrations, selected, (id) => repositories.get(id));
};

const getFilteredIntegrations = (integrations: Component[]) => {
	const workspaceCompId = process.env.SOURCE_COMPONENT_ID;
	if (workspaceCompId) {
		const filtered = integrations.filter((item) => item.id === workspaceCompId);
		if (filtered.length === 1) {
			return filtered;
		}
	}
	return integrations;
};

/** The clone URL and the sub path of a repository, in the words `parseGitURL` reads. */
export const repositoryUrlOf = (repository: ComponentRepository | undefined): string | undefined => {
	if (!repository) {
		return undefined;
	}
	if (repository.serverUrl) {
		return repository.serverUrl;
	}
	if (repository.organizationApp && repository.nameApp) {
		const host = repository.gitProvider === "bitbucket" ? "bitbucket.org" : "github.com";
		return `https://${host}/${repository.organizationApp}/${repository.nameApp}`;
	}
	return undefined;
};

export const repositorySubPathOf = (repository: ComponentRepository | undefined): string => (repository?.appSubPath ?? "").replace(/^\/+|\/+$/g, "");

/** Matches each integration's repository against the directories' git remotes. */
const mapIntegrationList = async (
	integrations: Component[],
	selected: ContextItemEnriched | undefined,
	repositoryOf: (integrationId: string) => ComponentRepository | undefined,
): Promise<DirectoryIntegration[]> => {
	const found: DirectoryIntegration[] = [];
	if (!selected?.contextDirs) {
		return found;
	}
	for (const integration of getFilteredIntegrations(integrations)) {
		const repository = repositoryOf(integration.id);
		const parsedRepoUrl = parseGitURL(repositoryUrlOf(repository) ?? "");
		if (!parsedRepoUrl) {
			continue;
		}
		const [repoOrg, repoName, repoProvider] = parsedRepoUrl;
		for (const dir of selected.contextDirs) {
			const gitRoot = await getGitRoot(ext.context, dir.projectRootFsPath);
			if (!gitRoot) {
				continue;
			}
			const remotes = await getGitRemotes(ext.context, gitRoot);
			const hasMatchingRemote = remotes.some((remote) => {
				const parsed = parseGitURL(remote.fetchUrl);
				return !!parsed && parsed[0] === repoOrg && parsed[1] === repoName && parsed[2] === repoProvider;
			});
			if (!hasMatchingRemote) {
				continue;
			}
			const subPathDir = path.join(gitRoot, repositorySubPathOf(repository));
			const within = isSamePath(dir.dirFsPath, subPathDir) || isSubpath(dir.dirFsPath, subPathDir);
			if (within && existsSync(subPathDir) && !found.some((item) => item.integration.id === integration.id)) {
				if (integration.isPrebuilt && ext.isDevantCloudEditor) {
					// A prebuilt integration opened in the cloud editor: drop the sample's .git so a deploy attaches the person's own repository.
					void ext.context.workspaceState.update("SOURCE_COMPONENT_ID", integration.id);
					rmSync(path.join(gitRoot, ".git"), { recursive: true, force: true });
					continue;
				}
				found.push({
					integration,
					repository,
					workspaceName: dir.workspaceName,
					fsPath: subPathDir,
					relativePath: relativePath(dir.dirFsPath, subPathDir),
				});
			}
		}
	}
	return found;
};

export const waitForContextStoreToLoad = async (): Promise<void> => {
	if (!contextStore.getState().state.loading) {
		return;
	}
	const listenToLoad = (): Promise<void> =>
		new Promise((resolve) => {
			const unsubscribe = contextStore.subscribe(({ state }) => {
				if (!state.loading) {
					unsubscribe();
					resolve();
				}
			});
		});
	return window.withProgress({ title: "Loading project directory...", location: ProgressLocation.Notification }, () => listenToLoad());
};

export const getContextKey = (orgHandle: string, project: Project | string) => contextKey({ org: orgHandle, project: typeof project === "string" ? project : project.id });

