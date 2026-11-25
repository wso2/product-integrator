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

import { createHash, randomBytes } from "crypto";
import { type CloudClient, type GitHubInstallation, type GitHubSource, type RepoPathInspection, isCloudError, isGitHubAuthRequired } from "@wso2/wso2-cloud-client";

/**
 * How WSO2 Cloud can read a GitHub repository:
 * - `installation`: through the organization's GitHub App installation on the repository's owner;
 * - `public`: it is public, and no installation reads it;
 * - `not-granted`: the app is installed on the owner but not given this repository;
 * - `auth-required`: the app is installed on the owner, but WSO2 Cloud holds no GitHub
 *   authorization for the person, or it expired, so it cannot tell; authorizing again does;
 * - `not-connected`: no installation on the owner is connected to the organization.
 */
export type GitHubRepoAccess =
	| { kind: "installation"; owner: string; repo: string; installation: GitHubInstallation }
	| { kind: "public"; owner: string; repo: string; branches?: string[] }
	| { kind: "not-granted"; owner: string; repo: string; installation: GitHubInstallation }
	| { kind: "auth-required"; owner: string; repo: string; installation: GitHubInstallation }
	| { kind: "not-connected"; owner: string; repo: string };

/** GitHub account names are case-insensitive. */
export const sameAccount = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Works out how WSO2 Cloud can read `owner/repo`. When the git integration
 * cannot answer, a public repository still reads as public; otherwise its
 * failure is passed on, rather than read as no installation or no grant.
 */
export async function resolveGitHubAccess(cloud: CloudClient, owner: string, repo: string, log: (message: string) => void = () => undefined): Promise<GitHubRepoAccess> {
	let lookupError: unknown;
	const installations = await cloud.git.listGitHubInstallations().catch((err: unknown) => {
		log(`Could not list the GitHub App installations: ${err instanceof Error ? err.message : String(err)}`);
		lookupError = err;
		return [] as GitHubInstallation[];
	});
	let installation = installations.find((item) => sameAccount(item.githubAccount, owner));
	let authRequired = false;
	if (installation) {
		// The installation's repository list says whether the app was given the repository; a branch
		// read cannot, as it uses the person's GitHub authorization, which reads any public repository.
		try {
			const repos = await cloud.git.listGitHubRepos(installation.installationId);
			if (repos.some((item) => sameAccount(item.owner, owner) && sameAccount(item.name, repo))) {
				return { kind: "installation", owner, repo, installation };
			}
		} catch (err) {
			if (isGitHubAuthRequired(err)) {
				authRequired = true;
			} else if (isCloudError(err) && err.code === "not_found") {
				installation = undefined; // the installation is gone from the organization
			} else {
				lookupError = err;
			}
		}
	}
	const branches = await cloud.repos
		.listBranches(owner, repo)
		.then((items) => items.map((branch) => branch.name))
		.catch((): string[] => []);
	if (branches.length > 0) {
		return { kind: "public", owner, repo, branches };
	}
	if (lookupError !== undefined) {
		throw lookupError; // the installation lookup failed, and the repository is not public
	}
	if (!installation) {
		return { kind: "not-connected", owner, repo };
	}
	return { kind: authRequired ? "auth-required" : "not-granted", owner, repo, installation };
}

/** A GitHub account connected to the organization, and the repositories the WSO2 Cloud app was given on it. */
export interface ConnectedGitHubAccount {
	orgName: string;
	orgHandler: string;
	repositories: { name: string }[];
}

/** What the form says, beside its button for connecting, when no GitHub account is connected or WSO2 Cloud cannot read one. */
export const CONNECT_GITHUB_MESSAGE = "Connect GitHub to WSO2 Cloud to choose a repository.";
export const AUTHORIZE_GITHUB_MESSAGE = "WSO2 Cloud's access to your GitHub account has expired. Connect GitHub again to choose a repository.";
export const UNREAD_GITHUB_MESSAGE = "WSO2 Cloud could not read your GitHub repositories. Connect GitHub again, then retry.";

/** The accounts a repository can be chosen from, and the connected ones left out because their repositories could not be read. */
export interface ConnectedGitHubAccounts {
	accounts: ConnectedGitHubAccount[];
	unread: string[];
}

