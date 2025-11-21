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
 * 
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */
import { RunCommandRequest, RunCommandResponse, FileOrDirRequest, FileOrDirResponse, WorkspaceRootResponse, GetConfigurationRequest, GetConfigurationResponse, GetSubFoldersRequest, GetSubFoldersResponse, ProjectDirResponse, GetSupportedMIVersionsResponse, GettingStartedData, SampleDownloadRequest, BIProjectRequest, CreateMiProjectRequest, CreateMiProjectResponse, DownloadProgress, GetMigrationToolsResponse, MigrateRequest, PullMigrationToolRequest, ImportIntegrationRPCRequest, ImportIntegrationResponse, ShowErrorMessageRequest, MigrationToolStateData, MigrationToolLogData, OpenMigrationReportRequest, SaveMigrationReportRequest } from "../../types/rpc.types";
import { NotificationType, RequestType } from "vscode-messenger-common";

const _preFix = "main";
export const closeWebview: NotificationType<void> = { method: `${_preFix}/closeWebview` };
export const openBiExtension: NotificationType<void> = { method: `${_preFix}/openBiExtension` };
export const openMiExtension: NotificationType<void> = { method: `${_preFix}/openMiExtension` };
export const runCommand: RequestType<RunCommandRequest, RunCommandResponse> = { method: `${_preFix}/runCommand` };
export const selectFileOrDirPath: RequestType<FileOrDirRequest, FileOrDirResponse> = { method: `${_preFix}/selectFileOrDirPath` };
export const selectFileOrFolderPath: RequestType<void, FileOrDirResponse> = { method: `${_preFix}/selectFileOrFolderPath` };
export const getWorkspaceRoot: RequestType<void, WorkspaceRootResponse> = { method: `${_preFix}/getWorkspaceRoot` };
export const getConfiguration: RequestType<GetConfigurationRequest, GetConfigurationResponse> = { method: `${_preFix}/getConfiguration` };
export const getSupportedMIVersionsHigherThan: RequestType<string, GetSupportedMIVersionsResponse> = { method: `${_preFix}/getSupportedMIVersionsHigherThan` };
export const getSubFolderNames: RequestType<GetSubFoldersRequest, GetSubFoldersResponse> = { method: `${_preFix}/getSubFolderNames` };
export const askProjectDirPath: RequestType<void, ProjectDirResponse> = { method: `${_preFix}/askProjectDirPath` };
export const createMiProject: RequestType<CreateMiProjectRequest, CreateMiProjectResponse> = { method: `${_preFix}/createMiProject` };
export const fetchSamplesFromGithub: RequestType<void, GettingStartedData> = { method: `${_preFix}/fetchSamplesFromGithub` };
export const downloadSelectedSampleFromGithub: NotificationType<SampleDownloadRequest> = { method: `${_preFix}/downloadSelectedSampleFromGithub` };
export const createBIProject: RequestType<BIProjectRequest, void> = { method: `${_preFix}/createBIProject` };
export const onDownloadProgress: NotificationType<DownloadProgress> = { method: `${_preFix}/onDownloadProgress` };
export const onMigrationToolStateChanged: NotificationType<MigrationToolStateData> = { method: `${_preFix}/onMigrationToolStateChanged` };
export const onMigrationToolLogs: NotificationType<MigrationToolLogData> = { method: `${_preFix}/onMigrationToolLogs` };
export const getMigrationTools: RequestType<void, GetMigrationToolsResponse> = { method: `${_preFix}/getMigrationTools` };
export const migrateProject: RequestType<MigrateRequest, void> = { method: `${_preFix}/migrateProject` };
export const pullMigrationTool: RequestType<PullMigrationToolRequest, void> = { method: `${_preFix}/pullMigrationTool` };
export const importIntegration: RequestType<ImportIntegrationRPCRequest, ImportIntegrationResponse> = { method: `${_preFix}/importIntegration` };
export const showErrorMessage: RequestType<ShowErrorMessageRequest, void> = { method: `${_preFix}/showErrorMessage` };
export const openMigrationReport: RequestType<OpenMigrationReportRequest, void> = { method: `${_preFix}/openMigrationReport` };
export const saveMigrationReport: RequestType<SaveMigrationReportRequest, void> = { method: `${_preFix}/saveMigrationReport` };
