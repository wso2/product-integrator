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

import { existsSync, readFileSync, rmSync } from "fs";
import * as path from "path";
import {
    type ComponentKind,
    type ContextItem,
    type ContextItemDir,
    type ContextItemEnriched,
    type ContextStoreComponentState,
    type ContextStoreState,
    type Environment,
    type Organization,
    type Project,
    getComponentKindRepoSource,
    parseGitURL,
} from "@wso2/wso2-platform-core";
import * as yaml from "js-yaml";
import { ProgressLocation, window, workspace } from "vscode";
import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { ext } from '../../extensionVariables';
import { getGitRemotes, getGitRoot, relativePath } from "../git/util";
import { isSamePath, isSubpath } from '../../utils';
import { dataCacheStore } from "./data-cache-store";
import { locationStore } from "./location-store";
import { getWorkspaceStateStore } from "./store-utils";

interface ContextStore {
    state: ContextStoreState;
    resetState: () => void;
    getValidItems: () => ContextItemEnriched[];
    refreshState: () => Promise<void>;
    changeContext: (selected: ContextItemEnriched) => Promise<void>;
    onSetNewContext: (org: Organization, project: Project, contextDir: ContextItemDir) => void;
}

const initialState: ContextStoreState = { items: {}, components: [], loading: false };

export const contextStore = createStore(
    persist<ContextStore>(
        (set, get) => ({
            state: initialState,
            resetState: () => set(() => ({ state: initialState })),
            refreshState: async () => {
                try {
                    if (ext.authProvider?.getState().state?.userInfo) {
                        set(({ state }) => ({ state: { ...state, loading: true } }));
                        let items = await getAllContexts(get().state?.items);
                        let selected = await getSelected(items, get().state?.selected);
                        set(({ state }) => ({ state: { ...state, items, selected } }));
                        let components = await getComponentsInfoCache(selected);
                        set(({ state }) => ({ state: { ...state, items, selected, components } }));
                        items = await getEnrichedContexts(get().state?.items);
                        selected = await getSelected(items, selected);
                        components = await getComponentsInfoCache(selected);
                        set(({ state }) => ({ state: { ...state, items, selected, components } }));
                        components = await getComponentsInfo(selected);
                        set(({ state }) => ({ state: { ...state, loading: false, items, selected, components } }));
                        if (selected) {
                            locationStore.getState().setLocation(selected, components);
                            updateProjectEnvCache(selected);
                        }
                    }
                } catch (err) {
                    set(({ state }) => ({ state: { ...state, loading: false, error: err as Error } }));
                }
            },
            getValidItems: () => Object.values(get().state.items).filter((item) => item.org && item.project),
            onSetNewContext: async (org, project, contextDir) => {
                try {
                    const item: ContextItemEnriched = {
                        orgHandle: org.handle,
                        org,
                        projectHandle: project.handler,
                        project,
                        contextDirs: [contextDir],
                    };
                    set(({ state }) => ({
                        state: {
                            ...state,
                            items: { ...state.items, [getContextKey(org, project)]: item },
                            selected: item,
                        },
                    }));
                    get().refreshState();
                } catch (err) {
                    set(({ state }) => ({ state: { ...state, loading: false, error: err as Error } }));
                }
            },
            changeContext: async (selected) => {
                try {
                    let components = await getComponentsInfoCache(selected);
                    set(({ state }) => ({ state: { ...state, selected, loading: true, components } }));
                    components = await getComponentsInfo(selected);
                    set(({ state }) => ({ state: { ...state, selected, loading: false, components } }));
                } catch (err) {
                    set(({ state }) => ({ state: { ...state, loading: false, error: err as Error } }));
                }
            },
        }),
        getWorkspaceStateStore("dir-context-zustand-storage"),
    ),
);

