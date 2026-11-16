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
import { ConflictError, ENVIRONMENTS, type GitProxyApi } from "@wso2/wso2-cloud-client";
import { env } from "vscode";
import { githubRepoAccess, installGitHubApp } from "../../cloud/github-app";
import { ext } from "../../extensionVariables";
import { fireWindowState } from "./mocks/vscode";

type GitHubCalls = Pick<GitProxyApi, "listGitHubInstallations" | "listGitHubRepos" | "listGitHubBranches">;

function platform(git: Partial<GitHubCalls>, publicBranches: string[] = []): void {
	ext.config = { ...ENVIRONMENTS.dev };
	ext.clients = {
		platform: { cloud: { git, repos: { listBranches: async () => publicBranches.map((name) => ({ name })) } } },
	} as unknown as typeof ext.clients;
}

const ACME = async () => [{ installationId: 7, githubAccount: "Acme" }];
const ORDERS = async () => [{ owner: "acme", name: "Orders", private: true, defaultBranch: "main" }];
const MAIN = async () => ["main"];
const AUTH_REQUIRED = new ConflictError("github-auth-required", { status: 409, apiError: "github-auth-required" });
const NO_ACCESS = { retrievedRepos: true, isAccessible: false, branches: [] as string[] };

describe("GitHub repository access", () => {
	it("reads a repository the app covers, with its installation", async () => {
		platform({ listGitHubInstallations: ACME, listGitHubRepos: ORDERS, listGitHubBranches: MAIN });
		assert.deepStrictEqual(await githubRepoAccess("acme", "orders"), { retrievedRepos: true, isAccessible: true, installationId: 7, branches: ["main"] });
	});

	it("asks to authorize while nothing is connected, or the app's authorization lapsed even for a public repository", async () => {
		platform({ listGitHubInstallations: async () => [] });
		assert.strictEqual((await githubRepoAccess("acme", "orders")).retrievedRepos, false);
		platform({ listGitHubInstallations: ACME, listGitHubRepos: () => Promise.reject(AUTH_REQUIRED) }, ["main"]);
		assert.deepStrictEqual(await githubRepoAccess("acme", "orders"), { retrievedRepos: false, isAccessible: false, branches: [] });
	});

	it("asks to grant access when the app is not on the account", async () => {
		platform({ listGitHubInstallations: async () => [{ installationId: 8, githubAccount: "other" }] }, ["main"]);
		assert.deepStrictEqual(await githubRepoAccess("acme", "orders"), NO_ACCESS);
	});

	it("asks to grant access for a public repository the installation does not include, though its branches read", async () => {
		platform({ listGitHubInstallations: ACME, listGitHubRepos: async () => [], listGitHubBranches: MAIN }, ["main"]);
		assert.deepStrictEqual(await githubRepoAccess("acme", "orders"), NO_ACCESS);
	});

	it("carries on from the install page once the editor has its focus back, with nothing more to connect", async () => {
		const opened: string[] = [];
		const openExternal = env.openExternal;
		env.openExternal = async (uri: { toString(): string }) => {
			opened.push(uri.toString());
			fireWindowState(false);
			return true;
		};
		try {
			platform({ listGitHubInstallations: ACME });
			let back = false;
			const install = installGitHubApp("acme").then(() => {
				back = true;
			});
			await new Promise((resolve) => setImmediate(resolve));
			assert.strictEqual(back, false);
			fireWindowState(true);
			await install;
			assert.deepStrictEqual(opened, ["https://github.com/apps/wso2-cloud-git-connect-dev/installations/new"]);
		} finally {
			env.openExternal = openExternal;
		}
	});

	it("reads public repositories in an environment with no GitHub App", async () => {
		platform({}, ["main"]);
		ext.config = { ...ENVIRONMENTS.prod };
		assert.deepStrictEqual(await githubRepoAccess("acme", "orders"), { retrievedRepos: true, isAccessible: true, branches: ["main"] });
	});
});
