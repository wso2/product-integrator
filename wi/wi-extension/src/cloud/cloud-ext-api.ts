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

import type {
	AuthState,
	ComponentKind,
	ContextItemEnriched,
	ContextStoreComponentState,
	IWso2PlatformExtensionAPI,
} from "@wso2/wso2-platform-core";
import { ext } from "../extensionVariables";
import { hasDirtyRepo } from "./git/util";
import { openClonedDir } from "./cloud-uri-handlers";
import { contextStore } from "./stores/context-store";
import { webviewStateStore } from "./stores/webview-state-store";
import { createConnectionConfig, deleteLocalConnectionConfig } from "./cloud-utils";
import { isSamePath } from "../utils/pathUtils";

/**
 * Implements IWso2PlatformExtensionAPI using wi-extension's own stores and RPC client.
 * Mirrors PlatformExtensionApi from the wso2-platform extension.
 */
export class WICloudExtensionAPI implements IWso2PlatformExtensionAPI {
	private getComponentsOfDir = (fsPath: string, components?: ContextStoreComponentState[]): ComponentKind[] =>
		(components
			?.filter((item) => isSamePath(item?.componentFsPath, fsPath))
			?.map((item) => item?.component)
			?.filter((item) => !!item) as ComponentKind[]) ?? [];

	// Auth
	public getAuthState = (): AuthState =>
		ext.authProvider?.getState().state ?? { userInfo: null, region: "US" as const };
	public isLoggedIn = (): boolean => !!ext.authProvider?.getState().state?.userInfo;
	public getStsToken = (): Promise<string> => ext.clients.rpcClient.getStsToken();

	// Project
	public getProjects = (orgId: string) => ext.clients.rpcClient.getProjects(orgId);
	public updateProject = (params: Parameters<IWso2PlatformExtensionAPI["updateProject"]>[0]) =>
		ext.clients.rpcClient.updateProject(params);

	// Context
	public getDirectoryComponents = (fsPath: string): ComponentKind[] =>
		this.getComponentsOfDir(fsPath, contextStore.getState().state?.components);
	public getSelectedContext = (): ContextItemEnriched | null =>
		contextStore.getState().state?.selected || null;
	public getContextStateStore = () => contextStore.getState().state;
	public getWebviewStateStore = () => webviewStateStore.getState().state;

	// Git
	public localRepoHasChanges = (fsPath: string): Promise<boolean> =>
		hasDirtyRepo(fsPath, ext.context, ["context.yaml"]);

	// Navigation
	public openClonedDir = (params: Parameters<IWso2PlatformExtensionAPI["openClonedDir"]>[0]): Promise<void> =>
		openClonedDir(params);

	// Marketplace
	public getMarketplaceItems = (params: Parameters<IWso2PlatformExtensionAPI["getMarketplaceItems"]>[0]) =>
		ext.clients.rpcClient.getMarketplaceItems(params);
	public getMarketplaceDatabases = (params: Parameters<IWso2PlatformExtensionAPI["getMarketplaceDatabases"]>[0]) =>
		ext.clients.rpcClient.getMarketplaceDatabases(params);
	public getMarketplaceDatabaseItem = (params: Parameters<IWso2PlatformExtensionAPI["getMarketplaceDatabaseItem"]>[0]) =>
		ext.clients.rpcClient.getMarketplaceDatabaseItem(params);
	public getMarketplaceItem = (params: Parameters<IWso2PlatformExtensionAPI["getMarketplaceItem"]>[0]) =>
		ext.clients.rpcClient.getMarketplaceItem(params);
	public getMarketplaceIdl = (params: Parameters<IWso2PlatformExtensionAPI["getMarketplaceIdl"]>[0]) =>
		ext.clients.rpcClient.getMarketplaceIdl(params);

