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
import { type CloudClient, ConflictError, NotFoundError } from "@wso2/wso2-cloud-client";
import { AUTHORIZE_GITHUB_MESSAGE, CONNECT_GITHUB_MESSAGE, UNREAD_GITHUB_MESSAGE, GITHUB_RETURN_TTL_MS, type WebEditor, GitHubAppConnector, listConnectedGitHubAccounts, consoleGitHubStartUrl, forgetGitHubAccess, gitHubSourceFor, installationSettingsUrl, pkceChallenge, resolveGitHubAccess, sharedGitHubAccess } from "../../cloud/github-app";

const acme = { installationId: 7, githubAccount: "Acme" };

/** A cloud client answering the git integration and the public repository read. */
function fakeCloud(answers: { installations?: unknown[]; grantedRepos?: string[]; reposError?: Error; reposErrorFor?: Record<number, Error>; appBranches?: string[]; publicBranches?: string[]; connect?: () => Promise<unknown[]> } = {}) {
	const connected: string[] = [];
	const calls = { installations: 0 };
	const cloud = {
		git: {
			listGitHubInstallations: async () => {
				calls.installations++;
				return answers.installations ?? [];
			},
			listGitHubRepos: async (installationId: number) => {
				const failure = answers.reposErrorFor?.[installationId] ?? answers.reposError;
				if (failure) {
					throw failure;
				}
				return (answers.grantedRepos ?? []).map((name) => ({ fullName: `acme/${name}`, name, owner: "acme", private: true, defaultBranch: "main" }));
			},
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
	return { cloud: cloud as unknown as CloudClient, connected, calls };
}

describe("GitHub repository access", () => {
	it("reads a repository through the installation on its owner", async () => {
		const { cloud } = fakeCloud({ installations: [acme], grantedRepos: ["Orders"] });
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

	it("counts a repository as given to the app only when the installation lists it, not because its branches read", async () => {
		// Branch reads use the person's GitHub authorization, which reads any public repository.
		const access = await resolveGitHubAccess(fakeCloud({ installations: [acme], appBranches: ["main"], publicBranches: ["main"] }).cloud, "acme", "orders");
		assert.equal(access.kind, "public");
		assert.equal(gitHubSourceFor(access, "main", undefined, "https://github.com/acme/orders"), undefined, "no binding is sent for it");
	});

	it("asks to authorize again when WSO2 Cloud's GitHub authorization for the person expired", async () => {
		const expired = new ConflictError("github-auth-required", { status: 409, apiError: "github-auth-required" });
		assert.equal((await resolveGitHubAccess(fakeCloud({ installations: [acme], reposError: expired }).cloud, "acme", "secret")).kind, "auth-required");
		const publicRepo = fakeCloud({ installations: [acme], reposError: expired, publicBranches: ["main"] });
		assert.equal((await resolveGitHubAccess(publicRepo.cloud, "acme", "orders")).kind, "public", "a public repository reads without it");
	});

	it("passes a failure of the installation's repository list on, and counts a gone installation as none", async () => {
		await assert.rejects(resolveGitHubAccess(fakeCloud({ installations: [acme], reposError: new Error("offline") }).cloud, "acme", "orders"), /offline/);
		const gone = new NotFoundError("installation not found", { status: 404 });
		assert.equal((await resolveGitHubAccess(fakeCloud({ installations: [acme], reposError: gone }).cloud, "acme", "orders")).kind, "not-connected");
	});

	it("shares one access answer among a repository's checks for a few seconds", async () => {
		forgetGitHubAccess();
		const { cloud, calls } = fakeCloud({ installations: [acme], grantedRepos: ["orders"] });
		await Promise.all([sharedGitHubAccess(cloud, "u1/acme", "acme", "orders", { now: 1_000 }), sharedGitHubAccess(cloud, "u1/acme", "Acme", "Orders", { now: 2_000 })]);
		assert.equal(calls.installations, 1);
		await sharedGitHubAccess(cloud, "u2/other", "acme", "orders", { now: 2_000 });
		assert.equal(calls.installations, 2, "another sign-in does not share it");
		await sharedGitHubAccess(cloud, "u1/acme", "acme", "orders", { now: 7_000 });
		assert.equal(calls.installations, 3, "it is read again after a few seconds");
		forgetGitHubAccess();
		await sharedGitHubAccess(cloud, "u1/acme", "acme", "orders", { now: 7_500 });
		assert.equal(calls.installations, 4, "and at once after it was forgotten");
	});

	it("does not share an answer that settled after the sign-in changed", async () => {
		forgetGitHubAccess();
		const { cloud, calls } = fakeCloud({ installations: [acme], grantedRepos: ["orders"] });
		await sharedGitHubAccess(cloud, "u1/acme", "acme", "orders", { now: 1_000, isCurrent: () => false });
		await sharedGitHubAccess(cloud, "u1/acme", "acme", "orders", { now: 1_500 });
		assert.equal(calls.installations, 2);
	});

	it("reads a public repository as public when the git integration fails, and passes the failure on otherwise", async () => {
		const failing = fakeCloud({ installations: [acme], reposError: new Error("503"), publicBranches: ["main"] });
		const access = await resolveGitHubAccess(failing.cloud, "acme", "orders");
		assert.equal(access.kind, "public");
		assert.deepEqual(access.kind === "public" && access.branches, ["main"], "the branches read are kept for the form");
		const down = fakeCloud();
		(down.cloud.git as { listGitHubInstallations: () => Promise<unknown> }).listGitHubInstallations = async () => {
			throw new Error("timeout");
		};
		await assert.rejects(resolveGitHubAccess(down.cloud, "acme", "secret"), /timeout/, "a private repository is not read as not connected");
	});

	it("does not share a failed access answer", async () => {
		forgetGitHubAccess();
		const failing = fakeCloud({ installations: [acme], reposError: new Error("offline") });
		await assert.rejects(sharedGitHubAccess(failing.cloud, "u1/acme", "acme", "orders", { now: 1_000 }));
		await assert.rejects(sharedGitHubAccess(failing.cloud, "u1/acme", "acme", "orders", { now: 1_500 }));
		assert.equal(failing.calls.installations, 2);
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

describe("The GitHub accounts a new integration's repository is chosen from", () => {
	const globex = { installationId: 8, githubAccount: "Globex" };
	const authRequired = new ConflictError("github-auth-required", { status: 409, apiError: "github-auth-required" });

	it("lists each connected account with the repositories the app was given on it", async () => {
		const { cloud } = fakeCloud({ installations: [acme], grantedRepos: ["orders", "billing"] });
		assert.deepEqual(await listConnectedGitHubAccounts(cloud), { accounts: [{ orgName: "Acme", orgHandler: "Acme", repositories: [{ name: "billing" }, { name: "orders" }] }], unread: [] });
	});

	it("lists an account the app was given no repository on, so one can be given", async () => {
		const { cloud } = fakeCloud({ installations: [acme] });
		assert.deepEqual(await listConnectedGitHubAccounts(cloud), { accounts: [{ orgName: "Acme", orgHandler: "Acme", repositories: [] }], unread: [] });
	});

	it("asks for GitHub to be connected when no account is, or the only one is gone from GitHub", async () => {
		await assert.rejects(listConnectedGitHubAccounts(fakeCloud().cloud), { message: CONNECT_GITHUB_MESSAGE });
		const gone = fakeCloud({ installations: [acme], reposError: new NotFoundError("gone") });
		await assert.rejects(listConnectedGitHubAccounts(gone.cloud), { message: CONNECT_GITHUB_MESSAGE });
	});

	it("asks for GitHub to be connected again when no account could be read", async () => {
		const expired = fakeCloud({ installations: [acme], reposError: authRequired });
		await assert.rejects(listConnectedGitHubAccounts(expired.cloud), { message: AUTHORIZE_GITHUB_MESSAGE });
		const down = fakeCloud({ installations: [acme], reposError: new Error("upstream error") });
		await assert.rejects(listConnectedGitHubAccounts(down.cloud), { message: UNREAD_GITHUB_MESSAGE });
		const mixed = fakeCloud({ installations: [acme, globex], reposErrorFor: { 7: new Error("upstream error"), 8: authRequired } });
		await assert.rejects(listConnectedGitHubAccounts(mixed.cloud), { message: AUTHORIZE_GITHUB_MESSAGE });
	});

	it("lists the accounts that can be read and names the ones that cannot", async () => {
		const logged: string[] = [];
		const failed = fakeCloud({ installations: [acme, globex], grantedRepos: ["orders"], reposErrorFor: { 8: new Error("upstream error") } });
		assert.deepEqual(await listConnectedGitHubAccounts(failed.cloud, (message) => logged.push(message)), {
			accounts: [{ orgName: "Acme", orgHandler: "Acme", repositories: [{ name: "orders" }] }],
			unread: ["Globex"],
		});
		assert.deepEqual(logged, ["Could not read the repositories of Globex: upstream error"]);

		const needsAuth = fakeCloud({ installations: [acme, globex], grantedRepos: ["orders"], reposErrorFor: { 8: authRequired } });
		assert.deepEqual((await listConnectedGitHubAccounts(needsAuth.cloud)).unread, ["Globex"]);
	});

	it("does not name an account gone from GitHub", async () => {
		const { cloud } = fakeCloud({ installations: [acme, globex], grantedRepos: ["orders"], reposErrorFor: { 8: new NotFoundError("gone") } });
		assert.deepEqual((await listConnectedGitHubAccounts(cloud)).unread, []);
	});
});

describe("GitHubAppConnector", () => {
	function connector(cloud: CloudClient, uriScheme = "vscode", webEditor?: () => Promise<WebEditor>) {
		const opened: string[] = [];
		const outcomes: string[] = [];
		const bound: string[] = [];
		const browser = { opens: true };
		const signedIn = { session: "u1/acme" as string | undefined };
		const clock = { now: 0 };
		let n = 0;
		let v = 0;
		const app = new GitHubAppConnector({
			cloud: () => cloud,
			consoleUrl: () => "https://console.example/integration/organizations/acme",
			session: () => signedIn.session,
			uriScheme,
			webEditor,
			openExternal: async (url) => {
				opened.push(url);
				return browser.opens;
			},
			onBound: (items) => bound.push(items.map((i) => i.githubAccount).join(",")),
			log: () => undefined,
			newNonce: () => `n${++n}`,
			newVerifier: () => `v${++v}`,
			now: () => clock.now,
			outcome: {
				connected: (items, missingOwner) => outcomes.push(`connected:${items.map((i) => i.githubAccount).join(",")}${missingOwner ? ` but not ${missingOwner}` : ""}`),
				noInstallationVisible: (owner) => outcomes.push(`none visible${owner ? ` on ${owner}` : ""}`),
				requested: () => outcomes.push("requested"),
				ignored: (reason) => outcomes.push(`ignored:${reason}`),
				cancelled: () => outcomes.push("cancelled"),
				failed: (message) => outcomes.push(`failed:${message}`),
			},
		});
		return { app, opened, outcomes, signedIn, clock, bound, browser };
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
		const { app, outcomes } = connector(cloud);
		await app.handleReturn(query({ code: "forged", state: "n1" }));
		await app.connect("acme");
		await app.handleReturn(query({ code: "forged", state: "other" }));
		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		await app.handleReturn(query({ code: "again", state: "n1" }));
		assert.deepEqual(connected, ["c0de with v1"]);
		assert.deepEqual(outcomes, ["ignored:not-started", "ignored:not-started", "connected:Acme", "ignored:not-started"], "each ignored return is told");
	});

	it("says so when the browser does not open, and takes no return for that flow", async () => {
		const { cloud, connected } = fakeCloud();
		const { app, outcomes, browser } = connector(cloud);
		browser.opens = false;
		await app.connect("acme");
		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		assert.deepEqual(connected, []);
		assert.deepEqual(outcomes, ["failed:Couldn't open the browser for GitHub. Try again.", "ignored:not-started"]);
	});

	it("tells the host about bound installations before it goes on to the install page", async () => {
		const { cloud } = fakeCloud({ connect: async () => [{ installationId: 9, githubAccount: "jo" }] });
		const { app, bound, outcomes } = connector(cloud);
		await app.connect("acme");
		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		assert.deepEqual(bound, ["jo"], "the form rechecks even if the install is abandoned");
		assert.deepEqual(outcomes, []);
	});

	it("ignores a return that arrives after its flow expired", async () => {
		const { cloud, connected } = fakeCloud();
		const { app, outcomes, clock } = connector(cloud);
		await app.connect("acme");
		clock.now = GITHUB_RETURN_TTL_MS + 1;
		await app.handleReturn(query({ code: "c0de", state: "n1" }));
		assert.deepEqual(connected, []);
		assert.deepEqual(outcomes, ["ignored:expired"]);
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
			assert.deepEqual(outcomes, ["ignored:signed-in-changed"]);
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
			"failed:GitHub did not authorize the Choreo Cloud app: The app is suspended.",
			"failed:Could not connect GitHub to Choreo Cloud: bad gateway",
		]);
	});

	it("sends an editor GitHub cannot return to to the console", async () => {
		const { app, opened } = connector(fakeCloud().cloud, "code-oss");
		assert.equal(app.canReturnHere, false);
		await app.connect("acme");
		assert.deepEqual(opened, ["https://console.example/integration/organizations/acme"]);
	});

	describe("in a browser editor", () => {
		const EDITOR = "https://editor-1.dp.example.io/callback?vscode-reqid=3&vscode-scheme=code-oss&vscode-authority=wso2.wso2-integrator&vscode-path=%2Fghapp";

		it("starts at the console like any editor, naming its own address, and binds the code the console sends back", async () => {
			const { cloud, connected: binds } = fakeCloud();
			const { app, opened, outcomes } = connector(cloud, "code-oss", async () => ({ returnTo: EDITOR, project: "orders", component: "orders-api" }));
			assert.equal(app.canReturnHere, true);
			await app.connect("Acme");
			const url = new URL(opened[0]);
			assert.equal(`${url.origin}${url.pathname}`, "https://console.example/ghapp");
			assert.deepEqual(Object.fromEntries(url.searchParams), { editor: "web", return: EDITOR, project: "orders", component: "orders-api", nonce: "n1", start: "authorize", challenge: pkceChallenge("v1") });

			await app.handleReturn(new URLSearchParams({ code: "c1", state: "n1" }));
			assert.deepEqual(binds, ["c1 with v1"]);
			assert.deepEqual(outcomes, ["connected:Acme"]);
		});

		it("uses its URI scheme where the console knows it, whatever address it has", async () => {
			const { app, opened } = connector(fakeCloud().cloud, "vscode", async () => ({ returnTo: EDITOR, project: "orders" }));
			await app.connect("Acme");
			assert.ok(opened[0].startsWith("https://console.example/ghapp?editor=vscode&nonce=n1"), opened[0]);
		});

		it("ignores a return for the connect before, while a newer one is still working out the editor's address", async () => {
			const { cloud, connected: binds } = fakeCloud();
			let release: (editor: WebEditor) => void = () => undefined;
			let calls = 0;
			const { app, outcomes } = connector(cloud, "code-oss", () => {
				calls++;
				return calls === 1 ? Promise.resolve({ returnTo: EDITOR, project: "orders" }) : new Promise<WebEditor>((resolve) => (release = resolve));
			});
			await app.connect("Acme");
			const second = app.connect("Globex");
			await app.handleReturn(new URLSearchParams({ code: "c1", state: "n1" }));
			assert.deepEqual(binds, []);
			assert.deepEqual(outcomes, ["ignored:not-started"]);
			release({ returnTo: EDITOR, project: "orders" });
			await second;
		});

		it("opens the console, as an editor GitHub cannot return to, when the editor's address cannot be worked out", async () => {
			const { cloud, connected: binds } = fakeCloud();
			const { app, opened, outcomes } = connector(cloud, "code-oss", async () => {
				throw new Error("no address");
			});
			await app.connect("Acme");
			assert.deepEqual(opened, ["https://console.example/integration/organizations/acme"]);
			assert.deepEqual(outcomes, []);
			// Nothing was started here, so nothing GitHub sends back is bound.
			await app.handleReturn(new URLSearchParams({ code: "c1", state: "n1" }));
			assert.deepEqual(binds, []);
		});
	});

	it("builds the console start page on the console's origin", () => {
		assert.equal(consoleGitHubStartUrl("https://console.example/a/b", "wso2-integrator", "abc", "install"), "https://console.example/ghapp?editor=wso2-integrator&nonce=abc&start=install");
		assert.equal(consoleGitHubStartUrl("https://console.example/a/b", "vscode", "abc", "authorize", "ch"), "https://console.example/ghapp?editor=vscode&nonce=abc&start=authorize&challenge=ch");
	});
});
