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
import { type SourceReadiness, type SourceReadinessInput, sourceReadiness, validateIntegrationDisplayName } from "@wso2/wi-core";

const REMOTE = "https://github.com/acme/orders.git";
const READY: SourceReadinessInput = {
	gitData: { remotes: [REMOTE] },
	gitRemote: REMOTE,
	gitProvider: "github",
	branch: "main",
	branches: ["main"],
	branchesLoading: false,
	repoAccess: { isAccessible: true, retrievedRepos: true },
	repoAccessLoading: false,
	configDriftFiles: [],
	hasDirtyRepo: false,
};
const NO_REMOTE: Partial<SourceReadinessInput> = { gitRemote: null, gitProvider: null, branch: null, branches: [], repoAccess: undefined };

describe("sourceReadiness", () => {
	const cases: [string, Partial<SourceReadinessInput>, Omit<SourceReadiness, "message">, RegExp?][] = [
		["deploys from a pushed GitHub repository it can read", {}, { tone: "warning", blocking: false }],
		["asks for a repository outside one", { ...NO_REMOTE, gitData: null }, { action: "sourceControl", refresh: "gitData", tone: "warning", blocking: true }, /initialize/],
		["asks for a remote in a repository with none", { ...NO_REMOTE, gitData: { remotes: [] } }, { action: "sourceControl", refresh: "gitData", tone: "warning", blocking: true }, /no configured remotes/],
		["refuses a provider other than GitHub", { gitProvider: "bitbucket" }, { refresh: "gitData", tone: "warning", blocking: true }, /Bitbucket repositories is not supported/],
		["asks to grant access to a repository the app does not cover", { repoAccess: { retrievedRepos: true, isAccessible: false } }, { action: "grantAccess", refresh: "repoAccess", tone: "warning", blocking: true }, /access/],
		["asks to authorize when nothing is connected", { repoAccess: { retrievedRepos: false, isAccessible: false } }, { action: "authorize", refresh: "repoAccess", tone: "info", blocking: true }, /uthorize/],
		["asks to retry a failed access check rather than to authorize", { repoAccess: undefined, repoAccessError: "socket hang up" }, { refresh: "repoAccess", tone: "warning", blocking: true }, /^Couldn't check WSO2 Cloud's access/],
		["waits for the access check before asking for either", { repoAccess: undefined, repoAccessLoading: true }, { tone: "warning", blocking: false }],
		["asks to push when the remote has no branches", { branches: [], branch: null }, { action: "pushChanges", refresh: "branches", tone: "info", blocking: true }, /no branches/],
		["asks to commit and push changed metadata", { configDriftFiles: ["Config.toml"] }, { refresh: "configDrift", tone: "warning", blocking: true }, /metadata in Config\.toml\b.*Commit and push it\./],
		["notes uncommitted changes without blocking", { hasDirtyRepo: true }, { refresh: "dirtyRepo", tone: "neutral", blocking: false }, /commit and push/],
		["blocks with no message while the git data loads", { gitData: undefined }, { tone: "warning", blocking: true }],
		["blocks a notice while the git data loads", { gitData: undefined, hasDirtyRepo: true }, { refresh: "dirtyRepo", tone: "neutral", blocking: true }, /commit and push/],
		["blocks until a branch is picked", { branch: null }, { tone: "warning", blocking: true }],
		["shows why the git data could not be read, with Refresh", { gitData: undefined, gitDataError: "spawn git ENOENT" }, { refresh: "gitData", tone: "error", blocking: true }, /^Couldn't read the Git repository: spawn git ENOENT$/],
		["ignores a failed reread while earlier git data is there", { gitDataError: "spawn git ENOENT" }, { tone: "warning", blocking: false }],
		["shows the first issue only", { gitData: null, hasDirtyRepo: true, configDriftFiles: ["Config.toml"] }, { action: "sourceControl", refresh: "gitData", tone: "warning", blocking: true }, /initialize/],
	];

	for (const [name, change, expected, message] of cases) {
		it(name, () => {
			const { message: shown, ...rest } = sourceReadiness({ ...READY, ...change });
			assert.deepStrictEqual(rest, expected);
			if (message) {
				assert.match(shown ?? "", message);
			} else {
				assert.strictEqual(shown, undefined);
			}
		});
	}
});

describe("validateIntegrationDisplayName", () => {
	it("accepts letters, numbers, spaces, hyphens and underscores, around surrounding spaces", () => {
		assert.strictEqual(validateIntegrationDisplayName(" Orders API_2-b "), undefined);
	});

	it("requires a name", () => {
		assert.strictEqual(validateIntegrationDisplayName("   "), "Display name is required.");
	});

	it("refuses a name that starts with a symbol or holds another character", () => {
		for (const name of ["-orders", "_orders", "orders.api", "orders/api", "ördërs"]) {
			assert.match(validateIntegrationDisplayName(name) ?? "", /Must start with a letter or number/, name);
		}
	});
});