/**
 * The GitHub accounts connected to the organization, each with the repositories the app was given: what a new
 * integration's repository is chosen from. An account whose repositories cannot be read is named in `unread`: the
 * organization's installations include ones this person's GitHub account cannot see. Fails, with what to do about
 * it, when none is connected or none could be read.
 */
export async function listConnectedGitHubAccounts(cloud: CloudClient, log: (message: string) => void = () => undefined): Promise<ConnectedGitHubAccounts> {
	const installations = await cloud.git.listGitHubInstallations();
	const unread: string[] = [];
	let authRequired = false;
	// Asked for together: the repository list waits for the slowest account, not for all of them in turn.
	const listed = await Promise.all(
		installations.map(async (installation): Promise<ConnectedGitHubAccount | undefined> => {
			try {
				const repos = await cloud.git.listGitHubRepos(installation.installationId);
				return {
					orgName: installation.githubAccount,
					// The account's login, which the repository's address is built from; a display name would go in `orgName` only.
					orgHandler: installation.githubAccount,
					repositories: repos
						.filter((repo) => sameAccount(repo.owner, installation.githubAccount))
						.map((repo) => ({ name: repo.name }))
						.sort((a, b) => a.name.localeCompare(b.name)),
				};
			} catch (err) {
				if (isCloudError(err) && err.code === "not_found") {
					return undefined; // the installation is gone from GitHub
				}
				authRequired ||= isGitHubAuthRequired(err);
				unread.push(installation.githubAccount);
				log(`Could not read the repositories of ${installation.githubAccount}: ${err instanceof Error ? err.message : String(err)}`);
				return undefined;
			}
		}),
	);
	const accounts = listed.filter((account): account is ConnectedGitHubAccount => account !== undefined);
	if (accounts.length === 0) {
		if (unread.length === 0) {
			throw new Error(CONNECT_GITHUB_MESSAGE);
		}
		throw new Error(authRequired ? AUTHORIZE_GITHUB_MESSAGE : UNREAD_GITHUB_MESSAGE);
	}
	return { accounts, unread: unread.sort((a, b) => a.localeCompare(b)) };
}

/** How long an access answer is shared: the form's checks of one repository reuse it, and a change made on GitHub shows on the next check. */
const ACCESS_TTL_MS = 5_000;
const accessAnswers = new Map<string, { at: number; access: Promise<GitHubRepoAccess> }>();

/**
 * {@link resolveGitHubAccess}, shared for a few seconds by the checks of one
 * repository for one signed-in organization. A failure is not shared, nor an
 * answer that settled after `isCurrent` says the sign-in changed.
 */
export function sharedGitHubAccess(
	cloud: CloudClient,
	scope: string,
	owner: string,
	repo: string,
	options: { log?: (message: string) => void; now?: number; isCurrent?: () => boolean } = {},
): Promise<GitHubRepoAccess> {
	const now = options.now ?? Date.now();
	const key = `${scope}:${owner}/${repo}`.toLowerCase();
	const known = accessAnswers.get(key);
	if (known && now - known.at < ACCESS_TTL_MS) {
		return known.access;
	}
	for (const [other, answer] of accessAnswers) {
		if (now - answer.at >= ACCESS_TTL_MS) {
			accessAnswers.delete(other); // expired answers are dropped, not only skipped
		}
	}
	const access = resolveGitHubAccess(cloud, owner, repo, options.log);
	const entry = { at: now, access };
	accessAnswers.set(key, entry);
	const drop = () => {
		if (accessAnswers.get(key) === entry) {
			accessAnswers.delete(key);
		}
	};
	access.then(() => {
		if (options.isCurrent && !options.isCurrent()) {
			drop(); // read partly under another sign-in
		}
	}, drop);
	return access;
}

/** Drops the shared access answers, as when GitHub was just connected or its access changed. */
export function forgetGitHubAccess(): void {
	accessAnswers.clear();
}

/** The branches WSO2 Cloud can read, through the installation when there is one; empty when it reads none. */
export async function listReadableBranches(cloud: CloudClient, access: GitHubRepoAccess): Promise<string[]> {
	if (access.kind === "installation") {
		return cloud.git.listGitHubBranches(access.installation.installationId, access.owner, access.repo);
	}
	if (access.kind === "public") {
		return access.branches ?? (await cloud.repos.listBranches(access.owner, access.repo)).map((branch) => branch.name);
	}
	return [];
}

