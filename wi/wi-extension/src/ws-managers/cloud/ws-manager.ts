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

import fs, { readdirSync } from "fs";
import path, { join } from "path";
import {
	type AuthState,
	COMMANDS,
	type CloneRepositoryIntoCompDirReq,
	type ContextStoreState,
	type CredentialItem,
	type DefaultOrgNameResponse,
	type GetAuthorizedGitOrgsReq,
	type GetAuthorizedGitOrgsResp,
	type GetBranchesReq,
	type GetCloudProjectsReq,
	type GetCloudProjectsResp,
	type GetConfigFileDriftsReq,
	type GetCredentialDetailsReq,
	type GetCredentialsReq,
	type GetGitMetadataReq,
	type GetGitMetadataResp,
	type GetLocalGitDataResp,
	type IsRepoAuthorizedReq,
	type IsRepoAuthorizedResp,
	ViewType,
	type WICloudAPI,
	type WICloudFormContext,
	type WICloudSubmitComponentsReq,
	type WICloudSubmitComponentsResp,
} from "@wso2/wi-core";
import { NotSupportedError, buildConsoleUrl, parseGitHubRepoUrl } from "@wso2/wso2-cloud-client";
import { GitProvider, WICommandIds, buildGitURL, parseGitURL } from "@wso2/wso2-platform-core";
import { ProgressLocation, Uri, commands, env, window } from "vscode";
import { enrichGitUsernamePassword } from "../../cloud/cmds/commit-and-push-to-git-cmd";
import { submitCreateComponentHandler } from "../../cloud/cmds/create-component-cmd";
import type { IFileStatus } from "../../cloud/git/git";
import { initGit } from "../../cloud/git/main";
import { hasDirtyRepo as checkDirtyRepo, getGitHead, getGitRemotes, getGitRoot, relativePath, removeCredentialsFromGitURL } from "../../cloud/git/util";
import { contextStore } from "../../cloud/stores/context-store";
import { dataCacheStore } from "../../cloud/stores/data-cache-store";
import { ext } from "../../extensionVariables";
import { StateMachine } from "../../stateMachine";
import { getUsername } from "../main/utils";

/**
 * Pending cloud form context — set by openCloudFormWebview before the webview opens,
 * consumed by getCloudFormContext when the webview requests it.
 */
let _pendingContext: WICloudFormContext | null = null;

/**
 * Store context then open the CREATE_CLOUD_INTEGRATION webview.
 */
export function openCloudFormWebview(context: WICloudFormContext): void {
	_pendingContext = context;
	StateMachine.openWebview(ViewType.CREATE_CLOUD_INTEGRATION);
}

/**
 * What the cloud webviews ask the extension. The method names are the ones
 * the views were written against; the answers come from the platform.
 */
export class CloudWsManager implements Omit<WICloudAPI, "onAuthStateChanged" | "onContextStateChanged"> {
	async getCloudFormContext(): Promise<WICloudFormContext> {
		const ctx = _pendingContext;
		if (!ctx) {
			throw new Error("No cloud form context available");
		}
		return ctx;
	}

	async submitComponents(req: WICloudSubmitComponentsReq): Promise<WICloudSubmitComponentsResp> {
		return submitCreateComponentHandler(req);
	}

	async closeCloudFormWebview(): Promise<void> {
		_pendingContext = null;
		commands.executeCommand(COMMANDS.CLOSE_WEBVIEW);
	}

	async getAuthState(): Promise<AuthState> {
		return ext.authProvider?.webviewAuthState() ?? { userInfo: null, status: "signed-out" };
	}

	async getContextState(): Promise<ContextStoreState> {
		return contextStore.getState().state;
	}

	/** An organization is fixed at sign-in; changing it means signing in again. */
	async changeOrgContext(_orgId: string): Promise<void> {
		await commands.executeCommand(WICommandIds.SignIn, { reselectOrganization: true });
	}

