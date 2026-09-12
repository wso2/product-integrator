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
import { ENV_CONSOLE_URL, resolveConsoleUrl } from "./config";
import { buildConsoleLink } from "./console-link";

const BASE = "https://ipaas-console-development.gateway.dev.cloud.wso2.com";

describe("buildConsoleLink", () => {
	it("links to an integration overview", () => {
		assert.equal(
			buildConsoleLink(BASE, "chiran-org", "default", "greetings"),
			`${BASE}/organizations/chiran-org/projects/default/components/greetings/overview`,
		);
	});

	it("links to a project when no integration is named", () => {
		assert.equal(
			buildConsoleLink(BASE, "chiran-org", "default"),
			`${BASE}/organizations/chiran-org/projects/default`,
		);
	});

	it("tolerates a trailing slash on the base", () => {
		assert.equal(
			buildConsoleLink(`${BASE}/`, "chiran-org", "default", "greetings"),
			`${BASE}/organizations/chiran-org/projects/default/components/greetings/overview`,
		);
	});

	it("encodes each segment", () => {
		assert.match(
			buildConsoleLink(BASE, "a b", "c/d", "e f"),
			/organizations\/a%20b\/projects\/c%2Fd\/components\/e%20f/,
		);
	});

	// Without a base there is no link to offer. Returning "" lets callers skip
	// the action rather than open "undefined/organizations/...".
	const incomplete: Array<
		[string, [string, string, string, string | undefined]]
	> = [
		["no base", ["", "org", "proj", "comp"]],
		["no org", [BASE, "", "proj", "comp"]],
		["no project", [BASE, "org", "", "comp"]],
	];
	for (const [name, args] of incomplete) {
		it(`returns an empty string with ${name}`, () => {
			assert.equal(buildConsoleLink(...args), "");
		});
	}
});

describe("resolveConsoleUrl", () => {
	it("reads the injected console URL", () => {
		assert.equal(
			resolveConsoleUrl({ env: { [ENV_CONSOLE_URL]: `${BASE}/` } }),
			BASE,
		);
	});
	it("lets the setting win", () => {
		assert.equal(
			resolveConsoleUrl({
				setting: "https://local.test",
				env: { [ENV_CONSOLE_URL]: BASE },
			}),
			"https://local.test",
		);
	});
	it("is empty when nothing supplies one", () => {
		assert.equal(resolveConsoleUrl({ env: {} }), "");
	});
});
