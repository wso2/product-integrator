/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { env, Uri, window, ProgressLocation } from "vscode";
import { Messenger } from "vscode-messenger";
import { BROADCAST } from "vscode-messenger-common";
import {
	type AuthState,
	WICloudFormContext,
	WICloudSubmitComponentsReq,
	WICloudSubmitComponentsResp,
	closeCloudFormWebview,
	getAuthState,
	getCloudFormContext,
	getContextState,
	getLocalGitData,
	onAuthStateChanged,
	onContextStateChanged,
	submitComponents,
	triggerGithubAuthFlow,
	triggerGithubInstallFlow,
	getBranches,
	getAuthorizedGitOrgs,
	getCredentials,
	getCredentialDetails,
	getGitRepoMetadataBatch,
	ViewType,
} from "@wso2/wi-core";
import { ext } from "../../extensionVariables";
import { StateMachine } from "../../stateMachine";
import { contextStore } from "../../cloud/stores/context-store";
import { webviewStateStore } from "../../cloud/stores/webview-state-store";
import { getGitHead, getGitRemotes, getGitRoot, removeCredentialsFromGitURL } from "../../cloud/git/util";

/**
 * Pending cloud form context — set by create-component-cmd before opening the webview,
 * consumed by the rpc-handler when the webview requests it.
 */
let _pendingContext: WICloudFormContext | null = null;

/**
 * Pending submit handler — set by create-component-cmd so the webview result
 * gets routed back to the command that opened the form.
 */
let _pendingSubmitHandler:
	| ((req: WICloudSubmitComponentsReq) => Promise<WICloudSubmitComponentsResp>)
	| null = null;

/**
 * Store context and handler, then open the CREATE_COMPONENT webview.
 */
export function openCloudFormWebview(
	context: WICloudFormContext,
	submitHandler: (req: WICloudSubmitComponentsReq) => Promise<WICloudSubmitComponentsResp>,
): void {
	_pendingContext = context;
	_pendingSubmitHandler = submitHandler;
	StateMachine.openWebview(ViewType.CREATE_COMPONENT);
}

export function registerCloudRpcHandlers(messenger: Messenger): void {
	messenger.onRequest(getCloudFormContext, () => {
		const ctx = _pendingContext;
		if (!ctx) {
			throw new Error("No cloud form context available");
		}
		return ctx;
	});

	messenger.onRequest(submitComponents, async (req: WICloudSubmitComponentsReq) => {
		const handler = _pendingSubmitHandler;
		if (!handler) {
			throw new Error("No submit handler registered");
		}
		const resp = await handler(req);
		// Clear state after submission
		_pendingContext = null;
		_pendingSubmitHandler = null;
		return resp;
	});

	messenger.onNotification(closeCloudFormWebview, () => {
		_pendingContext = null;
		_pendingSubmitHandler = null;
		StateMachine.openWebview(ViewType.WELCOME);
	});

	// Auth state
	messenger.onRequest(getAuthState, (): AuthState => ext.authProvider?.state ?? { userInfo: null, region: "US" });

	// Context state
	messenger.onRequest(getContextState, () => contextStore.getState().state);

	// Local git data
	messenger.onRequest(getLocalGitData, async (dirPath: string) => {
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
	});

	// GitHub OAuth app flows
	messenger.onRequest(triggerGithubAuthFlow, async (orgId: string) => {
		const extName = webviewStateStore.getState().state?.extensionName;
		const baseUrl = extName === "Devant" ? ext.config?.devantConsoleUrl : ext.config?.choreoConsoleUrl;
		const callbackUrl = await env.asExternalUri(Uri.parse(`${env.uriScheme}://wso2.wso2-integrator/ghapp`));
		const state = Buffer.from(
			JSON.stringify({ origin: "vscode.wi.ext", orgId, callbackUri: callbackUrl.toString(), extensionName: extName }),
			"binary",
		).toString("base64");
		const ghURL = Uri.parse(
			`${ext.config?.ghApp.authUrl}?redirect_uri=${baseUrl}/ghapp&client_id=${ext.config?.ghApp.clientId}&state=${state}`,
		);
		await env.openExternal(ghURL);
	});

	messenger.onRequest(triggerGithubInstallFlow, async (orgId: string) => {
		const extName = webviewStateStore.getState().state?.extensionName;
		const callbackUrl = await env.asExternalUri(Uri.parse(`${env.uriScheme}://wso2.wso2-integrator/ghapp`));
		const state = Buffer.from(
			JSON.stringify({ origin: "vscode.wi.ext", orgId, callbackUri: callbackUrl.toString(), extensionName: extName }),
			"binary",
		).toString("base64");
		const ghURL = Uri.parse(`${ext.config?.ghApp.installUrl}?state=${state}`);
		await env.openExternal(ghURL);
	});

	// Push auth/context state changes to the webview as notifications
	ext.authProvider?.subscribe(({ state }) => {
		messenger.sendNotification(onAuthStateChanged, BROADCAST, state);
	});
	contextStore.subscribe(({ state }) => {
		messenger.sendNotification(onContextStateChanged, BROADCAST, state);
	});

	// Repo RPC methods
	messenger.onRequest(getBranches, (params) => ext.clients.rpcClient.getRepoBranches(params));

	messenger.onRequest(getAuthorizedGitOrgs, (params) => ext.clients.rpcClient.getAuthorizedGitOrgs(params));

	messenger.onRequest(getCredentials, async (params) => {
		const result = await ext.clients.rpcClient.getCredentials(params);
		return result ?? [];
	});

	messenger.onRequest(getCredentialDetails, (params) => ext.clients.rpcClient.getCredentialDetails(params));

	messenger.onRequest(getGitRepoMetadataBatch, async (params) =>
		window.withProgress(
			{ title: "Fetching repo metadata...", location: ProgressLocation.Notification },
			() => ext.clients.rpcClient.getGitRepoMetadataBatch(params),
		),
	);
}
