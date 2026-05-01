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

import { ViewType, Platform } from "../enums";
import type { SignInResult } from "./network-bridge.types";

export interface WebviewContext {
    currentView: ViewType;
    projectUri?: string;
    platform?: Platform;
    pathSeparator?: string;
    env?: {
        [key: string]: string | undefined;
    };
}

export interface RunCommandRequest {
    command: string;
    args?: any[];
}

export interface RunCommandResponse {
    success: boolean;
    result?: any;
    error?: string;
}

export interface RecentProjectItem {
    path: string;
    label: string;
    description?: string;
    isWorkspace?: boolean;
}

export interface GetRecentProjectsResponse {
    projects: RecentProjectItem[];
}

export interface FileOrDirResponse {
    path: string;
    isDirectory?: boolean;
}

export interface FileOrDirRequest {
    isFile?: boolean;
    startPath?: string;
}

export interface WorkspaceRootResponse {
    path: string;
}

export interface GetConfigurationRequest {
    section: string;
}

export interface GetConfigurationResponse {
    value: any;
}

export type ConfigurationScope = "global" | "workspace" | "workspaceFolder";

export interface SetConfigurationRequest {
    section: string;
    value: any;
    scope?: ConfigurationScope;
}

export interface GetSubFoldersRequest {
    path: string;
}

export interface GetSubFoldersResponse {
    folders: string[];
}

export interface ProjectDirResponse {
    path: string;
}

export interface GetSupportedMIVersionsResponse {
    versions: string[];
}

export interface CreateMiProjectRequest {
    directory: string;
    name: string;
    open: boolean;
    groupID?: string;
    artifactID?: string;
    version?: string;
    miVersion: string;
    isConsolidatedProject?: boolean;
    subProjects?: string[];
}

export interface CreateMiProjectResponse {
    filePath: string;
}

export interface CreateSiProjectRequest {
    directory: string;
    name: string;
    open: boolean;
}

export interface CreateSiProjectResponse {
    filePath: string;
}

export interface GettingStartedCategory {
    id: number;
    title: string;
    icon: string;
}

export interface SampleItem {
    displayName: string;
    description: string;
    componentType: string;
    buildPack: string;
    repositoryUrl: string;
    branch?: string;
    subDirectory?: string;
    componentPath: string;
    thumbnailPath: string;
    documentationPath?: string;
    applications?: string[];
    imageVersion?: string;
    tags?: string[];
    imageUrl?: string;
    defaultPackage?: string;
    bidirectional?: boolean;
}

export interface GettingStartedData {
    categories: GettingStartedCategory[];
    samples: SampleItem[];
    prebuiltIntegrations?: SampleItem[];
}

export interface SampleDownloadRequest {
    runtime: "WSO2: BI" | "WSO2: MI" | "WSO2: SI";
    itemType?: "sample" | "prebuilt";
    sampleItem?: SampleItem;
}

export interface BIProjectRequest {
    projectName?: string;
    packageName?: string;
    projectPath: string;
    createDirectory: boolean;
    createAsWorkspace?: boolean;
    workspaceName?: string;
    orgName?: string;
    orgHandle?: string;
    version?: string;
    isLibrary?: boolean;
    projectHandle?: string;
}

export interface SemanticVersion {
    major: number;
    minor: number;
    patch: number;
}

export interface MigrationTool {
    id: number;
    title: string;
    needToPull: boolean;
    commandName: string;
    description: string;
    requiredVersion: string;
    parameters: Array<{
        key: string;
        label: string;
        description: string;
        valueType: "boolean" | "string" | "number" | "enum";
        defaultValue?: boolean | string | number;
        options?: string[];
    }>;
}

export interface GetMigrationToolsResponse {
    tools: MigrationTool[];
}

export interface DownloadProgress {
    totalSize?: number;
    downloadedSize?: number;
    percentage?: number;
    success: boolean;
    message: string;
    step?: number;
}

export interface ImportIntegrationResponse {
    error: string;
    textEdits: {
        [key: string]: string;
    };
    report: string;
    jsonReport: string;
}

export interface MigrateRequest {
    project: BIProjectRequest;
    textEdits: {
        [key: string]: string;
    };
    projects?: ProjectMigrationResult[];
    aiFeatureUsed?: boolean;
    sourcePath?: string;
}

export interface PullMigrationToolRequest {
    toolName: string;
}

export interface ImportIntegrationWsRequest {
    commandName: string;
    packageName: string;
    sourcePath: string;
    orgName?: string;
    parameters?: Record<string, any>;
}

export interface ImportIntegrationRequest {
    packageName: string;
    orgName: string;
    sourcePath: string;
    parameters?: Record<string, any>;
}

export interface ShowErrorMessageRequest {
    message: string;
}

export interface MigrationToolStateData {
    state: string;
}

export interface MigrationToolLogData {
    log: string;
}

export interface OpenMigrationReportRequest {
    reportContent: string;
    fileName: string;
}

export interface SaveMigrationReportRequest {
    reportContent: string;
    defaultFileName: string;
    projectReports?: {
        [projectName: string]: string;
    };
}

export interface ProjectMigrationResult {
    projectName: string;
    textEdits: {
        [key: string]: string;
    };
    report: string;
}

export interface StoreSubProjectReportsRequest {
    reports: { [projectName: string]: string };
}

export interface FetchSamplesRequest {
    runtime?: "WSO2: BI" | "WSO2: MI" | "WSO2: SI";
}


