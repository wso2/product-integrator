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

import type { AgentMcpConfig, AgentModelConfig, AuthStatus, Component, ContextStoreState, Project, RepoPathInspection } from "@wso2/wso2-cloud-client";
import type { GetLocalGitDataResp, ICreateNewIntegrationCmdIntegrations } from "@wso2/wso2-platform-core";

export type { Component, ContextStoreState, Project } from "@wso2/wso2-cloud-client";
export type { GetLocalGitDataResp, GetConfigFileDriftsReq } from "@wso2/wso2-platform-core";

/** The organization the session is bound to, as the webviews read it. */
export interface CloudOrganization {
	/** The organization's id (the token's `ouId`). */
	id: string;
	uuid?: string;
	handle: string;
	name: string;
}

/** The signed-in person, in the shape the webviews were written against. */
export interface CloudUserInfo {
	userId: string;
	displayName: string;
	userEmail: string;
	userProfilePictureUrl?: string;
	/** Always one entry: a session is bound to one organization. */
	organizations: CloudOrganization[];
}

/** The auth state the webview bridge publishes. */
export interface AuthState {
	userInfo: CloudUserInfo | null;
	status: AuthStatus;
	selectedOrgId?: string;
}

/**
 * Context passed to the cloud component-form webview.
 */
export interface WICloudFormContext {
	org: CloudOrganization;
	project: Project;
	workspaceFsPath: string;
	isNewCodeServerComp: boolean;
	buildPackLang: "ballerina" | "microintegrator";
	integrations: ICreateNewIntegrationCmdIntegrations[];
}

/** One integration the deploy form asks the platform to create. */
export interface WICloudCreateIntegrationParam {
	/** The directory of the integration on disk. */
	componentDir: string;
	displayName: string;
	/** The resource name, derived from the display name. */
	name: string;
	/** The integration scope the form picked (`DevantScopes`), mapped to a platform type by the extension. */
	integrationType: string;
	buildPackLang: "ballerina" | "microintegrator";
	repoUrl: string;
	branch: string;
	gitProvider: string;
	gitCredRef?: string;
	/** For an AI agent: the LLM providers and MCP servers Agent Manager attaches. */
	modelConfig?: AgentModelConfig[];
	mcpConfig?: AgentMcpConfig[];
}

/**
 * Unified submit request — works for both single and batch creation.
 * Single creation is just a batch with one element.
 */
export interface WICloudSubmitComponentsReq {
	org: CloudOrganization;
	project: Project;
	workspaceFsPath: string;
	createParams: WICloudCreateIntegrationParam[];
}

export interface WICloudSubmitComponentsResp {
	created: Component[];
	/** Failed integration names with error messages */
	failed: Array<{
		name: string;
		error: string;
	}>;
	/** Total integrations attempted */
	total: number;
}

export interface GetCloudProjectsReq {
	orgId: string;
	orgHandle: string;
}

export interface GetCloudProjectsResp {
	projects: Array<Project>;
}

export interface GetBranchesReq {
	repoUrl: string;
	/** Unused on the platform; kept so the form need not change. */
	credRef?: string;
	orgId?: string;
}

export interface IsRepoAuthorizedReq {
	repoUrl: string;
	credRef?: string;
	orgId?: string;
}

export interface IsRepoAuthorizedResp {
	retrievedRepos: boolean;
	isAccessible: boolean;
}

export interface GetAuthorizedGitOrgsReq {
	orgId?: string;
	provider: string;
	credential?: string;
}

export interface GitOrganization {
	orgName: string;
	orgHandler: string;
	repositories: { name: string }[];
}

export interface GetAuthorizedGitOrgsResp {
	gitOrgs: GitOrganization[];
}

export interface GetCredentialsReq {
	orgId?: string;
	orgUuid?: string;
}

export interface GetCredentialDetailsReq extends GetCredentialsReq {
	credentialId: string;
}

export interface CredentialItem {
	id: string;
	name: string;
	type: string;
	serverUrl?: string;
}

export interface GetGitMetadataReq {
	branch: string;
	gitOrgName: string;
	gitRepoName: string;
	relativePath: string;
	orgId?: string;
	secretRef?: string;
}

export interface GetGitMetadataResp {
	metadata: RepoPathInspection & { isValidRepo: boolean; hasBallerinaTomlInPath: boolean; hasPomXmlInPath: boolean; hasDockerfileInPath: boolean };
}

export interface CloneRepositoryIntoCompDirReq {
	cwd: string;
	subpath: string;
	org: CloudOrganization;
	componentName: string;
	repo: {
		provider: string;
		orgName: string;
		orgHandler: string;
		repo: string;
		serverUrl?: string;
		branch: string;
		secretRef?: string;
		isBareRepo: boolean;
	};
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
	getConfigFileDrifts: (params: import("@wso2/wso2-platform-core").GetConfigFileDriftsReq) => Promise<string[]>;
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

/** Commands another extension's deploy UI drives; WSO2 Integrator runs the same steps as its deploy form. */
export const WICloudDeployCommands = {
	/** The project, its integrations' suggested names and the integration types, read without prompting. */
	GetDeployContext: "wso2.integrator.cloud.integration.getDeployContext",
	/** The repository checks the deploy form shows as a banner. */
	InspectSource: "wso2.integrator.cloud.integration.inspectSource",
	/** Runs the deploy form's submit for one integration. */
	Deploy: "wso2.integrator.cloud.integration.deploy",
	/** Deploys an integration's latest successful build to its project's entry environment. */
	DeployBuild: "wso2.integrator.cloud.integration.deployBuild",
} as const;

export interface WICloudDeployContextReq {
	/** A workspace whose context file names a project that does not exist yet; it is created, as a deploy does. */
	workspaceDir?: string;
	integrations: { fsPath: string; name: string; supportedIntegrationTypes: string[] }[];
}

export interface WICloudDeployContext {
	signedIn: boolean;
	/** The project the workspace is linked to, which the deploy form uses without asking. */
	linkedProject?: { id: string; name: string };
	projects: { id: string; name: string }[];
	/** The integrations with names no integration of the linked project already uses. */
	integrations: { fsPath: string; name: string; supportedIntegrationTypes: string[] }[];
}

export interface WICloudInspectSourceReq {
	workspaceDir: string;
	gitRemote?: string;
	branch?: string;
}

export interface WICloudInspectSourceResp {
	remotes: string[];
	gitRemote: string | null;
	gitProvider: string | null;
	branches: string[];
	branch: string | null;
	readiness: import("../source-readiness").SourceReadiness;
}

export interface WICloudDeployReq {
	workspaceDir: string;
	buildPackLang: "ballerina" | "microintegrator";
	integration: {
		fsPath: string;
		displayName: string;
		integrationType: string;
		modelConfig?: AgentModelConfig[];
		mcpConfig?: AgentMcpConfig[];
	};
	/** An existing project's id, or the display name of a project to create. */
	project: { id: string } | { newName: string };
	gitRemote: string;
	branch: string;
}

export interface WICloudDeployBuildReq {
	integrationId: string;
	projectId: string;
}

export interface WICloudDeployBuildResp {
	success: boolean;
	message?: string;
}

export type WICloudDeployResp =
	| ({ outcome: "submitted" } & WICloudSubmitComponentsResp)
	/** An integration already builds this directory and the person chose not to create another. */
	| { outcome: "linkedExisting" }
	| { outcome: "cancelled" }
	| { outcome: "failed"; message: string };
