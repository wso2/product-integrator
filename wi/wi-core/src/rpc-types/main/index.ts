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

import { RunCommandRequest, RunCommandResponse, FileOrDirRequest, FileOrDirResponse, WorkspaceRootResponse, GetConfigurationRequest, GetConfigurationResponse, GetSubFoldersRequest, GetSubFoldersResponse, ProjectDirResponse, GetSupportedMIVersionsResponse, GettingStartedData, SampleDownloadRequest, BIProjectRequest, CreateMiProjectRequest, CreateMiProjectResponse, GetMigrationToolsResponse, MigrateRequest, PullMigrationToolRequest, ImportIntegrationRPCRequest, ImportIntegrationResponse, ShowErrorMessageRequest, OpenMigrationReportRequest, SaveMigrationReportRequest, WebviewContext } from "../../types/rpc.types";

export * from "./rpc-type";
export * from "../../types/rpc.types";

export interface WIVisualizerAPI {
    getWebviewContext: () => Promise<WebviewContext>;
    closeWebview: () => void;
    openBiExtension: () => void;
    openMiExtension: () => void;
    runCommand: (params: RunCommandRequest) => Promise<RunCommandResponse>;
    selectFileOrDirPath: (params: FileOrDirRequest) => Promise<FileOrDirResponse>;
    selectFileOrFolderPath: () => Promise<FileOrDirResponse>;
    getWorkspaceRoot: () => Promise<WorkspaceRootResponse>;
    getConfiguration: (params: GetConfigurationRequest) => Promise<GetConfigurationResponse>;
    getSupportedMIVersionsHigherThan: (version: string) => Promise<GetSupportedMIVersionsResponse>;
    getSubFolderNames: (params: GetSubFoldersRequest) => Promise<GetSubFoldersResponse>;
    askProjectDirPath: () => Promise<ProjectDirResponse>;
    createMiProject: (params: CreateMiProjectRequest) => Promise<CreateMiProjectResponse>;
    fetchSamplesFromGithub: () => Promise<GettingStartedData>;
    downloadSelectedSampleFromGithub: (params: SampleDownloadRequest) => void;
    createBIProject: (params: BIProjectRequest) => Promise<void>;
    getMigrationTools: () => Promise<GetMigrationToolsResponse>;
    migrateProject: (params: MigrateRequest) => Promise<void>;
    pullMigrationTool: (params: PullMigrationToolRequest) => Promise<void>;
    importIntegration: (params: ImportIntegrationRPCRequest) => Promise<ImportIntegrationResponse>;
    showErrorMessage: (params: ShowErrorMessageRequest) => Promise<void>;
    openMigrationReport: (params: OpenMigrationReportRequest) => Promise<void>;
    saveMigrationReport: (params: SaveMigrationReportRequest) => Promise<void>;
}
