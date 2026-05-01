/* eslint-disable @typescript-eslint/no-explicit-any */

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

import {
    BIProjectRequest,
    BIRuntimeStatusResponse,
    CreateMiProjectRequest,
    CreateMiProjectResponse,
    CreateSiProjectRequest,
    CreateSiProjectResponse,
    DownloadProgress,
    FetchSamplesRequest,
    FileOrDirRequest,
    FileOrDirResponse,
    GetConfigurationRequest,
    GetConfigurationResponse,
    GetRecentProjectsResponse,
    SetConfigurationRequest,
    GetMigrationToolsResponse,
    GetSubFoldersRequest,
    GetSubFoldersResponse,
    GetSupportedMIVersionsResponse,
    GettingStartedData,
    ImportIntegrationWsRequest,
    ImportIntegrationResponse,
    MigrateRequest,
    OpenMigrationReportRequest,
    ProjectDirResponse,
    ProjectMigrationResult,
    PullMigrationToolRequest,
    RunCommandRequest,
    RunCommandResponse,
    SampleDownloadRequest,
    SaveMigrationReportRequest,
    SemanticVersion,
    SetWebviewCacheParams,
    ShowErrorMessageRequest,
    StoreSubProjectReportsRequest,
    ValidateProjectFormRequest,
    ValidateProjectFormResponse,
    WebviewContext,
    WIBridgeRequest,
    WIBridgeResponse,
    WI_BRIDGE_EVENTS,
    WIWsMethod,
    WIWsMethodParamsMap,
    WIWsMethodResultMap,
    WITransportBootstrap,
    WorkspaceRootResponse,
    CloneProgressStage,
    WIChatNotify,
    SignInResult,
} from "@wso2/wi-core";
import type {
    AuthState,
    CloneRepositoryIntoCompDirReq,
    ContextStoreState,
    CredentialItem,
    DefaultOrgNameResponse,
    GetAuthorizedGitOrgsReq,
    GetAuthorizedGitOrgsResp,
    GetBranchesReq,
    GetConfigFileDriftsReq,
    GetCredentialDetailsReq,
    GetCredentialsReq,
    GetGitMetadataReq,
    GetGitMetadataResp,
    GetLocalGitDataResp,
    IsRepoAuthorizedReq,
    IsRepoAuthorizedResp,
    WICloudFormContext,
    WICloudSubmitComponentsReq,
    WICloudSubmitComponentsResp,
    GetCloudProjectsReq,
    GetCloudProjectsResp,
} from "@wso2/wi-core";
import { ConnectionStatus, createWebviewTransportAdapter } from "webview-giga-bridge/webview";

declare global {
    interface Window {
        __WI_BRIDGE_BOOTSTRAP?: WITransportBootstrap;
    }
}

function parseBridgeMode(rawMode: string | null): WITransportBootstrap["mode"] | undefined {
    if (rawMode === "proxy" || rawMode === "websocket") {
        return rawMode;
    }
    return undefined;
}

