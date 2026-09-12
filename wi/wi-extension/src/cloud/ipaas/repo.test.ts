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
	type RepoTreeNode,
	flattenTree,
	hasFileInPath,
	isSubPathEmpty,
	normalizeSubPath,
} from "./repo";
import { parseGitHubOwnerRepo } from "./repo-url";

const tree: RepoTreeNode[] = [
	{ path: "README.md", subPath: "README.md", type: "blob" },
	{
		path: "src",
		subPath: "src",
		type: "tree",
		children: [
			{
				path: "src/orders",
				subPath: "orders",
				type: "tree",
				children: [
					{ path: "src/orders/main.bal", subPath: "main.bal", type: "blob" },
				],
			},
			{ path: "src/Ballerina.toml", subPath: "Ballerina.toml", type: "blob" },
		],
	},
];

describe("parseGitHubOwnerRepo", () => {
	const cases: Array<
		[string | undefined, { owner: string; repo: string } | null]
	> = [
		["https://github.com/acme/repo", { owner: "acme", repo: "repo" }],
		["https://github.com/acme/repo.git", { owner: "acme", repo: "repo" }],
		["https://github.com/acme/repo/", { owner: "acme", repo: "repo" }],
		["git@github.com:acme/repo.git", { owner: "acme", repo: "repo" }],
		["ssh://git@github.com/acme/repo.git", { owner: "acme", repo: "repo" }],
		["  https://github.com/acme/repo  ", { owner: "acme", repo: "repo" }],
		// Not GitHub: addressing it as GitHub would query the wrong host entirely.
		["https://bitbucket.org/acme/repo", null],
		["https://gitlab.com/acme/repo", null],
		["not a url", null],
		[undefined, null],
	];
	for (const [input, want] of cases) {
		it(`parses ${JSON.stringify(input)}`, () =>
			assert.deepEqual(parseGitHubOwnerRepo(input), want));
	}
});

describe("normalizeSubPath", () => {
	for (const [input, want] of [
		["/src", "src"],
		["src/", "src"],
		["/src/", "src"],
		["", ""],
		["/", ""],
		[undefined, ""],
	] as Array<[string | undefined, string]>) {
		it(`normalizes ${JSON.stringify(input)}`, () =>
			assert.equal(normalizeSubPath(input), want));
	}
});

describe("flattenTree", () => {
	it("returns every path, nested included", () => {
		assert.deepEqual(flattenTree(tree).sort(), [
			"README.md",
			"src",
			"src/Ballerina.toml",
			"src/orders",
			"src/orders/main.bal",
		]);
	});
	it("tolerates an absent tree", () =>
		assert.deepEqual(flattenTree(undefined), []));
});

describe("isSubPathEmpty", () => {
	const paths = flattenTree(tree);

	// Creating an integration over an occupied path is what this blocks, so a
	// path holding anything at or beneath it is not empty.
	it("reports an occupied path as not empty", () => {
		assert.equal(isSubPathEmpty(paths, "src"), false);
		assert.equal(isSubPathEmpty(paths, "src/orders"), false);
	});

	it("reports a free path as empty", () => {
		assert.equal(isSubPathEmpty(paths, "services"), true);
		assert.equal(isSubPathEmpty(paths, "src/orders-v2"), true);
	});

	// "src/orders-v2" must not be judged occupied by "src/orders": prefix
	// matching has to respect the path separator.
	it("does not treat a sibling with a shared prefix as occupying", () => {
		assert.equal(isSubPathEmpty(["src/orders"], "src/orders-v2"), true);
	});

	it("treats the root as empty only for an empty repository", () => {
		assert.equal(isSubPathEmpty(paths, ""), false);
		assert.equal(isSubPathEmpty([], ""), true);
	});

	it("ignores leading and trailing slashes", () => {
		assert.equal(isSubPathEmpty(paths, "/src/"), false);
	});
});

describe("hasFileInPath", () => {
	const paths = flattenTree(tree);
	it("finds a file directly in the path", () =>
		assert.equal(hasFileInPath(paths, "src", "Ballerina.toml"), true));
	it("does not find one nested deeper", () =>
		assert.equal(hasFileInPath(paths, "", "Ballerina.toml"), false));
	it("finds one at the root", () =>
		assert.equal(hasFileInPath(paths, "", "README.md"), true));
});
