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

import {
	type AuthState,
	type ContextStoreState,
	type GetLocalGitDataResp,
	type WICloudAPI,
	type WICloudFormContext,
	type WICloudSubmitComponentsReq,
	type WICloudSubmitComponentsResp,
	type GetBranchesReq,
	type GetAuthorizedGitOrgsReq,
	type GetAuthorizedGitOrgsResp,
	type GetCredentialsReq,
	type CredentialItem,
	type GetCredentialDetailsReq,
	closeCloudFormWebview,
	getAuthState,
	getCloudFormContext,
	getContextState,
	getLocalGitData,
	hasDirtyRepo,
	onAuthStateChanged,
	onContextStateChanged,
	submitComponents,
	triggerGithubAuthFlow,
	triggerGithubInstallFlow,
	getBranches,
	getAuthorizedGitOrgs,
	getCredentials,
	getCredentialDetails,
	isRepoAuthorized,
	IsRepoAuthorizedReq,
	IsRepoAuthorizedResp,
	getConsoleUrl,
	getConfigFileDrifts,
	GetConfigFileDriftsReq,
} from "@wso2/wi-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class CloudRpcClient implements WICloudAPI {
	constructor(private readonly _messenger: Messenger) {}

	getCloudFormContext(): Promise<WICloudFormContext> {
		return this._messenger.sendRequest(getCloudFormContext, HOST_EXTENSION);
	}

	submitComponents(params: WICloudSubmitComponentsReq): Promise<WICloudSubmitComponentsResp> {
		return this._messenger.sendRequest(submitComponents, HOST_EXTENSION, params);
	}

	closeCloudFormWebview(): void {
		this._messenger.sendNotification(closeCloudFormWebview, HOST_EXTENSION);
	}

	getAuthState(): Promise<AuthState> {
		return this._messenger.sendRequest(getAuthState, HOST_EXTENSION);
	}

	onAuthStateChanged(callback: (state: AuthState) => void): void {
		this._messenger.onNotification(onAuthStateChanged, callback);
	}

	getContextState(): Promise<ContextStoreState> {
		return this._messenger.sendRequest(getContextState, HOST_EXTENSION);
	}

	onContextStateChanged(callback: (state: ContextStoreState) => void): void {
		this._messenger.onNotification(onContextStateChanged, callback);
	}

	getLocalGitData(dirPath: string): Promise<GetLocalGitDataResp | undefined> {
		return this._messenger.sendRequest(getLocalGitData, HOST_EXTENSION, dirPath);
	}

	hasDirtyRepo(dirPath: string): Promise<boolean> {
		return this._messenger.sendRequest(hasDirtyRepo, HOST_EXTENSION, dirPath);
	}

	getConfigFileDrifts(params: GetConfigFileDriftsReq): Promise<string[]> {
		return this._messenger.sendRequest(getConfigFileDrifts, HOST_EXTENSION, params);
	}

	triggerGithubAuthFlow(orgId: string): Promise<void> {
		return this._messenger.sendRequest(triggerGithubAuthFlow, HOST_EXTENSION, orgId);
	}

	triggerGithubInstallFlow(orgId: string): Promise<void> {
		return this._messenger.sendRequest(triggerGithubInstallFlow, HOST_EXTENSION, orgId);
	}

	getBranches(params: GetBranchesReq): Promise<string[]> {
		return this._messenger.sendRequest(getBranches, HOST_EXTENSION, params);
	}

	getAuthorizedGitOrgs(params: GetAuthorizedGitOrgsReq): Promise<GetAuthorizedGitOrgsResp> {
		return this._messenger.sendRequest(getAuthorizedGitOrgs, HOST_EXTENSION, params);
	}

	isRepoAuthorized(params: IsRepoAuthorizedReq): Promise<IsRepoAuthorizedResp> {
		return this._messenger.sendRequest(isRepoAuthorized, HOST_EXTENSION, params);
	}

	getCredentials(params: GetCredentialsReq): Promise<CredentialItem[]> {
		return this._messenger.sendRequest(getCredentials, HOST_EXTENSION, params);
	}

	getCredentialDetails(params: GetCredentialDetailsReq): Promise<CredentialItem> {
		return this._messenger.sendRequest(getCredentialDetails, HOST_EXTENSION, params);
	}

	getConsoleUrl(): Promise<string> {
		return this._messenger.sendRequest(getConsoleUrl, HOST_EXTENSION);
	}
}
