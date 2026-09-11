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
import { describe, it } from "node:test";
import {
	ENV_API_BASE_URL,
	ENV_STS_TOKEN,
	normalizeBaseUrl,
	resolveBackend,
} from "./config";

const TOKEN = { [ENV_STS_TOKEN]: "a-token" };
const URL = "https://api.example.dev";

describe("normalizeBaseUrl", () => {
	const cases: Array<[string, string | undefined, string]> = [
		["strips one trailing slash", "https://a.dev/", "https://a.dev"],
		["strips repeated trailing slashes", "https://a.dev///", "https://a.dev"],
		["keeps a path prefix", "https://a.dev/api/v1", "https://a.dev/api/v1"],
		["trims surrounding space", "  https://a.dev  ", "https://a.dev"],
		["treats whitespace as absent", "   ", ""],
		["treats undefined as absent", undefined, ""],
	];
	for (const [name, input, want] of cases) {
		it(name, () => assert.equal(normalizeBaseUrl(input), want));
	}
});

describe("resolveBackend", () => {
	it("uses the Integration Platform when the editor supplies a token and a base URL", () => {
		const resolved = resolveBackend({
			env: { ...TOKEN, [ENV_API_BASE_URL]: URL },
		});
		assert.deepEqual(resolved, { backend: "ipaas", baseUrl: URL });
	});

	// The previous platform's editors inject CLOUD_STS_TOKEN but never a base
	// URL. Resolving those to the Integration Platform would break every one of
	// them, so the token alone must never be enough.
	it("stays on Choreo when only a token is present", () => {
		assert.deepEqual(resolveBackend({ env: TOKEN }), {
			backend: "choreo",
			baseUrl: "",
		});
	});

	it("stays on Choreo when only a base URL is present", () => {
		const resolved = resolveBackend({ env: { [ENV_API_BASE_URL]: URL } });
		assert.deepEqual(resolved, { backend: "choreo", baseUrl: "" });
	});

	it("stays on Choreo on a plain desktop install", () => {
		assert.deepEqual(resolveBackend({ env: {} }), {
			backend: "choreo",
			baseUrl: "",
		});
	});

	it("lets the setting override the environment's base URL", () => {
		const resolved = resolveBackend({
			baseUrlSetting: "https://local.test/",
			env: { ...TOKEN, [ENV_API_BASE_URL]: URL },
		});
		assert.deepEqual(resolved, {
			backend: "ipaas",
			baseUrl: "https://local.test",
		});
	});

	it("forces the Integration Platform without a token when explicitly selected", () => {
		const resolved = resolveBackend({
			setting: "ipaas",
			baseUrlSetting: URL,
			env: {},
		});
		assert.deepEqual(resolved, { backend: "ipaas", baseUrl: URL });
	});

	// "ipaas" with nowhere to send requests has no recovery, unlike a missing
	// token, which at least fails with a 401 that names the problem.
	it("falls back to Choreo when ipaas is selected with no base URL", () => {
		assert.deepEqual(resolveBackend({ setting: "ipaas", env: TOKEN }), {
			backend: "choreo",
			baseUrl: "",
		});
	});

	it("forces Choreo even inside an Integration Platform editor", () => {
		const resolved = resolveBackend({
			setting: "choreo",
			env: { ...TOKEN, [ENV_API_BASE_URL]: URL },
		});
		assert.deepEqual(resolved, { backend: "choreo", baseUrl: "" });
	});

	it("treats an unrecognised setting as auto", () => {
		const resolved = resolveBackend({
			setting: "nonsense",
			env: { ...TOKEN, [ENV_API_BASE_URL]: URL },
		});
		assert.deepEqual(resolved, { backend: "ipaas", baseUrl: URL });
	});
});