const getAllContexts = async (previousItems: { [key: string]: ContextItemEnriched }) => {
    const contextFiles = await workspace.findFiles("**/{.wso2,.choreo}/context.yaml");
    const contextItems: { [key: string]: ContextItemEnriched } = {};

    const setContextObj = (contextFilePath: string, dirPath?: string, workspaceName?: string) => {
        let parsedData: ContextItem[] = yaml.load(readFileSync(contextFilePath, "utf8")) as any;
        if (!Array.isArray(parsedData) && (parsedData as any)?.org && (parsedData as any)?.project) {
            parsedData = [{ org: (parsedData as any).org, project: (parsedData as any).project }];
        } else if (parsedData === undefined) {
            parsedData = [];
        }

        for (const contextItem of parsedData) {
            const key = `${contextItem.org}-${contextItem.project}`;

            const workspaceDir = dirPath ?? path.dirname(path.dirname(contextFilePath));
            const projectRootFsPath = path.dirname(path.dirname(contextFilePath));
            const wsName = workspaceName ?? path.basename(workspaceDir);

            const contextDir: ContextItemDir = {
                contextFileFsPath: contextFilePath,
                dirFsPath: workspaceDir,
                workspaceName: wsName,
                projectRootFsPath,
            };

            if (contextItems[key]) {
                contextItems[key] = {
                    ...contextItems[key],
                    contextDirs: [...contextItems[key].contextDirs, contextDir],
                };
            } else if (previousItems?.[key]?.org && previousItems?.[key].project) {
                contextItems[key] = { ...previousItems?.[key], contextDirs: [contextDir] };
            } else {
                const userOrgs = ext.authProvider?.getState().state.userInfo?.organizations;
                const matchingOrg = userOrgs?.find((item: Organization) => item.handle === contextItem.org);

                const projectsOfOrg = dataCacheStore.getState().getProjects(contextItem.org);
                const matchingProject = projectsOfOrg.find((item) => item.handler === contextItem.project);

                contextItems[key] = {
                    orgHandle: contextItem.org,
                    org: matchingOrg,
                    projectHandle: contextItem.project,
                    project: matchingProject,
                    contextDirs: [contextDir],
                };
            }
        }
    };

    if (contextFiles.length > 0) {
        for (const contextFile of contextFiles) {
            setContextObj(contextFile.fsPath);
        }
    } else if (workspace.workspaceFolders) {
        for (const workspaceFolder of workspace.workspaceFolders) {
            try {
                const gitRoot = await getGitRoot(ext.context, workspaceFolder.uri.fsPath);
                if (gitRoot) {
                    const wso2ContextPath = path.join(gitRoot, ".wso2", "context.yaml");
                    const contextPath = existsSync(wso2ContextPath) ? wso2ContextPath : path.join(gitRoot, ".choreo", "context.yaml");
                    if (existsSync(contextPath)) {
                        setContextObj(contextPath, workspaceFolder.uri.fsPath, workspaceFolder.name);
                    }
                }
            } catch {
                console.log("workspaceFolder.uri.fsPat is not a Git repo");
            }
        }
    }

    return contextItems;
};

const getSelected = async (items: { [key: string]: ContextItemEnriched }, prevSelected?: ContextItemEnriched) => {
    if (ext.isDevantCloudEditor && process.env.CLOUD_INITIAL_ORG_ID && process.env.CLOUD_INITIAL_PROJECT_ID) {
        const userOrgs = ext.authProvider?.getState().state.userInfo?.organizations;
        const matchingOrg = userOrgs?.find(
            (item: Organization) => item.uuid === process.env.CLOUD_INITIAL_ORG_ID || item.id?.toString() === process.env.CLOUD_INITIAL_ORG_ID,
        );
        if (matchingOrg) {
            let projectsCache = dataCacheStore.getState().getProjects(matchingOrg.handle);
            if (projectsCache.length === 0) {
                const projects = await ext.clients.rpcClient.getProjects(matchingOrg.id.toString());
                dataCacheStore.getState().setProjects(matchingOrg.handle, projects);
                projectsCache = projects;
            }
            const matchingProject = projectsCache.find((item) => item.id === process.env.CLOUD_INITIAL_PROJECT_ID);
            if (matchingProject) {
                return {
                    orgHandle: matchingOrg.handle,
                    projectHandle: matchingProject.handler,
                    org: matchingOrg,
                    project: matchingProject,
                    contextDirs:
                        workspace.workspaceFolders?.map((item) => ({
                            workspaceName: item.name,
                            projectRootFsPath: item.uri.fsPath,
                            dirFsPath: item.uri.fsPath,
                        })) ?? [],
                } as ContextItemEnriched;
            }
        }
    }

    const globalCompId: string | null | undefined = ext.context.globalState.get("SOURCE_COMPONENT_ID");
    if (globalCompId) {
        await ext.context.globalState.update("SOURCE_COMPONENT_ID", null);
        await ext.context.workspaceState.update("SOURCE_COMPONENT_ID", globalCompId);
    }

    let selected: ContextItemEnriched | undefined = undefined;
    const matchingItem = Object.values(items).find(
        (item) =>
            prevSelected?.orgHandle === item.orgHandle &&
            prevSelected?.projectHandle === item.projectHandle &&
            prevSelected?.org &&
            prevSelected?.project,
    );

    const openKey: string | null | undefined = ext.context.globalState.get("open-local-repo");
    ext.context.globalState.update("open-local-repo", null);
    if (openKey) {
        const selected = items[openKey];
        if (selected?.org && selected?.project) {
            return selected;
        }
    }

    if (!prevSelected || !matchingItem) {
        const filtered = Object.values(items).filter((item) => item.org && item.project);
        if (filtered.length > 0) {
            selected = filtered[0];
        }
    }

    return selected || matchingItem;
};

