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

export interface FileOrDirResponse {
    path: string;
}

export interface FileOrDirRequest {
    isFile?: boolean;
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

export interface GettingStartedSample {
    category: number;
    priority: number;
    title: string;
    description: string;
    zipFileName: string;
    isAvailable?: boolean;
}

export interface GettingStartedCategory {
    id: number;
    title: string;
    icon: string;
}

export interface GettingStartedData {
    categories: GettingStartedCategory[];
    samples: GettingStartedSample[];
}

export interface SampleDownloadRequest {
    zipFileName: string;
    runtime: "WSO2: BI" | "WSO2: MI" | "WSO2: SI";
}

export interface BIProjectRequest {
    projectName: string;
    packageName: string;
    projectPath: string;
    createDirectory: boolean;
    createAsWorkspace?: boolean;
    workspaceName?: string;
    orgName?: string;
    version?: string;
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
}

export interface PullMigrationToolRequest {
    toolName: string;
    version: string;
}

export interface ImportIntegrationWsRequest {
    commandName: string;
    packageName: string;
    sourcePath: string;
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

export interface BISampleItem {
    id: string;
    category: string;
    title: string;
    description: string;
    icon: string;
    isEnabled: boolean;
}
export interface ValidateProjectFormRequest {
    projectPath: string;
    projectName: string;
    createDirectory: boolean;
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

export interface WIVisualizerAPI {
    getWebviewContext: () => Promise<WebviewContext>;
    closeWebview: () => void;
    openBiExtension: () => void;
    openMiExtension: () => void;
    openSettings: (settingKey: string) => void;
    runCommand: (params: RunCommandRequest) => Promise<RunCommandResponse>;
    selectFileOrDirPath: (params: FileOrDirRequest) => Promise<FileOrDirResponse>;
    selectFileOrFolderPath: () => Promise<FileOrDirResponse>;
    getWorkspaceRoot: () => Promise<WorkspaceRootResponse>;
    getConfiguration: (params: GetConfigurationRequest) => Promise<GetConfigurationResponse>;
    getSupportedMIVersionsHigherThan: (version: string) => Promise<GetSupportedMIVersionsResponse>;
    getSubFolderNames: (params: GetSubFoldersRequest) => Promise<GetSubFoldersResponse>;
    askProjectDirPath: () => Promise<ProjectDirResponse>;
    createMiProject: (params: CreateMiProjectRequest) => Promise<CreateMiProjectResponse>;
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
}
