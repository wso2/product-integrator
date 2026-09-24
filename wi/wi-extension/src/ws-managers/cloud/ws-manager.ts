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
import { buildAuthorizeUrl, buildInstallUrl } from "../../cloud/ipaas/github";
import { isEditorLocalEntry, isEditorLocalPath, isMissingRemoteBranch } from "../../cloud/ipaas/repo";
import { IpaasRpcClient } from "../../cloud/ipaas/client";
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
		// The editor's own files in the workspace are not the integration's, and
		// are not pushed with it — see localRepoHasChanges.
		return checkDirtyRepo(dirPath, ext.context, [], ext.isDevantCloudEditor ? isEditorLocalPath : undefined);
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
		if (ext.cloudBackend === "ipaas") {
			return this.triggerIpaasGithubFlow(orgId, "authorize");
		}
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
		if (ext.cloudBackend === "ipaas") {
			return this.triggerIpaasGithubFlow(orgId, "install");
		}
		const extName = webviewStateStore.getState().state?.extensionName;
		const callbackUrl = await env.asExternalUri(Uri.parse(`${env.uriScheme}://wso2.wso2-integrator/ghapp`));
		const state = Buffer.from(
			JSON.stringify({ origin: "vscode.choreo.ext", orgId, callbackUri: callbackUrl.toString(), extensionName: extName }),
			"binary",
		).toString("base64");
		const ghURL = Uri.parse(`${ext.config?.ghApp.installUrl}?state=${state}`);
		await env.openExternal(ghURL);
	}

	/**
	 * Send the user to GitHub to authorize the App, or to install it.
	 *
	 * The editor cannot be GitHub's redirect target — the App registers one
	 * callback URL, and it points at the console — so the editor's own URI
	 * travels inside `state` and the console forwards the result back to it.
	 * The callback lands on the /ghapp URI handler.
	 */
	private async triggerIpaasGithubFlow(orgId: string, kind: "authorize" | "install"): Promise<void> {
		const { clientId, slug } = ext.githubApp;
		const needed = kind === "authorize" ? clientId : slug;
		if (!needed) {
			window.showErrorMessage(
				"This deployment has no GitHub App configured, so GitHub cannot be connected from the editor. Connect the repository from the cloud console instead.",
			);
			return;
		}
		if (!ext.ipaasConsoleUrl) {
			window.showErrorMessage(
				"No console URL is configured, and GitHub returns its result by way of the console. Connect the repository from the cloud console instead.",
			);
			return;
		}

		const callbackUri = await env.asExternalUri(Uri.parse(`${env.uriScheme}://wso2.wso2-integrator/ghapp`));
		// toString(true) — without it the query is percent-encoded a second time.
		// In the browser the external URI is an http callback carrying the target
		// as query parameters, and re-encoding turns "?a=1&b=2" into one
		// parameter named "a%3D1%26b%3D2": the editor's own callback endpoint
		// then reads none of them and drops the code instead of routing it.
		const state = Buffer.from(
			JSON.stringify({ origin: "vscode.wso2-integrator", orgId, callbackUri: callbackUri.toString(true) }),
			"binary",
		).toString("base64");

		const url =
			kind === "authorize"
				? buildAuthorizeUrl(clientId, `${ext.ipaasConsoleUrl}/ghapp`, state)
				: buildInstallUrl(slug, state);
		ext.log(`Opening GitHub ${kind} flow`);
		await env.openExternal(Uri.parse(url));
		// Whatever the user does on that page changes which repositories are
		// reachable, and GitHub returns here only when the App is configured
		// with a setup URL. Forgetting now means the next look asks the
		// platform again, so newly granted repositories appear on their own
		// rather than after a window reload.
		if (ext.clients.rpcClient instanceof IpaasRpcClient) {
			ext.clients.rpcClient.resetGitHubInstallations();
		}
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

		const cloneInto = async (ref?: string, quietFailure = false) =>
			window.withProgress(
				{
					title: `Cloning repository ${params.repo.orgHandler}/${params.repo.repo}`,
					location: ProgressLocation.Notification,
				},
				async (progress, cancellationToken) =>
					newGit.clone(
						repoUrl,
						{
							recursive: true,
							...(ref ? { ref } : {}),
							parentPath: join(params.cwd, ".."),
							quietFailure,
							progress: {
								report: ({ increment, ...rest }: { increment: number }) => progress.report({ increment, ...rest }),
							},
						},
						cancellationToken,
					),
			);

		let clonedPath: string;
		let branchMissing = false;
		try {
			// Quiet, because the branch is expected to be missing on a repository
			// created for this integration: the attempt below recovers, and an
			// error notification for it reads as a failed deployment to a user
			// whose deployment is on its way. A failure this cannot recover from
			// is rethrown, and surfaces where the caller reports it.
			clonedPath = await cloneInto(params.repo.branch, true);
		} catch (err) {
			// The branch does not exist yet — either the repository holds no
			// commits at all, which is the ordinary state of one created for
			// this integration moments ago, or it holds some but not under this
			// name. Neither is a failure: take the repository as it is and
			// create the branch on the way out.
			if (!isMissingRemoteBranch(err)) {
				// The notification git would have raised was suppressed for the
				// attempt above, so raise it here: the caller only logs.
				const reason = (err as { stderr?: string })?.stderr || (err as Error)?.message;
				if (reason) {
					window.showErrorMessage(reason);
				}
				throw err;
			}
			branchMissing = true;
			clonedPath = await cloneInto();
		}

		// Move everything from cwd into the cloned directory at subpath
		const cwdFiles = readdirSync(params.cwd);
		const newPath = join(clonedPath, params.subpath);
		fs.mkdirSync(newPath, { recursive: true });

		for (const file of cwdFiles) {
			if (isEditorLocalEntry(file)) {
				continue;
			}
			const cwdFilePath = join(params.cwd, file);
			const destFilePath = join(newPath, file);
			fs.cpSync(cwdFilePath, destFilePath, { recursive: true });
		}

		const repoRoot = await newGit.getRepositoryRoot(newPath);
		const dotGit = await newGit.getRepositoryDotGit(newPath);
		const repo = newGit.open(repoRoot, dotGit);

		// An empty clone leaves HEAD unborn on whatever name the local git
		// defaults to, which need not be the branch the component was told to
		// build from. Point it at that branch before the first commit, or the
		// push creates one nobody is looking for.
		const startedEmpty = await newGit.isEmptyRepository(repoRoot);
		await window.withProgress({ title: "Pushing the changes to your remote repository...", location: ProgressLocation.Notification }, async () => {
			const branch = params.repo.branch || "main";
			if (startedEmpty) {
				// An empty clone leaves HEAD unborn on whatever name the local
				// git defaults to. symbolic-ref names it without needing a
				// commit to branch from, which checkout has no way to do.
				await repo.exec(["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
			} else if (branchMissing) {
				// The repository has history but not this branch, so start it
				// from whatever was checked out.
				await repo.branch(branch, true);
			}
			await repo.add(["."]);
			await repo.commit(`Add integration source`);
			const headRef = await repo.getHEADRef();
			// A branch the remote has never seen needs its upstream set here;
			// one that was cloned already has it.
			const isNew = startedEmpty || branchMissing;
			await repo.push(headRef?.upstream?.remote || "origin", headRef?.name || branch, isNew);
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