const getEnrichedContexts = async (items: { [key: string]: ContextItemEnriched }) => {
    const userOrgs = ext.authProvider?.getState().state.userInfo?.organizations;

    const orgsSet = new Set<string>();
    Object.values(items).forEach((item) => {
        if (item.org) {
            orgsSet.add(item.org.handle);
        }
    });
    const orgHandleList = Array.from(orgsSet);

    const projectsMap = new Map<string, Project[]>();
    await Promise.all(
        orgHandleList.map(async (orgHandle) => {
            const matchingOrg = userOrgs?.find((item: Organization) => item.handle === orgHandle);
            if (matchingOrg) {
                try {
                    const projects = await ext.clients.rpcClient.getProjects(matchingOrg.id.toString());
                    dataCacheStore.getState().setProjects(matchingOrg.handle, projects);
                    projectsMap.set(orgHandle, projects);
                } catch (err) {
                    console.log("failed to fetch project", err);
                }
            }
        }),
    );

    const enrichedItems: { [key: string]: ContextItemEnriched } = {};
    Object.keys(items).forEach((itemKey) => {
        const itemToEnrich = items[itemKey];
        const matchingProject = projectsMap.get(itemToEnrich.orgHandle)?.find((item) => item.handler === itemToEnrich.projectHandle);
        enrichedItems[itemKey] = { ...itemToEnrich, project: matchingProject };
    });

    return enrichedItems;
};

const getComponentsInfoCache = async (selected?: ContextItemEnriched): Promise<ContextStoreComponentState[]> => {
    if (!selected) {
        return [];
    }

    const componentCache = dataCacheStore.getState().getComponents(selected.orgHandle, selected.projectHandle);
    return mapComponentList(componentCache, selected);
};

const updateProjectEnvCache = async (selected: ContextItemEnriched): Promise<void> => {
    if (selected) {
        ext.clients.rpcClient
            .getEnvs({
                orgId: selected?.org?.id.toString()!,
                orgUuid: selected?.org?.uuid!,
                projectId: selected?.project?.id!,
            })
            .then((envs: Environment[]) => {
                dataCacheStore.getState().setEnvs(selected?.orgHandle, selected?.projectHandle, envs);
            });
    }
};

const getComponentsInfo = async (selected?: ContextItemEnriched): Promise<ContextStoreComponentState[]> => {
    if (!selected || !selected?.org?.id) {
        return getComponentsInfoCache(selected);
    }

    const components = await ext.clients.rpcClient.getComponentList({
        orgId: selected?.org?.id.toString(),
        orgHandle: selected?.org?.handle,
        projectHandle: selected.projectHandle,
        projectId: selected.project?.id!,
    });

    dataCacheStore.getState().setComponents(selected.orgHandle, selected.projectHandle, components);
    return mapComponentList(components, selected);
};

const getFilteredComponents = (components: ComponentKind[]) => {
    const workspaceCompId: string | null | undefined = process.env.SOURCE_COMPONENT_ID;
    if (workspaceCompId) {
        const filteredComps = components.filter((item) => item.metadata?.id === workspaceCompId);
        if (filteredComps.length === 1) {
            return filteredComps;
        }
    }
    return components;
};

const mapComponentList = async (components: ComponentKind[], selected?: ContextItemEnriched): Promise<ContextStoreComponentState[]> => {
    const comps: ContextStoreComponentState[] = [];
    for (const componentItem of getFilteredComponents(components)) {
        if (selected?.contextDirs) {
            // biome-ignore lint/correctness/noUnsafeOptionalChaining:
            for (const item of selected?.contextDirs) {
                const gitRoot = await getGitRoot(ext.context, item.projectRootFsPath);
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
                            const isSubPath = isSubpath(item.dirFsPath, subPathDir);
                            const isPathSame = isSamePath(item.dirFsPath, subPathDir);
                            if (
                                (isPathSame || isSubPath) &&
                                existsSync(subPathDir) &&
                                !comps.some((item) => item.component?.metadata?.id === componentItem.metadata?.id)
                            ) {
                                if (componentItem.metadata?.isPrebuilt && ext.isDevantCloudEditor) {
                                    // if its a prebuilt integration(we are in the samples repo), we will remove the .git directory 
                                    // thus making sure that when user tries to deploy it, we will update associated repo
                                    ext.context.workspaceState.update("SOURCE_COMPONENT_ID", componentItem?.metadata?.id);
                                    rmSync(path.join(gitRoot, ".git"), { recursive: true, force: true });
                                    continue;
                                }
                                comps.push({
                                    component: componentItem,
                                    workspaceName: item.workspaceName,
                                    componentFsPath: subPathDir,
                                    componentRelativePath: relativePath(item.dirFsPath, subPathDir),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    return comps;
};

export const waitForContextStoreToLoad = async (): Promise<void> => {
    const isLoading = contextStore.getState().state.loading;
    if (!isLoading) {
        return;
    }

    const listenToLoad = (): Promise<void> => {
        return new Promise((resolve) => {
            contextStore.subscribe(({ state }) => {
                if (!state.loading) {
                    resolve();
                }
            });
        });
    };
    return window.withProgress({ title: "Loading project directory...", location: ProgressLocation.Notification }, () => listenToLoad());
};

export const getContextKey = (org: Organization, project: Project) => `${org.handle}-${project.handler}`;
