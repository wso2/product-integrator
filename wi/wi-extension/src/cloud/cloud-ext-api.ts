/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import {
	type AuthState,
	type CloudClient,
	type ContextItemEnriched,
	type ContextStoreState,
	type DirectoryIntegration,
	type EnvVarGroup,
	type IWso2PlatformExtensionAPI,
	type LocalRuntimeEnv,
	NotSupportedError,
	type OpenClonedDirRequest,
	PLATFORM_EXTENSION_API_VERSION,
	type PlatformEnvConfig,
	type PlatformSession,
	orderByPipeline,
	DATABASE_CA_CERT_VAR,
	DATABASE_CONNECTION_VARS,
	SERVICE_CONNECTION_VARS,
	connectionVarName,
	isCloudError,
} from "@wso2/wso2-cloud-client";
import { ext } from "../extensionVariables";
import { isSamePath } from "../utils/pathUtils";
import { openClonedDir } from "./cloud-uri-handlers";
import { createConnectionConfig, deleteLocalConnectionConfig } from "./cloud-utils";
import { linkContext } from "./context-file";
import { hasDirtyRepo } from "./git/util";
import { contextStore } from "./stores/context-store";

const NO_PLATFORM_API = (what: string, dependency: string) =>
	new NotSupportedError(`${what} is not available on WSO2 Cloud yet.`, { reason: dependency });

/**
 * What this extension exports as `cloudAPIs` for other extensions (the
 * Ballerina extension reads it): the v2 contract over the platform client.
 * Tokens are not here; a consumer calls `vscode.authentication.getSession("wso2-cloud", ["env:<env>"])`.
 */
/** The URL an endpoint is reached at, from the parts the platform reports; undefined when there is no host. */
function endpointUrlOf(url: { scheme?: string; host?: string; port?: number; path?: string } | undefined): string | undefined {
	if (!url?.host) {
		return undefined;
	}
	const scheme = url.scheme || "https";
	const port = url.port && !((scheme === "https" && url.port === 443) || (scheme === "http" && url.port === 80)) ? `:${url.port}` : "";
	const path = url.path ? (url.path.startsWith("/") ? url.path : `/${url.path}`) : "";
	return `${scheme}://${url.host}${port}${path}`;
}

export class WICloudExtensionAPI implements IWso2PlatformExtensionAPI {
	public readonly apiVersion = PLATFORM_EXTENSION_API_VERSION;
	private active = false;

	public setActive(active: boolean) {
		this.active = active;
	}

	public isActive(): boolean {
		return this.active;
	}

	private get cloud(): CloudClient {
		return ext.clients.platform.cloud;
	}

	// A Ballerina workspace (no single package) asks with no path; nothing matches it.
	private integrationsOfDir = (fsPath: string | undefined, integrations?: DirectoryIntegration[]): DirectoryIntegration[] =>
		fsPath ? (integrations?.filter((item) => item.fsPath && isSamePath(item.fsPath, fsPath)) ?? []) : [];

	// ---- auth ----
	public getAuthState = (): AuthState => ext.authProvider?.state ?? { session: null, status: "signed-out" };
	public isLoggedIn = (): boolean => !!ext.authProvider?.isLoggedIn;
	public signIn = async (options?: { reselectOrganization?: boolean }): Promise<PlatformSession> => {
		if (!ext.authProvider) {
			throw new Error("The cloud layer is not active yet.");
		}
		return ext.authProvider.signIn(options);
	};
	public signOut = (): Promise<void> => ext.authProvider?.logout(true) ?? Promise.resolve();
	public getPlatformConfig = (): PlatformEnvConfig => ext.config;
	public subscribeAuthState = (callback: (state: AuthState) => void): (() => void) => ext.authProvider?.subscribe((s) => callback(s.state)) ?? (() => undefined);
	/** Tells `callback` whether there is a session now and whenever that changes, by the same rule as {@link isLoggedIn}. */
	public subscribeIsLoggedIn = (callback: (isLoggedIn: boolean) => void): (() => void) => {
		const auth = ext.authProvider;
		if (!auth) {
			return () => undefined;
		}
		let last: boolean | undefined;
		return auth.subscribe(() => {
			const now = auth.isLoggedIn;
			if (now !== last) {
				last = now;
				callback(now);
			}
		});
	};

	// ---- workspace context ----
	public getContextState = (): ContextStoreState => contextStore.getState().state;
	public getSelectedContext = (): ContextItemEnriched | null => contextStore.getState().state?.selected || null;
	public subscribeContextState = (callback: (state: ContextItemEnriched | undefined) => void): (() => void) =>
		contextStore.subscribe((s) => callback(s.state?.selected));
	public getDirectoryIntegrations = (fsPath: string): DirectoryIntegration[] => this.integrationsOfDir(fsPath, contextStore.getState().state?.integrations);
	public subscribeDirectoryIntegrations = (fsPath: string, callback: (integrations: DirectoryIntegration[]) => void): (() => void) =>
		contextStore.subscribe((s) => callback(this.integrationsOfDir(fsPath, s.state.integrations)));
	public localRepoHasChanges = (fsPath: string): Promise<boolean> => hasDirtyRepo(fsPath, ext.context);
	public linkDirectory = async (fsPath: string, target: { project: string; env?: string }): Promise<void> => {
		const org = ext.authProvider?.org;
		if (!org) {
			throw new Error("Not signed in to WSO2 Cloud.");
		}
		linkContext(fsPath, { org: org.handle, project: target.project, env: target.env });
		await contextStore.getState().refreshState();
	};
	public openClonedDir = (request: OpenClonedDirRequest): Promise<void> => openClonedDir(request);
	public refreshContext = (): Promise<void> => contextStore.getState().refreshState();

