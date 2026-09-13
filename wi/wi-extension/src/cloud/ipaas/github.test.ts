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
	buildAuthorizeUrl,
	buildInstallUrl,
	indexInstallations,
	installationFor,
	isGitHubAuthRequired,
	toGitOrgs,
} from "./github";

describe("indexInstallations", () => {
	const entries = [
		{
			installation: { installationId: 1, githubAccount: "acme" },
			repos: [{ name: "repo", owner: "acme", defaultBranch: "main" }],
		},
		{
			installation: { installationId: 2, githubAccount: "other-org" },
			// Shared into the installation from a different owner.
			repos: [
				{ name: "shared", owner: "third-party", defaultBranch: "develop" },
			],
		},
	];

	it("indexes the installation account", () => {
		assert.equal(
			installationFor(indexInstallations(entries), "acme")?.installationId,
			1,
		);
	});

	// A repository shared into an installation carries a different owner;
	// indexing only the account would make it unreachable.
	it("indexes a shared repository's own owner", () => {
		assert.equal(
			installationFor(indexInstallations(entries), "third-party")
				?.installationId,
			2,
		);
	});

	it("matches owners case-insensitively, as GitHub does", () => {
		assert.equal(
			installationFor(indexInstallations(entries), "ACME")?.installationId,
			1,
		);
	});

	it("records default branches per repository", () => {
		assert.equal(
			installationFor(
				indexInstallations(entries),
				"acme",
			)?.defaultBranchByRepo.get("repo"),
			"main",
		);
	});

	it("returns null for an owner no installation covers", () => {
		assert.equal(installationFor(indexInstallations(entries), "nobody"), null);
		assert.equal(installationFor(null, "acme"), null);
		assert.equal(installationFor(indexInstallations(entries), undefined), null);
	});

	it("skips an installation with no account", () => {
		const index = indexInstallations([
			{ installation: { installationId: 9, githubAccount: "" }, repos: [] },
		]);
		assert.equal(index.size, 0);
	});
});

describe("isGitHubAuthRequired", () => {
	// 409 means the authorization itself is gone, which calls for re-authorizing
	// rather than retrying, and it affects every installation at once.
	it("recognises 409 and nothing else", () => {
		assert.equal(isGitHubAuthRequired(409), true);
		assert.equal(isGitHubAuthRequired(404), false);
		assert.equal(isGitHubAuthRequired(401), false);
		assert.equal(isGitHubAuthRequired(undefined), false);
	});
});

describe("buildAuthorizeUrl", () => {
	it("carries the client id, redirect and state", () => {
		const url = new URL(
			buildAuthorizeUrl("Iv23li", "https://console.test/ghapp", "st%te"),
		);
		assert.equal(
			url.origin + url.pathname,
			"https://github.com/login/oauth/authorize",
		);
		assert.equal(url.searchParams.get("client_id"), "Iv23li");
		assert.equal(
			url.searchParams.get("redirect_uri"),
			"https://console.test/ghapp",
		);
		// Returned by GitHub untouched, so it has to survive encoding intact.
		assert.equal(url.searchParams.get("state"), "st%te");
		assert.equal(url.searchParams.get("scope"), "repo,read:user");
	});
});

describe("buildInstallUrl", () => {
	it("points at the App's install page", () => {
		const url = new URL(
			buildInstallUrl("wso2-cloud-git-connect-dev", "abc+def"),
		);
		assert.equal(
			url.origin + url.pathname,
			"https://github.com/apps/wso2-cloud-git-connect-dev/installations/new",
		);
		assert.equal(url.searchParams.get("state"), "abc+def");
	});
});

describe("toGitOrgs", () => {
	const inst = (id: number, account: string) => ({
		installationId: id,
		githubAccount: account,
	});

	it("lists each installation account with its repositories", () => {
		const orgs = toGitOrgs([
			{
				installation: inst(1, "acme"),
				repos: [
					{ name: "zebra", defaultBranch: "main" },
					{ name: "apples", defaultBranch: "main" },
				],
			},
		]);
		assert.deepStrictEqual(orgs, [
			{
				orgName: "acme",
				orgHandler: "acme",
				repositories: [{ name: "apples" }, { name: "zebra" }],
			},
		]);
	});

	// A repository shared into an installation carries its own owner, and the
	// clone URL is built from that owner, so it has to be listed under it.
	it("lists a shared repository under its own owner", () => {
		const orgs = toGitOrgs([
			{
				installation: inst(1, "acme"),
				repos: [{ name: "shared", owner: "partner" }],
			},
		]);
		const owners = orgs.map((o) => o.orgName).sort();
		assert.deepStrictEqual(owners, ["acme", "partner"]);
		assert.deepStrictEqual(
			orgs.find((o) => o.orgName === "partner")?.repositories,
			[{ name: "shared" }],
		);
	});

	// The account is listed even with no repositories: the user has installed
	// the App but granted it nothing yet, and the picker has to show the
	// account so they can see that.
	it("lists an installation with no repositories", () => {
		assert.deepStrictEqual(toGitOrgs([{ installation: inst(1, "acme"), repos: [] }]), [
			{ orgName: "acme", orgHandler: "acme", repositories: [] },
		]);
	});

	it("merges installations that share an owner, case-insensitively", () => {
		const orgs = toGitOrgs([
			{ installation: inst(1, "Acme"), repos: [{ name: "one" }] },
			{ installation: inst(2, "acme"), repos: [{ name: "two" }] },
		]);
		assert.strictEqual(orgs.length, 1);
		assert.deepStrictEqual(orgs[0].repositories, [{ name: "one" }, { name: "two" }]);
	});

	it("skips an installation with no account and repositories with no name", () => {
		const orgs = toGitOrgs([
			{ installation: { installationId: 1, githubAccount: "" }, repos: [{ name: "x" }] },
			{ installation: inst(2, "acme"), repos: [{ name: "" }, { name: "real" }] },
		]);
		assert.deepStrictEqual(orgs, [
			{ orgName: "acme", orgHandler: "acme", repositories: [{ name: "real" }] },
		]);
	});

	it("returns nothing when there are no installations", () => {
		assert.deepStrictEqual(toGitOrgs([]), []);
	});
});
