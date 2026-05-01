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

import { WebviewPanel } from "vscode";
import { createExtensionTransportManager, createRequestRouter } from "webview-giga-bridge";
import {
    BIProjectRequest,
    CreateMiProjectRequest,
    CreateSiProjectRequest,
    DownloadProgress,
    FetchSamplesRequest,
    FileOrDirRequest,
    GetConfigurationRequest,
    SetConfigurationRequest,
    GetSubFoldersRequest,
    ImportIntegrationWsRequest,
    MigrateRequest,
    MigrationToolLogData,
    MigrationToolStateData,
    OpenMigrationReportRequest,
    ProjectMigrationResult,
    PullMigrationToolRequest,
    RunCommandRequest,
    SampleDownloadRequest,
    SaveMigrationReportRequest,
    SemanticVersion,
    SetWebviewCacheParams,
    ShowErrorMessageRequest,
    StoreSubProjectReportsRequest,
    ValidateProjectFormRequest,
    WI_BRIDGE_EVENTS,
    WIBridgeRequest,
    WIBridgeResponse,
    WIWsMethod,
    WIWsMethodResultMap,
    WIWsResponseMessage,
    WebviewContext,
    WITransportBootstrap,
    CloneProgressStage,
    WIChatNotify,
} from "@wso2/wi-core";
import type {
    AuthState,
    CloneRepositoryIntoCompDirReq,
    ContextStoreState,
    GetAuthorizedGitOrgsReq,
    GetBranchesReq,
    GetConfigFileDriftsReq,
    GetCredentialDetailsReq,
    GetCredentialsReq,
    GetGitMetadataReq,
    IsRepoAuthorizedReq,
    WICloudSubmitComponentsReq,
    GetCloudProjectsReq,
} from "@wso2/wi-core";
import { MainWsManager } from "./ws-managers/main/ws-manager";
import { CloudWsManager } from "./ws-managers/cloud/ws-manager";
import { ballerinaContext } from "./bi/ballerinaContext";

type TransportManager = ReturnType<typeof createExtensionTransportManager<WIBridgeRequest, WIBridgeResponse>>;
type RequestRouter = ReturnType<typeof createRequestRouter<WIBridgeRequest, WIBridgeResponse>>;

interface BridgeChannel {
    transport: TransportManager;
    registration?: { dispose(): void };
}

export class BridgeLayer {
    private static channels: Map<string, BridgeChannel> = new Map();
    private static migrationSubscribed = false;
    private static migrationSubscriptionDisposable: { dispose(): void } | undefined;
    private static downloadProgressSubscribed = false;
    private static downloadProgressDisposable: { dispose(): void } | undefined;

    static create(webViewPanel: WebviewPanel, projectUri: string): void {
        const channel = this.getOrCreateChannel(projectUri);
        channel.registration?.dispose();
        channel.registration = channel.transport.registerWebviewPanel(webViewPanel);
    }

    static getWebviewBootstrap(projectUri: string): WITransportBootstrap {
        return this.getOrCreateChannel(projectUri).transport.getWebviewBootstrap();
    }

    static startWebSocketServer(projectUri: string): WITransportBootstrap {
        const channel = this.getOrCreateChannel(projectUri);
        if (channel.transport.getMode() !== "websocket") {
            channel.transport.switchMode("websocket");
        } else if (!channel.transport.isWebSocketServerRunning()) {
            channel.transport.startWebSocketServer();
        }
        return channel.transport.getWebviewBootstrap();
    }

    static stopWebSocketServer(projectUri: string): void {
        this.getChannel(projectUri)?.transport.stopWebSocketServer();
    }

    static isWebSocketServerRunning(projectUri: string): boolean {
        return this.getChannel(projectUri)?.transport.isWebSocketServerRunning() ?? false;
    }

    static notifyStateChanged(projectUri: string, context: WebviewContext): void {
        this.publish(projectUri, {
            type: WI_BRIDGE_EVENTS.STATE_CHANGED,
            context,
        });
    }

    static notifyDownloadProgress(projectUri: string, progress: DownloadProgress): void {
        this.publish(projectUri, {
            type: WI_BRIDGE_EVENTS.DOWNLOAD_PROGRESS,
            progress,
        });
    }

    static notifyMigrationToolStateChanged(projectUri: string, state: MigrationToolStateData): void {
        this.publish(projectUri, {
            type: WI_BRIDGE_EVENTS.MIGRATION_TOOL_STATE_CHANGED,
            state,
        });
    }

    static notifyMigrationToolLogs(projectUri: string, log: MigrationToolLogData): void {
        this.publish(projectUri, {
            type: WI_BRIDGE_EVENTS.MIGRATION_TOOL_LOGS,
            log,
        });
    }

