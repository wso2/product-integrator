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
import { GitHubAppConnector, consoleGitHubStartUrl, gitHubSourceFor, installationSettingsUrl, pkceChallenge, resolveGitHubAccess } from "../../cloud/github-app";

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
			connectGitHubInstallations: async (code: string, verifier?: string) => {
				connected.push(verifier ? `${code} with ${verifier}` : code);
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
		const signedIn = { session: "u1/acme" as string | undefined };
		let n = 0;
		let v = 0;
		const app = new GitHubAppConnector({
			cloud: () => cloud,
			consoleUrl: () => "https://console.example/integration/organizations/acme",
			session: () => signedIn.session,
			uriScheme,
			openExternal: async (url) => opened.push(url),
			log: () => undefined,
			newNonce: () => `n${++n}`,
			newVerifier: () => `v${++v}`,
			outcome: {
				connected: (items, missingOwner) => outcomes.push(`connected:${items.map((i) => i.githubAccount).join(",")}${missingOwner ? ` but not ${missingOwner}` : ""}`),
				noInstallationVisible: (owner) => outcomes.push(`none visible${owner ? ` on ${owner}` : ""}`),
				requested: () => outcomes.push("requested"),
				cancelled: () => outcomes.push("cancelled"),
				failed: (message) => outcomes.push(`failed:${message}`),
			},
		});
		return { app, opened, outcomes, signedIn };
	}
	const query = (params: Record<string, string>) => new URLSearchParams(params);
	const start = (url: string) => Object.fromEntries(new URL(url).searchParams);

	it("starts GitHub on the console's callback page with a PKCE challenge, and connects with the code and its verifier", async () => {
		const { cloud, connected } = fakeCloud();
		const { app, opened, outcomes } = connector(cloud);
		await app.connect("acme");
		assert.equal(new URL(opened[0]).origin + new URL(opened[0]).pathname, "https://console.example/ghapp");
		assert.deepEqual(start(opened[0]), { editor: "vscode", nonce: "n1", start: "authorize", challenge: pkceChallenge("v1") });

		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		assert.deepEqual(connected, ["c0de with v1"]);
		assert.deepEqual(outcomes, ["connected:Acme"]);
	});

	it("makes the S256 challenge of a verifier", () => {
		// RFC 7636, appendix B.
		assert.equal(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
	});

	it("ignores a return this window did not start, and a second use of one it did", async () => {
		const { cloud, connected } = fakeCloud();
		const { app } = connector(cloud);
		await app.handleReturn(query({ code: "forged", state: "n1" }));
		await app.connect("acme");
		await app.handleReturn(query({ code: "forged", state: "other" }));
		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		await app.handleReturn(query({ code: "again", state: "n1" }));
		assert.deepEqual(connected, ["c0de with v1"]);
	});

	it("goes on to install the app when the repository's owner has none, then authorizes again rather than use the install page's code", async () => {
		const { cloud, connected } = fakeCloud({ connect: async () => [{ installationId: 9, githubAccount: "jo" }] });
		const { app, opened, outcomes } = connector(cloud);
		await app.connect("acme");
		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		assert.deepEqual(start(opened[1]), { editor: "vscode", nonce: "n2", start: "install" }, "GitHub's install page takes no challenge");
		assert.deepEqual(outcomes, []);

		await app.handleReturn(query({ code: "c1", state: "n2", setup_action: "install", installation_id: "7" }));
		assert.deepEqual(start(opened[2]), { editor: "vscode", nonce: "n3", start: "authorize", challenge: pkceChallenge("v2") });
		await app.handleReturn(query({ code: "c2", state: "n3" }));
		assert.deepEqual(connected, ["c0de with v1", "c2 with v2"]);
		assert.deepEqual(outcomes, ["connected:jo but not acme"], "after the install the owner is not asked for again");
	});

	it("offers GitHub's account picker for the owner the app is still not on", async () => {
		const { cloud } = fakeCloud();
		const { app, opened } = connector(cloud);
		await app.connect("acme", "select-account");
		assert.deepEqual(start(opened[0]), { editor: "vscode", nonce: "n1", start: "select-account", challenge: pkceChallenge("v1") });
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
		assert.equal(start(opened[1]).start, "install");
		await app.handleReturn(query({ state: "n2", setup_action: "install", installation_id: "7" }));
		assert.deepEqual(start(opened[2]), { editor: "vscode", nonce: "n3", start: "authorize", challenge: pkceChallenge("v2") });
		await app.handleReturn(query({ code: "c2", state: "n3" }));
		assert.deepEqual(outcomes, ["connected:Acme"]);
	});

	it("offers another GitHub account when the app is still on no account it can see after installing", async () => {
		const { cloud } = fakeCloud({
			connect: async () => {
				throw new ConflictError("no accessible GitHub App installations; install the app first");
			},
		});
		const { app, opened, outcomes } = connector(cloud);
		await app.connect("acme");
		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		await app.handleReturn(query({ state: "n2", setup_action: "install", installation_id: "7" }));
		await app.handleReturn(query({ code: "c2", state: "n3" }));
		assert.deepEqual(outcomes, ["none visible on acme"]);
		assert.equal(opened.length, 3, "the install page is opened once");
	});

	it("ignores a return that arrives after the WSO2 Cloud sign-in changed", async () => {
		for (const after of ["u1/other-org", "u2/acme", undefined]) {
			const { cloud, connected } = fakeCloud();
			const { app, outcomes, signedIn } = connector(cloud);
			await app.connect("acme");
			signedIn.session = after;
			await app.handleReturn(query({ code: "c0de", state: "n1" }));
			assert.deepEqual(connected, [], `signed in as ${after}`);
			assert.deepEqual(outcomes, []);
		}
	});

	it("drops an exchange that finishes after a newer connect started", async () => {
		let finish: (items: unknown[]) => void = () => undefined;
		let calls = 0;
		const { cloud, connected } = fakeCloud({
			connect: () => (calls++ === 0 ? new Promise<unknown[]>((resolve) => (finish = resolve)) : Promise.resolve([acme])),
		});
		const { app, opened, outcomes } = connector(cloud);
		await app.connect("acme");
		const first = app.handleReturn(query({ code: "c0de", state: "n1" }));
		await app.connect("acme");
		finish([{ installationId: 9, githubAccount: "jo" }]);
		await first;
		assert.equal(opened.length, 2, "the first exchange starts no install");
		await app.handleReturn(query({ code: "c2", state: "n2" }));
		assert.deepEqual(connected, ["c0de with v1", "c2 with v2"]);
		assert.deepEqual(outcomes, ["connected:Acme"]);
	});

	it("reports an approval request, a cancel, GitHub's reason for a refusal, and a failed bind", async () => {
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
		await app.handleReturn(query({ state: "n3", error: "application_suspended", error_description: "The app is suspended." }));
		await app.connect("acme");
		await app.handleReturn(query({ state: "n4", code: "c0de" }));
		assert.deepEqual(outcomes, [
			"requested",
			"cancelled",
			"failed:GitHub did not authorize the WSO2 Cloud app: The app is suspended.",
			"failed:Could not connect GitHub to WSO2 Cloud: bad gateway",
		]);
	});

	it("sends an editor GitHub cannot return to to the console", async () => {
		const { app, opened } = connector(fakeCloud().cloud, "code-oss");
		assert.equal(app.canReturnHere, false);
		await app.connect("acme");
		assert.deepEqual(opened, ["https://console.example/integration/organizations/acme"]);
	});

	it("builds the console start page on the console's origin", () => {
		assert.equal(consoleGitHubStartUrl("https://console.example/a/b", "wso2-integrator", "abc", "install"), "https://console.example/ghapp?editor=wso2-integrator&nonce=abc&start=install");
		assert.equal(consoleGitHubStartUrl("https://console.example/a/b", "vscode", "abc", "authorize", "ch"), "https://console.example/ghapp?editor=vscode&nonce=abc&start=authorize&challenge=ch");
	});
});