	async getLocalGitData(dirPath: string): Promise<GetLocalGitDataResp | undefined> {
		try {
			const gitRoot = await getGitRoot(ext.context, dirPath);
			const remotes = await getGitRemotes(ext.context, dirPath);
			const head = await getGitHead(ext.context, dirPath);
			let headRemoteUrl = "";
			const remotesSet = new Set<string>();
			remotes.forEach((remote) => {
				if (remote.fetchUrl) {
					const sanitized = removeCredentialsFromGitURL(remote.fetchUrl);
					remotesSet.add(sanitized);
					if (head?.upstream?.remote === remote.name) {
						headRemoteUrl = sanitized;
					}
				}
			});
			return { remotes: Array.from(remotesSet), upstream: { name: head?.name, remote: head?.upstream?.remote, remoteUrl: headRemoteUrl }, gitRoot };
		} catch {
			return undefined;
		}
	}

	async hasDirtyRepo(dirPath: string): Promise<boolean> {
		return checkDirtyRepo(dirPath, ext.context);
	}

	async getConfigFileDrifts(params: GetConfigFileDriftsReq): Promise<string[]> {
		const { branch, repoDir, repoUrl } = params;
		try {
			const fileNames = new Set<string>();
			const git = await initGit(ext.context);
			const repoRoot = await git?.getRepositoryRoot(repoDir);
			if (repoRoot && git) {
				const subPath = relativePath(repoRoot, repoDir);
				const gitRepo = git.open(repoRoot, { path: repoRoot });
				const status = await gitRepo.getStatus({ untrackedChanges: "separate", subDirectory: subPath });
				status.status.forEach((item: IFileStatus) => {
					if (item.path.endsWith("component.yaml")) {
						fileNames.add("component.yaml");
					}
				});
				if (fileNames.size) {
					return Array.from(fileNames);
				}
				const remotes = await getGitRemotes(ext.context, repoRoot);
				const matchingRemoteName = remotes.find((item) => {
					const parsed1 = parseGitURL(item.fetchUrl);
					const parsed2 = parseGitURL(repoUrl);
					return !!parsed1 && !!parsed2 && parsed1[0] === parsed2[0] && parsed1[1] === parsed2[1];
				})?.name;
				if (matchingRemoteName) {
					try {
						await gitRepo.fetch({ silent: true, remote: matchingRemoteName });
					} catch {
						// ignore
					}
					const changes = await gitRepo.diffWith(`${matchingRemoteName}/${branch}`);
					const configPaths = [join(repoDir, ".wso2", "component.yaml")];
					changes.forEach((item) => {
						if (configPaths.includes(item.uri.path)) {
							fileNames.add(path.basename(item.uri.path));
						}
					});
				}
			}
			return Array.from(fileNames);
		} catch (err) {
			console.log(err);
			return [];
		}
	}

	/**
	 * The platform's git integration has no documented route for the GitHub App
	 * flows yet, so both open the console, where the connection is made.
	 */
	async triggerGithubAuthFlow(_orgId: string): Promise<void> {
		await env.openExternal(Uri.parse(buildConsoleUrl(ext.config.consoleUrl, { orgHandle: ext.authProvider?.org?.handle })));
	}

	async triggerGithubInstallFlow(_orgId: string): Promise<void> {
		await env.openExternal(Uri.parse(buildConsoleUrl(ext.config.consoleUrl, { orgHandle: ext.authProvider?.org?.handle })));
	}

	/** Branches of a public GitHub repository, which is what the platform can read; empty for anything else. */
	async getBranches(params: GetBranchesReq): Promise<string[]> {
		const github = parseGitHubRepoUrl(params.repoUrl ?? "");
		if (!github) {
			return [];
		}
		const branches = await ext.clients.platform.cloud.repos.listBranches(github.owner, github.repo);
		return branches.map((b) => b.name);
	}

	/** The platform lists no GitHub organizations yet; the form shows this instead of an empty list it cannot act on. */
	async getAuthorizedGitOrgs(_params: GetAuthorizedGitOrgsReq): Promise<GetAuthorizedGitOrgsResp> {
		throw new NotSupportedError(
			"Creating a repository from here is not available on WSO2 Cloud yet. Create the repository on GitHub, push the integration to it, then deploy from it.",
			{ reason: "git_orgs_unavailable" },
		);
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
		const parsed = parseGitURL(params.repoUrl);
		if (parsed && parsed[2] === GitProvider.GITHUB) {
			const branches = await this.getBranches(params).catch((): string[] => []);
			return { retrievedRepos: true, isAccessible: branches.length > 0 };
		}
		return { retrievedRepos: false, isAccessible: false };
	}

