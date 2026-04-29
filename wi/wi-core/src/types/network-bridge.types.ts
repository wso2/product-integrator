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

import {
    BIProjectRequest,
    BIRuntimeStatusResponse,
    CreateMiProjectRequest,
    CreateMiProjectResponse,
    CreateSiProjectRequest,
    CreateSiProjectResponse,
    DownloadProgress,
    FetchSamplesRequest,
    FileOrDirRequest,
    FileOrDirResponse,
    GetConfigurationRequest,
    GetConfigurationResponse,
    GetRecentProjectsResponse,
    SetConfigurationRequest,
    GetMigrationToolsResponse,
    GetSubFoldersRequest,
    GetSubFoldersResponse,
    GetSupportedMIVersionsResponse,
    GettingStartedData,
    ImportIntegrationWsRequest,
    ImportIntegrationResponse,
    MigrateRequest,
    MigrationToolLogData,
    MigrationToolStateData,
    OpenMigrationReportRequest,
    ProjectDirResponse,
    ProjectMigrationResult,
    PullMigrationToolRequest,
    RunCommandRequest,
    RunCommandResponse,
    SampleDownloadRequest,
    SaveMigrationReportRequest,
    SemanticVersion,
    SetWebviewCacheParams,
    ShowErrorMessageRequest,
    StoreSubProjectReportsRequest,
    ValidateProjectFormRequest,
    ValidateProjectFormResponse,
    WebviewContext,
    WorkspaceRootResponse,
    DefaultOrgNameResponse,
    WIChatNotify
} from "./webview-api.types";
import type {
    AuthState,
    ContextStoreState,
    CloneRepositoryIntoCompDirReq,
    CredentialItem,
    GetAuthorizedGitOrgsReq,
    GetAuthorizedGitOrgsResp,
    GetBranchesReq,
    GetConfigFileDriftsReq,
    GetCredentialDetailsReq,
    GetCredentialsReq,
    GetGitMetadataReq,
    GetGitMetadataResp,
    GetLocalGitDataResp,
    IsRepoAuthorizedReq,
    IsRepoAuthorizedResp,
    WICloudFormContext,
    WICloudSubmitComponentsReq,
    WICloudSubmitComponentsResp,
    GetCloudProjectsReq,
    GetCloudProjectsResp,
} from "./cloud.types";

export interface SignInResult {
    success: boolean;
    error?: string;
}

export const WI_BRIDGE_EVENTS = {
    WS_RESPONSE: "wi.ws.response",
    STATE_CHANGED: "wi.event.stateChanged",
    DOWNLOAD_PROGRESS: "wi.event.downloadProgress",
    MIGRATION_TOOL_STATE_CHANGED: "wi.event.migrationToolStateChanged",
    MIGRATION_TOOL_LOGS: "wi.event.migrationToolLogs",
    MIGRATED_PROJECT: "wi.event.migratedProject",
    // ── Cloud events ──────────────────────────────────────────
    AUTH_STATE_CHANGED: "wi.event.authStateChanged",
    CONTEXT_STATE_CHANGED: "wi.event.contextStateChanged",
    CLONE_PROGRESS: "wi.event.cloneProgress",
    SIGN_IN_INITIATED: "wi.event.signInInitiated",
    // ── AI migration streaming ────────────────────────────────
    CHAT_NOTIFY: "wi.event.chatNotify",
} as const;

/** Granular stages emitted by the clone-project command so the webview can show accurate progress. */
export type CloneProgressStage = "selecting_folder" | "fetching_components" | "selecting_component" | "cloning";

