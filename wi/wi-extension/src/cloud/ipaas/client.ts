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

/**
 * Integration Platform implementation of the client the cloud commands use.
 *
 * It extends the Choreo RPC client rather than replacing it, so the methods
 * below are served over REST and everything else — connections, the
 * marketplace, databases, sign-in — keeps working through the bundled CLI
 * exactly as before. A method that is not overridden here is not "unsupported";
 * it simply still goes to Choreo.
 */

import type {
	ComponentKind,
	CreateComponentReq,
	CreateProjectReq,
	DeleteCompReq,
	Environment,
	GetComponentItemReq,
	GetComponentsReq,
	GetProjectEnvsReq,
	Project,
	UserInfo,
} from "@wso2/wso2-platform-core";
import { ext } from "../../extensionVariables";
import { ChoreoRPCClient } from "../choreo-cli-rpc";
import { BffClient, IpaasError, items, q, seg } from "./bff";
import { decodeClaims } from "./claims";
import { ENV_STS_TOKEN } from "./config";
import {
	toComponentKind,
	toCreateComponentBody,
	toEnvironmentName,
	toOrganization,
	toProject,
} from "./mappers";
import type {
	IpaasComponent,
	IpaasComponentDeployment,
	IpaasEnvironment,
	IpaasOrgEntry,
	IpaasProject,
	IpaasTriggerBuildResponse,
	IpaasWorkflowRun,
	ListResponse,
} from "./types";

export class IpaasRpcClient extends ChoreoRPCClient {
	private readonly bff: BffClient;

	constructor(baseUrl: string) {
		super();
		this.bff = new BffClient({
			baseUrl,
			getToken: () => process.env[ENV_STS_TOKEN] ?? "",
		});
	}

	/** The raw transport, for callers that need an endpoint with no platform-core equivalent. */
	get http(): BffClient {
		return this.bff;
	}

	/**
	 * Ready as soon as it is constructed: the token and base URL are resolved
	 * during activation and there is no session to establish. Inheriting the
	 * base implementation would instead report this client unusable whenever the
	 * bundled CLI failed to start, which would block deploying over a transport
	 * that never involved the CLI.
	 */
	override isActive(): boolean {
		return true;
	}

	/**
	 * Identity comes from the token, not from a call: the platform has no
	 * "current user" endpoint, and every field below is a claim the gateway has
	 * already validated. The organization list is a single entry because a
	 * platform token is issued for one organization.
	 */
	override async getUserInfo(): Promise<UserInfo> {
		const token = process.env[ENV_STS_TOKEN] ?? "";
		const claims = decodeClaims(token);
		if (!claims?.sub) {
			throw new Error(
				"No Integration Platform session was found. Reload the editor to obtain a fresh token, then try again.",
			);
		}

		// The org endpoint resolves the numeric id and uuid the token does not
		// carry. It is not worth failing sign-in over, so fall back to the claims.
		let organizations = [
			toOrganization({
				handle: claims.ouHandle ?? "",
				numericId: 0,
				uuid: claims.ouId ?? "",
			}),
		];
		try {
			const listed = items(
				await this.bff.get<ListResponse<IpaasOrgEntry>>("/orgs"),
			);
			if (listed.length > 0) {
				organizations = listed.map(toOrganization);
			}
		} catch (err) {
			ext.logError(
				"Could not list organizations; using the token's claims",
				err as Error,
			);
		}

		return {
			displayName: claims.name ?? claims.email ?? claims.sub,
			userEmail: claims.email ?? "",
			userProfilePictureUrl: "",
			idpId: claims.sub,
			organizations,
			userId: claims.sub,
			userCreatedAt: new Date(0),
		};
	}

	override async getStsToken(): Promise<string> {
		return process.env[ENV_STS_TOKEN] ?? "";
	}

	override async getProjects(orgID: string): Promise<Project[]> {
		const projects = items(
			await this.bff.get<ListResponse<IpaasProject>>("/projects"),
		);
		return projects.map((project) => toProject(project, orgID));
	}

	override async createProject(params: CreateProjectReq): Promise<Project> {
		const handler = params.projectHandler || params.projectName;
		const created = await this.bff.post<IpaasProject>("/projects", {
			name: handler,
			displayName: params.projectName,
			description: "",
			// Every project binds to a delivery pipeline; "default" is the one
			// provisioned into each organization at bootstrap.
			deploymentPipeline: "default",
		});
		return toProject(created, params.orgId);
	}

	override async getComponentList(
		params: GetComponentsReq,
	): Promise<ComponentKind[]> {
		const components = items(
			await this.bff.get<ListResponse<IpaasComponent>>(
				`/projects/${seg(params.projectHandle)}/components`,
			),
		);
		return components.map(toComponentKind);
	}