/** Inspects a path of the repository the way WSO2 Cloud will read it. */
export async function inspectReadablePath(cloud: CloudClient, access: GitHubRepoAccess, branch: string | undefined, subPath: string): Promise<RepoPathInspection> {
	if (access.kind === "installation" && branch) {
		return cloud.git.inspectGitHubPath(access.installation.installationId, access.owner, access.repo, branch, subPath);
	}
	return cloud.repos.inspect(access.owner, access.repo, branch, subPath);
}

/** The source binding a private repository needs, when WSO2 Cloud reads it through an installation. */
export function gitHubSourceFor(access: GitHubRepoAccess, branch: string, appPath: string | undefined, repositoryUrl: string): GitHubSource | undefined {
	if (access.kind !== "installation") {
		return undefined;
	}
	return { installationId: access.installation.installationId, owner: access.owner, repo: access.repo, branch, appPath, repositoryUrl };
}

/** The URI schemes WSO2 Cloud's console sends GitHub's return to. */
export const GITHUB_RETURN_SCHEMES: readonly string[] = ["vscode", "vscode-insiders", "wso2-integrator"];

/**
 * What a browser editor (WSO2 Cloud's cloud editor) names itself by to the console, in place of a URI scheme: it is
 * a page at an https address of its own, which it sends along with the project (and component) the platform runs it
 * for. The console sends GitHub's return there only when the platform confirms that address is the cloud editor of
 * the person signed in to the console.
 */
export const GITHUB_WEB_EDITOR = "web";

/** A browser editor as the console confirms it: its address, and what the platform runs it for. */
export interface WebEditor {
	returnTo: string;
	project: string;
	component?: string;
	/** The editor's own component name, where the platform gives it one: the console then asks about this editor only. */
	name?: string;
}

/** The editor's path the console sends GitHub's return to. */
export const GITHUB_RETURN_PATH = "/ghapp";

/**
 * Where connecting GitHub starts: GitHub's authorize page, its install page, or
 * its authorize page through the account picker, to use another GitHub account.
 */
export type GitHubConnectStart = "authorize" | "install" | "select-account";

/** The S256 PKCE challenge of a verifier. */
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/**
 * The console page that starts GitHub's authorize or install page for the editor
 * and sends GitHub's return to `<scheme>://wso2.wso2-integrator/ghapp`, or, for a
 * browser editor, to its own address. The console holds the GitHub
 * App's identity and owns its callback URL. An authorize start carries the PKCE
 * challenge, so a code GitHub returns is bound only with this window's verifier.
 */
export function consoleGitHubStartUrl(consoleUrl: string, scheme: string, nonce: string, start: GitHubConnectStart, challenge?: string, web?: WebEditor): string {
	// On the console's host root, whatever path `consoleUrl` has: the page belongs to the console all products share.
	const url = new URL(GITHUB_RETURN_PATH, consoleUrl);
	url.search = new URLSearchParams({
		editor: web ? GITHUB_WEB_EDITOR : scheme,
		...(web ? { return: web.returnTo, project: web.project, ...(web.component ? { component: web.component } : {}), ...(web.name ? { name: web.name } : {}) } : {}),
		nonce,
		start,
		...(challenge ? { challenge } : {}),
	}).toString();
	return url.toString();
}

/** The GitHub page where an installation's repository access is changed. */
export async function installationSettingsUrl(owner: string, installationId: number, fetchFn: typeof fetch = fetch): Promise<string> {
	let isOrganization = true;
	try {
		const res = await fetchFn(`https://api.github.com/users/${encodeURIComponent(owner)}`, {
			headers: { accept: "application/vnd.github+json" },
			signal: AbortSignal.timeout(5000),
		});
		if (res.ok) {
			isOrganization = ((await res.json()) as { type?: string }).type !== "User";
		}
	} catch {
		// GitHub could not say; the organization page is the likelier one.
	}
	return isOrganization
		? `https://github.com/organizations/${encodeURIComponent(owner)}/settings/installations/${installationId}`
		: `https://github.com/settings/installations/${installationId}`;
}

