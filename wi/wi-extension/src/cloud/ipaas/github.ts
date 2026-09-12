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

/**
 * Reaching private repositories through the platform's GitHub App.
 *
 * A public repository is read anonymously and needs none of this. A private one
 * is reachable only through an App installation the user has granted, so every
 * lookup here is keyed on the installation covering the repository's owner.
 */

/** One GitHub account the App is installed on. */
export interface GitInstallation {
	installationId: number;
	githubAccount: string;
}

/** A repository an installation can reach. */
export interface GitRepo {
	name: string;
	owner?: string;
	defaultBranch?: string;
}

/** Which installation covers an owner, and what it knows about its repositories. */
export interface OwnerIndexEntry {
	installationId: number;
	defaultBranchByRepo: Map<string, string>;
}

/**
 * Index installations and their repositories by owner.
 *
 * A repository shared into an installation can carry an owner different from
 * the account the App was installed on, so both are indexed — keying only on
 * the installation account would miss every shared repository.
 */
export function indexInstallations(
	entries: Array<{ installation: GitInstallation; repos: GitRepo[] }>,
): Map<string, OwnerIndexEntry> {
	const index = new Map<string, OwnerIndexEntry>();
	const entryFor = (owner: string, installationId: number): OwnerIndexEntry => {
		const key = owner.toLowerCase();
		let existing = index.get(key);
		if (!existing) {
			existing = { installationId, defaultBranchByRepo: new Map() };
			index.set(key, existing);
		}
		return existing;
	};

	for (const { installation, repos } of entries) {
		if (!installation?.githubAccount) {
			continue;
		}
		entryFor(installation.githubAccount, installation.installationId);
		for (const repo of repos ?? []) {
			const owner = repo.owner || installation.githubAccount;
			const indexed = entryFor(owner, installation.installationId);
			if (repo.name && repo.defaultBranch) {
				indexed.defaultBranchByRepo.set(repo.name, repo.defaultBranch);
			}
		}
	}
	return index;
}

/** The installation covering an owner, matched case-insensitively as GitHub does. */
export function installationFor(
	index: Map<string, OwnerIndexEntry> | null,
	owner: string | undefined,
): OwnerIndexEntry | null {
	if (!index || !owner) {
		return null;
	}
	return index.get(owner.toLowerCase()) ?? null;
}

/**
 * Whether an error means the App's authorization is gone rather than that one
 * thing is missing. The platform reports it as 409; it affects every
 * installation, so it calls for re-authorizing rather than retrying.
 */
export function isGitHubAuthRequired(status: number | undefined): boolean {
	return status === 409;
}

/** The URL that authorizes the App for a user. `state` is returned untouched by GitHub. */
export function buildAuthorizeUrl(
	clientId: string,
	redirectUri: string,
	state: string,
): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		// The App needs to read repositories and identify the user; the
		// installation itself carries the per-repository grants.
		scope: "repo,read:user",
		state,
	});
	return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/** The App's installation page, for granting access to an account or repository. */
export function buildInstallUrl(slug: string, state: string): string {
	return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;
}
