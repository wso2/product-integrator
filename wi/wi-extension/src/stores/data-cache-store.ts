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

import type { CommitHistory, ComponentKind, DataCacheState, Environment, Organization, Project } from "@wso2/wso2-platform-core";
import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { ext } from "../extensionVariables";
import { getGlobalStateStore } from "./store-utils";

interface DataCacheStore {
    state: DataCacheState;
    setOrgs: (orgs: Organization[]) => void;
    setProjects: (orgHandle: string, projects: Project[]) => void;
    getProjects: (orgHandle: string) => Project[];
    setComponents: (orgHandle: string, projectHandle: string, components: ComponentKind[]) => void;
    getComponents: (orgHandle: string, projectHandle: string) => ComponentKind[];
    setCommits: (orgHandle: string, projectHandle: string, componentHandle: string, branch: string, commits: CommitHistory[]) => void;
    getCommits: (orgHandle: string, projectHandle: string, componentHandle: string, branch: string) => CommitHistory[];
    setEnvs: (orgHandle: string, projectHandle: string, envs: Environment[]) => void;
    getEnvs: (orgHandle: string, projectHandle: string) => Environment[];
}

export const dataCacheStore = createStore(
    persist<DataCacheStore>(
        (set, get) => ({
            state: {},
            setOrgs: (orgs) => {
                const updatedOrgs = get().state?.orgs ?? {};
                orgs.forEach((item) => {
                    updatedOrgs[item.handle] = { projects: updatedOrgs[item.handle]?.projects || {}, data: item };
                });
                set(({ state }) => ({ state: { ...state, orgs: updatedOrgs } }));
            },
            setProjects: (orgHandle, projects) => {
                const updatedProjects: {
                    [projectHandle: string]: {
                        data?: Project;
                        components?: { [componentHandle: string]: { data?: ComponentKind; commits?: { [branch: string]: CommitHistory[] } } };
                    };
                } = {};
                projects.forEach((item) => {
                    updatedProjects[item.handler] = {
                        components: get().state?.orgs?.[getRootKey(orgHandle)]?.projects?.[item.handler]?.components || {},
                        data: item,
                    };
                });

                const updatedOrgs = {
                    ...(get().state?.orgs ?? {}),
                    [getRootKey(orgHandle)]: { ...(get().state?.orgs?.[getRootKey(orgHandle)] ?? {}), projects: updatedProjects },
                };

                set(({ state }) => ({ state: { ...state, orgs: updatedOrgs } }));
            },
            setEnvs: (orgHandle, projectHandle, envs) => {
                set(({ state }) => ({
                    state: {
                        ...state,
                        orgs: {
                            ...(get().state?.orgs ?? {}),
                            [getRootKey(orgHandle)]: {
                                ...(get().state?.orgs?.[getRootKey(orgHandle)] ?? {}),
                                projects: {
                                    ...(get().state?.orgs?.[getRootKey(orgHandle)]?.projects ?? {}),
                                    [projectHandle]: {
                                        ...(get().state?.orgs?.[getRootKey(orgHandle)]?.projects?.[projectHandle] ?? {}),
                                        envs,
                                    },
                                },
                            },
                        },
                    },
                }));
            },
            getEnvs: (orgHandle, projectHandle) => {
                return get().state.orgs?.[getRootKey(orgHandle)]?.projects?.[projectHandle]?.envs || [];
            },
            getProjects: (orgHandle) => {
                const projectList = Object.values(get().state.orgs?.[getRootKey(orgHandle)]?.projects ?? {})
                    .filter((item) => item.data)
                    .map((item) => item.data);
                return projectList as Project[];
            },
            setComponents: (orgHandle, projectHandle, components) => {
                const newComponents: { [componentHandle: string]: { data?: ComponentKind; commits?: { [branch: string]: CommitHistory[] } } } = {};
                const prevComponents = get().state.orgs?.[getRootKey(orgHandle)]?.projects?.[projectHandle]?.components ?? {};
                components.forEach((item) => {
                    const matchingItem = prevComponents[item.metadata.name];
                    newComponents[item.metadata.name] = { ...matchingItem, data: item };
                });

                const updatedOrgs = {
                    ...(get().state?.orgs ?? {}),
                    [getRootKey(orgHandle)]: {
                        ...(get().state?.orgs?.[getRootKey(orgHandle)] ?? {}),
                        projects: {
                            ...(get().state?.orgs?.[getRootKey(orgHandle)]?.projects ?? {}),
                            [projectHandle]: {
                                ...(get().state?.orgs?.[getRootKey(orgHandle)]?.projects?.[projectHandle] ?? {}),
                                components: newComponents,
                            },
                        },
                    },
                };

                set(({ state }) => ({ state: { ...state, orgs: updatedOrgs } }));
            },
            getComponents: (orgHandle, projectHandle) => {
                const componentList = Object.values(
                    get().state.orgs?.[getRootKey(orgHandle)]?.projects?.[projectHandle]?.components ?? {},
                )
                    .filter((item) => item.data)
                    .map((item) => item.data);
                return componentList as ComponentKind[];
            },
            setCommits: (orgHandle, projectHandle, componentHandle, branch, commits) => {
                const updatedOrgs = {
                    ...(get().state?.orgs ?? {}),
                    [getRootKey(orgHandle)]: {
                        ...(get().state?.orgs?.[getRootKey(orgHandle)] ?? {}),
                        projects: {
                            ...(get().state?.orgs?.[getRootKey(orgHandle)]?.projects ?? {}),
                            [projectHandle]: {
                                ...(get().state?.orgs?.[getRootKey(orgHandle)]?.projects?.[projectHandle] ?? {}),
                                components: {
                                    ...(get().state?.orgs?.[getRootKey(orgHandle)]?.projects?.[projectHandle]?.components ?? {}),
                                    [componentHandle]: {
                                        ...(get().state?.orgs?.[getRootKey(orgHandle)]?.projects?.[projectHandle]?.components?.[componentHandle] ?? {}),
                                        commits: {
                                            ...(get().state?.orgs?.[getRootKey(orgHandle)]?.projects?.[projectHandle]?.components?.[componentHandle]?.commits ?? {}),
                                            [branch]: commits,
                                        },
                                    },
                                },
                            },
                        },
                    },
                };

                set(({ state }) => ({ state: { ...state, orgs: updatedOrgs } }));
            },
            getCommits: (orgHandle, projectHandle, componentHandle, branch) => {
                return (
                    get().state.orgs?.[getRootKey(orgHandle)]?.projects?.[projectHandle]?.components?.[componentHandle]?.commits?.[branch] ?? []
                );
            },
        }),
        getGlobalStateStore("data-cache-zustand-storage"),
    ),
);

const getRootKey = (orgHandle: string) => {
    const region = ext.authProvider?.getState().state.region;
    const env = ext.cloudEnv;
    let orgRegionHandle = `${region}-${orgHandle}`;
    if (env !== "prod") {
        orgRegionHandle = `${env}-${orgRegionHandle}`;
    }
    return orgRegionHandle;
};
