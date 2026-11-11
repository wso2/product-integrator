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
	type EnvVarGroup,
	type IntegrationLinks,
	type LinkRequest,
	type ServiceConnectionAccess,
	connectionVarName,
	isCloudError,
} from "@wso2/wso2-cloud-client";

/** `<project>/<component>/<endpoint>`: a project and a component hold no slash, an endpoint name may. */
function parseEndpointId(id: string): { project: string; component: string; endpoint: string } | undefined {
	const [project, component, ...rest] = id.split("/");
	const endpoint = rest.join("/");
	return project && component && endpoint ? { project, component, endpoint } : undefined;
}

/** The keys of the project's connection to another project's endpoint: a key link with any other key is to another resource. */
const CONNECTION_KEYS = new Set(["url", "apiKey", "apiKeyHeader"]);

/** The link that fills `configurable` now, as the request that writes it again; undefined when nothing fills it. */
function currentLink(links: IntegrationLinks, configurable: string): LinkRequest | undefined {
	const endpoint = links.endpointLinks?.[configurable];
	if (endpoint) {
		return { configurable, endpoint };
	}
	const field = links.fieldLinks?.[configurable];
	if (field) {
		return { configurable, ref: field.ref, key: field.key };
	}
	const orphaned = links.orphaned?.find((link) => link.target === configurable);
	if (orphaned?.kind === "endpoint") {
		return { configurable, endpoint: orphaned.ref };
	}
	if (orphaned?.kind === "configurable" && orphaned.key) {
		return { configurable, ref: orphaned.ref, key: orphaned.key };
	}
	return undefined;
}

/**
 * Connections composed over the platform, as `cloudAPIs.connections`: a database's credentials are an env
 * group on the consumer; a service connection is the platform filling the consumer's configurables from the
 * endpoint, directly inside the project and through the project's connection to it across projects.
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
		listConnectable: (integration: string, projectName: string) => cloud.config.listConnectableEndpoints(integration, projectName),
		createServiceConnection: async (request: {
			integration: string;
			target: { project: string; integration: string; endpoint: string };
			access: ServiceConnectionAccess;
			configurables: { url: string; apiKey?: string };
			projectName: string;
		}) => {
			const { target, configurables } = request;
			const endpoint = `${target.project}/${target.integration}/${target.endpoint}`;
			if (!configurables.url) {
				throw new BadRequestError("A service connection needs the configurable its URL fills.");
			}
			// A configurable is filled by one link, so a key written to the URL's would replace the URL.
			if (configurables.apiKey === configurables.url) {
				throw new BadRequestError("The URL and the API key of a service connection need different configurables.");
			}
			// The platform tells the two apart by the endpoint's project, so a mismatch is refused before anything is written.
			if ((target.project === request.projectName) !== (request.access === "project")) {
				throw new BadRequestError(
					request.access === "project"
						? `${target.integration} is in the project ${target.project}; connect to it with organization access.`
						: `${target.integration} is in this project; connect to it with project access.`,
				);
			}
			if (request.access === "project") {
				// The platform resolves the endpoint's address in every environment, so nothing is written per environment.
				await cloud.config.putLink(request.integration, { configurable: configurables.url, endpoint }, request.projectName);
				return;
			}
			// The first link makes the project's connection to the endpoint, the second reuses it; the platform binds it,
			// with an API key, in each environment the integration is deployed to.
			if (!configurables.apiKey) {
				await cloud.config.putLink(request.integration, { configurable: configurables.url, endpoint, key: "url" }, request.projectName);
				return;
			}
			// Read first, so a failed key link puts the URL back as it was, not unlinked: the connection may be one
			// being repaired or moved, whose URL link worked.
			const before = currentLink(await cloud.config.listLinks(request.integration, request.projectName), configurables.url);
			await cloud.config.putLink(request.integration, { configurable: configurables.url, endpoint, key: "url" }, request.projectName);
			try {
				await cloud.config.putLink(request.integration, { configurable: configurables.apiKey, endpoint, key: "apiKey" }, request.projectName);
			} catch (error) {
				// The key the API takes isn't linked, so the URL is not left pointing at it.
				await cloud.config
					.putLink(request.integration, before ?? { configurable: configurables.url }, request.projectName)
					.catch((undoError: unknown) => logError(`Could not put back the link of ${configurables.url}`, undoError as Error));
				throw error;
			}
		},
		listEndpointLinks: async (integration: string, projectName?: string): Promise<EndpointLink[]> => {
			const links = await cloud.config.listLinks(integration, projectName);
			// A link the build does not declare yet, such as one made before the build with its configurable, is orphaned.
			const orphaned = links.orphaned ?? [];
			const addressLinks: [string, string][] = [
				...Object.entries(links.endpointLinks ?? {}),
				...orphaned.filter((link) => link.kind === "endpoint").map((link): [string, string] => [link.target, link.ref]),
			];
			// Only keys of a connection can be an endpoint's: a database's keys never need the connectable endpoints read.
			const keyLinks: [string, { ref: string; key: string }][] = [
				...Object.entries(links.fieldLinks ?? {}),
				...orphaned
					.filter((link) => link.kind === "configurable" && link.key)
					.map((link): [string, { ref: string; key: string }] => [link.target, { ref: link.ref, key: link.key ?? "" }]),
			].filter(([, { key }]) => CONNECTION_KEYS.has(key));
			const result: EndpointLink[] = addressLinks.flatMap(([configurable, id]) => {
				const endpoint = parseEndpointId(id);
				return endpoint ? [{ configurable, ...endpoint }] : [];
			});
			if (keyLinks.length === 0) {
				return result;
			}
			// A key link names the project's connection, not the endpoint: the connectable endpoints say which endpoint
			// each connection is for. Links to other resources, a connection the listing no longer has among them, are not endpoints.
			const byRef = new Map<string, { project: string; component: string; endpoint: string }>();
			for (const item of await cloud.config.listConnectableEndpoints(integration, projectName)) {
				if (item.ref) {
					byRef.set(item.ref, { project: item.project, component: item.component, endpoint: item.endpoint });
				}
			}
			for (const [configurable, { ref, key }] of keyLinks) {
				const endpoint = byRef.get(ref);
				if (endpoint) {
					result.push({ configurable, ...endpoint, key });
				}
			}
			return result;
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
