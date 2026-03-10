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
    ShowErrorMessageRequest,
    StoreSubProjectReportsRequest,
    ValidateProjectFormRequest,
    ValidateProjectFormResponse,
    WebviewContext,
    WorkspaceRootResponse
} from "./webview-api.types";

export const WI_BRIDGE_EVENTS = {
    WS_RESPONSE: "wi.ws.response",
    STATE_CHANGED: "wi.event.stateChanged",
    DOWNLOAD_PROGRESS: "wi.event.downloadProgress",
    MIGRATION_TOOL_STATE_CHANGED: "wi.event.migrationToolStateChanged",
    MIGRATION_TOOL_LOGS: "wi.event.migrationToolLogs",
    MIGRATED_PROJECT: "wi.event.migratedProject",
} as const;

export interface WIWsMethodParamsMap {
    getWebviewContext: void;
    closeWebview: void;
    openBiExtension: void;
    openMiExtension: void;
    openSettings: string;
    runCommand: RunCommandRequest;
    selectFileOrDirPath: FileOrDirRequest;
    selectFileOrFolderPath: void;
    getWorkspaceRoot: void;
    getConfiguration: GetConfigurationRequest;
    getSupportedMIVersionsHigherThan: string;
    getSubFolderNames: GetSubFoldersRequest;
    askProjectDirPath: void;
    createMiProject: CreateMiProjectRequest;
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
}

export interface WIWsMethodResultMap {
    getWebviewContext: WebviewContext;
    closeWebview: void;
    openBiExtension: void;
    openMiExtension: void;
    openSettings: void;
    runCommand: RunCommandResponse;
    selectFileOrDirPath: FileOrDirResponse;
    selectFileOrFolderPath: FileOrDirResponse;
    getWorkspaceRoot: WorkspaceRootResponse;
    getConfiguration: GetConfigurationResponse;
    getSupportedMIVersionsHigherThan: GetSupportedMIVersionsResponse;
    getSubFolderNames: GetSubFoldersResponse;
    askProjectDirPath: ProjectDirResponse;
    createMiProject: CreateMiProjectResponse;
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

export type WIBridgeRequest = WIWsRequest;

export type WIBridgeResponse =
    | WIWsResponseMessage
    | WIStateChangedEvent
    | WIDownloadProgressEvent
    | WIMigrationToolStateChangedEvent
    | WIMigrationToolLogsEvent
    | WIMigratedProjectEvent;

export type WITransportMode = "proxy" | "websocket";

export interface WITransportBootstrap {
    mode: WITransportMode;
    wsServer: string;
    wsPort: number;
}
