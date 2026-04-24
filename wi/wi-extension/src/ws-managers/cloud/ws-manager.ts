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

import { env, Uri, commands, window, ProgressLocation } from "vscode";
import {
	type AuthState,
	type ContextStoreState,
	type WICloudFormContext,
	type WICloudSubmitComponentsReq,
	type WICloudSubmitComponentsResp,
	type GetLocalGitDataResp,
	type GetBranchesReq,
	type GetAuthorizedGitOrgsReq,
	type GetAuthorizedGitOrgsResp,
	type GetCredentialsReq,
	type CredentialItem,
	type GetCredentialDetailsReq,
	type GetGitMetadataReq,
	type GetGitMetadataResp,
	type IsRepoAuthorizedReq,
	type IsRepoAuthorizedResp,
	type CloneRepositoryIntoCompDirReq,
	type GetConfigFileDriftsReq,
	type GetCloudProjectsReq,
	type GetCloudProjectsResp,
	ViewType,
	COMMANDS,
	WICloudAPI,
	DefaultOrgNameResponse,
} from "@wso2/wi-core";
import { buildGitURL, parseGitURL } from "@wso2/wso2-platform-core";
import { ext } from "../../extensionVariables";
import { StateMachine } from "../../stateMachine";
import { contextStore } from "../../cloud/stores/context-store";
import { webviewStateStore } from "../../cloud/stores/webview-state-store";
import { getGitHead, getGitRemotes, getGitRoot, hasDirtyRepo as checkDirtyRepo, removeCredentialsFromGitURL, relativePath } from "../../cloud/git/util";
import { initGit } from "../../cloud/git/main";
import fs, { readdirSync } from "fs";
import path, { join } from "path";
import type { IFileStatus } from "../../cloud/git/git";
import { submitCreateComponentHandler } from "../../cloud/cmds/create-component-cmd";
import { enrichGitUsernamePassword } from "../../cloud/cmds/commit-and-push-to-git-cmd";
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
		const authState = ext.authProvider?.state ?? { userInfo: null, region: "US" };
		// Add selected org ID to auth state
		const selectedOrgId = ext.context.globalState.get<string>("selectedOrgId");
		return {
			...authState,
			selectedOrgId,
		} as AuthState & { selectedOrgId?: string };
	}

	async getContextState(): Promise<ContextStoreState> {
		return contextStore.getState().state;
	}

	async changeOrgContext(orgId: string): Promise<void> {
		try {
			await ext.clients.rpcClient.changeOrgContext(orgId);

			const userInfo = await ext.clients.rpcClient.getUserInfo();
			if (!userInfo) {
				throw new Error("Failed to retrieve user info after org context change");
			}

			const region = await ext.clients.rpcClient.getCurrentRegion();

			if (!region || (region !== "US" && region !== "EU")) {
				throw new Error("Region is not available or invalid. Expected 'US' or 'EU'.");
			}

			if (!ext.authProvider) {
				throw new Error("Auth provider is not available");
			}

			await ext.context.globalState.update("selectedOrgId", orgId);

			await ext.authProvider.getState().loginSuccess(userInfo, region);
		} catch (error) {
			console.error("Failed to change org context", error);
			throw error;
		}
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
			return {
				remotes: Array.from(remotesSet),
				upstream: { name: head?.name, remote: head?.upstream?.remote, remoteUrl: headRemoteUrl },
				gitRoot,
			};
		} catch {
			return undefined;
		}
	}

	async hasDirtyRepo(dirPath: string): Promise<boolean> {
		return checkDirtyRepo(dirPath, ext.context, ["context.yaml"]);
	}

	async getConfigFileDrifts(params: GetConfigFileDriftsReq): Promise<string[]> {
		const { branch, repoDir, repoUrl } = params;
		try {
			const fileNames = new Set<string>();
			const git = await initGit(ext.context);
			const repoRoot = await git?.getRepositoryRoot(repoDir);
			if (repoRoot) {
				const subPath = relativePath(repoRoot, repoDir);

				if (git) {
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
						if (parsed1 && parsed2) {
							const [org, repoName] = parsed1;
							const [componentRepoOrg, componentRepoName] = parsed2;
							return org === componentRepoOrg && repoName === componentRepoName;
						}
					})?.name;

					if (matchingRemoteName) {
						try {
							await gitRepo.fetch({ silent: true, remote: matchingRemoteName });
						} catch {
							// ignore error
						}
						const changes = await gitRepo.diffWith(`${matchingRemoteName}/${branch}`);
						const componentYamlPath = join(repoDir, ".wso2", "component.yaml");
						const componentYamlLegacyPath = join(repoDir, ".choreo", "component.yaml");
						const configPaths = [componentYamlPath, componentYamlLegacyPath];

						changes.forEach((item) => {
							if (configPaths.includes(item.uri.path)) {
								fileNames.add(path.basename(item.uri.path));
							}
						});
						if (fileNames.size) {
							return Array.from(fileNames);
						}
					}
				}
			}
			return Array.from(fileNames);
		} catch (err) {
			console.log(err);
			return [];
		}
	}

	async triggerGithubAuthFlow(orgId: string): Promise<void> {
		const extName = webviewStateStore.getState().state?.extensionName;
		const baseUrl = extName === "Devant" ? ext.config?.devantConsoleUrl : ext.config?.choreoConsoleUrl;
		const callbackUrl = await env.asExternalUri(Uri.parse(`${env.uriScheme}://wso2.wso2-integrator/ghapp`));
		const state = Buffer.from(
			JSON.stringify({ origin: "vscode.choreo.ext", orgId, callbackUri: callbackUrl.toString(), extensionName: extName }),
			"binary",
		).toString("base64");
		const ghURL = Uri.parse(
			`${ext.config?.ghApp.authUrl}?redirect_uri=${baseUrl}/ghapp&client_id=${ext.config?.ghApp.clientId}&state=${state}`,
		);
		await env.openExternal(ghURL);
	}

	async triggerGithubInstallFlow(orgId: string): Promise<void> {
		const extName = webviewStateStore.getState().state?.extensionName;
		const callbackUrl = await env.asExternalUri(Uri.parse(`${env.uriScheme}://wso2.wso2-integrator/ghapp`));
		const state = Buffer.from(
			JSON.stringify({ origin: "vscode.choreo.ext", orgId, callbackUri: callbackUrl.toString(), extensionName: extName }),
			"binary",
		).toString("base64");
		const ghURL = Uri.parse(`${ext.config?.ghApp.installUrl}?state=${state}`);
		await env.openExternal(ghURL);
	}

	async getBranches(params: GetBranchesReq): Promise<string[]> {
		return ext.clients.rpcClient.getRepoBranches(params);
	}

	async getAuthorizedGitOrgs(params: GetAuthorizedGitOrgsReq): Promise<GetAuthorizedGitOrgsResp> {
		return ext.clients.rpcClient.getAuthorizedGitOrgs(params);
	}

	async getCredentials(params: GetCredentialsReq): Promise<CredentialItem[]> {
		const result = await ext.clients.rpcClient.getCredentials(params);
		return result ?? [];
	}

	async getCredentialDetails(params: GetCredentialDetailsReq): Promise<CredentialItem> {
		return ext.clients.rpcClient.getCredentialDetails(params);
	}

	async isRepoAuthorized(params: IsRepoAuthorizedReq): Promise<IsRepoAuthorizedResp> {
		return ext.clients.rpcClient.isRepoAuthorized(params);
	}

	async getGitRepoMetadata(params: GetGitMetadataReq): Promise<GetGitMetadataResp> {
		return ext.clients.rpcClient.getGitRepoMetadata(params);
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

		const parsed = parseGitURL(_repoUrl);
		if (parsed) {
			const [repoOrg, repoName, provider] = parsed;
			await enrichGitUsernamePassword(params.org, repoOrg, repoName, provider, urlObj, _repoUrl, params.repo.secretRef || "");
		}

		const repoUrl = urlObj.href;

		const clonedPath = await window.withProgress(
			{
				title: `Cloning repository ${params.repo.orgHandler}/${params.repo.repo}`,
				location: ProgressLocation.Notification,
			},
			async (progress, cancellationToken) =>
				newGit.clone(
					repoUrl,
					{
						recursive: true,
						ref: params.repo.branch,
						parentPath: join(params.cwd, ".."),
						progress: {
							report: ({ increment, ...rest }: { increment: number }) => progress.report({ increment, ...rest }),
						},
					},
					cancellationToken,
				),
		);

		// Move everything from cwd into the cloned directory at subpath
		const cwdFiles = readdirSync(params.cwd);
		const newPath = join(clonedPath, params.subpath);
		fs.mkdirSync(newPath, { recursive: true });

		for (const file of cwdFiles) {
			const cwdFilePath = join(params.cwd, file);
			const destFilePath = join(newPath, file);
			fs.cpSync(cwdFilePath, destFilePath, { recursive: true });
		}

		const repoRoot = await newGit.getRepositoryRoot(newPath);
		const dotGit = await newGit.getRepositoryDotGit(newPath);
		const repo = newGit.open(repoRoot, dotGit);

		await window.withProgress({ title: "Pushing the changes to your remote repository...", location: ProgressLocation.Notification }, async () => {
			await repo.add(["."]);
			await repo.commit(`Add source for new Devant Integration`);
			const headRef = await repo.getHEADRef();
			await repo.push(headRef?.upstream?.remote || "origin", headRef?.name || params.repo.branch);
		});

		return newPath;
	}

	async getConsoleUrl(): Promise<string> {
		return ext.config?.devantConsoleUrl;
	}

	async getCloudProjects(params: GetCloudProjectsReq): Promise<GetCloudProjectsResp> {
		const projects = await ext.clients.rpcClient.getProjects(params.orgId);
		return { projects };
	}

	async getDefaultOrgName(): Promise<DefaultOrgNameResponse> {
		return { orgName: getUsername() };
	}

	/**
	 * Subscribe to auth/context state changes and forward via the provided callbacks.
	 */
	setupSubscriptions(
		publishAuthState: (state: AuthState) => void,
		publishContextState: (state: ContextStoreState) => void,
	): void {
		ext.authProvider?.subscribe(({ state }) => {
			const selectedOrgId = ext.context.globalState.get<string>("selectedOrgId");
			publishAuthState({ ...state, selectedOrgId } as AuthState & { selectedOrgId?: string });
		});
		contextStore.subscribe(({ state }) => {
			publishContextState(state);
		});
	}
}
