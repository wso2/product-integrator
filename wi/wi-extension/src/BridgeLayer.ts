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
import { createExtensionTransportManager, createRequestRouter } from "vscode-webview-network-bridge";
import {
    BIProjectRequest,
    CreateMiProjectRequest,
    DownloadProgress,
    FetchSamplesRequest,
    FileOrDirRequest,
    GetConfigurationRequest,
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
} from "@wso2/wi-core";
import { MainWsManager } from "./ws-managers/main/ws-manager";

type TransportManager = ReturnType<typeof createExtensionTransportManager<WIBridgeRequest, WIBridgeResponse>>;
type RequestRouter = ReturnType<typeof createRequestRouter<WIBridgeRequest, WIBridgeResponse>>;

interface BridgeChannel {
    transport: TransportManager;
    registration?: { dispose(): void };
}

export class BridgeLayer {
    private static channels: Map<string, BridgeChannel> = new Map();

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
        if (!channel.transport.isWebSocketServerRunning()) {
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

    static dispose(projectUri: string): void {
        const channel = this.channels.get(projectUri);
        if (!channel) {
            return;
        }
        channel.registration?.dispose();
        channel.transport.dispose();
        this.channels.delete(projectUri);
    }

    private static getOrCreateChannel(projectUri: string): BridgeChannel {
        const existing = this.channels.get(projectUri);
        if (existing) {
            return existing;
        }

        const wsManager = new MainWsManager(projectUri);
        const router = this.createRouter(wsManager);

        const transport = createExtensionTransportManager<WIBridgeRequest, WIBridgeResponse>({
            initialMode: "proxy",
            wsPort: this.resolveWebSocketPort(),
            handleRequest: (request) => router.handle(request),
        });

        const channel: BridgeChannel = { transport };
        this.channels.set(projectUri, channel);
        return channel;
    }

    private static createRouter(wsManager: MainWsManager): RequestRouter {
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
        const fallbackPort = 8787;
        const configuredPort = Number(process.env.WEB_VIEW_BRIDGE_PORT);
        return Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : fallbackPort;
    }
}
