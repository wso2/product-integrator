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

import type { ComponentKind } from "@wso2/wso2-platform-core";
import type { AttachMCPProxyRepositoryReq } from "@wso2/wi-core";
import axios, { type AxiosError } from "axios";
import { ext } from "../../extensionVariables";

type CloudRegion = "US" | "EU";

/** Control-plane GraphQL path, appended to the region/environment API host. */
const CP_GRAPHQL_PATH = "/projects/1.0.0/graphql";

/**
 * API hosts per cloud environment and region. Mirrors the CLI's region configs
 * (`internal/region/{us,eu}_config.go`), which build the same endpoint as
 * `apiHost + "/projects/1.0.0/graphql"`.
 */
const API_HOSTS: Record<string, Record<CloudRegion, string>> = {
	prod: { US: "https://apis.choreo.dev", EU: "https://apis.eu.choreo.dev" },
	stage: { US: "https://apis.st.choreo.dev", EU: "https://apis.st.eu.choreo.dev" },
	dev: { US: "https://apis.preview-dv.choreo.dev", EU: "https://apis.dv.eu.choreo.dev" },
};

const GRAPHQL_TIMEOUT_MS = 60000;

/** Repository type sent for a user-owned repository that already contains sources. */
const REPOSITORY_TYPE_USER_MANAGED_NON_EMPTY = "UserManagedNonEmpty";

const ATTACH_MCP_PROXY_REPOSITORY_OPERATION = "attachMCPProxyRepositoryToExistingTrack";

/** Component sub-type of an MCP proxy that has no source repository attached yet. */
export const MCP_PROXY_FROM_EXISTING_API = "MCPProxyFromExistingAPI";

/**
 * True when the component is an MCP proxy still awaiting a source repository. The control plane
 * flips the sub-type to `MCPProxyFromExistingAPIWithSource` once a repository is attached, so this
 * only matches components that have not been converted yet.
 */
export const isMcpProxyFromExistingApi = (component?: ComponentKind): component is ComponentKind =>
	component?.spec?.subType === MCP_PROXY_FROM_EXISTING_API;

interface GraphqlResponse<T> {
	data?: T;
	errors?: Array<{ message: string }>;
}

const resolveRegion = (): CloudRegion => {
	const fromEnv = process.env.CLOUD_REGION;
	if (fromEnv === "US" || fromEnv === "EU") {
		return fromEnv;
	}
	return ext.authProvider?.getRegion() ?? "US";
};

/**
 * Resolve the control-plane GraphQL endpoint for the active environment and region.
 * `WI_CP_GRAPHQL_URL` overrides it outright, for pointing at a local or ad-hoc control plane.
 */
export const getCpGraphqlEndpoint = (): string => {
	const override = process.env.WI_CP_GRAPHQL_URL;
	if (override) {
		return override;
	}
	const hostsForEnv = API_HOSTS[ext.cloudEnv] ?? API_HOSTS.prod;
	return `${hostsForEnv[resolveRegion()]}${CP_GRAPHQL_PATH}`;
};

/**
 * STS token for the control-plane APIs. Inside the Devant cloud editor the token is injected as
 * `CLOUD_STS_TOKEN`; elsewhere it is minted for the active organization by the signed-in session.
 */
const getStsToken = async (): Promise<string> => {
	const injected = process.env.CLOUD_STS_TOKEN;
	if (injected) {
		return injected;
	}
	const token = await ext.clients.rpcClient.getStsToken();
	if (!token) {
		throw new Error("Could not obtain an access token for the control plane. Please sign in and try again.");
	}
	return token;
};

/** Encode a value as a GraphQL string literal. JSON string escaping is valid GraphQL escaping. */
const gqlString = (value: string | undefined): string => JSON.stringify(value ?? "");

/** POST a GraphQL document to the control plane and return its `data`, surfacing GraphQL errors. */
export async function executeCpGraphql<T>(query: string, operationName: string): Promise<T> {
	const endpoint = getCpGraphqlEndpoint();
	const token = await getStsToken();

	let body: GraphqlResponse<T> | undefined;
	try {
		const response = await axios.post<GraphqlResponse<T>>(
			endpoint,
			{ query },
			{
				headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
				timeout: GRAPHQL_TIMEOUT_MS,
			},
		);
		body = response.data;
	} catch (err) {
		const status = (err as AxiosError)?.response?.status;
		throw new Error(`${operationName} request failed${status ? ` with status ${status}` : ""}: ${(err as Error).message}`);
	}

	if (body?.errors?.length) {
		throw new Error(`${operationName} failed: ${body.errors.map((item) => item.message).join("; ")}`);
	}
	if (!body?.data) {
		throw new Error(`${operationName} returned no data`);
	}
	return body.data;
}

/**
 * Attach a source repository to an existing MCP proxy component's deployment track, converting it
 * from a proxy over an existing API into an MCP server built from source. The control plane re-tags
 * the source APIM API and flips the component's sub-type to `MCPProxyFromExistingAPIWithSource`.
 */
export async function attachMCPProxyRepositoryToExistingTrack(params: AttachMCPProxyRepositoryReq): Promise<void> {
	const query = `mutation {
  attachMCPProxyRepositoryToExistingTrack(
    repository: {
      orgId: ${params.orgId}
      orgHandler: ${gqlString(params.orgHandler)}
      projectId: ${gqlString(params.projectId)}
      componentId: ${gqlString(params.componentId)}
      srcGitRepoUrl: ${gqlString(params.srcGitRepoUrl)}
      repositorySubPath: ${gqlString(params.repositorySubPath)}
      repositoryType: ${gqlString(REPOSITORY_TYPE_USER_MANAGED_NON_EMPTY)}
      repositoryBranch: ${gqlString(params.repositoryBranch)}
      secretRef: ${gqlString(params.secretRef)}
      isPublicRepo: ${params.isPublicRepo === true}
      originCloud: ${gqlString(params.originCloud)}
    }
  )
}`;

	const data = await executeCpGraphql<{ attachMCPProxyRepositoryToExistingTrack: string | null }>(
		query,
		ATTACH_MCP_PROXY_REPOSITORY_OPERATION,
	);

	// A null or empty result means the attachment was not confirmed, so do not report success.
	if (!data.attachMCPProxyRepositoryToExistingTrack) {
		throw new Error(
			`${ATTACH_MCP_PROXY_REPOSITORY_OPERATION} returned no confirmation. The MCP proxy may not have been converted — verify the component in the console before retrying.`,
		);
	}
}