    static notifyMigratedProject(project: ProjectMigrationResult, projectUri: string = "global"): void {
        this.publish(projectUri, {
            type: WI_BRIDGE_EVENTS.MIGRATED_PROJECT,
            project,
        });
    }

    static notifyCloneProgress(stage: CloneProgressStage, projectUri: string = "global"): void {
        this.publish(projectUri, {
            type: WI_BRIDGE_EVENTS.CLONE_PROGRESS,
            stage,
        });
    }

    // ── Cloud event publishers ────────────────────────────────
    static notifySignInInitiated(projectUri: string = "global"): void {
        this.publish(projectUri, {
            type: WI_BRIDGE_EVENTS.SIGN_IN_INITIATED,
        });
    }

    static notifyAuthStateChanged(projectUri: string, state: AuthState): void {
        this.publish(projectUri, {
            type: WI_BRIDGE_EVENTS.AUTH_STATE_CHANGED,
            state,
        });
    }

    static notifyContextStateChanged(projectUri: string, state: ContextStoreState): void {
        this.publish(projectUri, {
            type: WI_BRIDGE_EVENTS.CONTEXT_STATE_CHANGED,
            state,
        });
    }

    static notifyChatEvent(projectUri: string, event: WIChatNotify): void {
        this.publish(projectUri, {
            type: WI_BRIDGE_EVENTS.CHAT_NOTIFY,
            event,
        });
    }

    static dispose(projectUri: string): void {
        const channel = this.channels.get(projectUri);
        if (!channel) {
            return;
        }
        channel.registration?.dispose();
        channel.transport.dispose();
        this.channels.delete(projectUri);
        if (this.channels.size === 0) {
            this.migrationSubscriptionDisposable?.dispose();
            this.migrationSubscriptionDisposable = undefined;
            this.migrationSubscribed = false;
            this.downloadProgressDisposable?.dispose();
            this.downloadProgressDisposable = undefined;
            this.downloadProgressSubscribed = false;
        }
    }

    private static getOrCreateChannel(projectUri: string): BridgeChannel {
        const existing = this.channels.get(projectUri);
        if (existing) {
            return existing;
        }

        const wsManager = new MainWsManager(projectUri);
        const cloudManager = new CloudWsManager();
        const router = this.createRouter(wsManager, cloudManager);

        const transport = createExtensionTransportManager<WIBridgeRequest, WIBridgeResponse>({
            initialMode: "proxy",
            wsPort: this.resolveWebSocketPort(),
            handleRequest: (request) => router.handle(request),
        });

        const channel: BridgeChannel = { transport };
        this.channels.set(projectUri, channel);

        // Subscribe to cloud state changes and forward as bridge events
        cloudManager.setupSubscriptions(
            (state) => this.notifyAuthStateChanged(projectUri, state),
            (state) => this.notifyContextStateChanged(projectUri, state),
        );

        // Subscribe to AI migration streaming events from the Ballerina extension
        this.setupMigrationSubscription(projectUri);

        return channel;
    }

    /**
     * Subscribe to AI migration streaming events from the Ballerina extension.
     * Safe to call multiple times — only the first call with a valid API sets up the listener.
     * Broadcasts to all active channels so that any open webview receives events.
     */
    static setupMigrationSubscription(_projectUri: string): void {
        if (this.migrationSubscribed) {
            return;
        }
        if (ballerinaContext.migration?.onChatNotify) {
            this.migrationSubscribed = true;
            this.migrationSubscriptionDisposable = ballerinaContext.migration.onChatNotify((event) => {
                this.channels.forEach((_channel, uri) => {
                    this.notifyChatEvent(uri, event);
                });
            });
        }
    }

    /**
     * Subscribe to download-progress events from the Ballerina extension.
     * Safe to call multiple times — only the first call with a valid event sets up the listener.
     * Broadcasts to all active channels so that any open webview receives progress updates.
     */
    static setupDownloadProgressSubscription(): void {
        if (this.downloadProgressSubscribed) {
            return;
        }
        if (ballerinaContext.onDownloadProgress) {
            this.downloadProgressSubscribed = true;
            this.downloadProgressDisposable = ballerinaContext.onDownloadProgress((progress) => {
                this.channels.forEach((_channel, uri) => {
                    this.notifyDownloadProgress(uri, progress as DownloadProgress);
                });
            });
        }
    }

