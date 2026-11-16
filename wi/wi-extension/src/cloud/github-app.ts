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

import { randomUUID } from "crypto";
import {
	CONSOLE_PRODUCT_PATH,
	type GitHubInstallation,
	type RepoBranch,
	buildConsoleUrl,
	isCloudError,
	isGitHubAuthRequired,
	trimBaseUrl,
} from "@wso2/wso2-cloud-client";
import { callbackUrl } from "@wso2/wso2-cloud-client/vscode";
import { ProgressLocation, Uri, env, window } from "vscode";
import { ext } from "../extensionVariables";

/** What the platform can read of a GitHub repository; `retrievedRepos: false` asks the person to authorize the GitHub App. */
export interface GitHubRepoAccess {
	retrievedRepos: boolean;
	isAccessible: boolean;
	/** The installation that reads the repository, which a create binds the integration to. */
	installationId?: number;
	branches: string[];
}

export const GITHUB_CALLBACK_PATH = "/ghapp";

// shortcut: the console's /ghapp page forwards GitHub's answer to VS Code's own schemes only; add wso2-integrator once it accepts that one.
const FORWARDED_SCHEMES = ["vscode", "vscode-insiders"];

let pending: { state: string; resolve: (answer: URLSearchParams | undefined) => void } | undefined;

/** Through the GitHub App, which every integration builds from; an environment with no app reads public repositories. */
export async function githubRepoAccess(owner: string, repo: string): Promise<GitHubRepoAccess> {
	const { git, repos } = ext.clients.platform.cloud;
	if (!ext.config.githubAppClientId) {
		const branches = (await repos.listBranches(owner, repo).catch((): RepoBranch[] => [])).map((branch) => branch.name);
		return { retrievedRepos: true, isAccessible: branches.length > 0, branches };
	}
	const denied = (retrievedRepos: boolean): GitHubRepoAccess => ({ retrievedRepos, isAccessible: false, branches: [] });
	try {
		const installations = await git.listGitHubInstallations();
		const installation = installations.find((item) => sameName(item.githubAccount, owner));
		if (!installation) {
			// Nothing connected yet asks for an authorization, which connects the person's installations.
			return denied(installations.length > 0);
		}
		// Branches read for any public repository, so the installation's own list says whether a create may bind it.
		const covered = await git.listGitHubRepos(installation.installationId);
		if (!covered.some((item) => sameName(item.owner, owner) && sameName(item.name, repo))) {
			return denied(true);
		}
		const branches = await git.listGitHubBranches(installation.installationId, owner, repo);
		return { retrievedRepos: true, isAccessible: true, installationId: installation.installationId, branches };
	} catch (error) {
		return denied(!isGitHubAuthRequired(error));
	}
}

/** Authorizes the GitHub App and connects the person's installations; installs it when it is on none of them, or not on `owner`. */
export async function connectGitHub(owner?: string, installIfMissing = true): Promise<void> {
	const { githubAppClientId, consoleUrl } = ext.config;
	const answer = await fromGitHub(
		"https://github.com/login/oauth/authorize",
		{ client_id: githubAppClientId, redirect_uri: `${trimBaseUrl(consoleUrl)}${CONSOLE_PRODUCT_PATH}${GITHUB_CALLBACK_PATH}` },
		"Authorize WSO2 Cloud Git Connect on GitHub",
	);
	const code = answer && codeOf(answer);
	if (!code) {
		return;
	}
	const bound = await bindInstallations(code);
	const missing = !bound || (!!owner && !bound.some((item) => sameName(item.githubAccount, owner)));
	if (missing && installIfMissing) {
		await installGitHubApp(owner);
	}
}

