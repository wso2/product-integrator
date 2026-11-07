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

import type { Component, ComponentRepository, Project } from "@wso2/wso2-cloud-client";
import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { ext } from "../../extensionVariables";
import { getGlobalStateStore } from "./store-utils";

/** What is kept between sessions, per organization and deployment, so the UI shows something before the platform answers. */
export interface DataCacheState {
	orgs?: {
		[orgKey: string]: {
			projects?: {
				[projectName: string]: {
					data?: Project;
					integrations?: {
						[integrationId: string]: {
							data?: Component;
							repository?: ComponentRepository;
						};
					};
				};
			};
		};
	};
}

interface DataCacheStore {
	state: DataCacheState;
	setProjects: (orgHandle: string, projects: Project[]) => void;
	getProjects: (orgHandle: string) => Project[];
	setIntegrations: (orgHandle: string, projectName: string, integrations: Component[]) => void;
	getIntegrations: (orgHandle: string, projectName: string) => Component[];
	setRepository: (orgHandle: string, projectName: string, integrationId: string, repository: ComponentRepository) => void;
	getRepository: (orgHandle: string, projectName: string, integrationId: string) => ComponentRepository | undefined;
}

type OrgCache = NonNullable<DataCacheState["orgs"]>[string];
type ProjectCache = NonNullable<OrgCache["projects"]>[string];
type IntegrationCache = NonNullable<ProjectCache["integrations"]>[string];

export const dataCacheStore = createStore(
	persist<DataCacheStore>(
		(set, get) => {
			const orgCache = (orgHandle: string): OrgCache => get().state?.orgs?.[getRootKey(orgHandle)] ?? {};
			const projectCache = (orgHandle: string, projectName: string): ProjectCache => orgCache(orgHandle).projects?.[projectName] ?? {};
			const integrationCache = (orgHandle: string, projectName: string, id: string): IntegrationCache =>
				projectCache(orgHandle, projectName).integrations?.[id] ?? {};
			const setOrgCache = (orgHandle: string, change: (org: OrgCache) => OrgCache) =>
				set(({ state }) => ({ state: { ...state, orgs: { ...(state.orgs ?? {}), [getRootKey(orgHandle)]: change(orgCache(orgHandle)) } } }));
			const setProjectCache = (orgHandle: string, projectName: string, change: (project: ProjectCache) => ProjectCache) =>
				setOrgCache(orgHandle, (org) => ({ ...org, projects: { ...(org.projects ?? {}), [projectName]: change(projectCache(orgHandle, projectName)) } }));
			const setIntegrationCache = (orgHandle: string, projectName: string, id: string, change: (integration: IntegrationCache) => IntegrationCache) =>
				setProjectCache(orgHandle, projectName, (project) => ({
					...project,
					integrations: { ...(project.integrations ?? {}), [id]: change(integrationCache(orgHandle, projectName, id)) },
				}));

			return {
				state: {},
				setProjects: (orgHandle, projects) =>
					setOrgCache(orgHandle, (org) => {
						const projectsCache: OrgCache["projects"] = {};
						for (const project of projects) {
							projectsCache[project.id] = { ...(org.projects?.[project.id] ?? {}), data: project };
						}
						return { ...org, projects: projectsCache };
					}),
				getProjects: (orgHandle) =>
					Object.values(orgCache(orgHandle).projects ?? {})
						.map((item) => item.data)
						.filter((item): item is Project => !!item),
				setIntegrations: (orgHandle, projectName, integrations) =>
					setProjectCache(orgHandle, projectName, (project) => {
						const integrationsCache: ProjectCache["integrations"] = {};
						for (const integration of integrations) {
							integrationsCache[integration.id] = { ...(project.integrations?.[integration.id] ?? {}), data: integration };
						}
						return { ...project, integrations: integrationsCache };
					}),
				getIntegrations: (orgHandle, projectName) =>
					Object.values(projectCache(orgHandle, projectName).integrations ?? {})
						.map((item) => item.data)
						.filter((item): item is Component => !!item),
				setRepository: (orgHandle, projectName, integrationId, repository) =>
					setIntegrationCache(orgHandle, projectName, integrationId, (integration) => ({ ...integration, repository })),
				getRepository: (orgHandle, projectName, integrationId) => integrationCache(orgHandle, projectName, integrationId).repository,
			};
		},
		getGlobalStateStore("data-cache-zustand-storage"),
	),
);

/** One cache per organization and deployment: the same handle on dev and prod are different organizations. */
export const getRootKey = (orgHandle: string) => `${ext.cloudEnv}-${orgHandle}`;
