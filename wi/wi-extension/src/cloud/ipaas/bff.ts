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
 * HTTP transport for the Integration Platform API.
 *
 * Bearer auth only: the platform derives the organization from the token's
 * claims, so no request carries an org parameter. The token is read per call
 * rather than captured, because the editor's copy is a snapshot that can be
 * replaced under a running extension.
 */

import axios, {
	type AxiosError,
	type AxiosRequestConfig,
	type Method,
} from "axios";
import type { ListResponse } from "./types";

/** Long enough for a build trigger, short enough that a hung gateway surfaces. */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * A non-2xx answer, carrying the status so callers can branch on it. The
 * platform reports errors as `{error, message}`; `message` is lifted out when
 * present because it is the only human-readable part.
 */
export class IpaasError extends Error {
	readonly status: number;
	readonly body: string;

	constructor(status: number, body: string, message?: string) {
		super(message ?? `HTTP ${status}: ${body}`);
		this.name = "IpaasError";
		this.status = status;
		this.body = body;
	}

	/** True when the platform said the resource is absent, as opposed to refusing the request. */
	get isNotFound(): boolean {
		return this.status === 404;
	}

	/** True when the caller's token was missing, expired or rejected. */
	get isUnauthorized(): boolean {
		return this.status === 401 || this.status === 403;
	}
}

/** Extract the platform's `message` field, falling back to the raw body. */
function describe(status: number, body: string): string {
	try {
		const parsed = JSON.parse(body);
		if (parsed && typeof parsed.message === "string" && parsed.message) {
			return parsed.message;
		}
	} catch {
		// Not JSON — a gateway error page or an empty body. Use it as-is.
	}
	return body ? `HTTP ${status}: ${body}` : `HTTP ${status}`;
}

/**
 * Reduce a configured token to the credential itself.
 *
 * The platform injects a bare JWT, but the variable is also set by hand, and
 * pasting it with the "Bearer " prefix already attached is easy to do and
 * invisible afterwards — the request then carries "Bearer Bearer <jwt>" and the
 * gateway rejects it with a 401 that says only "Authentication failed", naming
 * nothing that would lead you here. Accept either form.
 */
export function normalizeBearerToken(token: string | undefined): string {
	const trimmed = (token ?? "").trim();
	const withoutScheme = trimmed.replace(/^bearer\s+/i, "");
	return withoutScheme.trim();
}

export interface BffOptions {
	/** Base URL without a trailing slash. */
	baseUrl: string;
	/** Returns the bearer token for the next request, or "" when there is none. */
	getToken: () => string;
	timeoutMs?: number;
}

export class BffClient {
	constructor(private readonly options: BffOptions) {}

	private async request<T>(
		method: Method,
		path: string,
		body?: unknown,
	): Promise<T> {
		const token = normalizeBearerToken(this.options.getToken());
		const config: AxiosRequestConfig = {
			method,
			url: `${this.options.baseUrl}${path}`,
			timeout: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				// A bodyless POST otherwise picks up axios' form-encoded default,
				// which describes a payload that was never sent. null removes the
				// header rather than overriding it with another wrong value.
				"Content-Type": body !== undefined ? "application/json" : null,
			},
			...(body !== undefined ? { data: body } : {}),
			// Statuses are branched on rather than thrown through, so let every
			// response back and decide here.
			validateStatus: () => true,
			transitional: {
				silentJSONParsing: false,
				forcedJSONParsing: false,
				clarifyTimeoutError: true,
			},
			responseType: "text",
		};

		let status: number;
		let text: string;
		try {
			const response = await axios.request<string>(config);
			status = response.status;
			text = response.data ?? "";
		} catch (err) {
			// No HTTP answer at all: DNS, TLS, connection refused, timeout. Status
			// 0 distinguishes it from anything the platform actually said.
			throw new IpaasError(
				0,
				"",
				`${method} ${path} failed: ${(err as AxiosError).message}`,
			);
		}

		if (status < 200 || status >= 300) {
			throw new IpaasError(status, text, describe(status, text));
		}
		// A 204, or a 200 with an empty body, is a legitimate "nothing to return".
		return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
	}

	get<T>(path: string): Promise<T> {
		return this.request<T>("GET", path);
	}
	post<T>(path: string, body?: unknown): Promise<T> {
		return this.request<T>("POST", path, body);
	}
	put<T>(path: string, body?: unknown): Promise<T> {
		return this.request<T>("PUT", path, body);
	}
	patch<T>(path: string, body?: unknown): Promise<T> {
		return this.request<T>("PATCH", path, body);
	}
	delete<T>(path: string, body?: unknown): Promise<T> {
		return this.request<T>("DELETE", path, body);
	}
}

/** Unwrap a list envelope, tolerating an empty body from a 204. */
export const items = <T>(response: ListResponse<T> | null | undefined): T[] =>
	response?.items ?? [];

/**
 * Build a query string, dropping values that carry no meaning. An empty string
 * is dropped rather than sent: the platform treats a present-but-empty
 * `projectName` as a filter on the empty name, not as "unfiltered".
 */
export function q(
	params: Record<string, string | number | boolean | undefined | null>,
): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === "") {
			continue;
		}
		parts.push(
			`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
		);
	}
	return parts.length ? `?${parts.join("&")}` : "";
}

/** Encode one path segment. Names are RFC 1123 slugs, but never assume it. */
export const seg = (value: string): string => encodeURIComponent(value);