export interface ValidateProjectFormRequest {
    projectPath: string;
    projectName: string;
    createDirectory: boolean;
    createAsWorkspace?: boolean;
}

export interface ValidateProjectFormResponse {
    isValid: boolean;
    errorMessage?: string;
    errorField?: ValidateProjectFormErrorField;
}

export enum ValidateProjectFormErrorField {
    PATH = 'path',
    NAME = 'name'
}

export interface SetWebviewCacheParams {
    cacheKey: string;
    data: unknown;
}

export interface DefaultOrgNameResponse {
    orgName: string;
}

// ── AI migration streaming event types (wizard) ──────────────────────────────
export interface WIChatStart { type: "start"; }
export interface WIChatContent { type: "content_block"; content: string; }
export interface WIChatReplace { type: "content_replace"; content: string; }
export interface WIChatStop { type: "stop"; }
export interface WIChatAbort { type: "abort"; }
export interface WIChatError { type: "error"; content: string; }
export interface WIToolCall { type: "tool_call"; toolName: string; toolInput?: Record<string, any>; toolCallId?: string; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface WIToolResult { type: "tool_result"; toolName: string; toolOutput?: any; toolCallId?: string; failed?: boolean; }
export type WIChatNotify =
    | WIChatStart
    | WIChatContent
    | WIChatReplace
    | WIToolCall
    | WIToolResult
    | WIChatStop
    | WIChatAbort
    | WIChatError;

export interface WIVisualizerAPI {
    getWebviewContext: () => Promise<WebviewContext>;
    getRecentProjects: () => Promise<GetRecentProjectsResponse>;
    closeWebview: () => void;
    openBiExtension: () => void;
    openMiExtension: () => void;
    openSettings: (settingKey: string) => void;
    runCommand: (params: RunCommandRequest) => Promise<RunCommandResponse>;
    selectFileOrDirPath: (params: FileOrDirRequest) => Promise<FileOrDirResponse>;
    selectFileOrFolderPath: () => Promise<FileOrDirResponse>;
    getWorkspaceRoot: () => Promise<WorkspaceRootResponse>;
    getConfiguration: (params: GetConfigurationRequest) => Promise<GetConfigurationResponse>;
    setConfiguration: (params: SetConfigurationRequest) => Promise<void>;
    getSupportedMIVersionsHigherThan: (version: string) => Promise<GetSupportedMIVersionsResponse>;
    getSubFolderNames: (params: GetSubFoldersRequest) => Promise<GetSubFoldersResponse>;
    askProjectDirPath: () => Promise<ProjectDirResponse>;
    createMiProject: (params: CreateMiProjectRequest) => Promise<CreateMiProjectResponse>;
    importProjectFromCapp: () => Promise<void>;
    createSiProject: (params: CreateSiProjectRequest) => Promise<CreateSiProjectResponse>;
    fetchSamplesFromGithub: (params: FetchSamplesRequest) => Promise<GettingStartedData>;
    downloadSelectedSampleFromGithub: (params: SampleDownloadRequest) => void;
    createBIProject: (params: BIProjectRequest) => Promise<void>;
    getMigrationTools: () => Promise<GetMigrationToolsResponse>;
    isSupportedSLVersion: (params: SemanticVersion) => Promise<boolean>;
    migrateProject: (params: MigrateRequest) => Promise<void>;
    pullMigrationTool: (params: PullMigrationToolRequest) => Promise<void>;
    importIntegration: (params: ImportIntegrationWsRequest) => Promise<ImportIntegrationResponse>;
    showErrorMessage: (params: ShowErrorMessageRequest) => Promise<void>;
    openMigrationReport: (params: OpenMigrationReportRequest) => Promise<void>;
    saveMigrationReport: (params: SaveMigrationReportRequest) => Promise<void>;
    storeSubProjectReports: (params: StoreSubProjectReportsRequest) => Promise<void>;
    validateProjectPath: (params: ValidateProjectFormRequest) => Promise<ValidateProjectFormResponse>;
    openFolder: (folderPath: string) => void;
    openExternal: (url: string) => void;
    setWebviewCache: (params: SetWebviewCacheParams) => Promise<void>;
    restoreWebviewCache: (cacheKey: string) => Promise<unknown>;
    clearWebviewCache: (cacheKey: string) => Promise<void>;
    getDefaultOrgName: () => Promise<DefaultOrgNameResponse>;
    getDefaultCreationPath: () => Promise<WorkspaceRootResponse>;
    wizardEnhancementReady: () => Promise<void>;
    openMigratedProject: () => Promise<void>;
    abortMigrationAgent: () => Promise<void>;
    checkAIAuth: () => Promise<boolean>;
    triggerAICopilotSignIn: () => Promise<SignInResult>;
    triggerAnthropicKeySignIn: (params: { apiKey: string }) => Promise<SignInResult>;
    triggerAwsBedrockSignIn: (params: { accessKeyId: string; secretAccessKey: string; region: string; sessionToken?: string }) => Promise<SignInResult>;
    triggerVertexAiSignIn: (params: { projectId: string; location: string; clientEmail: string; privateKey: string }) => Promise<SignInResult>;
    getBIRuntimeStatus: () => Promise<BIRuntimeStatusResponse>;
    initBIRuntimeContext: () => Promise<void>;
}

export interface BIRuntimeStatusResponse {
    isAvailable: boolean;
    status: string;
}