	/**
	 * The platform's per-component detail route returns a stub today, so the
	 * component is picked out of the project's list — the same thing the console
	 * does for this reason.
	 */
	override async getComponentItem(
		params: GetComponentItemReq,
	): Promise<ComponentKind> {
		const components = await this.getComponentList({
			orgId: params.orgId,
			orgHandle: "",
			projectId: params.projectHandle,
			projectHandle: params.projectHandle,
		});
		const match = components.find(
			(component) =>
				component.metadata.handler === params.componentName ||
				component.metadata.name === params.componentName,
		);
		if (!match) {
			throw new Error(
				`Integration "${params.componentName}" was not found in project "${params.projectHandle}".`,
			);
		}
		return match;
	}

	/**
	 * Create the component, returning it under the name the platform actually
	 * assigned. A name collision is resolved server-side by suffixing, so the
	 * requested name and the created one are not always the same string, and
	 * every later call has to use the created one.
	 */
	override async createComponent(
		params: CreateComponentReq,
	): Promise<ComponentKind> {
		const repoSubPath = await resolveRepoSubPath(params.componentDir);
		const created = await this.bff.post<IpaasComponent>(
			`/projects/${seg(params.projectHandle)}/components`,
			toCreateComponentBody(params, repoSubPath),
		);
		if (created?.warning) {
			ext.log(
				`Integration "${created.name}" was created with a warning: ${created.warning}`,
			);
		}
		return toComponentKind(created);
	}

	/**
	 * `componentId` is the address, not `componentName` — callers put the
	 * human-readable display name in the latter, and the platform routes on the
	 * slug. `projectId` carries the handler, which is what toProject stores.
	 */
	override async deleteComponent(params: DeleteCompReq): Promise<void> {
		await this.bff.delete(
			`/projects/${seg(params.projectId)}/components/${seg(params.componentId)}`,
		);
	}

	/**
	 * Environments are organization-scoped on the platform, with no project
	 * association, so the project in the request is not a filter — it is ignored.
	 */
	override async getEnvs(_params: GetProjectEnvsReq): Promise<Environment[]> {
		const environments = items(
			await this.bff.get<ListResponse<IpaasEnvironment>>("/environments"),
		);
		return environments.map(
			(environment) =>
				({
					id: toEnvironmentName(environment),
					name: toEnvironmentName(environment),
					description: environment.description ?? "",
					critical: environment.critical,
				}) as Environment,
		);
	}

	// --- Operations with no platform-core equivalent ---------------------------

	/** Builds for a component, as the platform returns them. */
	async listBuilds(
		componentName: string,
		projectName?: string,
	): Promise<IpaasWorkflowRun[]> {
		return items(
			await this.bff.get<ListResponse<IpaasWorkflowRun>>(
				`/components/${seg(componentName)}/builds${q({ projectName })}`,
			),
		);
	}

	async getBuild(
		componentName: string,
		buildName: string,
		projectName?: string,
	): Promise<IpaasWorkflowRun> {
		return this.bff.get<IpaasWorkflowRun>(
			`/components/${seg(componentName)}/builds/${seg(buildName)}${q({ projectName })}`,
		);
	}

	/**
	 * Start a build. The answer confirms only that one was started — it does not
	 * name the run, which is why callers identify it by time instead.
	 */
	async triggerBuild(
		componentName: string,
		projectName?: string,
	): Promise<IpaasTriggerBuildResponse> {
		return this.bff.post<IpaasTriggerBuildResponse>(
			`/components/${seg(componentName)}/builds${q({ projectName })}`,
		);
	}

	/** Snapshot the current build into a release and bind it to an environment. */
	async deploy(
		componentName: string,
		environment: string,
		projectName?: string,
	): Promise<void> {
		await this.bff.post(
			`/components/${seg(componentName)}/deploy${q({ projectName, environment })}`,
		);
	}

	/**
	 * The component's deployment in one environment, or null when it has none
	 * yet — which the platform reports as an empty 200, not a 404.
	 */
	async getDeployment(
		componentName: string,
		environmentId: string,
	): Promise<IpaasComponentDeployment | null> {
		try {
			const deployment = await this.bff.get<IpaasComponentDeployment | null>(
				`/components/${seg(componentName)}/deployments${q({ environmentId })}`,
			);
			return deployment ?? null;
		} catch (err) {
			if (err instanceof IpaasError && err.isNotFound) {
				return null;
			}
			throw err;
		}
	}
}

/**
 * The integration's path within its repository.
 *
 * `componentDir` is an absolute workspace path, and the platform stores a
 * repository-relative one. Resolving it needs the git root, so it happens here
 * rather than in the pure mapper. An unresolvable root yields "" — the
 * repository root — which is correct for a single-integration repository and
 * the only safe guess for anything else.
 */
async function resolveRepoSubPath(componentDir: string): Promise<string> {
	if (!componentDir) {
		return "";
	}
	// Imported lazily: the git module reaches for the vscode API at load time,
	// which makes it unusable from a plain unit test of anything importing it.
	const { getGitRoot, relativePath } = await import("../git/util");
	const gitRoot = await getGitRoot(ext.context, componentDir);
	if (!gitRoot) {
		ext.log(
			`No git root found for ${componentDir}; treating the integration as the repository root`,
		);
		return "";
	}
	return relativePath(gitRoot, componentDir);
}
