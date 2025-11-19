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
    WorkspaceRootResponse,
    WIVisualizerAPI,
    FileOrDirResponse,
    GetConfigurationRequest,
    GetConfigurationResponse,
    GetSubFoldersRequest,
    GetSubFoldersResponse,
    ProjectDirResponse,
    GetSupportedMIVersionsResponse,
    CreateMiProjectRequest,
    CreateMiProjectResponse,
    GettingStartedData,
    GettingStartedCategory,
    GettingStartedSample,
    SampleDownloadRequest,
    BIProjectRequest,
    GetMigrationToolsResponse,
    MigrateRequest,
    ImportIntegrationRPCRequest,
    ImportIntegrationResponse,
    ImportIntegrationRequest,
    ShowErrorMessageRequest
} from "@wso2/wi-core";
import { commands, window, workspace, Uri, MarkdownString, extensions } from "vscode";
import { askFileOrFolderPath, askFilePath, askProjectPath, BALLERINA_INTEGRATOR_ISSUES_URL, getUsername, handleOpenFile, sanitizeName } from "./utils";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { pullMigrationTool } from "./migrate-integration";

export class MainRpcManager implements WIVisualizerAPI {
    constructor(private projectUri?: string) { }

    async openBiExtension(): Promise<void> {
        commands.executeCommand("wso2.integrator.openBIIntegration");
    }

    async openMiExtension(): Promise<void> {
        commands.executeCommand("wso2.integrator.openMIIntegration");
    }

    async runCommand(props: RunCommandRequest): Promise<RunCommandResponse> {
        return await commands.executeCommand("wso2.integrator.runCommand", props);
    }

    async selectFileOrDirPath(params: FileOrDirRequest): Promise<FileOrDirResponse> {
        return new Promise(async (resolve) => {
            if (params.isFile) {
                const selectedFile = await askFilePath();
                if (!selectedFile || selectedFile.length === 0) {
                    window.showErrorMessage('A file must be selected');
                    resolve({ path: "" });
                } else {
                    const filePath = selectedFile[0].fsPath;
                    resolve({ path: filePath });
                }
            } else {
                const selectedDir = await askProjectPath();
                if (!selectedDir || selectedDir.length === 0) {
                    window.showErrorMessage('A folder must be selected');
                    resolve({ path: "" });
                } else {
                    const dirPath = selectedDir[0].fsPath;
                    resolve({ path: dirPath });
                }
            }
        });
    }

    async selectFileOrFolderPath(): Promise<FileOrDirResponse> {
        return new Promise(async (resolve) => {
            const selectedFileOrFolder = await askFileOrFolderPath();
            if (!selectedFileOrFolder || selectedFileOrFolder.length === 0) {
                window.showErrorMessage('A file or folder must be selected');
                resolve({ path: "" });
            } else {
                const fileOrFolderPath = selectedFileOrFolder[0].fsPath;
                resolve({ path: fileOrFolderPath });
            }
        });
    }

    async getWorkspaceRoot(): Promise<WorkspaceRootResponse> {
        return new Promise(async (resolve) => {
            const workspaceFolders = workspace.workspaceFolders;
            resolve(workspaceFolders ? { path: workspaceFolders[0].uri.fsPath } : { path: "" });
        });
    }

    async getConfiguration(params: GetConfigurationRequest): Promise<GetConfigurationResponse> {
        return new Promise(async (resolve) => {
            const configValue = workspace.getConfiguration().get(params.section);
            resolve({ value: configValue });
        });
    }

    async getSupportedMIVersionsHigherThan(version: string): Promise<GetSupportedMIVersionsResponse> {
        return new Promise(async (resolve) => {
            // TODO: Implement the actual function from ballerina-core
            // For now, return a placeholder
            const versions = ["4.2.0", "4.1.0", "4.0.0"];
            resolve({ versions });
        });
    }

    async getSubFolderNames(params: GetSubFoldersRequest): Promise<GetSubFoldersResponse> {
        return new Promise(async (resolve) => {
            const { path: folderPath } = params;
            const subFolders: string[] = [];

            if (!folderPath || folderPath.trim() === '') {
                resolve({ folders: subFolders });
                return;
            }

            try {
                const subItems = fs.readdirSync(folderPath, { withFileTypes: true });
                for (const item of subItems) {
                    if (item.isDirectory()) {
                        subFolders.push(item.name);
                    }
                }
            } catch (error) {
                console.error("Error reading subfolder names:", error);
            }
            resolve({ folders: subFolders });
        });
    }

    async askProjectDirPath(): Promise<ProjectDirResponse> {
        return new Promise(async (resolve) => {
            const selectedDir = await askProjectPath();
            if (!selectedDir || selectedDir.length === 0) {
                window.showErrorMessage('A folder must be selected to create project');
                resolve({ path: "" });
            } else {
                const parentDir = selectedDir[0].fsPath;
                resolve({ path: parentDir });
            }
        });
    }

