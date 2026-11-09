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

import * as assert from "assert";
import { type CloudError, type CloudServiceRequest, type PlatformEnvConfig, type TokenExchangeTarget, type TokenSource, isCloudError } from "@wso2/wso2-cloud-client";
import { type CloudServiceDeps, callCloudService, exchangeEndpointsOf, exchangeToken } from "../../cloud/cloud-services";

interface Sent {
	url: string;
	init: RequestInit;
}

/** WI's token source and `fetch`, answering each call from `answers` in turn and recording what was sent. */
function deps(answers: (() => Response)[], config: Partial<PlatformEnvConfig> = {}) {
	const sent: Sent[] = [];
	const refreshes: boolean[] = [];
	const tokenSource = {
		kind: "browser",
		getAccessToken: async (options?: { forceRefresh?: boolean }) => {
			refreshes.push(!!options?.forceRefresh);
			return options?.forceRefresh ? "wso2-token-2" : "wso2-token-1";
		},
		getClaims: async (): Promise<undefined> => undefined,
	} as unknown as TokenSource;
	const fetch = async (url: string, init?: RequestInit) => {
		sent.push({ url, init: init ?? {} });
		const answer = answers.shift();
		if (!answer) {
			throw new Error("no answer left");
		}
		return answer();
	};
	const value: CloudServiceDeps = {
		config: { managedTokensBaseUrl: "https://tokens.example.com", ...config } as PlatformEnvConfig,
		tokenSource,
		fetch,
		exchangeEndpoints: { copilot: [COPILOT_EXCHANGE] },
	};
	return { deps: value, sent, refreshes };
}

const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const COPILOT_EXCHANGE = "https://apis.example.com/copilot/auth-api/v1.0/auth/token-exchange";
const codeOf = (code: string, status?: number) => (error: unknown) =>
	isCloudError(error) && error.code === code && (status === undefined || error.details.status === status);

describe("Copilot token exchange", () => {
	it("posts the WSO2 Cloud token to the endpoint given and hands back only Copilot's token", async () => {
		const { deps: d, sent } = deps([json(201, { access_token: "copilot-token", expires_in: 3600 })]);
		const before = Date.now();
		const token = await exchangeToken("copilot", COPILOT_EXCHANGE, d);
		assert.strictEqual(sent.length, 1);
		assert.strictEqual(sent[0].url, COPILOT_EXCHANGE);
		assert.strictEqual(sent[0].init.method, "POST");
		assert.strictEqual(sent[0].init.redirect, "manual");
		assert.deepStrictEqual(JSON.parse(sent[0].init.body as string), { subjectToken: "wso2-token-1" });
		assert.strictEqual((sent[0].init.headers as Record<string, string>)["Content-Type"], "application/json");
		assert.strictEqual(token.accessToken, "copilot-token");
		assert.ok(token.expiresAt >= before + 3600_000 && token.expiresAt <= Date.now() + 3600_000);
		assert.ok(!JSON.stringify(token).includes("wso2-token"));
	});

	it("retries a 401 once with a refreshed token", async () => {
		const { deps: d, sent, refreshes } = deps([json(401, { message: "expired" }), json(200, { access_token: "copilot-token" })]);
		const token = await exchangeToken("copilot", COPILOT_EXCHANGE, d);
		assert.deepStrictEqual(refreshes, [false, true]);
		assert.deepStrictEqual(JSON.parse(sent[1].init.body as string), { subjectToken: "wso2-token-2" });
		assert.deepStrictEqual(token, { accessToken: "copilot-token", expiresAt: undefined });
	});

	it("maps a failed exchange to the error its status means", async () => {
		await assert.rejects(exchangeToken("copilot", COPILOT_EXCHANGE, deps([json(403, { message: "no" })]).deps), codeOf("forbidden", 403));
		await assert.rejects(exchangeToken("copilot", COPILOT_EXCHANGE, deps([json(503, {})]).deps), codeOf("unavailable", 503));
		await assert.rejects(exchangeToken("copilot", COPILOT_EXCHANGE, deps([json(401, {}), json(401, {})]).deps), codeOf("unauthenticated", 401));
		await assert.rejects(exchangeToken("copilot", COPILOT_EXCHANGE, deps([json(200, { token_type: "Bearer" })]).deps), codeOf("server"));
	});

	it("does not follow a redirect", async () => {
		const redirect = () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example.com" } });
		await assert.rejects(exchangeToken("copilot", COPILOT_EXCHANGE, deps([redirect]).deps), codeOf("server", 302));
	});

	it("sends the token only to an exchange endpoint on the target's list", async () => {
		const refused = [
			"https://copilot.example.com/auth-api/v1.0/auth/token-exchange",
			"https://apis.example.com/another-tenant/auth-api/v1.0/auth/token-exchange",
			"http://apis.example.com/copilot/auth-api/v1.0/auth/token-exchange",
			"https://apis.example.com:8443/copilot/auth-api/v1.0/auth/token-exchange",
			"https://apis.example.com/copilot/auth-api/v1.0/auth/token-exchange?x=1",
			"https://u:p@apis.example.com/copilot/auth-api/v1.0/auth/token-exchange",
			"not a url",
		];

		for (const endpoint of refused) {
			let read = false;
			const deps = {
				config: {} as PlatformEnvConfig,
				tokenSource: {
					kind: "browser",
					getAccessToken: async () => {
						read = true;
						return "cloud-token";
					},
				} as unknown as TokenSource,
				fetch: async () => {
					throw new Error("nothing is sent");
				},
				exchangeEndpoints: { copilot: [COPILOT_EXCHANGE] },
			};
			await assert.rejects(exchangeToken("copilot", endpoint, deps), (error: CloudError) => error.code === "forbidden", endpoint);
			assert.ok(!read, `the token is not even read for ${endpoint}`);
		}
	});

	it("allows no endpoint at all when the build lists none", async () => {
		const built = deps([]);
		await assert.rejects(exchangeToken("copilot", COPILOT_EXCHANGE, { ...built.deps, exchangeEndpoints: { copilot: [] } }), codeOf("forbidden"));
		assert.strictEqual(built.sent.length, 0);
	});

	it("lists the exact exchange URL under each Copilot root", () => {
		assert.deepStrictEqual(exchangeEndpointsOf(["https://apis.example.com/copilot/", "", "https://b.example.com/x"], "/auth"), [
			"https://apis.example.com/copilot/auth",
			"https://b.example.com/x/auth",
		]);
	});

	it("knows no other target, and refuses one with no endpoint", async () => {
		const { deps: d, sent } = deps([]);
		await assert.rejects(exchangeToken("github" as TokenExchangeTarget, COPILOT_EXCHANGE, d), codeOf("not_supported"));
		await assert.rejects(exchangeToken("constructor" as TokenExchangeTarget, COPILOT_EXCHANGE, d), codeOf("not_supported"));
		await assert.rejects(exchangeToken("copilot", undefined, d), (error: unknown) => codeOf("not_supported")(error) && /no Copilot token exchange/.test((error as Error).message));
		assert.strictEqual(sent.length, 0);
	});
});

