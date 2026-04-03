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
    GetRecentProjectsResponse,
    GetSubFoldersRequest,
    GetSubFoldersResponse,
    ProjectDirResponse,
    GetSupportedMIVersionsResponse,
    CreateMiProjectRequest,
    CreateMiProjectResponse,
    CreateSiProjectRequest,
    CreateSiProjectResponse,
    GettingStartedData,
    GettingStartedCategory,
    GettingStartedSample,
    SampleDownloadRequest,
    BIProjectRequest,
    GetMigrationToolsResponse,
    MigrateRequest,
    ImportIntegrationWsRequest,
    ImportIntegrationResponse,
    ImportIntegrationRequest,
    ShowErrorMessageRequest,
    COMMANDS,
    WebviewContext,
    FetchSamplesRequest,
    SemanticVersion,
    SetConfigurationRequest,
    ValidateProjectFormRequest,
    ValidateProjectFormResponse,
    DefaultOrgNameResponse
} from "@wso2/wi-core";
import { commands, window, workspace, MarkdownString, Uri, env, ConfigurationTarget } from "vscode";
import { getActiveBallerinaExtension } from "../../utils/ballerinaExtension";
import { getDefaultCreationPath } from "../../utils/pathUtils";
import { askFileOrFolderPath, askFilePath, askProjectPath, BALLERINA_INTEGRATOR_ISSUES_URL, getPlatform, getUsername, handleOpenFile, isSupportedSLVersionUtil, openInVSCode, sanitizeName, validateProjectPath } from "./utils";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { stringify as stringifyYaml } from "yaml";
import { pullMigrationTool } from "./migrate-integration";
import { MigrationReportWebview } from "../../migration-report/webview";
import { BridgeLayer } from "../../BridgeLayer";
import { OpenMigrationReportRequest, SaveMigrationReportRequest } from "@wso2/wi-core";
import { StateMachine } from "../../stateMachine";
import { ext } from "../../extensionVariables";
import { StoreSubProjectReportsRequest } from "@wso2/wi-core";
import { ballerinaContext } from "../../bi/ballerinaContext";
const platform = getPlatform();

export class MainWsManager implements WIVisualizerAPI {
    private subProjectReports: Map<string, string> = new Map();
    constructor(private projectUri?: string) { }

    async getWebviewContext(): Promise<WebviewContext> {
        const context = StateMachine.getContext();
        return new Promise((resolve) => {
            resolve({
                currentView: context.currentView,
                projectUri: this.projectUri,
                platform,
                pathSeparator: path.sep,
                env: {
                    MI_SAMPLE_ICONS_GITHUB_URL: process.env.MI_SAMPLE_ICONS_GITHUB_URL || '',
                    BI_SAMPLE_ICONS_GITHUB_URL: process.env.BI_SAMPLE_ICONS_GITHUB_URL || ''
                }
            });
        });
    }

    async closeWebview(): Promise<void> {
        commands.executeCommand(COMMANDS.CLOSE_WEBVIEW, this.projectUri);
    }

    async openBiExtension(): Promise<void> {
        commands.executeCommand(COMMANDS.OPEN_BI_INTEGRATION);
    }

    async openMiExtension(): Promise<void> {
        commands.executeCommand(COMMANDS.OPEN_MI_INTEGRATION);
    }

    async openSettings(settingKey: string): Promise<void> {
        commands.executeCommand('workbench.action.openSettings', settingKey);
    }

    async getRecentProjects(): Promise<GetRecentProjectsResponse> {
        try {
            const recentlyOpened = await commands.executeCommand<any>("_workbench.getRecentlyOpened");
            const workspaceItems: any[] = [
                ...(Array.isArray(recentlyOpened?.workspaces) ? recentlyOpened.workspaces : []),
                ...(Array.isArray(recentlyOpened?.folders) ? recentlyOpened.folders : []),
            ];
            const projects: GetRecentProjectsResponse["projects"] = [];
            const seenPaths = new Set<string>();

            for (const item of workspaceItems) {
                const project = this.normalizeRecentProject(item);
                if (!project || seenPaths.has(project.path)) {
                    continue;
                }
                seenPaths.add(project.path);
                projects.push(project);
                if (projects.length >= 8) {
                    break;
                }
            }

            return { projects };
        } catch {
            return { projects: [] };
        }
    }

