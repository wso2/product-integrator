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
import {
    RunCommandRequest,
    RunCommandResponse,
    FileOrDirRequest,
    FileOrDirResponse,
    WorkspaceRootResponse,
    WIVisualizerAPI,
    openBiExtension,
    openMiExtension,
    runCommand,
    selectFileOrDirPath,
    selectFileOrFolderPath,
    getWorkspaceRoot,
    getConfiguration,
    getSupportedMIVersionsHigherThan,
    getSubFolderNames,
    askProjectDirPath,
    createMiProject,
    fetchSamplesFromGithub,
    downloadSelectedSampleFromGithub,
    createBIProject,
    getMigrationTools,
    migrateProject,
    pullMigrationTool,
    importIntegration,
    showErrorMessage,
    openMigrationReport,
    saveMigrationReport,
    GetConfigurationRequest,
    GetConfigurationResponse,
    GetSubFoldersRequest,
    GetSubFoldersResponse,
    ProjectDirResponse,
    GetSupportedMIVersionsResponse,
    CreateMiProjectRequest,
    CreateMiProjectResponse,
    GettingStartedData,
    SampleDownloadRequest,
    BIProjectRequest,
    GetMigrationToolsResponse,
    MigrateRequest,
    PullMigrationToolRequest,
    ImportIntegrationRPCRequest,
    ImportIntegrationResponse,
    ShowErrorMessageRequest,
    OpenMigrationReportRequest,
    SaveMigrationReportRequest
} from "@wso2/wi-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class MainRpcClient implements WIVisualizerAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    openBiExtension(): void {
        return this._messenger.sendNotification(openBiExtension, HOST_EXTENSION);
    }

    openMiExtension(): void {
        return this._messenger.sendNotification(openMiExtension, HOST_EXTENSION);
    }

    runCommand(params: RunCommandRequest): Promise<RunCommandResponse> {
        return this._messenger.sendRequest(runCommand, HOST_EXTENSION, params);
    }

    selectFileOrDirPath(params: FileOrDirRequest): Promise<FileOrDirResponse> {
        return this._messenger.sendRequest(selectFileOrDirPath, HOST_EXTENSION, params);
    }

    selectFileOrFolderPath(): Promise<FileOrDirResponse> {
        return this._messenger.sendRequest(selectFileOrFolderPath, HOST_EXTENSION);
    }

    getWorkspaceRoot(): Promise<WorkspaceRootResponse> {
        return this._messenger.sendRequest(getWorkspaceRoot, HOST_EXTENSION);
    }

    getConfiguration(params: GetConfigurationRequest): Promise<GetConfigurationResponse> {
        return this._messenger.sendRequest(getConfiguration, HOST_EXTENSION, params);
    }

    getSupportedMIVersionsHigherThan(version: string): Promise<GetSupportedMIVersionsResponse> {
        return this._messenger.sendRequest(getSupportedMIVersionsHigherThan, HOST_EXTENSION, version);
    }

    getSubFolderNames(params: GetSubFoldersRequest): Promise<GetSubFoldersResponse> {
        return this._messenger.sendRequest(getSubFolderNames, HOST_EXTENSION, params);
    }

    askProjectDirPath(): Promise<ProjectDirResponse> {
        return this._messenger.sendRequest(askProjectDirPath, HOST_EXTENSION);
    }

    createMiProject(params: CreateMiProjectRequest): Promise<CreateMiProjectResponse> {
        return this._messenger.sendRequest(createMiProject, HOST_EXTENSION, params);
    }

    fetchSamplesFromGithub(): Promise<GettingStartedData> {
        return this._messenger.sendRequest(fetchSamplesFromGithub, HOST_EXTENSION);
    }

    downloadSelectedSampleFromGithub(params: SampleDownloadRequest): void {
        this._messenger.sendNotification(downloadSelectedSampleFromGithub, HOST_EXTENSION, params);
    }

    createBIProject(params: BIProjectRequest): Promise<void> {
        return this._messenger.sendRequest(createBIProject, HOST_EXTENSION, params);
    }

    getMigrationTools(): Promise<GetMigrationToolsResponse> {
        return this._messenger.sendRequest(getMigrationTools, HOST_EXTENSION);
    }

    migrateProject(params: MigrateRequest): Promise<void> {
        return this._messenger.sendRequest(migrateProject, HOST_EXTENSION, params);
    }

    pullMigrationTool(params: PullMigrationToolRequest): Promise<void> {
        return this._messenger.sendRequest(pullMigrationTool, HOST_EXTENSION, params);
    }

    importIntegration(params: ImportIntegrationRPCRequest): Promise<ImportIntegrationResponse> {
        return this._messenger.sendRequest(importIntegration, HOST_EXTENSION, params);
    }

    showErrorMessage(params: ShowErrorMessageRequest): Promise<void> {
        return this._messenger.sendRequest(showErrorMessage, HOST_EXTENSION, params);
    }

    openMigrationReport(params: OpenMigrationReportRequest): Promise<void> {
        return this._messenger.sendRequest(openMigrationReport, HOST_EXTENSION, params);
    }

    saveMigrationReport(params: SaveMigrationReportRequest): Promise<void> {
        return this._messenger.sendRequest(saveMigrationReport, HOST_EXTENSION, params);
    }

    getMessenger(): Messenger {
        return this._messenger;
    }
}
