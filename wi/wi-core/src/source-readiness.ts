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

import { GitProvider, toSentenceCase } from "@wso2/wso2-platform-core";

export type SourceReadinessAction = "sourceControl" | "pushChanges" | "grantAccess" | "authorize" | "manageCredentials";
export type SourceReadinessRefresh = "gitData" | "branches" | "repoAccess" | "configDrift" | "dirtyRepo";
export type SourceReadinessTone = "error" | "warning" | "info" | "neutral";

export interface SourceReadinessInput {
	/** `null` when the directory is not in a git repository; `undefined` while it loads. */
	gitData: { remotes?: string[] } | null | undefined;
	/** Why the git data could not be read. */
	gitDataError?: string;
	gitRemote: string | null;
	gitProvider: string | null;
	branch: string | null;
	branches: string[];
	branchesLoading: boolean;
	repoAccess?: { isAccessible: boolean; retrievedRepos: boolean };
	/** Why WSO2 Cloud's access to the repository could not be checked. */
	repoAccessError?: string;
	repoAccessLoading: boolean;
	configDriftFiles: string[];
	hasDirtyRepo: boolean;
}

export interface SourceReadiness {
	message?: string;
	action?: SourceReadinessAction;
	refresh?: SourceReadinessRefresh;
	tone: SourceReadinessTone;
	/** Deploying is not possible until this is resolved. */
	blocking: boolean;
}

export const SOURCE_READINESS_ACTION_LABELS: Record<SourceReadinessAction, string> = {
	sourceControl: "Source Control",
	pushChanges: "Push Changes",
	grantAccess: "Grant Access",
	authorize: "Authorize",
	manageCredentials: "Manage Credentials",
};

function gitDataIssue({ gitData, gitDataError }: SourceReadinessInput): SourceReadiness | undefined {
	if (gitData === undefined && gitDataError) {
		return { message: `Couldn't read the Git repository: ${gitDataError}`, refresh: "gitData", tone: "error", blocking: true };
	}
	if (gitData === null) {
		return {
			message: "Please initialize the selected directory as a Git repository to proceed.",
			action: "sourceControl",
			refresh: "gitData",
			tone: "warning",
			blocking: true,
		};
	}
	if (gitData?.remotes?.length === 0) {
		return {
			message: "The selected Git repository has no configured remotes. Please add a remote to proceed.",
			action: "sourceControl",
			refresh: "gitData",
			tone: "warning",
			blocking: true,
		};
	}
	return undefined;
}

function providerIssue(gitProvider: string | null): SourceReadiness | undefined {
	// WSO2 Cloud builds from GitHub repositories only for now; no credential configured for another provider changes that.
	if (!gitProvider || gitProvider === GitProvider.GITHUB) {
		return undefined;
	}
	return {
		message: `Creating integrations from ${toSentenceCase(gitProvider).replace(/-/g, " ")} repositories is not supported on Choreo Cloud yet. Push the integration to a GitHub repository and create it from there.`,
		refresh: "gitData",
		tone: "warning",
		blocking: true,
	};
}

function accessIssue(input: SourceReadinessInput): SourceReadiness | undefined {
	const { gitRemote, gitProvider, repoAccess } = input;
	if (input.repoAccessLoading || !gitRemote || !gitProvider) {
		return undefined;
	}
	const issue = { refresh: "repoAccess" as const, tone: "warning" as const, blocking: true };
	// A failed check says nothing about access; it is retried rather than answered with Authorize.
	if (input.repoAccessError) {
		return { ...issue, message: "Couldn't check Choreo Cloud's access to this repository. Refresh to try again." };
	}
	if (repoAccess?.isAccessible) {
		return undefined;
	}
	if (gitProvider !== GitProvider.GITHUB) {
		return {
			...issue,
			message: repoAccess?.retrievedRepos
				? "Selected Credential does not have sufficient permissions to access the repository."
				: `Failed to retrieve ${toSentenceCase(gitProvider)} repositories using the selected credential.`,
			action: "manageCredentials",
		};
	}
	return repoAccess?.retrievedRepos
		? { ...issue, message: "The WSO2 Cloud app has no access to this repository on GitHub.", action: "grantAccess" }
		: { ...issue, message: "Authorize the WSO2 Cloud app on GitHub to deploy from this repository.", action: "authorize", tone: "info" };
}

function branchIssue(input: SourceReadinessInput): SourceReadiness | undefined {
	if (!input.gitRemote || input.branchesLoading || input.branches.length > 0) {
		return undefined;
	}
	return {
		message: "The selected remote repository has no branches. Please publish your local branch to the remote repository.",
		action: "pushChanges",
		refresh: "branches",
		tone: "info",
		blocking: true,
	};
}

function driftIssue(files: string[]): SourceReadiness | undefined {
	if (files.length === 0) {
		return undefined;
	}
	return {
		message: `Choreo Cloud reads the metadata in ${files.join(", ")} from the selected remote repository. Commit and push ${files.length > 1 ? "them" : "it"}.`,
		refresh: "configDrift",
		tone: "warning",
		blocking: true,
	};
}

function dirtyNotice(hasDirtyRepo: boolean): SourceReadiness | undefined {
	return hasDirtyRepo
		? {
				message:
					"Choreo Cloud builds your integrations from the source code in the selected remote repository. Please commit and push your local changes to the remote Git repository.",
				refresh: "dirtyRepo",
				tone: "neutral",
				blocking: false,
			}
		: undefined;
}

/** What the deploy form shows about the selected repository, and whether it blocks the deploy; the first issue wins. */
export function sourceReadiness(input: SourceReadinessInput): SourceReadiness {
	const issue =
		gitDataIssue(input) ??
		providerIssue(input.gitProvider) ??
		accessIssue(input) ??
		branchIssue(input) ??
		driftIssue(input.configDriftFiles) ??
		dirtyNotice(input.hasDirtyRepo);
	const incomplete = input.gitData === undefined || (!!input.gitRemote && !input.branch);
	return issue ? { ...issue, blocking: issue.blocking || incomplete } : { tone: "warning", blocking: incomplete };
}

/** The rule the deploy form applies to an integration's display name. */
export function validateIntegrationDisplayName(name: string): string | undefined {
	const trimmed = name.trim();
	if (!trimmed) {
		return "Display name is required.";
	}
	if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(trimmed)) {
		return "Use letters, numbers, spaces, hyphens or underscores. Must start with a letter or number.";
	}
	return undefined;
}