	async getGitRepoMetadata(params: GetGitMetadataReq): Promise<GetGitMetadataResp> {
		const inspection = await ext.clients.platform.cloud.repos.inspect(params.gitOrgName, params.gitRepoName, params.branch || undefined, params.relativePath);
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

	async cloneRepositoryIntoCompDir(params: CloneRepositoryIntoCompDirReq): Promise<string> {
		const newGit = await initGit(ext.context);
		if (!newGit) {
			throw new Error("failed to retrieve Git details");
		}
		const _repoUrl = buildGitURL(params.repo.orgHandler, params.repo.repo, params.repo.provider, true, params.repo.serverUrl);
		if (!_repoUrl || !_repoUrl.startsWith("https://")) {
			throw new Error("failed to parse git details");
		}
		const urlObj = new URL(_repoUrl);
		await enrichGitUsernamePassword(urlObj);
		const repoUrl = urlObj.href;

		const clonedPath = await window.withProgress(
			{ title: `Cloning repository ${params.repo.orgHandler}/${params.repo.repo}`, location: ProgressLocation.Notification },
			async (progress, cancellationToken) =>
				newGit.clone(
					repoUrl,
					{
						recursive: true,
						ref: params.repo.branch,
						parentPath: join(params.cwd, ".."),
						progress: { report: ({ increment, ...rest }: { increment: number }) => progress.report({ increment, ...rest }) },
					},
					cancellationToken,
				),
		);

		const newPath = join(clonedPath, params.subpath);
		try {
			const cwdFiles = readdirSync(params.cwd);
			fs.mkdirSync(newPath, { recursive: true });
			for (const file of cwdFiles) {
				fs.cpSync(join(params.cwd, file), join(newPath, file), { recursive: true });
			}

			const repo = newGit.open(await newGit.getRepositoryRoot(newPath), await newGit.getRepositoryDotGit(newPath));
			await window.withProgress({ title: "Pushing the changes to your remote repository...", location: ProgressLocation.Notification }, async () => {
				await repo.add(["."]);
				await repo.commit("Add integration source");
				const headRef = await repo.getHEADRef();
				await repo.push(headRef?.upstream?.remote || "origin", headRef?.name || params.repo.branch);
			});
		} finally {
			// The clone and the push needed the credentials; from the moment the clone exists, whatever
			// happens after it, the repository keeps the plain URL.
			try {
				const cloned = newGit.open(await newGit.getRepositoryRoot(clonedPath), await newGit.getRepositoryDotGit(clonedPath));
				await cloned.exec(["remote", "set-url", "origin", _repoUrl]);
			} catch (error) {
				ext.logError("Could not reset the remote URL", error as Error);
			}
		}
		return newPath;
	}

	async getConsoleUrl(): Promise<string> {
		return ext.config.consoleUrl;
	}

	async getCloudProjects(_params: GetCloudProjectsReq): Promise<GetCloudProjectsResp> {
		const projects = await ext.clients.platform.cloud.projects.list();
		const orgHandle = ext.authProvider?.org?.handle;
		if (orgHandle) {
			dataCacheStore.getState().setProjects(orgHandle, projects);
		}
		return { projects };
	}

	async getDefaultOrgName(): Promise<DefaultOrgNameResponse> {
		return { orgName: getUsername() };
	}

	/**
	 * Subscribe to auth/context state changes and forward via the provided callbacks.
	 */
	setupSubscriptions(publishAuthState: (state: AuthState) => void, publishContextState: (state: ContextStoreState) => void): void {
		ext.authProvider?.subscribe(() => {
			publishAuthState(ext.authProvider?.webviewAuthState() ?? { userInfo: null, status: "signed-out" });
		});
		contextStore.subscribe(({ state }) => {
			publishContextState(state);
		});
	}
}