    async openFolder(folderPath: string): Promise<void> {
        if (folderPath) {
            await commands.executeCommand('vscode.openFolder', Uri.file(folderPath));
        }
    }

    async runCommand(props: RunCommandRequest): Promise<RunCommandResponse> {
        return await commands.executeCommand(props.command, ...(props.args || []));
    }

    private normalizeRecentProject(item: any): GetRecentProjectsResponse["projects"][number] | undefined {
        const folderPath = this.extractFsPath(item?.folderUri);
        const workspacePath = this.extractFsPath(item?.workspace?.configPath ?? item?.workspace?.uri);
        const resolvedPath = folderPath ?? workspacePath;
        if (!resolvedPath) {
            return undefined;
        }

        const label = typeof item?.label === "string" && item.label.trim().length > 0
            ? item.label.trim()
            : path.basename(resolvedPath);

        return {
            path: resolvedPath,
            label: label || resolvedPath,
            description: resolvedPath,
            isWorkspace: !folderPath && !!workspacePath,
        };
    }

    private extractFsPath(uriLike: any): string | undefined {
        if (!uriLike) {
            return undefined;
        }

        if (uriLike instanceof Uri) {
            return uriLike.fsPath;
        }

        if (typeof uriLike === "string") {
            if (uriLike.startsWith("file:")) {
                return Uri.parse(uriLike).fsPath;
            }
            return uriLike;
        }

        if (typeof uriLike === "object") {
            if (typeof uriLike.fsPath === "string" && uriLike.fsPath.length > 0) {
                return uriLike.fsPath;
            }

            if (typeof uriLike.path === "string" && uriLike.path.length > 0) {
                if (uriLike.scheme === "file") {
                    return Uri.from({ scheme: "file", path: uriLike.path }).fsPath;
                }
                return uriLike.path;
            }

            if (typeof uriLike.external === "string" && uriLike.external.startsWith("file:")) {
                return Uri.parse(uriLike.external).fsPath;
            }
        }

        return undefined;
    }