    private static createRouter(wsManager: MainWsManager, cloudManager: CloudWsManager): RequestRouter {
        const router = createRequestRouter<WIBridgeRequest, WIBridgeResponse>({
            onUnknownAction: (request) => this.createWsErrorResponse(request.action, `Unsupported ws action: ${request.action}`),
        });

        function registerRoute<TAction extends WIWsMethod>(
            action: TAction,
            handler: (
                request: Extract<WIBridgeRequest, { action: TAction }>
            ) => Promise<WIWsMethodResultMap[TAction]> | WIWsMethodResultMap[TAction]
        ) {
            router.register(action, async (request) => {
                try {
                    const result = await handler(request);
                    return BridgeLayer.createWsSuccessResponse(action, result);
                } catch (error) {
                    return BridgeLayer.createWsErrorResponse(action, BridgeLayer.toErrorMessage(error));
                }
            });
        }

        registerRoute("getWebviewContext", async () => wsManager.getWebviewContext());
        registerRoute("getRecentProjects", async () => wsManager.getRecentProjects());
        registerRoute("closeWebview", async () => wsManager.closeWebview());
        registerRoute("openBiExtension", async () => wsManager.openBiExtension());
        registerRoute("openMiExtension", async () => wsManager.openMiExtension());
        registerRoute("openSettings", async (request) => wsManager.openSettings(request.params));
        registerRoute("runCommand", async (request) => wsManager.runCommand(request.params as RunCommandRequest));
        registerRoute("selectFileOrDirPath", async (request) =>
            wsManager.selectFileOrDirPath(request.params as FileOrDirRequest)
        );
        registerRoute("selectFileOrFolderPath", async () => wsManager.selectFileOrFolderPath());
        registerRoute("getWorkspaceRoot", async () => wsManager.getWorkspaceRoot());
        registerRoute("getConfiguration", async (request) =>
            wsManager.getConfiguration(request.params as GetConfigurationRequest)
        );
        registerRoute("setConfiguration", async (request) =>
            wsManager.setConfiguration(request.params as SetConfigurationRequest)
        );
        registerRoute("getSupportedMIVersionsHigherThan", async (request) =>
            wsManager.getSupportedMIVersionsHigherThan(request.params)
        );
        registerRoute("getSubFolderNames", async (request) =>
            wsManager.getSubFolderNames(request.params as GetSubFoldersRequest)
        );
        registerRoute("askProjectDirPath", async () => wsManager.askProjectDirPath());
        registerRoute("createMiProject", async (request) =>
            wsManager.createMiProject(request.params as CreateMiProjectRequest)
        );
        registerRoute("importProjectFromCapp", async () => wsManager.importProjectFromCapp());
        registerRoute("createSiProject", async (request) =>
            wsManager.createSiProject(request.params as CreateSiProjectRequest)
        );
        registerRoute("fetchSamplesFromGithub", async (request) =>
            wsManager.fetchSamplesFromGithub(request.params as FetchSamplesRequest)
        );
        registerRoute("downloadSelectedSampleFromGithub", async (request) =>
            wsManager.downloadSelectedSampleFromGithub(request.params as SampleDownloadRequest)
        );
        registerRoute("createBIProject", async (request) => wsManager.createBIProject(request.params as BIProjectRequest));
        registerRoute("getMigrationTools", async () => wsManager.getMigrationTools());
        registerRoute("isSupportedSLVersion", async (request) =>
            wsManager.isSupportedSLVersion(request.params as SemanticVersion)
        );
        registerRoute("migrateProject", async (request) => wsManager.migrateProject(request.params as MigrateRequest));
        registerRoute("pullMigrationTool", async (request) =>
            wsManager.pullMigrationTool(request.params as PullMigrationToolRequest)
        );
        registerRoute("importIntegration", async (request) =>
            wsManager.importIntegration(request.params as ImportIntegrationWsRequest)
        );
        registerRoute("showErrorMessage", async (request) =>
            wsManager.showErrorMessage(request.params as ShowErrorMessageRequest)
        );
        registerRoute("openMigrationReport", async (request) =>
            wsManager.openMigrationReport(request.params as OpenMigrationReportRequest)
        );
        registerRoute("saveMigrationReport", async (request) =>
            wsManager.saveMigrationReport(request.params as SaveMigrationReportRequest)
        );
        registerRoute("storeSubProjectReports", async (request) =>
            wsManager.storeSubProjectReports(request.params as StoreSubProjectReportsRequest)
        );
        registerRoute("validateProjectPath", async (request) =>
            wsManager.validateProjectPath(request.params as ValidateProjectFormRequest)
        );
        registerRoute("openFolder", async (request) => wsManager.openFolder(request.params));
        registerRoute("openExternal", async (request) => wsManager.openExternal(request.params));
        registerRoute("setWebviewCache", async (request) =>
            wsManager.setWebviewCache(request.params as SetWebviewCacheParams)
        );
        registerRoute("restoreWebviewCache", async (request) => wsManager.restoreWebviewCache(request.params));
        registerRoute("clearWebviewCache", async (request) => wsManager.clearWebviewCache(request.params));
        registerRoute("getDefaultOrgName", async () => cloudManager.getDefaultOrgName());
        registerRoute("getDefaultCreationPath", async () => wsManager.getDefaultCreationPath());
        registerRoute("wizardEnhancementReady", async () => wsManager.wizardEnhancementReady());
        registerRoute("openMigratedProject", async () => wsManager.openMigratedProject());
        registerRoute("abortMigrationAgent", async () => wsManager.abortMigrationAgent());
        registerRoute("checkAIAuth", async () => wsManager.checkAIAuth());
        registerRoute("triggerAICopilotSignIn", async () => wsManager.triggerAICopilotSignIn());
        registerRoute("triggerAnthropicKeySignIn", async (request) => wsManager.triggerAnthropicKeySignIn(request.params));
        registerRoute("triggerAwsBedrockSignIn", async (request) => wsManager.triggerAwsBedrockSignIn(request.params));
        registerRoute("triggerVertexAiSignIn", async (request) => wsManager.triggerVertexAiSignIn(request.params));
        registerRoute("getBIRuntimeStatus", async () => wsManager.getBIRuntimeStatus());
        registerRoute("initBIRuntimeContext", async () => wsManager.initBIRuntimeContext());

        // ── Cloud routes ──────────────────────────────────────────
        registerRoute("getCloudFormContext", async () => cloudManager.getCloudFormContext());
        registerRoute("submitComponents", async (request) =>
            cloudManager.submitComponents(request.params as WICloudSubmitComponentsReq)
        );
        registerRoute("closeCloudFormWebview", async () => cloudManager.closeCloudFormWebview());
        registerRoute("getAuthState", async () => cloudManager.getAuthState());
        registerRoute("getContextState", async () => cloudManager.getContextState());
        registerRoute("changeOrgContext", async (request) => cloudManager.changeOrgContext(request.params));
        registerRoute("getLocalGitData", async (request) => cloudManager.getLocalGitData(request.params));
        registerRoute("hasDirtyRepo", async (request) => cloudManager.hasDirtyRepo(request.params));
        registerRoute("getConfigFileDrifts", async (request) =>
            cloudManager.getConfigFileDrifts(request.params as GetConfigFileDriftsReq)
        );
        registerRoute("triggerGithubAuthFlow", async (request) => cloudManager.triggerGithubAuthFlow(request.params));
        registerRoute("triggerGithubInstallFlow", async (request) => cloudManager.triggerGithubInstallFlow(request.params));
        registerRoute("getBranches", async (request) =>
            cloudManager.getBranches(request.params as GetBranchesReq)
        );
        registerRoute("getAuthorizedGitOrgs", async (request) =>
            cloudManager.getAuthorizedGitOrgs(request.params as GetAuthorizedGitOrgsReq)
        );
        registerRoute("getCredentials", async (request) =>
            cloudManager.getCredentials(request.params as GetCredentialsReq)
        );
        registerRoute("getCredentialDetails", async (request) =>
            cloudManager.getCredentialDetails(request.params as GetCredentialDetailsReq)
        );
        registerRoute("isRepoAuthorized", async (request) =>
            cloudManager.isRepoAuthorized(request.params as IsRepoAuthorizedReq)
        );
        registerRoute("getGitRepoMetadata", async (request) =>
            cloudManager.getGitRepoMetadata(request.params as GetGitMetadataReq)
        );
        registerRoute("cloneRepositoryIntoCompDir", async (request) =>
            cloudManager.cloneRepositoryIntoCompDir(request.params as CloneRepositoryIntoCompDirReq)
        );
        registerRoute("getConsoleUrl", async () => cloudManager.getConsoleUrl());
        registerRoute("getCloudProjects", async (request) =>
            cloudManager.getCloudProjects(request.params as GetCloudProjectsReq)
        );

        return router;
    }

    private static getChannel(projectUri: string): BridgeChannel | undefined {
        const channel = this.channels.get(projectUri);
        if (channel) {
            return channel;
        }
        return this.channels.values().next().value;
    }

    private static publish(projectUri: string, response: WIBridgeResponse): void {
        this.getChannel(projectUri)?.transport.publish(response);
    }

    private static createWsSuccessResponse<TAction extends WIWsMethod>(
        action: TAction,
        result: WIWsMethodResultMap[TAction]
    ): WIWsResponseMessage {
        return {
            type: WI_BRIDGE_EVENTS.WS_RESPONSE,
            action,
            success: true,
            result,
        } as WIWsResponseMessage;
    }

    private static createWsErrorResponse(action: WIWsMethod, error: string): WIWsResponseMessage {
        return {
            type: WI_BRIDGE_EVENTS.WS_RESPONSE,
            action,
            success: false,
            error,
        };
    }

    private static toErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    private static resolveWebSocketPort(): number {
        const configuredPort = Number(process.env.WEB_VIEW_BRIDGE_PORT);
        if (Number.isInteger(configuredPort) && configuredPort >= 0) {
            return configuredPort;
        }

        // Let the OS allocate an available port when one is not explicitly configured.
        return 0;
    }
}
