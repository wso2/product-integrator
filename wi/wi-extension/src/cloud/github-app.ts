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
import { type CloudClient, type GitHubInstallation, type GitHubSource, type RepoPathInspection, isCloudError } from "@wso2/wso2-cloud-client";

/**
 * How WSO2 Cloud can read a GitHub repository:
 * - `installation`: through the organization's GitHub App installation on the repository's owner;
 * - `public`: it is public, and no installation reads it;
 * - `not-granted`: the app is installed on the owner but not given this repository;
 * - `not-connected`: no installation on the owner is connected to the organization.
 */
export type GitHubRepoAccess =
	| { kind: "installation"; owner: string; repo: string; installation: GitHubInstallation }
	| { kind: "public"; owner: string; repo: string }
	| { kind: "not-granted"; owner: string; repo: string; installation: GitHubInstallation }
	| { kind: "not-connected"; owner: string; repo: string };

/** GitHub account names are case-insensitive. */
export const sameAccount = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Works out how WSO2 Cloud can read `owner/repo`; a git integration that cannot answer counts as no installation. */
export async function resolveGitHubAccess(cloud: CloudClient, owner: string, repo: string, log: (message: string) => void = () => undefined): Promise<GitHubRepoAccess> {
	const installations = await cloud.git.listGitHubInstallations().catch((err: unknown) => {
		log(`Could not list the GitHub App installations: ${err instanceof Error ? err.message : String(err)}`);
		return [] as GitHubInstallation[];
	});
	const installation = installations.find((item) => sameAccount(item.githubAccount, owner));
	if (installation) {
		const branches = await cloud.git.listGitHubBranches(installation.installationId, owner, repo).catch((): string[] => []);
		if (branches.length > 0) {
			return { kind: "installation", owner, repo, installation };
		}
	}
	const publicBranches = await cloud.repos.listBranches(owner, repo).catch((): unknown[] => []);
	if (publicBranches.length > 0) {
		return { kind: "public", owner, repo };
	}
	return installation ? { kind: "not-granted", owner, repo, installation } : { kind: "not-connected", owner, repo };
}

/** The branches WSO2 Cloud can read, through the installation when there is one; empty when it reads none. */
export async function listReadableBranches(cloud: CloudClient, access: GitHubRepoAccess): Promise<string[]> {
	if (access.kind === "installation") {
		return cloud.git.listGitHubBranches(access.installation.installationId, access.owner, access.repo);
	}
	if (access.kind === "public") {
		return (await cloud.repos.listBranches(access.owner, access.repo)).map((branch) => branch.name);
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

/** The URI schemes WSO2 Cloud's console sends GitHub's return to; anything else finishes in the console. */
export const GITHUB_RETURN_SCHEMES: readonly string[] = ["vscode", "vscode-insiders", "wso2-integrator"];

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
 * and sends GitHub's return to `<scheme>://wso2.wso2-integrator/ghapp`. The
 * console holds the GitHub App's identity and owns its callback URL. An
 * authorize start carries the PKCE challenge, so a code GitHub returns is bound
 * only with this window's verifier.
 */
export function consoleGitHubStartUrl(consoleUrl: string, scheme: string, nonce: string, start: GitHubConnectStart, challenge?: string): string {
	const url = new URL(GITHUB_RETURN_PATH, consoleUrl);
	url.search = new URLSearchParams({ editor: scheme, nonce, start, ...(challenge ? { challenge } : {}) }).toString();
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
	cancelled(): void;
	failed(message: string): void;
}

export interface GitHubAppConnectorDeps {
	cloud(): CloudClient;
	consoleUrl(): string;
	/** Who is signed in to WSO2 Cloud, and to which organization; undefined when no one is. */
	session(): string | undefined;
	uriScheme: string;
	openExternal(url: string): PromiseLike<unknown>;
	outcome: GitHubConnectOutcome;
	log(message: string): void;
	newNonce?: () => string;
	newVerifier?: () => string;
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
	private pending?: { nonce: string; owner?: string; installTried: boolean; verifier?: string; session?: string };
	/** Counts the flows started; an exchange that finishes after a newer start is dropped. */
	private started = 0;
	private readonly newNonce: () => string;
	private readonly newVerifier: () => string;

	constructor(private readonly deps: GitHubAppConnectorDeps) {
		this.newNonce = deps.newNonce ?? (() => randomBytes(16).toString("hex"));
		this.newVerifier = deps.newVerifier ?? (() => randomBytes(32).toString("base64url"));
	}

	/** Whether GitHub's return can come back to this editor; otherwise GitHub is connected in the console. */
	get canReturnHere(): boolean {
		return GITHUB_RETURN_SCHEMES.includes(this.deps.uriScheme);
	}

	/** Opens GitHub through the console; `owner` is the account the repository needs the app on. */
	async connect(owner?: string, start: GitHubConnectStart = "authorize", installTried = start === "install"): Promise<void> {
		if (!this.canReturnHere) {
			await this.deps.openExternal(this.deps.consoleUrl());
			return;
		}
		this.started++;
		const nonce = this.newNonce();
		// GitHub's install page takes no challenge; the editor authorizes after it.
		const verifier = start === "install" ? undefined : this.newVerifier();
		this.pending = { nonce, owner, installTried, verifier, session: this.deps.session() };
		await this.deps.openExternal(consoleGitHubStartUrl(this.deps.consoleUrl(), this.deps.uriScheme, nonce, start, verifier && pkceChallenge(verifier)));
	}

	/** Takes GitHub's return, as the console relayed it to `/ghapp`. */
	async handleReturn(query: URLSearchParams): Promise<void> {
		const pending = this.pending;
		const state = query.get("state");
		if (!pending || !state || state !== pending.nonce) {
			this.deps.log("A GitHub return arrived that this window did not start; it was ignored");
			return;
		}
		this.pending = undefined;
		if (pending.session !== this.deps.session()) {
			// GitHub would be connected to an organization, or for a person, other than the one that started.
			this.deps.log("A GitHub return arrived after the WSO2 Cloud sign-in changed; it was ignored");
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
		const owner = pending.owner;
		const missingOwner = owner && !installations.some((item) => sameAccount(item.githubAccount, owner)) ? owner : undefined;
		if (missingOwner && !pending.installTried) {
			await this.connect(missingOwner, "install");
			return;
		}
		this.deps.outcome.connected(installations, missingOwner);
	}
}
