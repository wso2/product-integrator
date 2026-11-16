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

import { type CloudEnvName, assertSecureUrl, trimBaseUrl } from "@wso2/wso2-cloud-client";

/** Points the managed-tokens service at a host, for an environment WSO2 Integrator knows none for. */
export const MANAGED_TOKENS_URL_VAR = "WSO2_CLOUD_MANAGED_TOKENS_URL";

/** The managed-tokens service of each deployment; none is published yet, so `WSO2_CLOUD_MANAGED_TOKENS_URL` supplies it. */
const MANAGED_TOKENS_BASE_URLS: Partial<Record<CloudEnvName, string>> = {};

/** The other WSO2 Cloud services WSO2 Integrator calls for its consumers; undefined where the deployment has none. */
export interface CloudServiceUrls {
	managedTokensBaseUrl?: string;
}

export interface CloudServiceUrlSources {
	env: CloudEnvName;
	managedTokensByEnv: Partial<Record<CloudEnvName, string>>;
	/** {@link MANAGED_TOKENS_URL_VAR}. */
	managedTokensOverride?: string;
}

/**
 * Where the services are for the deployment in use: the deployment's
 * managed-tokens host, else the variable. The WSO2 Cloud token is sent there,
 * so it must be https (http on this machine only), as the API host must; a
 * bad one throws rather than being skipped.
 */
export function resolveCloudServiceUrls(sources: CloudServiceUrlSources): CloudServiceUrls {
	// The variable wins, as the other WSO2_CLOUD_* overrides do.
	const chosen = sources.managedTokensOverride?.trim() || sources.managedTokensByEnv[sources.env]?.trim();
	if (!chosen) {
		return {};
	}
	assertSecureUrl("managedTokensBaseUrl", chosen);
	return { managedTokensBaseUrl: trimBaseUrl(chosen) };
}

/** {@link resolveCloudServiceUrls} for this process's environment. */
export function readCloudServiceUrls(env: CloudEnvName, vars: NodeJS.ProcessEnv = process.env): CloudServiceUrls {
	return resolveCloudServiceUrls({ env, managedTokensByEnv: MANAGED_TOKENS_BASE_URLS, managedTokensOverride: vars[MANAGED_TOKENS_URL_VAR] });
}
