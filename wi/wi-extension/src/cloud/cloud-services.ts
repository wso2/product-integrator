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

import {
	BadRequestError,
	type CloudServiceName,
	type CloudServiceRequest,
	DEFAULT_TIMEOUT_MS,
	type ExchangedToken,
	type FetchLike,
	ForbiddenError,
	HttpClient,
	NetworkError,
	NotSupportedError,
	type PlatformEnvConfig,
	ServerError,
	TimeoutError,
	type TokenExchangeTarget,
	type TokenSource,
	defaultFetch,
	errorMessage,
	fromHttpResponse,
	isCloudError,
} from "@wso2/wso2-cloud-client";

/** What the calls below are made with; the token source is WSO2 Integrator's own, and its tokens never leave this module. */
export interface CloudServiceDeps {
	config: PlatformEnvConfig;
	tokenSource: TokenSource;
	fetch?: FetchLike;
	/** The exchange endpoints each target allows; the build's, unless a test gives its own. */
	exchangeEndpoints?: Readonly<Record<TokenExchangeTarget, readonly string[]>>;
}

/**
 * The Copilot backends of this build (`COPILOT_ROOT_URL`, `COPILOT_STAGE_ROOT_URL`, `COPILOT_DEV_ROOT_URL`), put in by
 * the bundler from the build's environment: never read at run time, so nothing installed can add to them.
 */
declare const __WI_COPILOT_ROOT_URLS__: readonly string[] | undefined;
const COPILOT_ROOT_URLS: readonly string[] = typeof __WI_COPILOT_ROOT_URLS__ !== "undefined" ? __WI_COPILOT_ROOT_URLS__ : [];

/** The exchange URLs under `roots`: the exact endpoints the WSO2 Cloud token may be sent to. */
export function exchangeEndpointsOf(roots: readonly string[], path: string): string[] {
	return roots.filter((root) => !!root).map((root) => `${root.replace(/\/+$/, "")}${path}`);
}

interface TokenExchange {
	/** Said when no endpoint is known for the target. */
	missing: string;
}

/** The services whose own token WSO2 Integrator exchanges the WSO2 Cloud token for; no other target is reachable. */
const TOKEN_EXCHANGES: Readonly<Record<TokenExchangeTarget, TokenExchange>> = {
	copilot: { missing: "This WSO2 Cloud deployment has no Copilot token exchange." },
};

/**
 * Where each target's exchange may be: exact URLs, never a host or a domain, since a shared gateway serves other
 * tenants' APIs on the same host under other paths.
 */
const EXCHANGE_ENDPOINTS: Readonly<Record<TokenExchangeTarget, readonly string[]>> = {
	copilot: exchangeEndpointsOf(COPILOT_ROOT_URLS, "/auth-api/v1.0/auth/token-exchange"),
};

/** `endpoint` as a URL when it is exactly one of `allowed`, over https; otherwise a `ForbiddenError`. */
export function allowedExchangeEndpoint(target: TokenExchangeTarget, allowed: readonly string[], endpoint: string): URL {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		throw new ForbiddenError(`The ${target} token exchange endpoint is not a URL.`, { reason: "token_exchange_endpoint_refused" });
	}
	const listed = allowed.some((entry) => {
		try {
			const known = new URL(entry);
			return known.origin === url.origin && known.pathname.replace(/\/+$/, "") === url.pathname.replace(/\/+$/, "");
		} catch {
			return false;
		}
	});
	if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !listed) {
		throw new ForbiddenError(`WSO2 Integrator does not send the WSO2 Cloud token to ${url.origin} for ${target}.`, {
			reason: "token_exchange_endpoint_refused",
		});
	}
	return url;
}

interface CloudService {
	baseUrl: (config: PlatformEnvConfig) => string | undefined;
	/** The service's API root under its base; a consumer's path is relative to it and cannot leave it. */
	prefix: string;
	missing: string;
}

/** The services a consumer may call through WSO2 Integrator; no other host gets the WSO2 Cloud token. */
const CLOUD_SERVICES: Readonly<Record<CloudServiceName, CloudService>> = {
	// Consumers pass `/managed-connections/...`: the version prefix is this table's, not theirs.
	"managed-tokens": {
		baseUrl: (config) => config.managedTokensBaseUrl,
		prefix: "/managed-tokens/v1.0/api/v1",
		missing: "This WSO2 Cloud deployment has no managed-tokens service configured (set WSO2_CLOUD_MANAGED_TOKENS_URL).",
	},
	// Agent Manager sits behind the same gateway as the WSO2 Cloud API; consumers pass `/orgs/...`.
	"agent-manager": {
		baseUrl: (config) => (config.apiBaseUrl ? `${new URL(config.apiBaseUrl).origin}/agent-manager-service-agent-manager-api` : undefined),
		prefix: "/api/v1",
		missing: "This WSO2 Cloud deployment has no API URL to reach Agent Manager at.",
	},
};

const METHODS = new Set<string>(["GET", "POST", "PUT", "DELETE"]);

/** Own members only, so a name such as `constructor` is not mistaken for an entry. */
function entryOf<T>(table: Readonly<Record<string, T>>, name: unknown): T | undefined {
	return typeof name === "string" && Object.prototype.hasOwnProperty.call(table, name) ? table[name] : undefined;
}

