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

export type { AuthState, ContextStoreState, GetLocalGitDataResp, GetBranchesReq, GetAuthorizedGitOrgsReq, GetAuthorizedGitOrgsResp, GetCredentialsReq, CredentialItem, GetCredentialDetailsReq, GetGitMetadataReq, GetGitMetadataResp, IsRepoAuthorizedReq, IsRepoAuthorizedResp, GetConfigFileDriftsReq, CloneRepositoryIntoCompDirReq } from "@wso2/wso2-platform-core";
import type { AuthState, ContextStoreState, GetLocalGitDataResp, GetBranchesReq, GetAuthorizedGitOrgsReq, GetAuthorizedGitOrgsResp, GetCredentialsReq, CredentialItem, GetCredentialDetailsReq, GetGitMetadataReq, GetGitMetadataResp, Organization, Project, IsRepoAuthorizedReq, IsRepoAuthorizedResp, GetConfigFileDriftsReq, CloneRepositoryIntoCompDirReq, ComponentKind, CreateComponentReq, ICreateNewIntegrationCmdIntegrations } from "@wso2/wso2-platform-core";



/**
 * Context passed to the cloud component-form webview.
 */
export interface WICloudFormContext {
	org: Organization;
	project: Project;
	workspaceFsPath: string;
	isNewCodeServerComp: boolean;
	buildPackLang: "ballerina" | "microintegrator";
	integrations: ICreateNewIntegrationCmdIntegrations[];
}

/**
 * Unified submit request — works for both single and batch creation.
 * Single creation is just a batch with one element.
 */
export interface WICloudSubmitComponentsReq {
	org: Organization;
	project: Project;
	workspaceFsPath: string;
	createParams: CreateComponentReq[];
}

export interface WICloudSubmitComponentsResp {
	created: ComponentKind[];
	/** Failed component names with error messages */
	failed: Array<{
		name: string;
		error: string;
	}>;
	/** Total components attempted */
	total: number;
}

export interface GetCloudProjectsReq {
	orgId: string;
	orgHandle: string;
}

export interface GetCloudProjectsResp {
	projects: Array<Project>;
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
	hasDirtyRepo: (dirPath: string) => Promise<boolean>;
	getConfigFileDrifts: (params: GetConfigFileDriftsReq) => Promise<string[]>;
	// GitHub flows
	triggerGithubAuthFlow: (orgId: string) => Promise<void>;
	triggerGithubInstallFlow: (orgId: string) => Promise<void>;
	// Repo
	getBranches: (params: GetBranchesReq) => Promise<string[]>;
	getAuthorizedGitOrgs: (params: GetAuthorizedGitOrgsReq) => Promise<GetAuthorizedGitOrgsResp>;
	getCredentials: (params: GetCredentialsReq) => Promise<CredentialItem[]>;
	getCredentialDetails: (params: GetCredentialDetailsReq) => Promise<CredentialItem>;
	isRepoAuthorized: (params: IsRepoAuthorizedReq) => Promise<IsRepoAuthorizedResp>;
	// Repo metadata & clone
	getGitRepoMetadata: (params: GetGitMetadataReq) => Promise<GetGitMetadataResp>;
	cloneRepositoryIntoCompDir: (params: CloneRepositoryIntoCompDirReq) => Promise<string>;
	// Config
	getConsoleUrl: () => Promise<string>;
	// Projects
	getCloudProjects: (params: GetCloudProjectsReq) => Promise<GetCloudProjectsResp>;
}