/** Opens the GitHub App's install page and carries on once the person is back in the editor. */
export async function installGitHubApp(owner?: string): Promise<void> {
	const { githubAppClientId, githubAppSlug } = ext.config;
	if (!githubAppClientId || !githubAppSlug) {
		await openConsole();
		return;
	}
	await untilBackFrom(`https://github.com/apps/${encodeURIComponent(githubAppSlug)}/installations/new`, "Give WSO2 Cloud Git Connect access to the repository on GitHub");
	// GitHub's own redirect after an install never reaches the editor, so a new installation is connected by an authorization.
	const installations = owner ? await ext.clients.platform.cloud.git.listGitHubInstallations() : [];
	if (owner && !installations.some((item) => sameName(item.githubAccount, owner))) {
		await connectGitHub(owner, false);
	}
}

/** Hands GitHub's answer, forwarded by the console, to the flow waiting for it. */
export function acceptGitHubCallback(uri: Uri): boolean {
	const answer = callbackUrl(`${env.uriScheme}://${ext.context.extension.id}${GITHUB_CALLBACK_PATH}`, uri.query).searchParams;
	if (!pending || answer.get("state") !== pending.state) {
		return false;
	}
	pending.resolve(answer);
	pending = undefined;
	return true;
}

// Opens a GitHub page whose answer comes back through the console's /ghapp page; undefined when the person cancels the wait.
async function fromGitHub(page: string, query: Record<string, string>, title: string): Promise<URLSearchParams | undefined> {
	const { githubAppClientId, githubAppSlug } = ext.config;
	if (!githubAppClientId || !githubAppSlug || !FORWARDED_SCHEMES.includes(env.uriScheme)) {
		await openConsole();
		return undefined;
	}
	const state = editorState(`${env.uriScheme}://${ext.context.extension.id}${GITHUB_CALLBACK_PATH}`);
	return window.withProgress(
		{ location: ProgressLocation.Notification, title, cancellable: true },
		(_progress, token) =>
			new Promise<URLSearchParams | undefined>((resolve) => {
				pending?.resolve(undefined);
				pending = { state, resolve };
				token.onCancellationRequested(() => {
					if (pending?.state === state) {
						pending = undefined;
					}
					resolve(undefined);
				});
				void env.openExternal(Uri.parse(`${page}?${new URLSearchParams({ ...query, state })}`));
			}),
	);
}

// Opens a GitHub page and resolves once the editor has lost focus to the browser and got it back, or the wait is cancelled.
function untilBackFrom(page: string, title: string): Thenable<void> {
	return window.withProgress(
		{ location: ProgressLocation.Notification, title, cancellable: true },
		(_progress, token) =>
			new Promise<void>((resolve) => {
				let left = !window.state.focused;
				const listener = window.onDidChangeWindowState((state) => {
					left ||= !state.focused;
					if (left && state.focused) {
						listener.dispose();
						resolve();
					}
				});
				token.onCancellationRequested(() => {
					listener.dispose();
					resolve();
				});
				void env.openExternal(Uri.parse(page));
			}),
	);
}

async function openConsole(): Promise<void> {
	await env.openExternal(Uri.parse(buildConsoleUrl(ext.config.consoleUrl, { orgHandle: ext.authProvider?.org?.handle })));
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function codeOf(answer: URLSearchParams): string | undefined {
	const error = answer.get("error");
	if (error && error !== "access_denied") {
		throw new Error(`GitHub did not authorize WSO2 Cloud Git Connect: ${answer.get("error_description") ?? error}`);
	}
	return answer.get("code") ?? undefined;
}

// The installations now connected; undefined when the app is installed on none of the person's GitHub accounts.
async function bindInstallations(code: string): Promise<GitHubInstallation[] | undefined> {
	try {
		return await ext.clients.platform.cloud.git.bindGitHubInstallations(code);
	} catch (error) {
		if (isCloudError(error) && error.code === "conflict") {
			return undefined;
		}
		throw error;
	}
}

// The console reads `callbackUri` from the base64 JSON state. Its JSON holds no > ? or ~, so the base64 has no + or / for a URL to garble.
function editorState(callbackUri: string): string {
	return Buffer.from(JSON.stringify({ callbackUri, nonce: randomUUID() })).toString("base64");
}