    async openExternal(url: string): Promise<void> {
        await env.openExternal(Uri.parse(url));
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
                const selectedDir = await askProjectPath(params.startPath);
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

    async setConfiguration(params: SetConfigurationRequest): Promise<void> {
        const target = params.scope === "workspace"
            ? ConfigurationTarget.Workspace
            : params.scope === "workspaceFolder"
                ? ConfigurationTarget.WorkspaceFolder
                : ConfigurationTarget.Global;

        await workspace.getConfiguration().update(params.section, params.value, target);
    }

    async getSupportedMIVersionsHigherThan(version: string): Promise<GetSupportedMIVersionsResponse> {
        return new Promise(async (resolve) => {
            const versions = ["4.6.0", "4.5.0", "4.4.0", "4.3.0", "4.2.0", "4.1.0", "4.0.0"];
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
                    open: params.open,
                    miVersion: params.miVersion
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

    async createSiProject(params: CreateSiProjectRequest): Promise<CreateSiProjectResponse> {
        return new Promise(async (resolve, reject) => {
            try {
                const projectPath = path.join(params.directory, params.name);
                const mainSiddhiPath = path.join(projectPath, "main.siddhi");

                await fs.promises.mkdir(projectPath, { recursive: false });
                await fs.promises.writeFile(mainSiddhiPath, "", { encoding: "utf8", flag: "wx" });

                if (params.open) {
                    await commands.executeCommand("vscode.openFolder", Uri.file(projectPath));
                }

                resolve({ filePath: projectPath });
            } catch (error) {
                console.error("Error creating SI project:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                window.showErrorMessage(`Failed to create SI project: ${errorMessage}`);
                reject(error);
            }
        });
    }

    async fetchSamplesFromGithub(params: FetchSamplesRequest): Promise<GettingStartedData> {
        return new Promise(async (resolve) => {
            const url = params.runtime === "WSO2: MI" ?
                'https://mi-connectors.wso2.com/samples/info.json' :
                'https://devant-cdn.wso2.com/bi-samples/v1/info.json';
            try {
                const { data } = await axios.get(url);
                console.log('Fetched samples data:', data);

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
        let url = 'https://devant-cdn.wso2.com/bi-samples/v1';
        if (params.runtime === "WSO2: MI") {
            url = `https://mi-connectors.wso2.com/samples/samples/${params.zipFileName}`;
        }
        const workspaceFolders = workspace.workspaceFolders;
        const projectUri = this.projectUri ?? (workspaceFolders ? workspaceFolders[0].uri.fsPath : "");
        handleOpenFile(projectUri, params.zipFileName, url);
    }

    private async getLangClient() {
        const ballerinaExt = await getActiveBallerinaExtension();
        const langClient = ballerinaExt.exports.ballerinaExtInstance.langClient;
        return langClient as any;
    }

    async isSupportedSLVersion(params: SemanticVersion): Promise<boolean> {
        const ballerinaExt = await getActiveBallerinaExtension();
        return isSupportedSLVersionUtil(ballerinaExt.exports.ballerinaExtInstance, params);
    }

    async getMigrationTools(): Promise<GetMigrationToolsResponse> {
        const langClient = await this.getLangClient();
        return langClient.getMigrationTools();
    }

    async createBIProject(params: BIProjectRequest): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const projectRoot: string = await commands.executeCommand('BI.project.createBIProjectPure', params);
                if (params.createAsWorkspace && params.projectHandle) {
                    const displayName = params.workspaceName || 'Default';
                    try {
                        const loggedInUser = ext.authProvider?.getUserInfo();
                        await this.writeLocalProjectYaml(
                            projectRoot,
                            displayName,
                            params.projectHandle,
                            loggedInUser ? params.orgName : undefined
                        );
                    } catch (yamlError) {
                        console.warn("Failed to write local-project.yaml (non-critical):", yamlError);
                    }
                }
                openInVSCode(projectRoot);
                resolve();
            } catch (error) {
                console.error("Error creating Ballerina project:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                window.showErrorMessage(`Failed to create Ballerina project: ${errorMessage}`);
                reject(error);
            }
        });
    }

    private async writeLocalProjectYaml(
        projectRoot: string,
        projectName: string,
        projectHandle: string,
        orgName?: string
    ): Promise<void> {
        const choreoDir = path.join(projectRoot, '.choreo');
        const localProjectFile = path.join(choreoDir, 'local-project.yaml');
        const content = orgName
            ? stringifyYaml({ org: orgName, name: projectName, handle: projectHandle })
            : stringifyYaml({ name: projectName, handle: projectHandle });
        await fs.promises.mkdir(choreoDir, { recursive: true });
        await fs.promises.writeFile(localProjectFile, content, { encoding: 'utf8' });
    }

    async validateProjectPath(params: ValidateProjectFormRequest): Promise<ValidateProjectFormResponse> {
        return validateProjectPath(params.projectPath, params.projectName, params.createDirectory, params.createAsWorkspace);
    }

    async migrateProject(params: MigrateRequest): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('[WI migrateProject] Starting. aiFeatureUsed:', params.aiFeatureUsed, 'sourcePath:', params.sourcePath);
                const result = await commands.executeCommand('BI.project.createBIProjectMigration', params);
                console.log('[WI migrateProject] createBIProjectMigration returned:', typeof result, result);
                if (params.aiFeatureUsed && params.sourcePath) {
                    const projectRoot = typeof result === 'string' ? result : undefined;
                    if (projectRoot) {
                        const migrationAPI = await ballerinaContext.ensureMigrationAPI();
                        console.log('[WI migrateProject] AI path. projectRoot:', projectRoot, 'migration API available:', !!migrationAPI);
                        migrationAPI?.setWizardProjectRoot(projectRoot, params.sourcePath);
                        // Ensure the BridgeLayer forwards chat events now that the API is available
                        BridgeLayer.setupMigrationSubscription(this.projectUri ?? 'global');
                    }
                }
                resolve();
            } catch (error) {
                console.error("Error creating Ballerina project:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                window.showErrorMessage(`Failed to create Ballerina project: ${errorMessage}`);
                reject(error);
            }
        });
    }

    async storeSubProjectReports(params: StoreSubProjectReportsRequest): Promise<void> {
        this.subProjectReports.clear();
        Object.entries(params.reports).forEach(([projectName, reportContent]) => {
            this.subProjectReports.set(projectName, reportContent);
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

    async importIntegration(params: ImportIntegrationWsRequest): Promise<ImportIntegrationResponse> {
        const orgName = params.orgName || getUsername();
        const langParams: ImportIntegrationRequest = {
            orgName: orgName,
            packageName: sanitizeName(params.packageName),
            sourcePath: params.sourcePath,
            parameters: params.parameters,
        };
        const langClient = await this.getLangClient();
        langClient.registerMigrationToolCallbacks();

        // the WI webview receives onMigratedProject notifications as each project is migrated.
        const projectUri = StateMachine.getContext().projectUri ?? 'global';
        langClient.onNotification('projectService/pushMigratedProject', (res: any) => {
            try {
                BridgeLayer.notifyMigratedProject(res, projectUri);
            } catch (error) {
                console.error('[WI] Error forwarding migratedProject notification:', error);
            }
        });

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

    async openMigrationReport(params: OpenMigrationReportRequest): Promise<void> {
        MigrationReportWebview.createOrShow(params.fileName, params.reportContent);
    }

    async saveMigrationReport(params: SaveMigrationReportRequest): Promise<void> {
        const vscode = await import('vscode');

        // Show save dialog
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(params.defaultFileName),
            filters: {
                'HTML files': ['html'],
                'All files': ['*']
            }
        });

        if (saveUri) {
            // Write the report content to the selected file
            await vscode.workspace.fs.writeFile(saveUri, Buffer.from(params.reportContent, 'utf8'));
            vscode.window.showInformationMessage(`Migration report saved to ${saveUri.fsPath}`);
        }
    }

    async setWebviewCache(params: { cacheKey: string; data: unknown }): Promise<void> {
        await ext.context.workspaceState.update(params.cacheKey, params.data);
    }

    async restoreWebviewCache(cacheKey: string): Promise<unknown> {
        return ext.context.workspaceState.get(cacheKey);
    }

    async clearWebviewCache(cacheKey: string): Promise<void> {
        await ext.context.workspaceState.update(cacheKey, undefined);
    }

    async getDefaultOrgName(): Promise<DefaultOrgNameResponse> {
        return { orgName: getUsername() };
    }

    async getDefaultCreationPath(): Promise<WorkspaceRootResponse> {
        return { path: getDefaultCreationPath() };
    }

    async wizardEnhancementReady(): Promise<void> {
        const migrationAPI = await ballerinaContext.ensureMigrationAPI();
        console.log('[WI wizardEnhancementReady] Called. migration API available:', !!migrationAPI);
        await migrationAPI?.wizardEnhancementReady();
        console.log('[WI wizardEnhancementReady] Returned.');
    }

    async openMigratedProject(): Promise<void> {
        const migrationAPI = await ballerinaContext.ensureMigrationAPI();
        migrationAPI?.openMigratedProject();
    }

    async abortMigrationAgent(): Promise<void> {
        const migrationAPI = await ballerinaContext.ensureMigrationAPI();
        migrationAPI?.abortAgent();
    }
}