export interface WIWsMethodParamsMap {
    getWebviewContext: void;
    getRecentProjects: void;
    closeWebview: void;
    openBiExtension: void;
    openMiExtension: void;
    openSettings: string;
    runCommand: RunCommandRequest;
    selectFileOrDirPath: FileOrDirRequest;
    selectFileOrFolderPath: void;
    getWorkspaceRoot: void;
    getConfiguration: GetConfigurationRequest;
    setConfiguration: SetConfigurationRequest;
    getSupportedMIVersionsHigherThan: string;
    getSubFolderNames: GetSubFoldersRequest;
    askProjectDirPath: void;
    createMiProject: CreateMiProjectRequest;
    importProjectFromCapp: void;
    createSiProject: CreateSiProjectRequest;
    fetchSamplesFromGithub: FetchSamplesRequest;
    downloadSelectedSampleFromGithub: SampleDownloadRequest;
    createBIProject: BIProjectRequest;
    getMigrationTools: void;
    isSupportedSLVersion: SemanticVersion;
    migrateProject: MigrateRequest;
    pullMigrationTool: PullMigrationToolRequest;
    importIntegration: ImportIntegrationWsRequest;
    showErrorMessage: ShowErrorMessageRequest;
    openMigrationReport: OpenMigrationReportRequest;
    saveMigrationReport: SaveMigrationReportRequest;
    storeSubProjectReports: StoreSubProjectReportsRequest;
    validateProjectPath: ValidateProjectFormRequest;
    openFolder: string;
    openExternal: string;
    setWebviewCache: SetWebviewCacheParams;
    restoreWebviewCache: string;
    clearWebviewCache: string;
    getDefaultOrgName: void;
    getDefaultCreationPath: void;
    wizardEnhancementReady: void;
    openMigratedProject: void;
    abortMigrationAgent: void; checkAIAuth: void;
    triggerAICopilotSignIn: void;
    triggerAnthropicKeySignIn: { apiKey: string };
    triggerAwsBedrockSignIn: { accessKeyId: string; secretAccessKey: string; region: string; sessionToken?: string };
    triggerVertexAiSignIn: { projectId: string; location: string; clientEmail: string; privateKey: string };
    getBIRuntimeStatus: void;
    initBIRuntimeContext: void;
    // ── Cloud methods ─────────────────────────────────────────
    getCloudFormContext: void;
    submitComponents: WICloudSubmitComponentsReq;
    closeCloudFormWebview: void;
    getAuthState: void;
    getContextState: void;
    changeOrgContext: string;
    getLocalGitData: string;
    hasDirtyRepo: string;
    getConfigFileDrifts: GetConfigFileDriftsReq;
    triggerGithubAuthFlow: string;
    triggerGithubInstallFlow: string;
    getBranches: GetBranchesReq;
    getAuthorizedGitOrgs: GetAuthorizedGitOrgsReq;
    getCredentials: GetCredentialsReq;
    getCredentialDetails: GetCredentialDetailsReq;
    isRepoAuthorized: IsRepoAuthorizedReq;
    getGitRepoMetadata: GetGitMetadataReq;
    cloneRepositoryIntoCompDir: CloneRepositoryIntoCompDirReq;
    getConsoleUrl: void;
    getCloudProjects: GetCloudProjectsReq;
}

export interface WIWsMethodResultMap {
    getWebviewContext: WebviewContext;
    getRecentProjects: GetRecentProjectsResponse;
    closeWebview: void;
    openBiExtension: void;
    openMiExtension: void;
    openSettings: void;
    runCommand: RunCommandResponse;
    selectFileOrDirPath: FileOrDirResponse;
    selectFileOrFolderPath: FileOrDirResponse;
    getWorkspaceRoot: WorkspaceRootResponse;
    getConfiguration: GetConfigurationResponse;
    setConfiguration: void;
    getSupportedMIVersionsHigherThan: GetSupportedMIVersionsResponse;
    getSubFolderNames: GetSubFoldersResponse;
    askProjectDirPath: ProjectDirResponse;
    createMiProject: CreateMiProjectResponse;
    importProjectFromCapp: void;
    createSiProject: CreateSiProjectResponse;
    fetchSamplesFromGithub: GettingStartedData;
    downloadSelectedSampleFromGithub: void;
    createBIProject: void;
    getMigrationTools: GetMigrationToolsResponse;
    isSupportedSLVersion: boolean;
    migrateProject: void;
    pullMigrationTool: void;
    importIntegration: ImportIntegrationResponse;
    showErrorMessage: void;
    openMigrationReport: void;
    saveMigrationReport: void;
    storeSubProjectReports: void;
    validateProjectPath: ValidateProjectFormResponse;
    openFolder: void;
    openExternal: void;
    setWebviewCache: void;
    restoreWebviewCache: unknown;
    clearWebviewCache: void;
    getDefaultOrgName: DefaultOrgNameResponse;
    getDefaultCreationPath: WorkspaceRootResponse;
    wizardEnhancementReady: void;
    openMigratedProject: void;
    abortMigrationAgent: void; checkAIAuth: boolean;
    triggerAICopilotSignIn: SignInResult;
    triggerAnthropicKeySignIn: SignInResult;
    triggerAwsBedrockSignIn: SignInResult;
    triggerVertexAiSignIn: SignInResult;
    getBIRuntimeStatus: BIRuntimeStatusResponse;
    initBIRuntimeContext: void;
    // ── Cloud methods ─────────────────────────────────────────
    getCloudFormContext: WICloudFormContext;
    submitComponents: WICloudSubmitComponentsResp;
    closeCloudFormWebview: void;
    getAuthState: AuthState;
    getContextState: ContextStoreState;
    changeOrgContext: void;
    getLocalGitData: GetLocalGitDataResp | undefined;
    hasDirtyRepo: boolean;
    getConfigFileDrifts: string[];
    triggerGithubAuthFlow: void;
    triggerGithubInstallFlow: void;
    getBranches: string[];
    getAuthorizedGitOrgs: GetAuthorizedGitOrgsResp;
    getCredentials: CredentialItem[];
    getCredentialDetails: CredentialItem;
    isRepoAuthorized: IsRepoAuthorizedResp;
    getGitRepoMetadata: GetGitMetadataResp;
    cloneRepositoryIntoCompDir: string;
    getConsoleUrl: string;
    getCloudProjects: GetCloudProjectsResp;
}