/** How long a started flow waits for GitHub's return; a later return is ignored. */
export const GITHUB_RETURN_TTL_MS = 10 * 60_000;

/** Why GitHub's return was ignored: this window did not start it, it came too late, or the WSO2 Cloud sign-in changed. */
export type IgnoredGitHubReturn = "not-started" | "expired" | "signed-in-changed";

/** What the person is told as connecting GitHub ends. */
export interface GitHubConnectOutcome {
	/**
	 * GitHub is connected; `missingOwner` is the repository's owner when the app
	 * is still not on it after installing, as when the browser is signed in to
	 * another GitHub account.
	 */
	connected(installations: GitHubInstallation[], missingOwner?: string): void;
	/**
	 * The GitHub user still sees the app on no account after installing it, as
	 * when the browser is signed in to another GitHub account; `owner` is the
	 * repository's owner, when there is one.
	 */
	noInstallationVisible(owner?: string): void;
	/** The GitHub organization's owner has to approve the app. */
	requested(): void;
	/** GitHub's return was not taken, so connecting did not happen here. */
	ignored(reason: IgnoredGitHubReturn): void;
	cancelled(): void;
	failed(message: string): void;
}

export interface GitHubAppConnectorDeps {
	cloud(): CloudClient;
	consoleUrl(): string;
	/** Who is signed in to WSO2 Cloud, and to which organization; undefined when no one is. */
	session(): string | undefined;
	uriScheme: string;
	/** In a browser editor: its address for `/ghapp` as the browser reaches it, and what the platform runs it for. Absent elsewhere. */
	webEditor?: () => PromiseLike<WebEditor>;
	openExternal(url: string): PromiseLike<unknown>;
	outcome: GitHubConnectOutcome;
	log(message: string): void;
	newNonce?: () => string;
	newVerifier?: () => string;
	now?: () => number;
	/** Installations were just connected to the organization, whatever comes next in the flow. */
	onBound?: (installations: GitHubInstallation[]) => void;
}

/**
 * Connects GitHub to the organization from the editor, as the console's own
 * repository field does: GitHub's authorize page, then its install page when
 * the app is not on the repository's owner. GitHub returns to the console,
 * which sends the return here; the `code` is accepted only with the nonce this
 * window started the flow with, so a forged return cannot connect someone
 * else's installations. It is bound with the PKCE verifier of the challenge the
 * flow started with, so an app that claims the editor's URI scheme and takes
 * the code cannot bind it.
 */
export class GitHubAppConnector {
	private pending?: { nonce: string; owner?: string; installTried: boolean; verifier?: string; session?: string; startedAt: number };
	/** Counts the flows started; an exchange that finishes after a newer start is dropped. */
	private started = 0;
	private readonly newNonce: () => string;
	private readonly newVerifier: () => string;
	private readonly now: () => number;

	constructor(private readonly deps: GitHubAppConnectorDeps) {
		this.newNonce = deps.newNonce ?? (() => randomBytes(16).toString("hex"));
		this.newVerifier = deps.newVerifier ?? (() => randomBytes(32).toString("base64url"));
		this.now = deps.now ?? Date.now;
	}

	/** Whether GitHub's return can come back to this editor; otherwise GitHub is connected in the console. */
	get canReturnHere(): boolean {
		return GITHUB_RETURN_SCHEMES.includes(this.deps.uriScheme) || !!this.deps.webEditor;
	}