	// ---- platform resources ----
	public get org() {
		const cloud = this.cloud;
		const uuid = () => {
			const value = ext.authProvider?.org?.uuid;
			if (!value) {
				throw new Error("The organization's id is not known yet; sign in again.");
			}
			return value;
		};
		return {
			get: () => cloud.orgs.current(),
			getSubscriptions: () => cloud.orgs.subscriptions(uuid()),
			getComponentLimits: () => cloud.orgs.componentLimits(uuid()),
		};
	}
	public get projects() {
		return this.cloud.projects;
	}
	public get integrations() {
		const components = this.cloud.components;
		return {
			list: (projectName: string) => components.list(projectName),
			get: (projectName: string, name: string) => components.get(projectName, name),
			find: (ref: string, projectName: string) => components.find(ref, projectName),
			getRepository: (name: string, projectName?: string) => components.repository(name, projectName),
			create: components.create.bind(components),
			createRaw: components.createRaw.bind(components),
			update: components.update.bind(components),
			delete: components.delete.bind(components),
			checkName: components.checkName.bind(components),
			updateBuildParameters: components.updateBuildParameters.bind(components),
			updateBuildpackConfig: components.updateBuildpackConfig.bind(components),
			setAutoBuild: components.setAutoBuild.bind(components),
			setAutoDeploy: components.setAutoDeploy.bind(components),
			listCommits: components.listCommits.bind(components),
			listTracks: components.listTracks.bind(components),
			getDefaultTrack: components.getDefaultTrack.bind(components),
		};
	}
	public get builds() {
		return this.cloud.builds;
	}
	public get deployments() {
		return this.cloud.deployments;
	}
	public get environments() {
		const environments = this.cloud.environments;
		const pipelines = this.cloud.pipelines;
		return {
			list: () => environments.list(),
			get: (id: string) => environments.get(id),
			resolve: (ref: string) => environments.resolve(ref),
			listOrdered: async (projectName: string) => {
				const [all, { pipeline }] = await Promise.all([environments.list(), pipelines.ofProject(projectName)]);
				return orderByPipeline(all, pipeline);
			},
		};
	}
	public get pipelines() {
		return this.cloud.pipelines;
	}
	public get endpoints() {
		return this.cloud.endpoints;
	}
	public get config() {
		return this.cloud.config;
	}
	public get observability() {
		const observability = this.cloud.observability;
		const builds = this.cloud.builds;
		return {
			queryBuildLogs: async (name: string, buildName: string, options: { tail?: number; signal?: AbortSignal; projectName?: string } = {}) => {
				const build = await builds.get(name, buildName, options.projectName);
				return observability.buildLogs(build, options);
			},
			queryRuntimeLogs: (projectName: string, name: string, environment: string, sinceMs: number, options?: { tail?: number; signal?: AbortSignal }) =>
				observability.runtimeLogs({ project: projectName, component: name, environment }, sinceMs, options),
		};
	}
	public get repos() {
		return this.cloud.repos;
	}
	public get git() {
		const proxy = this.cloud.git;
		return {
			// The git integration's routes are not in the platform's API document yet.
			isRepoAuthorized: async (_owner: string, _repo: string) => {
				throw NO_PLATFORM_API("Checking repository access", "git_app_service_routes");
			},
			listInstallations: async () => {
				throw NO_PLATFORM_API("Listing GitHub installations", "git_app_service_routes");
			},
			connectGitHub: async () => {
				throw NO_PLATFORM_API("Connecting GitHub", "git_app_service_routes");
			},
			raw: proxy.raw.bind(proxy),
		};
	}
	public get dbServers() {
		return this.cloud.dbServers;
	}
	public get knowledgeBases() {
		return this.cloud.knowledgeBases;
	}
	public get applications() {
		return this.cloud.applications;
	}
	public get codeServer() {
		return this.cloud.codeServer;
	}
	public get ballerinaCentral() {
		return this.cloud.ballerinaCentral;
	}

