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

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import axios, { type AxiosRequestConfig } from "axios";
import { BffClient, IpaasError, items, q, seg } from "./bff";

/**
 * Requests are intercepted at the adapter, which is the lowest seam axios
 * offers: everything above it — headers, serialization, validateStatus — is the
 * real code path, so these assertions describe what would go on the wire.
 */
interface Captured {
	config: AxiosRequestConfig;
}

function clientWith(
	responses: Array<{ status: number; data: string } | Error>,
	token = "tok",
): { client: BffClient; captured: Captured[] } {
	const captured: Captured[] = [];
	let call = 0;
	const adapter = async (config: AxiosRequestConfig) => {
		captured.push({ config });
		const next = responses[Math.min(call++, responses.length - 1)];
		if (next instanceof Error) {
			throw next;
		}
		return {
			status: next.status,
			statusText: "",
			data: next.data,
			headers: {},
			config,
		};
	};
	axios.defaults.adapter = adapter as any;
	return {
		client: new BffClient({
			baseUrl: "https://api.test",
			getToken: () => token,
		}),
		captured,
	};
}

describe("q", () => {
	it("returns an empty string when nothing is set", () => {
		assert.equal(q({ a: undefined, b: null, c: "" }), "");
	});
	// A present-but-empty projectName filters on the empty name rather than
	// meaning "unfiltered", so blanks must never reach the wire.
	it("drops blank values but keeps false and zero", () => {
		assert.equal(q({ a: "", b: false, c: 0, d: "x" }), "?b=false&c=0&d=x");
	});
	it("encodes keys and values", () => {
		assert.equal(q({ "a b": "c/d" }), "?a%20b=c%2Fd");
	});
});

describe("seg", () => {
	it("encodes a path segment", () => assert.equal(seg("a/b"), "a%2Fb"));
});

describe("items", () => {
	it("tolerates an absent envelope", () => {
		assert.deepEqual(items(undefined), []);
		assert.deepEqual(items(null), []);
		assert.deepEqual(items({ items: [1, 2] }), [1, 2]);
	});
});

describe("BffClient", () => {
	beforeEach(() => {
		axios.defaults.adapter = undefined;
	});

	it("sends the bearer token and joins base URL to path", async () => {
		const { client, captured } = clientWith([
			{ status: 200, data: '{"ok":true}' },
		]);
		const result = await client.get<{ ok: boolean }>("/projects");
		assert.deepEqual(result, { ok: true });
		assert.equal(captured[0].config.url, "https://api.test/projects");
		assert.equal(
			(captured[0].config.headers as Record<string, string>).Authorization,
			"Bearer tok",
		);
	});

	it("omits the Authorization header when there is no token", async () => {
		const { client, captured } = clientWith([{ status: 200, data: "{}" }], "");
		await client.get("/projects");
		assert.equal(
			(captured[0].config.headers as Record<string, string>).Authorization,
			undefined,
		);
	});

	it("sets a JSON content type only when there is a body", async () => {
		const { client, captured } = clientWith([{ status: 200, data: "{}" }]);
		await client.post("/components", { a: 1 });
		assert.equal(
			(captured[0].config.headers as Record<string, string>)["Content-Type"],
			"application/json",
		);
		// Serialization happens above the adapter, so this is the literal body.
		assert.equal(captured[0].config.data, '{"a":1}');

		// A bodyless POST declares no content type. The config carries null,
		// which axios drops before the request is sent (verified against a real
		// socket: the server sees no content-type header at all) — asserting
		// "nullish" therefore describes the wire, not an axios implementation detail.
		const bodyless = clientWith([{ status: 200, data: "{}" }]);
		await bodyless.client.post("/components/x/builds");
		const contentType = (
			bodyless.captured[0].config.headers as Record<string, unknown>
		)["Content-Type"];
		assert.ok(
			contentType == null,
			`expected no content type, got ${String(contentType)}`,
		);
	});

	// The deployment endpoint answers 200 with no body when nothing is deployed
	// yet, which is an answer, not a failure.
	it("resolves an empty body as undefined", async () => {
		const { client } = clientWith([{ status: 200, data: "" }]);
		assert.equal(await client.get("/components/x/deployments"), undefined);
	});

	it("resolves a 204 as undefined", async () => {
		const { client } = clientWith([{ status: 204, data: "" }]);
		assert.equal(await client.delete("/projects/p/components/c"), undefined);
	});

	it("raises the platform's message rather than the raw body", async () => {
		const { client } = clientWith([
			{
				status: 404,
				data: '{"error":"Not Found","message":"component not found"}',
			},
		]);
		await assert.rejects(client.get("/components/x"), (err: unknown) => {
			assert.ok(err instanceof IpaasError);
			assert.equal(err.status, 404);
			assert.equal(err.message, "component not found");
			assert.equal(err.isNotFound, true);
			assert.equal(err.isUnauthorized, false);
			return true;
		});
	});

	it("falls back to the raw body when the error is not JSON", async () => {
		const { client } = clientWith([
			{ status: 502, data: "<html>bad gateway</html>" },
		]);
		await assert.rejects(client.get("/projects"), (err: unknown) => {
			assert.ok(err instanceof IpaasError);
			assert.equal(err.message, "HTTP 502: <html>bad gateway</html>");
			return true;
		});
	});

	it("classifies 401 and 403 as unauthorized", async () => {
		for (const status of [401, 403]) {
			const { client } = clientWith([{ status, data: "" }]);
			await assert.rejects(client.get("/projects"), (err: unknown) => {
				assert.ok(err instanceof IpaasError);
				assert.equal(err.isUnauthorized, true);
				return true;
			});
		}
	});

	// A transport failure is not something the platform said, so it must not be
	// mistaken for a status the caller might branch on.
	it("reports a transport failure as status 0", async () => {
		const { client } = clientWith([new Error("connect ECONNREFUSED")]);
		await assert.rejects(client.get("/projects"), (err: unknown) => {
			assert.ok(err instanceof IpaasError);
			assert.equal(err.status, 0);
			assert.equal(err.isNotFound, false);
			assert.match(err.message, /connect ECONNREFUSED/);
			return true;
		});
	});
});
