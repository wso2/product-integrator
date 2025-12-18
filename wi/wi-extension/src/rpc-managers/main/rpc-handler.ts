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
    getWebviewContext,
    closeWebview,
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
    RunCommandRequest,
    FileOrDirRequest,
    GetConfigurationRequest,
    GetSubFoldersRequest,
    CreateMiProjectRequest,
    SampleDownloadRequest,
    BIProjectRequest,
    MigrateRequest,
    PullMigrationToolRequest,
    ImportIntegrationRPCRequest,
    ShowErrorMessageRequest,
    OpenMigrationReportRequest,
    SaveMigrationReportRequest,
    FetchSamplesRequest
} from "@wso2/wi-core";
import { Messenger } from "vscode-messenger";
import { MainRpcManager } from "./rpc-manager";

export function registerMainRpcHandlers(messenger: Messenger) {
    const rpcManger = new MainRpcManager();
    messenger.onRequest(getWebviewContext, () => rpcManger.getWebviewContext());
    messenger.onNotification(closeWebview, () => rpcManger.closeWebview());
    messenger.onNotification(openBiExtension, () => rpcManger.openBiExtension());
    messenger.onNotification(openMiExtension, () => rpcManger.openMiExtension());
    messenger.onRequest(runCommand, (args: RunCommandRequest) => rpcManger.runCommand(args));
    messenger.onRequest(selectFileOrDirPath, (args: FileOrDirRequest) => rpcManger.selectFileOrDirPath(args));
    messenger.onRequest(selectFileOrFolderPath, () => rpcManger.selectFileOrFolderPath());
    messenger.onRequest(getWorkspaceRoot, () => rpcManger.getWorkspaceRoot());
    messenger.onRequest(getConfiguration, (args: GetConfigurationRequest) => rpcManger.getConfiguration(args));
    messenger.onRequest(getSupportedMIVersionsHigherThan, (version: string) => rpcManger.getSupportedMIVersionsHigherThan(version));
    messenger.onRequest(getSubFolderNames, (args: GetSubFoldersRequest) => rpcManger.getSubFolderNames(args));
    messenger.onRequest(askProjectDirPath, () => rpcManger.askProjectDirPath());
    messenger.onRequest(createMiProject, (args: CreateMiProjectRequest) => rpcManger.createMiProject(args));
    messenger.onRequest(fetchSamplesFromGithub, (args: FetchSamplesRequest) => rpcManger.fetchSamplesFromGithub(args));
    messenger.onNotification(downloadSelectedSampleFromGithub, (args: SampleDownloadRequest) => rpcManger.downloadSelectedSampleFromGithub(args));
    messenger.onRequest(createBIProject, (args: BIProjectRequest) => rpcManger.createBIProject(args));
    messenger.onRequest(getMigrationTools, () => rpcManger.getMigrationTools());
    messenger.onRequest(migrateProject, (args: MigrateRequest) => rpcManger.migrateProject(args));
    messenger.onRequest(pullMigrationTool, (args: PullMigrationToolRequest) => rpcManger.pullMigrationTool(args));
    messenger.onRequest(importIntegration, (args: ImportIntegrationRPCRequest) => rpcManger.importIntegration(args));
    messenger.onRequest(showErrorMessage, (args: ShowErrorMessageRequest) => rpcManger.showErrorMessage(args));
    messenger.onRequest(openMigrationReport, (args: OpenMigrationReportRequest) => rpcManger.openMigrationReport(args));
    messenger.onRequest(saveMigrationReport, (args: SaveMigrationReportRequest) => rpcManger.saveMigrationReport(args));
}
