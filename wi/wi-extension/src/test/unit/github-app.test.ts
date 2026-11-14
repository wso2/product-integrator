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
import { type CloudClient, ConflictError } from "@wso2/wso2-cloud-client";
import { GitHubAppConnector, consoleGitHubStartUrl, gitHubSourceFor, installationSettingsUrl, resolveGitHubAccess } from "../../cloud/github-app";

const acme = { installationId: 7, githubAccount: "Acme" };

/** A cloud client answering the git integration and the public repository read. */
function fakeCloud(answers: { installations?: unknown[]; appBranches?: string[]; publicBranches?: string[]; connect?: () => Promise<unknown[]> } = {}) {
	const connected: string[] = [];
	const cloud = {
		git: {
			listGitHubInstallations: async () => answers.installations ?? [],
			listGitHubBranches: async () => {
				if (!answers.appBranches) {
					throw new Error("repository not in installation");
				}
				return answers.appBranches;
			},
			connectGitHubInstallations: async (code: string) => {
				connected.push(code);
				return answers.connect ? answers.connect() : [acme];
			},
		},
		repos: { listBranches: async () => (answers.publicBranches ?? []).map((name) => ({ name })) },
	};
	return { cloud: cloud as unknown as CloudClient, connected };
}

describe("GitHub repository access", () => {
	it("reads a repository through the installation on its owner", async () => {
		const { cloud } = fakeCloud({ installations: [acme], appBranches: ["main"] });
		const access = await resolveGitHubAccess(cloud, "acme", "orders");
		assert.equal(access.kind, "installation");
		assert.deepEqual(gitHubSourceFor(access, "main", "svc", "https://github.com/acme/orders"), {
			installationId: 7,
			owner: "acme",
			repo: "orders",
			branch: "main",
			appPath: "svc",
			repositoryUrl: "https://github.com/acme/orders",
		});
	});

	it("tells a repository the app is not given apart from an owner it is not on", async () => {
		assert.equal((await resolveGitHubAccess(fakeCloud({ installations: [acme] }).cloud, "acme", "secret")).kind, "not-granted");
		assert.equal((await resolveGitHubAccess(fakeCloud({ installations: [acme] }).cloud, "other", "secret")).kind, "not-connected");
	});

	it("reads a public repository with no installation and binds no source for it", async () => {
		const access = await resolveGitHubAccess(fakeCloud({ publicBranches: ["main"] }).cloud, "acme", "orders");
		assert.equal(access.kind, "public");
		assert.equal(gitHubSourceFor(access, "main", undefined, "https://github.com/acme/orders"), undefined);
	});

	it("counts a git integration that cannot answer as no installation", async () => {
		const { cloud } = fakeCloud({ publicBranches: ["main"] });
		(cloud.git as { listGitHubInstallations: () => Promise<unknown> }).listGitHubInstallations = async () => {
			throw new Error("401");
		};
		const logged: string[] = [];
		assert.equal((await resolveGitHubAccess(cloud, "acme", "orders", (m) => logged.push(m))).kind, "public");
		assert.equal(logged.length, 1);
	});

	it("opens an installation's settings on the page its account type has", async () => {
		const answer = (type: string) => (async () => new Response(JSON.stringify({ type }))) as unknown as typeof fetch;
		assert.equal(await installationSettingsUrl("acme", 7, answer("Organization")), "https://github.com/organizations/acme/settings/installations/7");
		assert.equal(await installationSettingsUrl("jo", 7, answer("User")), "https://github.com/settings/installations/7");
		const down = (async () => {
			throw new Error("offline");
		}) as unknown as typeof fetch;
		assert.equal(await installationSettingsUrl("acme", 7, down), "https://github.com/organizations/acme/settings/installations/7");
	});
});

