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
    DefaultOrgNameResponse,
    SampleItem,
    BIRuntimeStatusResponse,
    EXTENSION_DEPENDENCIES
} from "@wso2/wi-core";
import { commands, extensions, window, workspace, MarkdownString, Uri, env, ConfigurationTarget } from "vscode";
import { getActiveBallerinaExtension } from "../../utils/ballerinaExtension";
import { getDefaultCreationPath } from "../../utils/pathUtils";
import { askFileOrFolderPath, askFilePath, askProjectPath, BALLERINA_INTEGRATOR_ISSUES_URL, getPlatform, getUsername, handleOpenSamples, isSupportedSLVersionUtil, openInVSCode, sanitizeName, validateProjectPath } from "./utils";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { stringify as stringifyYaml } from "yaml";
import { pullMigrationTool } from "./migrate-integration";
import { MigrationReportWebview } from "../../migration-report/webview";
import { BridgeLayer } from "../../BridgeLayer";
import { OpenMigrationReportRequest, SaveMigrationReportRequest, PullMigrationToolRequest } from "@wso2/wi-core";
import { StateMachine } from "../../stateMachine";
import { ext } from "../../extensionVariables";
import { StoreSubProjectReportsRequest } from "@wso2/wi-core";
import { ballerinaContext } from "../../bi/ballerinaContext";
const platform = getPlatform();
const SAMPLES_INFO_URL = process.env.SAMPLES_INFO_URL;
const PREBUILT_INTEGRATIONS_URL = process.env.PREBUILT_INTEGRATIONS_URL;

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
                    BI_SAMPLE_ICONS_GITHUB_URL: process.env.BI_SAMPLE_ICONS_GITHUB_URL || '',
                    SAMPLES_INFO_URL: process.env.SAMPLES_INFO_URL || '',
                    SAMPLES_REPOSITORY_URL: process.env.SAMPLES_REPOSITORY_URL || '',
                    PREBUILT_INTEGRATIONS_URL: process.env.PREBUILT_INTEGRATIONS_URL || ''
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
                let isDirectory = false;
                try {
                    isDirectory = fs.statSync(fileOrFolderPath).isDirectory();
                } catch {
                    // ignore stat error
                }
                resolve({ path: fileOrFolderPath, isDirectory });
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
                    miVersion: params.miVersion,
                    isConsolidatedProject: params.isConsolidatedProject ?? false,
                    subProjects: params.subProjects ?? [],
                    groupId: params.groupID ?? "com.microintegrator.projects",
                    artifactId: params.artifactID ?? params.name,
                    version: params.version ?? "1.0.0",
                };

                const result = await commands.executeCommand("MI.project-explorer.create-project", miCommandParams);

                if (result) {
                    openInVSCode((result as CreateMiProjectResponse).filePath);
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

    async importProjectFromCapp(): Promise<void> {
        await commands.executeCommand("MI.importProjectFromCapp");
    }

    async createSiProject(params: CreateSiProjectRequest): Promise<CreateSiProjectResponse> {
        return new Promise(async (resolve, reject) => {
            try {
                const projectPath = path.join(params.directory, params.name);
                const mainSiddhiPath = path.join(projectPath, "main.siddhi");
                const mainSiddhiContent = '@App:name("APP_NAME")\n@App:description("APP_DESCRIPTION")\n\ndefine stream InputStream (attribute1 string,attribute2 int);\n';

                await fs.promises.mkdir(projectPath, { recursive: false });
                await fs.promises.writeFile(mainSiddhiPath, mainSiddhiContent, { encoding: "utf8", flag: "wx" });

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
            if (params.runtime === "WSO2: BI") {
                const prebuiltIntegrations = await this.fetchBiPrebuiltIntegrations();
                try {
                    const { data } = await axios.get(SAMPLES_INFO_URL);
                    const biSamples: SampleItem[] = Array.isArray(data.samples)
                        ? data.samples.filter((s: SampleItem) => s.buildPack === "ballerina")
                        : [];
                    resolve({
                        categories: [],
                        samples: biSamples,
                        prebuiltIntegrations: [...prebuiltIntegrations],
                    });
                } catch (error) {
                    console.error('Error fetching BI samples:', error);
                    resolve({
                        categories: [],
                        samples: [],
                        prebuiltIntegrations,
                    });
                }
                return;
            }

            try {
                const { data } = await axios.get(SAMPLES_INFO_URL);
                const miSamples: SampleItem[] = Array.isArray(data.samples)
                    ? data.samples.filter((s: SampleItem) => s.buildPack === "wso2-mi")
                    : [];
                resolve({
                    categories: [],
                    samples: miSamples,
                    prebuiltIntegrations: [],
                });
            } catch (error) {
                console.error('Error fetching MI samples:', error);
                resolve({
                    categories: [],
                    samples: [],
                    prebuiltIntegrations: [],
                });
            }
        });
    }

    async fetchBiPrebuiltIntegrations(): Promise<SampleItem[]> {
        try {
            const { data } = await axios.get(PREBUILT_INTEGRATIONS_URL);
            return data.prebuiltIntegrations as SampleItem[];
        } catch (error) {
            console.error("Error fetching BI prebuilt integrations:", error);
            return [];
        }
    }

    async downloadSelectedSampleFromGithub(params: SampleDownloadRequest): Promise<void> {
        const workspaceFolders = workspace.workspaceFolders;
        const projectUri = this.projectUri ?? (workspaceFolders ? workspaceFolders[0].uri.fsPath : "");
        const sampleItem = params.sampleItem;

        if ((params.runtime === "WSO2: BI" || params.runtime === "WSO2: MI") && sampleItem) {
            const { componentPath, displayName, repositoryUrl, branch, subDirectory } = sampleItem;
            const isPrebuilt = params.itemType === "prebuilt";

            if (!componentPath || !displayName || !repositoryUrl) {
                await window.showErrorMessage("Sample download details are missing.");
                return;
            }

            await handleOpenSamples(projectUri, {
                repositoryUrl,
                branch: branch ?? "main",
                subDirectory: subDirectory ?? "",
                componentPath,
                displayName,
                sourceLabel: isPrebuilt ? "pre-built integration" : "integration sample",
                missingSourceError: isPrebuilt
                    ? "Pre-built integration source files were not found in the downloaded archive."
                    : "Integration sample source files were not found in the downloaded archive.",
                preparationErrorLabel: isPrebuilt ? "pre-built integration" : "integration sample",
            });
        }
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
                    try {
                        await this.writeLocalContextYaml(
                            projectRoot,
                            params.orgHandle,
                            params.projectHandle,
                        );
                    } catch (yamlError) {
                        console.warn("Failed to write context.yaml (non-critical):", yamlError);
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

    private async writeLocalContextYaml(
        projectRoot: string,
        orgHandle: string,
        projectHandle: string,
    ): Promise<void> {
        const wso2Dir = path.join(projectRoot, '.wso2');
        const localProjectFile = path.join(wso2Dir, 'context.yaml');
        const content = stringifyYaml([{ org: orgHandle, project: projectHandle, local: true }]);
        await fs.promises.mkdir(wso2Dir, { recursive: true });
        await fs.promises.writeFile(localProjectFile, content, { encoding: 'utf8' });
    }

    async validateProjectPath(params: ValidateProjectFormRequest): Promise<ValidateProjectFormResponse> {
        return validateProjectPath(params.projectPath, params.projectName, params.createDirectory, params.createAsWorkspace);
    }

    async migrateProject(params: MigrateRequest): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const result = await commands.executeCommand("BI.project.createBIProjectMigration", params);
                if (params.aiFeatureUsed && params.sourcePath) {
                    const projectRoot = typeof result === "string" ? result : undefined;
                    if (projectRoot) {
                        const migrationAPI = await ballerinaContext.ensureMigrationAPI();
                        migrationAPI?.setWizardProjectRoot(projectRoot, params.sourcePath);
                        // Ensure the BridgeLayer forwards chat events now that the API is available
                        BridgeLayer.setupMigrationSubscription(this.projectUri ?? "global");
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

    async pullMigrationTool(args: PullMigrationToolRequest): Promise<void> {
        try {
            await pullMigrationTool(args.toolName);
        } catch (error) {
            console.error(`Failed to pull migration tool '${args.toolName}':`, error);
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
        await migrationAPI?.wizardEnhancementReady();
    }

    async openMigratedProject(): Promise<void> {
        const migrationAPI = await ballerinaContext.ensureMigrationAPI();
        migrationAPI?.openMigratedProject();
    }

    async abortMigrationAgent(): Promise<void> {
        const migrationAPI = await ballerinaContext.ensureMigrationAPI();
        migrationAPI?.abortAgent();
    }

    async checkAIAuth(): Promise<boolean> {
        const migrationAPI = await ballerinaContext.ensureMigrationAPI();
        const result = migrationAPI?.isAIAuthenticated() ?? false;
        console.log('[ws-manager] checkAIAuth: migrationAPI available:', !!migrationAPI, 'result:', result);
        return result;
    }

    async triggerAICopilotSignIn(): Promise<{ success: boolean; error?: string }> {
        const migrationAPI = await ballerinaContext.ensureMigrationAPI();
        console.log('[ws-manager] triggerAICopilotSignIn: migrationAPI available:', !!migrationAPI);
        const result = await (migrationAPI?.signInForAI() ?? Promise.resolve({ success: false, error: "Migration API not available." }));
        console.log('[ws-manager] triggerAICopilotSignIn: result:', JSON.stringify(result));
        return result;
    }

    async triggerAnthropicKeySignIn(params: { apiKey: string }): Promise<{ success: boolean; error?: string }> {
        try {
            const migrationAPI = await ballerinaContext.ensureMigrationAPI();
            return await (migrationAPI?.signInWithAnthropicKey(params.apiKey) ?? Promise.resolve({ success: false, error: "Migration API not available." }));
        } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : "Authentication failed. Please try again." };
        }
    }

    async triggerAwsBedrockSignIn(params: { accessKeyId: string; secretAccessKey: string; region: string; sessionToken?: string }): Promise<{ success: boolean; error?: string }> {
        try {
            const migrationAPI = await ballerinaContext.ensureMigrationAPI();
            return await (migrationAPI?.signInWithAwsBedrock(params) ?? Promise.resolve({ success: false, error: "Migration API not available." }));
        } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : "Authentication failed. Please try again." };
        }
    }

    async triggerVertexAiSignIn(params: { projectId: string; location: string; clientEmail: string; privateKey: string }): Promise<{ success: boolean; error?: string }> {
        try {
            const migrationAPI = await ballerinaContext.ensureMigrationAPI();
            return await (migrationAPI?.signInWithVertexAI(params) ?? Promise.resolve({ success: false, error: "Migration API not available." }));
        } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : "Authentication failed. Please try again." };
        }
    }

    /**
     * Pure status check — returns whether the Ballerina distribution is installed
     * and ready without performing any initialisation or subscription wiring.
     * Init and subscription wiring are handled by {@link initBIRuntimeContext},
     * which must be called before starting a download.
     */
    async getBIRuntimeStatus(): Promise<BIRuntimeStatusResponse> {
        try {
            const ext = extensions.getExtension(EXTENSION_DEPENDENCIES.BALLERINA);
            if (!ext) {
                return { isAvailable: false, status: "unavailable" };
            }
            // Activate only when the prefetcher hasn't done it yet; otherwise this is a no-op.
            if (!ext.isActive) {
                await ext.activate();
            }
            const biSupported = ballerinaContext.isInitialized
                ? ballerinaContext.biSupported
                : (ext.exports as any)?.ballerinaExtInstance?.biSupported === true;
            return { isAvailable: biSupported, status: biSupported ? "ready" : "noLS" };
        } catch {
            return { isAvailable: false, status: "error" };
        }
    }

    /**
     * Initialises the BallerinaContext and wires up the download-progress
     * subscription so that subsequent setup progress events are forwarded to
     * all open webviews. Must be called before starting a Ballerina download.
     */
    async initBIRuntimeContext(): Promise<void> {
        const ext = extensions.getExtension(EXTENSION_DEPENDENCIES.BALLERINA);
        if (!ext) {
            return;
        }
        if (!ext.isActive) {
            await ext.activate();
        }
        // Always run both so the download-progress subscription is wired even when
        // ballerinaContext was previously initialised via a different code path
        // init() re-assigns fields from the extension
        // exports each time; setupDownloadProgressSubscription() is internally guarded
        // against double-subscription.
        ballerinaContext.init(ext.exports);
        BridgeLayer.setupDownloadProgressSubscription();
    }
}
