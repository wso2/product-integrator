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

import type { NotificationType, RequestType } from "vscode-messenger-common";
import type {
	AuthState,
	ContextStoreState,
	GetLocalGitDataResp,
	GetBranchesReq,
	GetAuthorizedGitOrgsReq,
	GetAuthorizedGitOrgsResp,
	GetCredentialsReq,
	CredentialItem,
	GetCredentialDetailsReq,
	GetGitMetadataReq,
	GetGitMetadataResp,
	IsRepoAuthorizedReq,
	IsRepoAuthorizedResp,
	GetConfigFileDriftsReq,
} from "@wso2/wso2-platform-core";
import type {
	WICloudFormContext,
	WICloudSubmitComponentsReq,
	WICloudSubmitComponentsResp,
} from "./interfaces";

const _prefix = "cloud";

export const getCloudFormContext: RequestType<void, WICloudFormContext> = {
	method: `${_prefix}/getCloudFormContext`,
};

export const submitComponents: RequestType<WICloudSubmitComponentsReq, WICloudSubmitComponentsResp> = {
	method: `${_prefix}/submitComponents`,
};

export const closeCloudFormWebview: NotificationType<void> = {
	method: `${_prefix}/closeCloudFormWebview`,
};

// Requests
export const getAuthState: RequestType<void, AuthState> = {
	method: `${_prefix}/getAuthState`,
};

export const getContextState: RequestType<void, ContextStoreState> = {
	method: `${_prefix}/getContextState`,
};

export const getLocalGitData: RequestType<string, GetLocalGitDataResp | undefined> = {
	method: `${_prefix}/getLocalGitData`,
};

export const hasDirtyRepo: RequestType<string, boolean> = {
	method: `${_prefix}/hasDirtyRepo`,
};

export const getConfigFileDrifts: RequestType<GetConfigFileDriftsReq, string[]> = {
	method: `${_prefix}/getConfigFileDrifts`,
};

export const triggerGithubAuthFlow: RequestType<string, void> = {
	method: `${_prefix}/triggerGithubAuthFlow`,
};

export const triggerGithubInstallFlow: RequestType<string, void> = {
	method: `${_prefix}/triggerGithubInstallFlow`,
};

export const getBranches: RequestType<GetBranchesReq, string[]> = {
	method: `${_prefix}/getBranches`,
};

export const getAuthorizedGitOrgs: RequestType<GetAuthorizedGitOrgsReq, GetAuthorizedGitOrgsResp> = {
	method: `${_prefix}/getAuthorizedGitOrgs`,
};

export const getCredentials: RequestType<GetCredentialsReq, CredentialItem[]> = {
	method: `${_prefix}/getCredentials`,
};

export const getCredentialDetails: RequestType<GetCredentialDetailsReq, CredentialItem> = {
	method: `${_prefix}/getCredentialDetails`,
};

export const getGitRepoMetadataBatch: RequestType<GetGitMetadataReq[], GetGitMetadataResp[]> = {
	method: `${_prefix}/getGitRepoMetadataBatch`,
};

export const isRepoAuthorized: RequestType<IsRepoAuthorizedReq, IsRepoAuthorizedResp> = {
	method: `${_prefix}/isRepoAuthorized`,
};

export const getConsoleUrl: RequestType<void, string> = {
	method: `${_prefix}/getConsoleUrl`,
};

// Notifications
export const onAuthStateChanged: NotificationType<AuthState> = {
	method: `${_prefix}/onAuthStateChanged`,
};

export const onContextStateChanged: NotificationType<ContextStoreState> = {
	method: `${_prefix}/onContextStateChanged`,
};