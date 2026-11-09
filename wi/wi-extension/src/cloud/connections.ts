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
	BadRequestError,
	type CloudClient,
	DATABASE_CA_CERT_VAR,
	DATABASE_CONNECTION_VARS,
	type EndpointLink,
	type EndpointResources,
	type EnvVarGroup,
	NotSupportedError,
	SERVICE_CONNECTION_VARS,
	type ServiceConnectionAccess,
	connectionVarName,
	isCloudError,
} from "@wso2/wso2-cloud-client";

/** The URL the gateway serves an exposed endpoint's API at: the public one, else the organization one; none when it is not exposed. */
function gatewayUrlOf(endpoint: EndpointResources): string | undefined {
	if (endpoint.exposure === "none") {
		return undefined;
	}
	return (
		endpointUrlOf(endpoint.urls?.external) ??
		[endpoint.visibilityStatus?.public, endpoint.visibilityStatus?.organization].find((state) => state?.status === "ENABLED" && state.url)?.url
	);
}

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

/**
 * Connections composed over the platform, as `cloudAPIs.connections`: a database's credentials and a
 * gateway connection are env groups on the consumer; a connection inside the project is a link the
 * platform resolves.
 */
export function cloudConnections(cloud: CloudClient, logError: (message: string, error: Error) => void) {
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
		createServiceConnection: async (request: {
			integration: string;
			target: { project: string; integration: string; endpoint: string };
			access: ServiceConnectionAccess;
			name: string;
			environments?: string[];
			projectName?: string;
			configurable?: string;
		}) => {
			const { target } = request;
			if (request.access === "project") {
				if (request.projectName && target.project !== request.projectName) {
					throw new NotSupportedError(
						`${target.integration} is in the project ${target.project}; reaching it from another project needs its endpoint exposed with organization or public access.`,
						{ reason: "endpoint_not_exposed" },
					);
				}
				if (!request.configurable) {
					throw new BadRequestError("A connection inside the project needs the configurable the endpoint's address fills.");
				}
				// The platform resolves the endpoint's address in every environment, so nothing is written per environment.
				await cloud.config.putLink(request.integration, { configurable: request.configurable, endpoint: `${target.integration}/${target.endpoint}` }, request.projectName);
				return;
			}
			// Every environment is checked before anything is created, so a missing endpoint or deployment leaves no half-made connection behind.
			const targets: { environment: string; url: string }[] = [];
			for (const environment of await environmentsFor(request.environments)) {
				// The connection is written into the integration's deployment in the environment, so there has to be one.
				if (!(await cloud.deployments.get(request.integration, environment, request.projectName))) {
					throw new NotSupportedError(`Deploy ${request.integration} to ${environment} first: the connection is written into its deployment there.`, {
						reason: "not_deployed",
					});
				}
				const endpoints = await cloud.endpoints.listForEnvironment(target.integration, environment, target.project);
				const endpoint = endpoints.find((e) => e.name === target.endpoint);
				if (!endpoint) {
					throw new NotSupportedError(`${target.integration} exposes no endpoint ${target.endpoint} in ${environment}.`, { reason: "endpoint_missing" });
				}
				const url = gatewayUrlOf(endpoint);
				if (!url) {
					throw new NotSupportedError(
						`The endpoint ${target.endpoint} of ${target.integration} is not exposed as an API in ${environment}. Expose it with organization or public access, or connect with project access.`,
						{ reason: "endpoint_not_exposed" },
					);
				}
				targets.push({ environment, url });
			}
			for (const { environment, url } of targets) {
				const key = await cloud.endpoints.createApiKey(target.integration, environment, target.endpoint, { displayName: `${request.integration}-${request.name}` }, target.project);
				const data = {
					[connectionVarName(request.name, SERVICE_CONNECTION_VARS.ServiceURL)]: url,
					[connectionVarName(request.name, SERVICE_CONNECTION_VARS.ChoreoAPIKey)]: key.apiKey,
				};
				try {
					await cloud.config.putEnvGroup(request.integration, environment, request.name, { name: request.name, sensitive: true, data }, request.projectName);
				} catch (error) {
					// A key no connection carries is only a live credential: it is revoked, best effort.
					if (key.keyId) {
						await cloud.endpoints
							.revokeApiKey(target.integration, environment, target.endpoint, key.keyId, target.project)
							.catch((revokeError: unknown) => logError(`Could not revoke the API key ${key.keyId}`, revokeError as Error));
					}
					throw error;
				}
			}
		},
		listEndpointLinks: async (integration: string, projectName?: string): Promise<EndpointLink[]> => {
			const links = await cloud.config.listLinks(integration, projectName);
			return Object.entries(links.endpointLinks ?? {}).flatMap(([configurable, id]) => {
				const slash = id.indexOf("/");
				return slash > 0 && slash < id.length - 1 ? [{ configurable, component: id.slice(0, slash), endpoint: id.slice(slash + 1) }] : [];
			});
		},
		unlinkEndpoint: async (request: { integration: string; configurable: string; projectName?: string }) => {
			await cloud.config.putLink(request.integration, { configurable: request.configurable }, request.projectName);
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