export type WIWsMethod = keyof WIWsMethodParamsMap;

export type WIWsRequest = {
    [K in WIWsMethod]: WIWsMethodParamsMap[K] extends void
    ? { action: K }
    : { action: K; params: WIWsMethodParamsMap[K] };
}[WIWsMethod];

export type WIWsSuccessResponseMessage = {
    [K in WIWsMethod]: {
        type: typeof WI_BRIDGE_EVENTS.WS_RESPONSE;
        action: K;
        success: true;
        result: WIWsMethodResultMap[K];
    };
}[WIWsMethod];

export interface WIWsErrorResponseMessage {
    type: typeof WI_BRIDGE_EVENTS.WS_RESPONSE;
    action: WIWsMethod;
    success: false;
    error?: string;
}

export type WIWsResponseMessage = WIWsSuccessResponseMessage | WIWsErrorResponseMessage;

export interface WIStateChangedEvent {
    type: typeof WI_BRIDGE_EVENTS.STATE_CHANGED;
    context: WebviewContext;
}

export interface WIDownloadProgressEvent {
    type: typeof WI_BRIDGE_EVENTS.DOWNLOAD_PROGRESS;
    progress: DownloadProgress;
}

export interface WIMigrationToolStateChangedEvent {
    type: typeof WI_BRIDGE_EVENTS.MIGRATION_TOOL_STATE_CHANGED;
    state: MigrationToolStateData;
}

export interface WIMigrationToolLogsEvent {
    type: typeof WI_BRIDGE_EVENTS.MIGRATION_TOOL_LOGS;
    log: MigrationToolLogData;
}

export interface WIMigratedProjectEvent {
    type: typeof WI_BRIDGE_EVENTS.MIGRATED_PROJECT;
    project: ProjectMigrationResult;
}

// ── Cloud event interfaces ────────────────────────────────
export interface WIAuthStateChangedEvent {
    type: typeof WI_BRIDGE_EVENTS.AUTH_STATE_CHANGED;
    state: AuthState;
}

export interface WIContextStateChangedEvent {
    type: typeof WI_BRIDGE_EVENTS.CONTEXT_STATE_CHANGED;
    state: ContextStoreState;
}

export interface WICloneProgressEvent {
    type: typeof WI_BRIDGE_EVENTS.CLONE_PROGRESS;
    stage: CloneProgressStage;
}

export interface WISignInInitiatedEvent {
    type: typeof WI_BRIDGE_EVENTS.SIGN_IN_INITIATED;
}

export interface WIChatNotifyEvent {
    type: typeof WI_BRIDGE_EVENTS.CHAT_NOTIFY;
    event: WIChatNotify;
}

export type WIBridgeRequest = WIWsRequest;

export type WIBridgeResponse =
    | WIWsResponseMessage
    | WIStateChangedEvent
    | WIDownloadProgressEvent
    | WIMigrationToolStateChangedEvent
    | WIMigrationToolLogsEvent
    | WIMigratedProjectEvent
    | WIAuthStateChangedEvent
    | WIContextStateChangedEvent
    | WICloneProgressEvent
    | WISignInInitiatedEvent
    | WIChatNotifyEvent;

export type WITransportMode = "proxy" | "websocket";

export interface WITransportBootstrap {
    mode: WITransportMode;
    wsServer: string;
    wsPort: number;
}