describe("GitHubAppConnector", () => {
	function connector(cloud: CloudClient, uriScheme = "vscode") {
		const opened: string[] = [];
		const outcomes: string[] = [];
		let n = 0;
		const app = new GitHubAppConnector({
			cloud: () => cloud,
			consoleUrl: () => "https://console.example/integration/organizations/acme",
			uriScheme,
			openExternal: async (url) => opened.push(url),
			log: () => undefined,
			newNonce: () => `n${++n}`,
			outcome: {
				connected: (items) => outcomes.push(`connected:${items.map((i) => i.githubAccount).join(",")}`),
				requested: () => outcomes.push("requested"),
				cancelled: () => outcomes.push("cancelled"),
				failed: (message) => outcomes.push(`failed:${message}`),
			},
		});
		return { app, opened, outcomes };
	}
	const query = (params: Record<string, string>) => new URLSearchParams(params);

	it("starts GitHub on the console's callback page and connects with the code it returns", async () => {
		const { cloud, connected } = fakeCloud();
		const { app, opened, outcomes } = connector(cloud);
		await app.connect("acme");
		assert.deepEqual(opened, ["https://console.example/ghapp?editor=vscode&nonce=n1&start=authorize"]);

		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		assert.deepEqual(connected, ["c0de"]);
		assert.deepEqual(outcomes, ["connected:Acme"]);
	});

	it("ignores a return this window did not start, and a second use of one it did", async () => {
		const { cloud, connected } = fakeCloud();
		const { app } = connector(cloud);
		await app.handleReturn(query({ code: "forged", state: "n1" }));
		await app.connect("acme");
		await app.handleReturn(query({ code: "forged", state: "other" }));
		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		await app.handleReturn(query({ code: "again", state: "n1" }));
		assert.deepEqual(connected, ["c0de"]);
	});

	it("goes on to install the app when the repository's owner has none", async () => {
		const { cloud } = fakeCloud({ connect: async () => [{ installationId: 9, githubAccount: "jo" }] });
		const { app, opened, outcomes } = connector(cloud);
		await app.connect("acme");
		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		assert.equal(opened[1], "https://console.example/ghapp?editor=vscode&nonce=n2&start=install");
		assert.deepEqual(outcomes, []);

		await app.handleReturn(query({ code: "c1", state: "n2", setup_action: "install", installation_id: "7" }));
		assert.deepEqual(outcomes, ["connected:jo"], "after the install the owner is not asked for again");
	});

	it("installs when the GitHub user has the app nowhere, and authorizes after an install that returned no code", async () => {
		let calls = 0;
		const { cloud } = fakeCloud({
			connect: async () => {
				if (calls++ === 0) {
					throw new ConflictError("no accessible GitHub App installations; install the app first");
				}
				return [acme];
			},
		});
		const { app, opened, outcomes } = connector(cloud);
		await app.connect();
		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		assert.ok(opened[1].endsWith("nonce=n2&start=install"));
		await app.handleReturn(query({ state: "n2", setup_action: "install", installation_id: "7" }));
		assert.ok(opened[2].endsWith("nonce=n3&start=authorize"));
		await app.handleReturn(query({ code: "c2", state: "n3" }));
		assert.deepEqual(outcomes, ["connected:Acme"]);
	});

	it("reports an approval request, a cancel and a refusal", async () => {
		const failing = fakeCloud({
			connect: async () => {
				throw new Error("bad gateway");
			},
		});
		const { app, outcomes } = connector(failing.cloud);
		await app.connect("acme");
		await app.handleReturn(query({ state: "n1", setup_action: "request" }));
		await app.connect("acme");
		await app.handleReturn(query({ state: "n2", error: "access_denied" }));
		await app.connect("acme");
		await app.handleReturn(query({ state: "n3", code: "c0de" }));
		assert.deepEqual(outcomes, ["requested", "cancelled", "failed:Could not connect GitHub to WSO2 Cloud: bad gateway"]);
	});

	it("sends an editor GitHub cannot return to to the console", async () => {
		const { app, opened } = connector(fakeCloud().cloud, "code-oss");
		assert.equal(app.canReturnHere, false);
		await app.connect("acme");
		assert.deepEqual(opened, ["https://console.example/integration/organizations/acme"]);
	});

	it("builds the console start page on the console's origin", () => {
		assert.equal(consoleGitHubStartUrl("https://console.example/a/b", "wso2-integrator", "abc", "install"), "https://console.example/ghapp?editor=wso2-integrator&nonce=abc&start=install");
	});
});