	// ---- compositions over the platform ----
	public get connections() {
		const cloud = this.cloud;
		const environmentsFor = async (requested?: string[]) => (requested?.length ? requested : (await cloud.environments.list()).map((e) => e.id));
		return {
			list: (integration: string, environment: string, projectName?: string): Promise<EnvVarGroup[]> => cloud.config.listEnvGroups(integration, environment, projectName),
			createDatabaseConnection: async (request: { integration: string; dbServerId: string; name: string; environments?: string[]; projectName?: string }) => {
				const credentials = await cloud.dbServers.revealCredentials(request.dbServerId);
				// Prefixed with the connection's name: every group lands in the same container.
				const name = (suffix: string) => connectionVarName(request.name, suffix);
				const data: Record<string, string> = {
					[name(DATABASE_CONNECTION_VARS.HostName)]: credentials.host ?? "",
					[name(DATABASE_CONNECTION_VARS.Port)]: credentials.port ?? "",
					[name(DATABASE_CONNECTION_VARS.DatabaseName)]: credentials.database ?? "",
					[name(DATABASE_CONNECTION_VARS.Username)]: credentials.username,
					[name(DATABASE_CONNECTION_VARS.Password)]: credentials.password,
				};
				if (credentials.caCertificate) {
					data[name(DATABASE_CA_CERT_VAR)] = credentials.caCertificate;
				}
				for (const environment of await environmentsFor(request.environments)) {
					await cloud.config.putEnvGroup(request.integration, environment, request.name, { name: request.name, sensitive: true, data }, request.projectName);
				}
			},
			createServiceConnection: async (request: { integration: string; target: { project: string; integration: string; endpoint: string }; name: string; environments?: string[]; projectName?: string }) => {
				// Every environment's endpoint is found before anything is created, so a missing one leaves no half-made connection behind.
				const targets: { environment: string; url: string }[] = [];
				for (const environment of await environmentsFor(request.environments)) {
					const endpoints = await cloud.endpoints.listForEnvironment(request.target.integration, environment, request.target.project);
					const endpoint = endpoints.find((e) => e.name === request.target.endpoint);
					if (!endpoint) {
						throw new NotSupportedError(`${request.target.integration} exposes no endpoint ${request.target.endpoint} in ${environment}.`, { reason: "endpoint_missing" });
					}
					const url = endpointUrlOf(endpoint.urls?.external) ?? endpointUrlOf(endpoint.urls?.internal);
					if (!url) {
						throw new NotSupportedError(`${request.target.integration} has no URL for endpoint ${request.target.endpoint} in ${environment} yet.`, { reason: "endpoint_missing" });
					}
					targets.push({ environment, url });
				}
				for (const { environment, url } of targets) {
					const key = await cloud.endpoints.createApiKey(request.target.integration, environment, request.target.endpoint, { displayName: `${request.integration}-${request.name}` }, request.target.project);
					try {
						await cloud.config.putEnvGroup(
							request.integration,
							environment,
							request.name,
							{
								name: request.name,
								sensitive: true,
								data: {
									[connectionVarName(request.name, SERVICE_CONNECTION_VARS.ServiceURL)]: url,
									[connectionVarName(request.name, SERVICE_CONNECTION_VARS.ChoreoAPIKey)]: key.apiKey,
								},
							},
							request.projectName,
						);
					} catch (error) {
						// A key no connection carries is only a live credential: it is revoked, best effort.
						if (key.keyId) {
							await cloud.endpoints
								.revokeApiKey(request.target.integration, environment, request.target.endpoint, key.keyId, request.target.project)
								.catch((revokeError: unknown) => ext.logError(`Could not revoke the API key ${key.keyId}`, revokeError as Error));
						}
						throw error;
					}
				}
			},
			delete: async (request: { integration: string; name: string; environments?: string[]; projectName?: string }) => {
				for (const environment of await environmentsFor(request.environments)) {
					// An environment the connection was never made in has no group to delete; any other failure is the caller's to see.
					await cloud.config.deleteEnvGroup(request.integration, environment, request.name, request.projectName).catch((error: unknown) => {
						if (!(isCloudError(error) && error.code === "not_found")) {
							throw error;
						}
					});
				}
			},
		};
	}
	public get runtime() {
		const cloud = this.cloud;
		return {
			collectLocalEnv: async (request: { projectName: string; integration?: string; environment?: string; skip?: string[] }): Promise<LocalRuntimeEnv> => {
				const result: LocalRuntimeEnv = { envVars: {}, missingSecrets: [] };
				if (!request.integration) {
					return result;
				}
				const environment = request.environment ?? (await cloud.pipelines.ofProject(request.projectName)).entry ?? (await cloud.environments.list())[0]?.id;
				if (!environment) {
					return result;
				}
				const groups = await cloud.config.listEnvGroups(request.integration, environment, request.projectName);
				for (const group of groups) {
					if (request.skip?.includes(group.name ?? "")) {
						continue;
					}
					if (group.sensitive) {
						// Secrets are write-only on the platform; the person sets them locally.
						result.missingSecrets.push(...(group.keys ?? []));
						continue;
					}
					const full = group.data ? group : await cloud.config.getEnvGroup(request.integration, environment, group.name ?? "", request.projectName);
					Object.assign(result.envVars, full.data ?? {});
				}
				return result;
			},
		};
	}

	// ---- local files ----
	public get local() {
		return {
			writeConnectionReference: (request: { componentDir: string; name: string; resourceRef: string }) => createConnectionConfig(request),
			deleteConnectionReference: (request: { componentDir: string; name: string }) => deleteLocalConnectionConfig({ componentDir: request.componentDir, connectionName: request.name }),
		};
	}
}
