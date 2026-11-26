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

import { NotFoundError, NotSupportedError, type Organization } from "@wso2/wso2-cloud-client";
import type { DevantClient } from "@wso2/wso2-cloud-client/devant/vscode";
import type { ComponentKind, Project as DevantProject } from "@wso2/wso2-platform-core";
import { window } from "vscode";
import { ext } from "../../../extensionVariables";
import type { CloudBackend } from "../port";
import { legacyContextFiles } from "./context-file";
import { submitDevantIntegrations } from "./create";
import { authorizeGitHub, completeGitHubCallback, installGitHubApp, isDevantGitHubCallback } from "./github";
import { toComponent, toProject, toRepository } from "./mapping";

/** Devant's name in the platform switch, as the cloud client registers it. */
export const DEVANT_PLATFORM = "devant";
export const DEVANT_LABEL = "Devant";

export interface DevantBackendDeps {
	/** The Devant client of the clients in use; undefined while another platform is. */
	client(): DevantClient | undefined;
	/** The organization signed in to. */
	org(): Organization | undefined;
}

/**
 * Devant behind the port. Projects and integrations are addressed by handle and name, as on Choreo Cloud; the ids
 * Devant's API takes are looked up from what was listed last.
 */
export function devantCloudBackend(deps: DevantBackendDeps): CloudBackend {
	const projects = new Map<string, DevantProject>();
	const components = new Map<string, ComponentKind[]>();

	const client = (): DevantClient => {
		const devant = deps.client();
		if (!devant) {
			throw new NotSupportedError("Devant is not the platform in use.", { reason: "platform_mismatch" });
		}
		return devant;
	};
	const org = (): Organization => {
		const current = deps.org();
		if (!current) {
			throw new NotSupportedError("Sign in to Devant first.", { reason: "not_signed_in" });
		}
		return current;
	};
	const listProjects = async (): Promise<DevantProject[]> => {
		const list = await client().api.getProjects(org().id);
		projects.clear();
		for (const project of list) {
			projects.set(project.handler, project);
		}
		return list;
	};
	const project = async (handle: string): Promise<DevantProject> => {
		const found = projects.get(handle) ?? (await listProjects()).find((item) => item.handler === handle || item.id === handle);
		if (!found) {
			throw new NotFoundError(`Devant has no project ${handle} in this organization.`);
		}
		return found;
	};
	const listComponents = async (projectHandle: string): Promise<ComponentKind[]> => {
		const devantProject = await project(projectHandle);
		const current = org();
		const list = await client().api.getComponentList({
			orgId: current.id,
			orgHandle: current.handle,
			projectId: devantProject.id,
			projectHandle: devantProject.handler,
		});
		components.set(projectHandle, list);
		return list;
	};
	const component = async (ref: string, projectHandle: string): Promise<ComponentKind> => {
		const matches = (item: ComponentKind) => item.metadata.name === ref || item.metadata.handler === ref || item.metadata.id === ref;
		const found = components.get(projectHandle)?.find(matches) ?? (await listComponents(projectHandle)).find(matches);
		if (!found) {
			throw new NotFoundError(`Devant has no integration ${ref} in the project ${projectHandle}.`);
		}
		return found;
	};

	return {
		platform: DEVANT_PLATFORM,
		label: DEVANT_LABEL,
		cacheNamespace: `${DEVANT_PLATFORM}:`,
		gitProviders: ["github", "bitbucket", "gitlab-server"],
		projects: {
			list: async () => (await listProjects()).map(toProject),
			create: async (displayName) => {
				const current = org();
				const created = await client().api.createProject({
					orgId: current.id,
					orgHandler: current.handle,
					projectName: displayName,
					region: client().region,
				});
				projects.set(created.handler, created);
				return toProject(created);
			},
		},
		integrations: {
			list: async (projectHandle) => (await listComponents(projectHandle)).map((item) => toComponent(item, projectHandle)),
			find: async (ref, projectHandle) => toComponent(await component(ref, projectHandle), projectHandle),
			repository: async (ref, projectHandle) => {
				const repository = toRepository(await component(ref, projectHandle));
				if (!repository) {
					throw new NotFoundError(`The integration ${ref} has no repository.`);
				}
				return repository;
			},
			delete: async (ref, projectHandle) => {
				const target = await component(ref, projectHandle);
				const devantProject = await project(projectHandle);
				const current = org();
				await client().api.deleteComponent({
					orgId: current.id,
					orgHandler: current.handle,
					projectId: devantProject.id,
					componentId: target.metadata.id,
					componentName: target.metadata.name,
				});
				components.set(
					projectHandle,
					(components.get(projectHandle) ?? []).filter((item) => item !== target),
				);
			},
		},
		links: {
			console: (link = {}) => {
				const base = client().deployment().consoleUrl.replace(/\/+$/, "");
				const orgHandle = link.orgHandle ?? deps.org()?.handle;
				if (!orgHandle) {
					return base;
				}
				const orgUrl = `${base}/organizations/${encodeURIComponent(orgHandle)}`;
				if (link.section) {
					return `${orgUrl}/${link.section.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
				}
				if (!link.project) {
					return orgUrl;
				}
				const projectUrl = `${orgUrl}/projects/${encodeURIComponent(link.project)}`;
				if (!link.integration) {
					return projectUrl;
				}
				const handler = components.get(link.project)?.find((item) => item.metadata.name === link.integration)?.metadata.handler ?? link.integration;
				return `${projectUrl}/components/${encodeURIComponent(handler)}/${encodeURIComponent(link.page ?? "overview")}`;
			},
		},
		contextFiles: legacyContextFiles,
		sourceControl: devantSourceControl(client, org),
		creation: {
			submit: (request) =>
				submitDevantIntegrations(
					{
						client,
						org,
						project,
						remember: (projectHandle, created) => components.set(projectHandle, [created, ...(components.get(projectHandle) ?? [])]),
					},
					request,
				),
		},
		handleUri: (uri) => {
			if (!isDevantGitHubCallback(uri)) {
				return false;
			}
			completeGitHubCallback(client(), uri.query).catch((error) => {
				ext.logError("Could not connect GitHub to Devant", error as Error);
				void window.showErrorMessage(`Could not connect GitHub to Devant: ${error instanceof Error ? error.message : String(error)}`);
			});
			return true;
		},
		changeOrganization: async (orgId) => {
			const target = (await client().organizations()).find((item) => item.id === orgId || item.handle === orgId || item.uuid === orgId);
			if (!target) {
				throw new NotFoundError(`You do not belong to a Devant organization ${orgId}.`);
			}
			projects.clear();
			components.clear();
			await client().selectOrganization(target.handle);
		},
	};
}

/** The create form's repository questions, answered by Devant's own API as the 5.1 editor did. */
function devantSourceControl(client: () => DevantClient, org: () => Organization): CloudBackend["sourceControl"] {
	return {
		triggerGithubAuthFlow: () => authorizeGitHub(client(), org()),
		triggerGithubInstallFlow: () => installGitHubApp(client(), org()),
		getBranches: (params) => client().api.getRepoBranches({ ...params, orgId: params.orgId || org().id, credRef: params.credRef ?? "" }),
		getAuthorizedGitOrgs: (params) => client().api.getAuthorizedGitOrgs({ ...params, orgId: params.orgId || org().id, credRef: params.credential ?? "" }),
		getCredentials: (params) => client().api.getCredentials({ ...params, orgId: params.orgId || org().id, orgUuid: params.orgUuid || org().uuid || "" }),
		getCredentialDetails: (params) => client().api.getCredentialDetails({ ...params, orgId: params.orgId || org().id, orgUuid: params.orgUuid || org().uuid || "" }),
		isRepoAuthorized: (params) => client().api.isRepoAuthorized({ ...params, orgId: params.orgId || org().id, credRef: params.credRef ?? "" }),
		getGitRepoMetadata: async (params) => {
			const { metadata } = await client().api.getGitRepoMetadata({ ...params, orgId: params.orgId || org().id, secretRef: params.secretRef ?? "" });
			// Devant reads the path whole, so its answer is never cut short.
			return {
				metadata: {
					...metadata,
					isTruncated: false,
					hasBallerinaToml: metadata.hasBallerinaTomlInPath,
					hasPomXml: metadata.hasPomXmlInPath,
					hasDockerfile: metadata.hasDockerfileInPath,
				},
			};
		},
	};
}
