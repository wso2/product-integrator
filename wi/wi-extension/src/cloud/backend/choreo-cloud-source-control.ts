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

import type {
	CredentialItem,
	GetAuthorizedGitOrgsReq,
	GetAuthorizedGitOrgsResp,
	GetBranchesReq,
	GetCredentialDetailsReq,
	GetCredentialsReq,
	GetGitMetadataReq,
	GetGitMetadataResp,
	IsRepoAuthorizedReq,
	IsRepoAuthorizedResp,
} from "@wso2/wi-core";
import { NotSupportedError, parseGitHubRepoUrl } from "@wso2/wso2-cloud-client";
import { GitProvider } from "@wso2/wso2-platform-core";
import { Uri, env, window } from "vscode";
import { ext } from "../../extensionVariables";
import { SIGN_IN_CHANGED_MESSAGE, gitHubAccessFor, signedInScope } from "../github-access";
import { type GitHubAppConnector, forgetGitHubAccess, inspectReadablePath, installationSettingsUrl, listConnectedGitHubAccounts, listReadableBranches } from "../github-app";
import type { CloudSourceControl } from "./port";

/** Choreo Cloud reads GitHub repositories through its GitHub App; other providers are connected in the console. */
export class ChoreoCloudSourceControl implements CloudSourceControl {
	/** Connects GitHub to the organization, with the app on the repository's owner. */
	async triggerGithubAuthFlow(repoUrl: string): Promise<void> {
		forgetGitHubAccess();
		await this.githubApp().connect(parseGitHubRepoUrl(repoUrl ?? "")?.owner, "authorize");
	}

	/**
	 * Gives the WSO2 Cloud app access to the repository: on GitHub's own page for the
	 * installation when the owner is connected already, otherwise by installing it there.
	 */
	async triggerGithubInstallFlow(repoUrl: string): Promise<void> {
		const github = parseGitHubRepoUrl(repoUrl ?? "");
		if (!github) {
			await this.githubApp().connect(undefined, "install");
			return;
		}
		forgetGitHubAccess();
		// The flow belongs to the organization signed in when it was asked for.
		const scope = signedInScope();
		const stillSignedIn = () => {
			if (signedInScope() === scope) {
				return true;
			}
			window.showWarningMessage(SIGN_IN_CHANGED_MESSAGE);
			return false;
		};
		const access = await gitHubAccessFor(github.owner, github.repo);
		if (!stillSignedIn()) {
			return;
		}
		if (access.kind === "not-granted") {
			const settingsUrl = await installationSettingsUrl(github.owner, access.installation.installationId);
			if (stillSignedIn()) {
				await env.openExternal(Uri.parse(settingsUrl));
			}
			return;
		}
		// The app is on the owner, but WSO2 Cloud needs the person's GitHub authorization again to tell.
		await this.githubApp().connect(github.owner, access.kind === "auth-required" ? "authorize" : "install");
	}

	private githubApp(): GitHubAppConnector {
		if (!ext.githubApp) {
			throw new Error("WSO2 Cloud is not available.");
		}
		return ext.githubApp;
	}

	/** Branches of a GitHub repository WSO2 Cloud can read, through the GitHub App or because it is public; empty otherwise. */
	async getBranches(params: GetBranchesReq): Promise<string[]> {
		const github = parseGitHubRepoUrl(params.repoUrl ?? "");
		if (!github) {
			return [];
		}
		const cloud = ext.clients.platform.cloud;
		return listReadableBranches(cloud, await gitHubAccessFor(github.owner, github.repo));
	}

	/**
	 * The GitHub accounts connected to the organization and the repositories the WSO2 Cloud app was given on each:
	 * what a new integration's repository is chosen from. The platform connects no other provider from here.
	 */
	async getAuthorizedGitOrgs(params: GetAuthorizedGitOrgsReq): Promise<GetAuthorizedGitOrgsResp> {
		if (params?.provider && params.provider !== GitProvider.GITHUB) {
			throw new NotSupportedError("WSO2 Cloud connects GitHub repositories from here. For another provider, create the integration in the WSO2 Cloud console.", {
				reason: "git_orgs_unavailable",
			});
		}
		const { accounts, unread } = await listConnectedGitHubAccounts(ext.clients.platform.cloud, (message) => ext.log(message));
		return { gitOrgs: accounts, unreadOrgs: unread };
	}

	async getCredentials(_params: GetCredentialsReq): Promise<CredentialItem[]> {
		return [];
	}

	async getCredentialDetails(_params: GetCredentialDetailsReq): Promise<CredentialItem> {
		throw new Error("Git credentials are managed in the WSO2 Cloud console.");
	}

	/**
	 * Whether the platform can read the repository. Until the git
	 * integration's routes are documented, a public GitHub repository with
	 * branches the platform can list counts as accessible.
	 */
	async isRepoAuthorized(params: IsRepoAuthorizedReq): Promise<IsRepoAuthorizedResp> {
		const github = parseGitHubRepoUrl(params.repoUrl ?? "");
		if (!github) {
			return { retrievedRepos: false, isAccessible: false };
		}
		// `retrievedRepos` is set when the app is on the owner: the form then asks for this
		// repository's access rather than for GitHub to be connected.
		const access = await gitHubAccessFor(github.owner, github.repo);
		return {
			retrievedRepos: access.kind === "installation" || access.kind === "not-granted",
			isAccessible: access.kind === "installation" || access.kind === "public",
		};
	}

	async getGitRepoMetadata(params: GetGitMetadataReq): Promise<GetGitMetadataResp> {
		const cloud = ext.clients.platform.cloud;
		const access = await gitHubAccessFor(params.gitOrgName, params.gitRepoName);
		const inspection = await inspectReadablePath(cloud, access, params.branch || undefined, params.relativePath);
		return {
			metadata: {
				...inspection,
				isValidRepo: !inspection.isBareRepo,
				hasBallerinaTomlInPath: inspection.hasBallerinaToml,
				hasPomXmlInPath: inspection.hasPomXml,
				hasDockerfileInPath: inspection.hasDockerfile,
			},
		};
	}
}