    async createMiProject(params: CreateMiProjectRequest): Promise<CreateMiProjectResponse> {
        return new Promise(async (resolve, reject) => {
            try {
                console.log("Creating MI project with params:", params);

                const miCommandParams = {
                    name: params.name,
                    path: path.join(params.directory, params.name),
                    scope: "user",
                    open: params.open
                };

                const result = await commands.executeCommand("MI.project-explorer.create-project", miCommandParams);

                if (result) {
                    resolve(result as CreateMiProjectResponse);
                } else {
                    resolve({ filePath: '' });
                }
            } catch (error) {
                console.error("Error creating MI project:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                window.showErrorMessage(`Failed to create MI project: ${errorMessage}`);
                reject(error);
            }
        });
    }

    async fetchSamplesFromGithub(): Promise<GettingStartedData> {
        return new Promise(async (resolve) => {
            const url = 'https://mi-connectors.wso2.com/samples/info.json';
            try {
                const { data } = await axios.get(url);
                const samples = data.Samples;
                const categories = data.categories;

                let categoriesList: GettingStartedCategory[] = [];
                for (let i = 0; i < categories.length; i++) {
                    const cat: GettingStartedCategory = {
                        id: categories[i][0],
                        title: categories[i][1],
                        icon: categories[i][2]
                    };
                    categoriesList.push(cat);
                }
                let sampleList: GettingStartedSample[] = [];
                for (let i = 0; i < samples.length; i++) {
                    const sample: GettingStartedSample = {
                        category: samples[i][0],
                        priority: samples[i][1],
                        title: samples[i][2],
                        description: samples[i][3],
                        zipFileName: samples[i][4],
                        isAvailable: samples[i][5]
                    };
                    sampleList.push(sample);
                }
                const gettingStartedData: GettingStartedData = {
                    categories: categoriesList,
                    samples: sampleList
                };
                resolve(gettingStartedData);

            } catch (error) {
                console.error('Error fetching samples:', error);
                resolve({
                    categories: [],
                    samples: []
                });
            }
        });
    }

    downloadSelectedSampleFromGithub(params: SampleDownloadRequest): void {
        const url = 'https://mi-connectors.wso2.com/samples/samples/';
        const workspaceFolders = workspace.workspaceFolders;
        const projectUri = this.projectUri ?? (workspaceFolders ? workspaceFolders[0].uri.fsPath : "");
        handleOpenFile(projectUri, params.zipFileName, url);
    }

    private getLangClient() {
        const ballerinaExt = extensions.getExtension('wso2.ballerina');
        if (!ballerinaExt) {
            throw new Error('Ballerina extension is not installed');
        }
        if (!ballerinaExt.isActive) {
            throw new Error('Ballerina extension is not activated yet');
        }
        const langClient = ballerinaExt.exports.ballerinaExtInstance.langClient;
        return langClient as any;
    }

    async getMigrationTools(): Promise<GetMigrationToolsResponse> {
        return this.getLangClient().getMigrationTools();
    }

    async createBIProject(params: BIProjectRequest): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const result = await commands.executeCommand('BI.project.createBIProjectPure', params);
                resolve();
            } catch (error) {
                console.error("Error creating BI project:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                window.showErrorMessage(`Failed to create BI project: ${errorMessage}`);
                reject(error);
            }
        });
    }

    async migrateProject(params: MigrateRequest): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const result = await commands.executeCommand('BI.project.createBIProjectMigration', params);
                resolve();
            } catch (error) {
                console.error("Error creating BI project:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                window.showErrorMessage(`Failed to create BI project: ${errorMessage}`);
                reject(error);
            }
        });
    }

    async pullMigrationTool(args: { toolName: string; version: string }): Promise<void> {
        try {
            await pullMigrationTool(args.toolName, args.version);
        } catch (error) {
            console.error(`Failed to pull migration tool '${args.toolName}' version '${args.version}':`, error);
            throw error;
        }
    }

    async importIntegration(params: ImportIntegrationRPCRequest): Promise<ImportIntegrationResponse> {
        const orgName = getUsername();
        const langParams: ImportIntegrationRequest = {
            orgName: orgName,
            packageName: sanitizeName(params.packageName),
            sourcePath: params.sourcePath,
            parameters: params.parameters,
        };
        const langClient = this.getLangClient();
        langClient.registerMigrationToolCallbacks();
        switch (params.commandName) {
            case "migrate-tibco":
                return langClient.importTibcoToBI(langParams);
            case "migrate-mule":
                return langClient.importMuleToBI(langParams);
            default:
                console.error(`Unsupported integration type: ${params.commandName}`);
                throw new Error(`Unsupported integration type: ${params.commandName}`);
        }
    }

    async showErrorMessage(params: ShowErrorMessageRequest): Promise<void> {
        const messageWithLink = new MarkdownString(params.message);
        messageWithLink.appendMarkdown(`\n\nPlease [create an issue](${BALLERINA_INTEGRATOR_ISSUES_URL}) if the issue persists.`);
        window.showErrorMessage(messageWithLink.value);
    }
}