/**
 * `target`'s own token for the WSO2 Cloud session: `endpoint` (the full URL
 * of the target's token exchange, e.g. Copilot's
 * `.../auth-api/v1.0/auth/token-exchange`) is sent the WSO2 Cloud token as
 * `{ subjectToken }` and answers `{ access_token, expires_in }`, of which the
 * caller gets only the new token. `endpoint` comes from the consumer, so it
 * must be on the target's list ({@link allowedExchangeEndpoint}) before the
 * WSO2 Cloud token is read for it. A 401 is retried once
 * with a refreshed token, since the stored one may simply have aged.
 */
export async function exchangeToken(target: TokenExchangeTarget, endpoint: string | undefined, deps: CloudServiceDeps): Promise<ExchangedToken> {
	const exchange = entryOf(TOKEN_EXCHANGES, target);
	if (!exchange) {
		throw new NotSupportedError(`WSO2 Integrator exchanges no token for "${String(target)}".`, { reason: "unknown_token_exchange_target" });
	}
	if (!endpoint) {
		throw new NotSupportedError(exchange.missing, { reason: `${target}_token_exchange_not_configured` });
	}
	// Checked before the token is read: an endpoint off the list never sees it.
	const url = allowedExchangeEndpoint(target, (deps.exchangeEndpoints ?? EXCHANGE_ENDPOINTS)[target] ?? [], endpoint);
	const what = `The ${target} token exchange`;
	const path = url.pathname;
	for (let forceRefresh = false; ; forceRefresh = true) {
		const subjectToken = await deps.tokenSource.getAccessToken({ forceRefresh });
		const { response, text } = await post(deps.fetch ?? defaultFetch, url.href, { subjectToken }, what);
		if (response.status === 401 && !forceRefresh) {
			continue;
		}
		if (!response.ok) {
			throw fromHttpResponse(response.status, text, path, { statusText: response.statusText });
		}
		let answer: { access_token?: unknown; expires_in?: unknown } | null;
		try {
			answer = JSON.parse(text);
		} catch (error) {
			throw new NetworkError(`${what} answered with something other than JSON.`, { status: response.status, path, cause: error });
		}
		if (typeof answer?.access_token !== "string" || !answer.access_token) {
			throw new ServerError(`${what} answered without a token.`, { status: response.status, path });
		}
		const expiresIn = answer.expires_in;
		return {
			accessToken: answer.access_token,
			expiresAt: typeof expiresIn === "number" && Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined,
		};
	}
}

/**
 * POSTs `body` as JSON and reads the answer, by the platform client's rules:
 * a timeout, no redirect followed (the token in the body must not go
 * elsewhere), failures as `CloudError`s.
 */
async function post(fetchImpl: FetchLike, url: string, body: unknown, what: string): Promise<{ response: Response; text: string }> {
	const path = new URL(url).pathname;
	try {
		const response = await fetchImpl(url, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify(body),
			redirect: "manual",
			signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
		});
		if (response.status >= 300 && response.status < 400) {
			await response.body?.cancel().catch((): void => undefined);
			throw new ServerError(`${what} answered with a redirect (${response.status}), which is not followed.`, { status: response.status, path });
		}
		return { response, text: await response.text() };
	} catch (error) {
		if (isCloudError(error)) {
			throw error;
		}
		if ((error as Error)?.name === "TimeoutError") {
			throw new TimeoutError(`${what} did not answer within ${DEFAULT_TIMEOUT_MS / 1000} seconds.`, { path, cause: error });
		}
		throw new NetworkError(`${what} could not be reached: ${errorMessage(error)}`, { path, cause: error });
	}
}

/**
 * One call to a WSO2 Cloud service on a consumer's behalf, with WSO2
 * Integrator's token: the package's HTTP client, so the timeout (30 s
 * unless asked otherwise), the refusal of redirects, the one retry on 401
 * and the status mapping are the platform API's. Only the services in
 * {@link CLOUD_SERVICES} are reachable, and only below their API root.
 */
export async function callCloudService<T>(request: CloudServiceRequest, deps: CloudServiceDeps): Promise<T> {
	const service = entryOf(CLOUD_SERVICES, request?.service);
	if (!service) {
		throw new NotSupportedError(`WSO2 Integrator calls no service named "${String(request?.service)}".`, { reason: "unknown_cloud_service" });
	}
	const baseUrl = service.baseUrl(deps.config);
	if (!baseUrl) {
		throw new NotSupportedError(service.missing, { reason: `${request.service}_not_configured` });
	}
	if (!METHODS.has(request.method)) {
		throw new BadRequestError(`WSO2 Integrator does not send ${String(request.method)} requests to ${request.service}.`);
	}
	const root = baseUrl + service.prefix;
	// The resolved URL, not the text: `..` (or `%2e%2e`) in the path would otherwise climb out of the API root to another API on the host.
	if (typeof request.path !== "string" || !request.path.startsWith("/") || !isBelow(root, root + request.path)) {
		throw new BadRequestError(`"${String(request.path)}" is not a path in the ${request.service} API.`);
	}
	const client = new HttpClient({ baseUrl: root, tokenSource: deps.tokenSource, fetch: deps.fetch });
	const timeoutMs = typeof request.timeoutMs === "number" && request.timeoutMs > 0 ? request.timeoutMs : undefined;
	return client.request<T>(request.method, request.path, { body: request.body, timeoutMs });
}

/** Whether `url` is on `root`'s host and under its path. */
function isBelow(root: string, url: string): boolean {
	try {
		const base = new URL(root);
		const resolved = new URL(url);
		return resolved.origin === base.origin && resolved.pathname.startsWith(`${base.pathname}/`);
	} catch {
		return false;
	}
}
