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

export type { AuthState, ContextStoreState, GetLocalGitDataResp, GetBranchesReq, GetAuthorizedGitOrgsReq, GetAuthorizedGitOrgsResp, GetCredentialsReq, CredentialItem, GetCredentialDetailsReq, GetGitMetadataReq, GetGitMetadataResp } from "@wso2/wso2-platform-core";
import type { AuthState, ContextStoreState, GetLocalGitDataResp, GetBranchesReq, GetAuthorizedGitOrgsReq, GetAuthorizedGitOrgsResp, GetCredentialsReq, CredentialItem, GetCredentialDetailsReq, GetGitMetadataReq, GetGitMetadataResp } from "@wso2/wso2-platform-core";

/**
 * A single component entry for the component creation form.
 * Contains only the data the webview needs — platform-core types stay in wi-extension.
 */
export interface WICloudComponentEntry {
	directoryFsPath: string;
	directoryName: string;
	/** Pre-generated unique component name (used as default display name). */
	componentName: string;
	/** Component type, e.g. "Service", "Automation". */
	componentType: string;
	componentSubType?: string;
	/** "Ballerina" or "MicroIntegrator". */
	buildPackLang: string;
	/** True when componentType is "Service" — controls "Use Default Endpoints" checkbox visibility. */
	isService: boolean;
}

/**
 * Context passed to the cloud component-form webview.
 */
export interface WICloudFormContext {
	orgName: string;
	projectName: string;
	/** "Choreo" or "Devant" */
	extensionName: string;
	components: WICloudComponentEntry[];
}

/**
 * Unified submit request — works for both single and batch creation.
 * Single creation is just a batch with one element.
 */
export interface WICloudSubmitComponentsReq {
	components: Array<{
		/** Index into WICloudFormContext.components */
		index: number;
		displayName: string;
		useDefaultEndpoints?: boolean;
	}>;
}

export interface WICloudSubmitComponentsResp {
	created: number;
	failed: number;
	total: number;
	errors?: Array<{ index: number; message: string }>;
}

export interface WICloudAPI {
	getCloudFormContext: () => Promise<WICloudFormContext>;
	submitComponents: (params: WICloudSubmitComponentsReq) => Promise<WICloudSubmitComponentsResp>;
	closeCloudFormWebview: () => void;
	// Auth
	getAuthState: () => Promise<AuthState>;
	onAuthStateChanged: (callback: (state: AuthState) => void) => void;
	// Context
	getContextState: () => Promise<ContextStoreState>;
	onContextStateChanged: (callback: (state: ContextStoreState) => void) => void;
	// Git
	getLocalGitData: (dirPath: string) => Promise<GetLocalGitDataResp | undefined>;
	// GitHub flows
	triggerGithubAuthFlow: (orgId: string) => Promise<void>;
	triggerGithubInstallFlow: (orgId: string) => Promise<void>;
	// Repo
	getBranches: (params: GetBranchesReq) => Promise<string[]>;
	getAuthorizedGitOrgs: (params: GetAuthorizedGitOrgsReq) => Promise<GetAuthorizedGitOrgsResp>;
	getCredentials: (params: GetCredentialsReq) => Promise<CredentialItem[]>;
	getCredentialDetails: (params: GetCredentialDetailsReq) => Promise<CredentialItem>;
	getGitRepoMetadataBatch: (params: GetGitMetadataReq[]) => Promise<GetGitMetadataResp[]>;
}