export function resolveBridgeBootstrap(): WITransportBootstrap {
    const urlParams = new URLSearchParams(window.location.search);
    const runtimeBootstrap = window.__WI_BRIDGE_BOOTSTRAP;
    const queryMode = parseBridgeMode(urlParams.get("bridgeMode"));
    const queryWsServer = urlParams.get("wsServer") ?? undefined;
    const queryWsPort = Number(urlParams.get("wsPort"));
    const runtimeWsPort = runtimeBootstrap?.wsPort;
    const hasVsCodeApi = typeof (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi === "function";
    const explicitMode = runtimeBootstrap?.mode ?? queryMode;
    const resolvedWsPort = Number.isFinite(queryWsPort) && queryWsPort > 0
        ? queryWsPort
        : Number.isFinite(runtimeWsPort) && runtimeWsPort > 0
            ? runtimeWsPort
            : 8787;

    return {
        mode: explicitMode ?? (hasVsCodeApi ? "proxy" : "websocket"),
        wsServer: queryWsServer ?? runtimeBootstrap?.wsServer ?? "127.0.0.1",
        wsPort: resolvedWsPort,
    };
}

export class WsClient {
    private readonly bootstrap = resolveBridgeBootstrap();
    private transport = createWebviewTransportAdapter<WIBridgeRequest, WIBridgeResponse>({
        mode: this.bootstrap.mode,
        server: this.bootstrap.wsServer,
        port: this.bootstrap.wsPort,
    });
    private readonly stateChangedListeners = new Set<(context: WebviewContext) => void>();
    private readonly downloadProgressListeners = new Set<(progress: DownloadProgress) => void>();
    private readonly migrationToolStateListeners = new Set<(state: string) => void>();
    private readonly migrationToolLogListeners = new Set<(log: string) => void>();
    private readonly migratedProjectListeners = new Set<(result: ProjectMigrationResult) => void>();
    // ── Cloud event listeners ─────────────────────────────────
    private readonly signInInitiatedListeners = new Set<() => void>();
    private readonly authStateChangedListeners = new Set<(state: AuthState) => void>();
    private readonly contextStateChangedListeners = new Set<(state: ContextStoreState) => void>();
    private readonly cloneProgressListeners = new Set<(stage: CloneProgressStage) => void>();
    private readonly chatNotifyListeners = new Set<(event: WIChatNotify) => void>();

    constructor() {
        this.transport.subscribe(
            (message: WIBridgeResponse) => this.handleIncomingMessage(message),
            (status: ConnectionStatus) => this.handleConnectionStatus(status)
        );
    }

    public getWebviewContext(): Promise<WebviewContext> {
        return this.request("getWebviewContext");
    }

    public getRecentProjects(): Promise<GetRecentProjectsResponse> {
        return this.request("getRecentProjects");
    }

    public closeWebview(): void {
        this.notify("closeWebview");
    }

    public openBiExtension(): void {
        this.notify("openBiExtension");
    }

    public openMiExtension(): void {
        this.notify("openMiExtension");
    }

    public openSettings(settingKey: string): void {
        this.notify("openSettings", settingKey);
    }

    public runCommand(params: RunCommandRequest): Promise<RunCommandResponse> {
        return this.request("runCommand", params);
    }

    public selectFileOrDirPath(params: FileOrDirRequest): Promise<FileOrDirResponse> {
        return this.request("selectFileOrDirPath", params);
    }

    public selectFileOrFolderPath(): Promise<FileOrDirResponse> {
        return this.request("selectFileOrFolderPath");
    }

    public getWorkspaceRoot(): Promise<WorkspaceRootResponse> {
        return this.request("getWorkspaceRoot");
    }

    public getConfiguration(params: GetConfigurationRequest): Promise<GetConfigurationResponse> {
        return this.request("getConfiguration", params);
    }

    public setConfiguration(params: SetConfigurationRequest): Promise<void> {
        return this.request("setConfiguration", params);
    }

    public getSupportedMIVersionsHigherThan(version: string): Promise<GetSupportedMIVersionsResponse> {
        return this.request("getSupportedMIVersionsHigherThan", version);
    }

    public getSubFolderNames(params: GetSubFoldersRequest): Promise<GetSubFoldersResponse> {
        return this.request("getSubFolderNames", params);
    }

    public askProjectDirPath(): Promise<ProjectDirResponse> {
        return this.request("askProjectDirPath");
    }

    public createMiProject(params: CreateMiProjectRequest): Promise<CreateMiProjectResponse> {
        return this.request("createMiProject", params);
    }

    public importProjectFromCapp(): Promise<void> {
        return this.request("importProjectFromCapp");
    }

    public createSiProject(params: CreateSiProjectRequest): Promise<CreateSiProjectResponse> {
        return this.request("createSiProject", params);
    }

    public fetchSamplesFromGithub(params: FetchSamplesRequest): Promise<GettingStartedData> {
        return this.request("fetchSamplesFromGithub", params);
    }

    public downloadSelectedSampleFromGithub(params: SampleDownloadRequest): void {
        this.notify("downloadSelectedSampleFromGithub", params);
    }

    public createBIProject(params: BIProjectRequest): Promise<void> {
        return this.request("createBIProject", params);
    }

    public validateProjectPath(params: ValidateProjectFormRequest): Promise<ValidateProjectFormResponse> {
        return this.request("validateProjectPath", params);
    }

    public getMigrationTools(): Promise<GetMigrationToolsResponse> {
        return this.request("getMigrationTools");
    }

    public isSupportedSLVersion(params: SemanticVersion): Promise<boolean> {
        return this.request("isSupportedSLVersion", params);
    }

    public migrateProject(params: MigrateRequest): Promise<void> {
        return this.request("migrateProject", params);
    }

    public storeSubProjectReports(params: StoreSubProjectReportsRequest): Promise<void> {
        return this.request("storeSubProjectReports", params);
    }

    public openFolder(folderPath: string): void {
        this.notify("openFolder", folderPath);
    }

    public openExternal(url: string): void {
        this.notify("openExternal", url);
    }

    public setWebviewCache(params: SetWebviewCacheParams): Promise<void> {
        return this.request("setWebviewCache", params);
    }

    public restoreWebviewCache(cacheKey: string): Promise<unknown> {
        return this.request("restoreWebviewCache", cacheKey);
    }

    public clearWebviewCache(cacheKey: string): Promise<void> {
        return this.request("clearWebviewCache", cacheKey);
    }

    public pullMigrationTool(params: PullMigrationToolRequest): Promise<void> {
        return this.request("pullMigrationTool", params);
    }

    public importIntegration(params: ImportIntegrationWsRequest): Promise<ImportIntegrationResponse> {
        return this.request("importIntegration", params);
    }

    public showErrorMessage(params: ShowErrorMessageRequest): Promise<void> {
        return this.request("showErrorMessage", params);
    }

    public openMigrationReport(params: OpenMigrationReportRequest): Promise<void> {
        return this.request("openMigrationReport", params);
    }

    public saveMigrationReport(params: SaveMigrationReportRequest): Promise<void> {
        return this.request("saveMigrationReport", params);
    }

    public onStateChanged(callback: (context: WebviewContext) => void) {
        this.stateChangedListeners.add(callback);
    }

    public onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void {
        this.downloadProgressListeners.add(callback);
        return () => this.downloadProgressListeners.delete(callback);
    }

    public onMigrationToolStateChanged(callback: (state: string) => void) {
        this.migrationToolStateListeners.add(callback);
    }

    public onMigrationToolLogs(callback: (log: string) => void) {
        this.migrationToolLogListeners.add(callback);
    }

    public onMigratedProject(callback: (result: ProjectMigrationResult) => void) {
        this.migratedProjectListeners.add(callback);
    }

    public getDefaultOrgName(): Promise<DefaultOrgNameResponse> {
        return this.request("getDefaultOrgName");
    }

    public getDefaultCreationPath(): Promise<WorkspaceRootResponse> {
        return this.request("getDefaultCreationPath");
    }

    // ── Cloud methods ─────────────────────────────────────────

    public getCloudFormContext(): Promise<WICloudFormContext> {
        return this.request("getCloudFormContext");
    }

    public submitComponents(params: WICloudSubmitComponentsReq): Promise<WICloudSubmitComponentsResp> {
        return this.request("submitComponents", params);
    }

    public closeCloudFormWebview(): void {
        this.notify("closeCloudFormWebview");
    }

    public getAuthState(): Promise<AuthState> {
        return this.request("getAuthState");
    }

    public getContextState(): Promise<ContextStoreState> {
        return this.request("getContextState");
    }

    public changeOrgContext(orgId: string): Promise<void> {
        return this.request("changeOrgContext", orgId);
    }

    public getLocalGitData(dirPath: string): Promise<GetLocalGitDataResp | undefined> {
        return this.request("getLocalGitData", dirPath);
    }

    public hasDirtyRepo(dirPath: string): Promise<boolean> {
        return this.request("hasDirtyRepo", dirPath);
    }

    public getConfigFileDrifts(params: GetConfigFileDriftsReq): Promise<string[]> {
        return this.request("getConfigFileDrifts", params);
    }

    public triggerGithubAuthFlow(orgId: string): Promise<void> {
        return this.request("triggerGithubAuthFlow", orgId);
    }

    public triggerGithubInstallFlow(orgId: string): Promise<void> {
        return this.request("triggerGithubInstallFlow", orgId);
    }

    public getBranches(params: GetBranchesReq): Promise<string[]> {
        return this.request("getBranches", params);
    }

    public getAuthorizedGitOrgs(params: GetAuthorizedGitOrgsReq): Promise<GetAuthorizedGitOrgsResp> {
        return this.request("getAuthorizedGitOrgs", params);
    }

    public getCredentials(params: GetCredentialsReq): Promise<CredentialItem[]> {
        return this.request("getCredentials", params);
    }

    public getCredentialDetails(params: GetCredentialDetailsReq): Promise<CredentialItem> {
        return this.request("getCredentialDetails", params);
    }

    public isRepoAuthorized(params: IsRepoAuthorizedReq): Promise<IsRepoAuthorizedResp> {
        return this.request("isRepoAuthorized", params);
    }

    public getGitRepoMetadata(params: GetGitMetadataReq): Promise<GetGitMetadataResp> {
        return this.request("getGitRepoMetadata", params);
    }

    public cloneRepositoryIntoCompDir(params: CloneRepositoryIntoCompDirReq): Promise<string> {
        return this.request("cloneRepositoryIntoCompDir", params);
    }

    public getConsoleUrl(): Promise<string> {
        return this.request("getConsoleUrl");
    }

    public getCloudProjects(params: GetCloudProjectsReq): Promise<GetCloudProjectsResp> {
        return this.request("getCloudProjects", params);
    }

    public onSignInInitiated(callback: () => void): () => void {
        this.signInInitiatedListeners.add(callback);
        return () => this.signInInitiatedListeners.delete(callback);
    }

    public onAuthStateChanged(callback: (state: AuthState) => void) {
        this.authStateChangedListeners.add(callback);
    }

    public onContextStateChanged(callback: (state: ContextStoreState) => void) {
        this.contextStateChangedListeners.add(callback);
    }

    public onCloneProgress(callback: (stage: CloneProgressStage) => void): () => void {
        this.cloneProgressListeners.add(callback);
        return () => this.cloneProgressListeners.delete(callback);
    }

    public onChatNotify(callback: (event: WIChatNotify) => void): () => void {
        this.chatNotifyListeners.add(callback);
        return () => this.chatNotifyListeners.delete(callback);
    }

    public async wizardEnhancementReady(): Promise<void> {
        await this.request("wizardEnhancementReady");
    }

    public async openMigratedProject(): Promise<void> {
        await this.request("openMigratedProject");
    }

    public async abortMigrationAgent(): Promise<void> {
        await this.request("abortMigrationAgent");
    }

    public async checkAIAuth(): Promise<boolean> {
        return this.request("checkAIAuth");
    }

    public async triggerAICopilotSignIn(): Promise<SignInResult> {
        return this.request("triggerAICopilotSignIn");
    }

    public async triggerAnthropicKeySignIn(params: { apiKey: string }): Promise<SignInResult> {
        return this.request("triggerAnthropicKeySignIn", params);
    }

    public async triggerAwsBedrockSignIn(params: { accessKeyId: string; secretAccessKey: string; region: string; sessionToken?: string }): Promise<SignInResult> {
        return this.request("triggerAwsBedrockSignIn", params);
    }

    public async triggerVertexAiSignIn(params: { projectId: string; location: string; clientEmail: string; privateKey: string }): Promise<SignInResult> {
        return this.request("triggerVertexAiSignIn", params);
    }

    public getBIRuntimeStatus(): Promise<BIRuntimeStatusResponse> {
        return this.request("getBIRuntimeStatus");
    }

    public initBIRuntimeContext(): Promise<void> {
        return this.request("initBIRuntimeContext");
    }

    public async request<TAction extends WIWsMethod>(
        action: TAction,
        ...args: WIWsMethodParamsMap[TAction] extends void ? [] : [WIWsMethodParamsMap[TAction]]
    ): Promise<WIWsMethodResultMap[TAction]> {
        const request = this.createRequestPayload(action, args[0] as WIWsMethodParamsMap[TAction] | undefined);
        const response = await this.transport.request(request);

        if (response.type !== WI_BRIDGE_EVENTS.WS_RESPONSE || response.action !== action) {
            throw new Error(`Unexpected response type for "${action}"`);
        }

        if (!response.success) {
            const errorMessage = "error" in response ? response.error : undefined;
            throw new Error(errorMessage ?? `Request failed for "${action}"`);
        }

        return response.result as WIWsMethodResultMap[TAction];
    }

    public notify<TAction extends WIWsMethod>(
        action: TAction,
        ...args: WIWsMethodParamsMap[TAction] extends void ? [] : [WIWsMethodParamsMap[TAction]]
    ): void {
        void this.request(action, ...args).catch((error) => {
            console.warn(`[WI] Failed to send "${action}" message`, error);
        });
    }

    private createRequestPayload<TAction extends WIWsMethod>(
        action: TAction,
        params: WIWsMethodParamsMap[TAction] | undefined
    ): Extract<WIBridgeRequest, { action: TAction }> {
        if (params === undefined) {
            return { action } as Extract<WIBridgeRequest, { action: TAction }>;
        }
        return {
            action,
            params,
        } as Extract<WIBridgeRequest, { action: TAction }>;
    }

    private handleIncomingMessage(message: WIBridgeResponse): void {
        switch (message.type) {
            case WI_BRIDGE_EVENTS.STATE_CHANGED:
                this.stateChangedListeners.forEach((listener) => listener(message.context));
                return;
            case WI_BRIDGE_EVENTS.DOWNLOAD_PROGRESS:
                this.downloadProgressListeners.forEach((listener) => listener(message.progress));
                return;
            case WI_BRIDGE_EVENTS.MIGRATION_TOOL_STATE_CHANGED:
                this.migrationToolStateListeners.forEach((listener) => listener(message.state.state));
                return;
            case WI_BRIDGE_EVENTS.MIGRATION_TOOL_LOGS:
                this.migrationToolLogListeners.forEach((listener) => listener(message.log.log));
                return;
            case WI_BRIDGE_EVENTS.MIGRATED_PROJECT:
                this.migratedProjectListeners.forEach((listener) => listener(message.project));
                return;
            // ── Cloud events ──────────────────────────────────────
            case WI_BRIDGE_EVENTS.SIGN_IN_INITIATED:
                this.signInInitiatedListeners.forEach((listener) => listener());
                return;
            case WI_BRIDGE_EVENTS.AUTH_STATE_CHANGED:
                this.authStateChangedListeners.forEach((listener) => listener(message.state));
                return;
            case WI_BRIDGE_EVENTS.CONTEXT_STATE_CHANGED:
                this.contextStateChangedListeners.forEach((listener) => listener(message.state));
                return;
            case WI_BRIDGE_EVENTS.CLONE_PROGRESS:
                this.cloneProgressListeners.forEach((listener) => listener(message.stage));
                return;
            case WI_BRIDGE_EVENTS.CHAT_NOTIFY:
                this.chatNotifyListeners.forEach((listener) => listener(message.event));
                return;
            case WI_BRIDGE_EVENTS.WS_RESPONSE:
            default:
                return;
        }
    }

    private handleConnectionStatus(status: ConnectionStatus): void {
        if (status === "error") {
            console.warn("[WI] Bridge connection error");
        }
    }
}
