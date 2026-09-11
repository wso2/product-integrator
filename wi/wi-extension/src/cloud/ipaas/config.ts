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
 * Which cloud backend the extension talks to.
 *
 * `choreo` is the Choreo control plane reached through the bundled Choreo CLI's
 * RPC server. `ipaas` is the Integration Platform BFF, reached over REST from
 * this process.
 */
export type CloudBackend = "choreo" | "ipaas";

/** Setting keys, kept here so the resolution rules and package.json cannot drift apart. */
export const SETTING_CLOUD_BACKEND = "integrator.advanced.cloudBackend";
export const SETTING_CLOUD_API_BASE_URL = "integrator.advanced.cloudApiBaseUrl";

/** The environment the Integration Platform editor boots its tooling against. */
export const ENV_STS_TOKEN = "CLOUD_STS_TOKEN";
export const ENV_API_BASE_URL = "CLOUD_API_BASE_URL";

/** Inputs to backend resolution, passed explicitly so the rules are testable without vscode. */
export interface BackendResolutionInput {
	/** Value of the `integrator.advanced.cloudBackend` setting. */
	setting?: string;
	/** Value of the `integrator.advanced.cloudApiBaseUrl` setting. */
	baseUrlSetting?: string;
	/** Process environment (the editor container injects both variables). */
	env: Record<string, string | undefined>;
}

export interface ResolvedBackend {
	backend: CloudBackend;
	/** Base URL for the Integration Platform BFF, without a trailing slash. Empty unless `backend` is "ipaas". */
	baseUrl: string;
}

/**
 * Strip a trailing slash so a base URL concatenates cleanly with paths that
 * always carry a leading one. A blank or whitespace-only value is no URL at all.
 */
export function normalizeBaseUrl(value: string | undefined): string {
	const trimmed = (value ?? "").trim();
	return trimmed.replace(/\/+$/, "");
}

/**
 * Resolve which backend to use and, for the Integration Platform, where it is.
 *
 * The base URL cannot be derived at runtime: the editor is served on a
 * per-component subdomain unrelated to the API gateway host, so it is either
 * injected as CLOUD_API_BASE_URL or configured by hand. The setting wins over
 * the environment so a developer can point an editor at a local BFF without
 * rebuilding the container.
 *
 * `auto` requires both a token and a base URL. Requiring the base URL is what
 * keeps the previous platform's editors on the Choreo path — those inject
 * CLOUD_STS_TOKEN too, so the token alone identifies no platform.
 */
export function resolveBackend(input: BackendResolutionInput): ResolvedBackend {
	const baseUrl =
		normalizeBaseUrl(input.baseUrlSetting) ||
		normalizeBaseUrl(input.env[ENV_API_BASE_URL]);
	const hasToken = !!input.env[ENV_STS_TOKEN];

	// An explicit "ipaas" is honoured even without a token: the request then
	// fails with a 401 naming the missing credential, which is a far better
	// signal than silently serving the wrong backend to someone who asked for
	// this one. A missing base URL has no such recovery, so it still falls back.
	if (input.setting === "ipaas") {
		return baseUrl
			? { backend: "ipaas", baseUrl }
			: { backend: "choreo", baseUrl: "" };
	}
	if (input.setting === "choreo") {
		return { backend: "choreo", baseUrl: "" };
	}
	if (hasToken && baseUrl) {
		return { backend: "ipaas", baseUrl };
	}
	return { backend: "choreo", baseUrl: "" };
}