	// Database
	public getDatabaseServer = (params: Parameters<IWso2PlatformExtensionAPI["getDatabaseServer"]>[0]) =>
		ext.clients.rpcClient.getDatabaseServer(params);
	public getDatabaseAdminCredential = (params: Parameters<IWso2PlatformExtensionAPI["getDatabaseAdminCredential"]>[0]) =>
		ext.clients.rpcClient.getDatabaseAdminCredential(params);
	public getDatabaseCredentials = (params: Parameters<IWso2PlatformExtensionAPI["getDatabaseCredentials"]>[0]) =>
		ext.clients.rpcClient.getDatabaseCredentials(params);
	public createDatabaseConnection = (params: Parameters<IWso2PlatformExtensionAPI["createDatabaseConnection"]>[0]) =>
		ext.clients.rpcClient.createDatabaseConnection(params);

	// Connections
	public createComponentConnection = (params: Parameters<IWso2PlatformExtensionAPI["createComponentConnection"]>[0]) =>
		ext.clients.rpcClient.createComponentConnection(params);
	public createThirdPartyConnection = (params: Parameters<IWso2PlatformExtensionAPI["createThirdPartyConnection"]>[0]) =>
		ext.clients.rpcClient.createThirdPartyConnection(params);
	public createConnectionConfig = (params: Parameters<IWso2PlatformExtensionAPI["createConnectionConfig"]>[0]) =>
		createConnectionConfig(params);
	public registerMarketplaceConnection = (params: Parameters<IWso2PlatformExtensionAPI["registerMarketplaceConnection"]>[0]) =>
		ext.clients.rpcClient.registerMarketplaceConnection(params);
	public getConnections = (params: Parameters<IWso2PlatformExtensionAPI["getConnections"]>[0]) =>
		ext.clients.rpcClient.getConnections(params);
	public getConnection = (params: Parameters<IWso2PlatformExtensionAPI["getConnection"]>[0]) =>
		ext.clients.rpcClient.getConnectionItem(params);
	public deleteConnection = (params: Parameters<IWso2PlatformExtensionAPI["deleteConnection"]>[0]) =>
		ext.clients.rpcClient.deleteConnection(params);
	public deleteLocalConnectionsConfig = (params: Parameters<IWso2PlatformExtensionAPI["deleteLocalConnectionsConfig"]>[0]): void =>
		deleteLocalConnectionConfig(params);
	public resolveConnectionSecrets = (params: Parameters<IWso2PlatformExtensionAPI["resolveConnectionSecrets"]>[0]) =>
		ext.clients.rpcClient.resolveConnectionSecrets(params);

	// Environments & console
	public getDevantConsoleUrl = async (): Promise<string> => ext.config?.devantConsoleUrl;
	public getProjectEnvs = (params: Parameters<IWso2PlatformExtensionAPI["getProjectEnvs"]>[0]) =>
		ext.clients.rpcClient.getEnvs(params);
	public getComponentList = (params: Parameters<IWso2PlatformExtensionAPI["getComponentList"]>[0]) =>
		ext.clients.rpcClient.getComponentList(params);

	// Proxy
	public startProxyServer = (params: Parameters<IWso2PlatformExtensionAPI["startProxyServer"]>[0]) =>
		ext.clients.rpcClient.startProxyServer(params);
	public stopProxyServer = (params: Parameters<IWso2PlatformExtensionAPI["stopProxyServer"]>[0]) =>
		ext.clients.rpcClient.stopProxyServer(params);

	// Auth subscriptions
	public subscribeAuthState = (callback: (state: AuthState) => void): (() => void) =>
		ext.authProvider?.subscribe((s) => callback(s.state)) ?? (() => { });
	public subscribeIsLoggedIn = (callback: (isLoggedIn: boolean) => void): (() => void) =>
		ext.authProvider?.subscribe((s) => callback(!!s.state?.userInfo)) ?? (() => { });

	// Context subscriptions
	public subscribeContextState = (callback: (state: ContextItemEnriched | undefined) => void): (() => void) =>
		contextStore.subscribe((s) => callback(s.state?.selected));
	public subscribeDirComponents = (fsPath: string, callback: (comps: ComponentKind[]) => void): (() => void) =>
		contextStore.subscribe((s) => callback(this.getComponentsOfDir(fsPath, s.state.components)));
}
