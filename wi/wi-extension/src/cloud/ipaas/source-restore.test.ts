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
	integrationPath,
	normalizeSubPath,
	shouldRestoreSource,
	toSourceLocation,
} from "./source-restore";

describe("shouldRestoreSource", () => {
	const base = {
		backend: "ipaas",
		sourceComponentId: "comp-1",
		workspaceIsRepository: false,
	};

	it("restores for an editor opened on an integration with no working copy", () => {
		assert.strictEqual(shouldRestoreSource(base), true);
	});

	// A fresh editor has no integration and therefore no source to fetch; the
	// user is about to write one.
	it("does not restore for a fresh editor", () => {
		assert.strictEqual(
			shouldRestoreSource({ ...base, sourceComponentId: "" }),
			false,
		);
		assert.strictEqual(
			shouldRestoreSource({ ...base, sourceComponentId: undefined }),
			false,
		);
	});

	// A workspace that is already a repository has either been restored or holds
	// work that was never pushed. Replacing it would discard that work.
	it("does not restore over an existing working copy", () => {
		assert.strictEqual(
			shouldRestoreSource({ ...base, workspaceIsRepository: true }),
			false,
		);
	});

	it("does nothing on the previous platform", () => {
		assert.strictEqual(shouldRestoreSource({ ...base, backend: "choreo" }), false);
	});
});

describe("integrationPath", () => {
	it("opens the integration's own directory, not the clone root", () => {
		assert.strictEqual(integrationPath("/tmp/repo", "svc/orders"), "/tmp/repo/svc/orders");
	});

	it("opens the clone root when the integration is the repository", () => {
		assert.strictEqual(integrationPath("/tmp/repo", ""), "/tmp/repo");
		assert.strictEqual(integrationPath("/tmp/repo", "/"), "/tmp/repo");
		assert.strictEqual(integrationPath("/tmp/repo", "."), "/tmp/repo");
	});

	it("joins exactly once whatever the recorded form", () => {
		for (const sub of ["/svc", "svc/", "./svc", "\\svc"]) {
			assert.strictEqual(integrationPath("/tmp/repo/", sub), "/tmp/repo/svc", `for ${sub}`);
		}
	});
});

describe("normalizeSubPath", () => {
	it("reduces a recorded subpath to a relative one", () => {
		const cases: Array<[string | undefined, string]> = [
			["/a/b", "a/b"],
			["a/b/", "a/b"],
			["./a", "a"],
			["a\\b", "a/b"],
			[".", ""],
			["/", ""],
			["", ""],
			[undefined, ""],
		];
		for (const [input, want] of cases) {
			assert.strictEqual(normalizeSubPath(input), want, `for ${JSON.stringify(input)}`);
		}
	});
});

describe("toSourceLocation", () => {
	it("reads the recorded location", () => {
		assert.deepStrictEqual(
			toSourceLocation({ repo: "https://github.com/acme/orders", branch: "main", path: "/svc" }),
			{ repoUrl: "https://github.com/acme/orders", branch: "main", subPath: "svc" },
		);
	});

	// A component that was never given a repository has nothing to restore, and
	// that is not a failure to report.
	it("returns nothing when no repository is recorded", () => {
		assert.strictEqual(toSourceLocation(null), null);
		assert.strictEqual(toSourceLocation(undefined), null);
		assert.strictEqual(toSourceLocation({}), null);
		assert.strictEqual(toSourceLocation({ repo: "   " }), null);
	});

	it("tolerates a missing branch", () => {
		assert.deepStrictEqual(toSourceLocation({ repo: "https://github.com/acme/orders" }), {
			repoUrl: "https://github.com/acme/orders",
			branch: "",
			subPath: "",
		});
	});
});