describe("WSO2 Cloud service requests", () => {
	const managed = (request: Partial<CloudServiceRequest>): CloudServiceRequest => ({ service: "managed-tokens", method: "GET", path: "/managed-connections", ...request });

	it("calls the service below its API root with WI's token", async () => {
		const { deps: d, sent } = deps([json(200, { items: [] })]);
		const answer = await callCloudService(managed({ method: "POST", path: "/managed-connections?org=acme", body: { name: "db" } }), d);
		assert.deepStrictEqual(answer, { items: [] });
		assert.strictEqual(sent[0].url, "https://tokens.example.com/managed-tokens/v1.0/api/v1/managed-connections?org=acme");
		assert.strictEqual(sent[0].init.method, "POST");
		assert.strictEqual(sent[0].init.redirect, "manual");
		assert.deepStrictEqual(JSON.parse(sent[0].init.body as string), { name: "db" });
		const headers = sent[0].init.headers as Record<string, string>;
		assert.strictEqual(headers.Authorization, "Bearer wso2-token-1");
		assert.strictEqual(headers.Accept, "application/json");
	});

	it("answers an empty body with undefined", async () => {
		const { deps: d } = deps([() => new Response(null, { status: 204 })]);
		assert.strictEqual(await callCloudService(managed({ method: "DELETE", path: "/managed-connections/1" }), d), undefined);
	});

	it("does not follow a redirect", async () => {
		const redirect = () => new Response(null, { status: 307, headers: { location: "https://elsewhere.example.com" } });
		await assert.rejects(callCloudService(managed({}), deps([redirect]).deps), codeOf("server", 307));
	});

	it("maps a failed call to the error its status means", async () => {
		await assert.rejects(callCloudService(managed({}), deps([json(404, { message: "gone" })]).deps), codeOf("not_found", 404));
		await assert.rejects(callCloudService(managed({}), deps([json(409, { message: "exists" })]).deps), codeOf("conflict", 409));
	});

	it("refuses a path that leaves the service's API root", async () => {
		const { deps: d, sent } = deps([]);
		await assert.rejects(callCloudService(managed({ path: "/../../other-api/x" }), d), codeOf("bad_request"));
		await assert.rejects(callCloudService(managed({ path: "/%2e%2e/%2e%2e/other-api" }), d), codeOf("bad_request"));
		await assert.rejects(callCloudService(managed({ path: "managed-connections" }), d), codeOf("bad_request"));
		assert.strictEqual(sent.length, 0);
	});

	it("knows no other service, and none the deployment has no host for", async () => {
		const { deps: d } = deps([]);
		await assert.rejects(callCloudService(managed({ service: "billing" as CloudServiceRequest["service"] }), d), codeOf("not_supported"));
		await assert.rejects(callCloudService(managed({}), deps([], { managedTokensBaseUrl: undefined }).deps), codeOf("not_supported"));
		await assert.rejects(callCloudService(managed({ method: "PATCH" as CloudServiceRequest["method"] }), d), codeOf("bad_request"));
	});
});