	/** Opens GitHub through the console; `owner` is the account the repository needs the app on. */
	async connect(owner?: string, start: GitHubConnectStart = "authorize", installTried = start === "install"): Promise<void> {
		if (!this.canReturnHere) {
			await this.deps.openExternal(this.deps.consoleUrl());
			return;
		}
		this.started++;
		const flow = this.started;
		// A newer connect takes the flow over from here: a return for the one before must not be bound
		// while this one is still working out the editor's address.
		this.pending = undefined;
		// A browser editor has no scheme the console knows: it names the address the browser reaches it at.
		let web: WebEditor | undefined;
		if (!GITHUB_RETURN_SCHEMES.includes(this.deps.uriScheme) && this.deps.webEditor) {
			try {
				web = await this.deps.webEditor();
			} catch (err) {
				if (flow !== this.started) {
					return; // a newer connect owns the flow
				}
				// GitHub has nowhere to return to here, as in an editor that cannot be returned to at all: it is
				// connected in the console instead, which is where this went before a browser editor could be returned to.
				this.deps.log(`Couldn't work out this editor's address for GitHub to return to (${err instanceof Error ? err.message : String(err)}); opening the console instead`);
				await this.deps.openExternal(this.deps.consoleUrl());
				return;
			}
			if (flow !== this.started) {
				return; // a newer connect owns the flow
			}
		}
		const nonce = this.newNonce();
		// GitHub's install page takes no challenge; the editor authorizes after it.
		const verifier = start === "install" ? undefined : this.newVerifier();
		this.pending = { nonce, owner, installTried, verifier, session: this.deps.session(), startedAt: this.now() };
		const opened = await this.deps.openExternal(
			consoleGitHubStartUrl(this.deps.consoleUrl(), this.deps.uriScheme, nonce, start, verifier && pkceChallenge(verifier), web),
		);
		if (opened === false) {
			if (this.pending?.nonce === nonce) {
				this.pending = undefined;
			}
			this.deps.outcome.failed("Couldn't open the browser for GitHub. Try again.");
		}
	}

	/** Takes GitHub's return, as the console relayed it to `/ghapp`. */
	async handleReturn(query: URLSearchParams): Promise<void> {
		const pending = this.pending;
		const state = query.get("state");
		if (!pending || !state || state !== pending.nonce) {
			// With several windows open, GitHub's return can reach one that did not start the flow.
			this.deps.log("A GitHub return arrived that this window did not start; it was ignored");
			this.deps.outcome.ignored("not-started");
			return;
		}
		this.pending = undefined;
		if (this.now() - pending.startedAt > GITHUB_RETURN_TTL_MS) {
			this.deps.log("A GitHub return arrived after its flow had expired; it was ignored");
			this.deps.outcome.ignored("expired");
			return;
		}
		if (pending.session !== this.deps.session()) {
			// GitHub would be connected to an organization, or for a person, other than the one that started.
			this.deps.log("A GitHub return arrived after the WSO2 Cloud sign-in changed; it was ignored");
			this.deps.outcome.ignored("signed-in-changed");
			return;
		}
		const flow = this.started;
		// A code from the install page was issued without this window's challenge; the editor authorizes again instead.
		const code = pending.verifier ? query.get("code") : null;
		const setupAction = query.get("setup_action");
		if (setupAction === "request") {
			this.deps.outcome.requested();
			return;
		}
		if (!code) {
			if (setupAction === "install" || setupAction === "update") {
				// The app is installed; authorizing proves which GitHub user may connect it.
				await this.connect(pending.owner, "authorize", true);
				return;
			}
			const reason = query.get("error_description");
			if (query.get("error") === "access_denied") {
				this.deps.outcome.cancelled();
			} else {
				this.deps.outcome.failed(reason ? `GitHub did not authorize the WSO2 Cloud app: ${reason}` : "GitHub did not authorize the WSO2 Cloud app.");
			}
			return;
		}
		let installations: GitHubInstallation[];
		try {
			installations = await this.deps.cloud().git.connectGitHubInstallations(code, pending.verifier);
		} catch (err) {
			if (flow !== this.started) {
				return; // a newer connect owns the outcome
			}
			if (isCloudError(err) && err.code === "conflict") {
				// The GitHub user has the app on no account: install it, once.
				if (pending.installTried) {
					this.deps.outcome.noInstallationVisible(pending.owner);
				} else {
					await this.connect(pending.owner, "install");
				}
				return;
			}
			this.deps.outcome.failed(`Could not connect GitHub to WSO2 Cloud: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}
		if (flow !== this.started) {
			return; // a newer connect owns the outcome
		}
		this.deps.onBound?.(installations);
		const owner = pending.owner;
		const missingOwner = owner && !installations.some((item) => sameAccount(item.githubAccount, owner)) ? owner : undefined;
		if (missingOwner && !pending.installTried) {
			await this.connect(missingOwner, "install");
			return;
		}
		this.deps.outcome.connected(installations, missingOwner);
	}
}
