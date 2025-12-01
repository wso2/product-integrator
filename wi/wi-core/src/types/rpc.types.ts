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
}

export interface BIProjectRequest {
    projectName: string;
    packageName: string;
    projectPath: string;
    createDirectory: boolean;
    orgName?: string;
    version?: string;
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
}

export interface PullMigrationToolRequest {
    toolName: string;
    version: string;
}

export interface ImportIntegrationRPCRequest {
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
}
