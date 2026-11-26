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

import { existsSync, rmSync } from "fs";
import { join } from "path";
import { NotSupportedError } from "@wso2/wso2-cloud-client";
import type { DevantClient, DevantOrganization, DevantStoredSession } from "@wso2/wso2-cloud-client/devant/vscode";
import type {
	AuthState,
	ComponentKind,
	ContextItemEnriched,
	ContextStoreComponentState,
	ContextStoreState,
	IWso2PlatformExtensionAPI,
	Organization,
	Project,
	WebviewState,
} from "@wso2/wso2-platform-core";
import { ext } from "../../../extensionVariables";
import { isSamePath } from "../../../utils/pathUtils";
import { openClonedDir } from "../../cloud-uri-handlers";
import { createConnectionConfig, deleteLocalConnectionConfig } from "../../cloud-utils";
import { hasDirtyRepo } from "../../git/util";
import { contextStore } from "../../stores/context-store";

export interface DevantExtensionApiDeps {
	client(): DevantClient;
	/** The Devant project of a handle, as last listed. */
	projectOf(handle: string): Project | undefined;
	/** A project's component by name, as last listed. */
	componentOf(projectHandle: string, name: string): ComponentKind | undefined;
}

/** What WSO2 Integrator 5.1 kept in its webview state; only the environment is read. */
const WEBVIEW_STATE: Omit<WebviewState, "choreoEnv"> = { extensionName: "Devant", openedComponentKey: "", componentViews: {} };

function legacyOrganization(org: DevantOrganization): Organization {
	return { id: Number(org.id), uuid: org.uuid, handle: org.handle, name: org.name, owner: { id: "", idpId: "", createdAt: new Date(0) } };
}

/**
 * The API WSO2 Integrator 5.1 exported to the Ballerina extension, on Devant, built from this editor's stores and
 * Devant's client. Its one call that handed out the platform token is refused: Devant's token stays in this editor.
 */
export function devantExtensionApi(deps: DevantExtensionApiDeps): IWso2PlatformExtensionAPI {
	let session: DevantStoredSession | undefined;
	// The person's details are read when the sign-in state changes, so the reads below can answer at once.
	const refresh = () => {
		deps
			.client()
			.session()
			.then((current) => {
				session = current;
			})
			.catch((): undefined => undefined);
	};
	refresh();
	ext.authProvider?.subscribe(refresh);

	const authState = (): AuthState => {
		const details = ext.authProvider?.isLoggedIn ? session?.devant : undefined;
		if (!details) {
			return { userInfo: null, region: deps.client().region };
		}
		return {
			region: details.region,
			userInfo: {
				displayName: details.user.displayName,
				userEmail: details.user.userEmail,
				userProfilePictureUrl: details.user.userProfilePictureUrl ?? "",
				idpId: details.user.idpId,
				userId: details.user.userId,
				userCreatedAt: new Date(0),
				organizations: details.organizations.map(legacyOrganization),
			},
		};
	};

	const legacyItem = (item: { orgHandle: string; projectName: string; contextDirs: ContextItemEnriched["contextDirs"] }): ContextItemEnriched => {
		const org = session?.devant.organizations.find((candidate) => candidate.handle === item.orgHandle);
		return {
			orgHandle: item.orgHandle,
			projectHandle: item.projectName,
			org: org && legacyOrganization(org),
			project: deps.projectOf(item.projectName),
			contextDirs: item.contextDirs,
		};
	};

	const components = (): ContextStoreComponentState[] => {
		const { selected, integrations } = contextStore.getState().state;
		return (integrations ?? []).map((item) => ({
			component: selected ? deps.componentOf(selected.projectName, item.integration.id) : undefined,
			workspaceName: item.workspaceName,
			componentFsPath: item.fsPath,
			componentRelativePath: item.relativePath,
		}));
	};
	const componentsOfDir = (fsPath: string): ComponentKind[] =>
		components()
			.filter((item) => isSamePath(item.componentFsPath, fsPath))
			.map((item) => item.component)
			.filter((item): item is ComponentKind => !!item);
	const selectedItem = (): ContextItemEnriched | undefined => {
		const selected = contextStore.getState().state.selected;
		return selected ? legacyItem(selected) : undefined;
	};
	const api = () => deps.client().api;

	return {
		isActive: () => !!ext.backend,
		getAuthState: authState,
		isLoggedIn: () => !!ext.authProvider?.isLoggedIn,
		getDirectoryComponents: componentsOfDir,
		localRepoHasChanges: (fsPath) => hasDirtyRepo(fsPath, ext.context),
		getWebviewStateStore: () => ({ ...WEBVIEW_STATE, choreoEnv: deps.client().deployment().deployment }),
		getContextStateStore: (): ContextStoreState => {
			const { items, loading } = contextStore.getState().state;
			return {
				items: Object.fromEntries(Object.entries(items).map(([key, item]) => [key, legacyItem(item)])),
				selected: selectedItem(),
				components: components(),
				loading,
			};
		},
		openClonedDir: (params) =>
			openClonedDir({
				orgHandle: params.orgHandle,
				projectName: params.projectHandle,
				integrationName: params.componentName,
				technology: params.technology,
				integrationType: params.integrationType,
				integrationDisplayType: params.integrationDisplayType,
			}),
		getStsToken: async () => {
			throw new NotSupportedError("Devant's token stays in WSO2 Integrator; use exchangeToken or request on the current API.", {
				reason: "token_not_exported",
			});
		},
		getMarketplaceItems: (params) => api().getMarketplaceItems(params),
		getMarketplaceDatabases: (params) => api().getMarketplaceDatabases(params),
		getMarketplaceDatabaseItem: (params) => api().getMarketplaceDatabaseItem(params),
		getDatabaseServer: (params) => api().getDatabaseServer(params),
		getDatabaseAdminCredential: (params) => api().getDatabaseAdminCredential(params),
		getDatabaseCredentials: (params) => api().getDatabaseCredentials(params),
		createDatabaseConnection: (params) => api().createDatabaseConnection(params),
		getMarketplaceItem: (params) => api().getMarketplaceItem(params),
		getSelectedContext: () => selectedItem() ?? null,
		getMarketplaceIdl: (params) => api().getMarketplaceIdl(params),
		createComponentConnection: (params) => api().createComponentConnection(params),
		createThirdPartyConnection: (params) => api().createThirdPartyConnection(params),
		createConnectionConfig: async (params) => {
			const resourceRef = await connectionResourceRef(deps, params);
			if (!resourceRef) {
				return "";
			}
			// 5.1 kept the service's own config files beside component.yaml; the connection replaces them.
			for (const dir of [".wso2", ".choreo"]) {
				for (const file of ["endpoints.yaml", "component-config.yaml"]) {
					const path = join(params.componentDir, dir, file);
					if (existsSync(path)) {
						rmSync(path);
					}
				}
			}
			return createConnectionConfig({ componentDir: params.componentDir, name: params.name, resourceRef });
		},
		registerMarketplaceConnection: (params) => api().registerMarketplaceConnection(params),
		getConnections: (params) => api().getConnections(params),
		getConnection: (params) => api().getConnectionItem(params),
		deleteConnection: (params) => api().deleteConnection(params),
		deleteLocalConnectionsConfig: (params) => deleteLocalConnectionConfig(params),
		getDevantConsoleUrl: async () => deps.client().deployment().consoleUrl,
		getProjectEnvs: (params) => api().getEnvs(params),
		startProxyServer: (params) => api().startProxyServer(params),
		stopProxyServer: (params) => api().stopProxyServer(params),
		getComponentList: (params) => api().getComponentList(params),
		resolveConnectionSecrets: (params) => api().resolveConnectionSecrets(params),
		updateProject: (params) => api().updateProject(params),
		getProjects: (orgId) => api().getProjects(orgId),
		subscribeAuthState: (callback) => ext.authProvider?.subscribe(() => callback(authState())) ?? (() => undefined),
		subscribeIsLoggedIn: (callback) => ext.authProvider?.subscribe(() => callback(!!ext.authProvider?.isLoggedIn)) ?? (() => undefined),
		subscribeDirComponents: (fsPath, callback) => contextStore.subscribe(() => callback(componentsOfDir(fsPath))),
		subscribeContextState: (callback) => contextStore.subscribe(() => callback(selectedItem())),
	};
}

/** The reference component.yaml names a connection's resource by, as 5.1 composed it. */
async function connectionResourceRef(
	deps: DevantExtensionApiDeps,
	params: Parameters<IWso2PlatformExtensionAPI["createConnectionConfig"]>[0],
): Promise<string | undefined> {
	const item = params.marketplaceItem;
	if (!item) {
		return undefined;
	}
	if (item.resourceType === "DATABASE") {
		return `database:${item.name}/${item.name}`;
	}
	if (item.isThirdParty) {
		return `thirdparty:${item.name}/${item.version}`;
	}
	const session = await deps.client().session();
	const org = session?.devant.organizations.find((candidate) => candidate.uuid === item.organizationId);
	if (!org) {
		return undefined;
	}
	const projects = await deps.client().api.getProjects(org.id);
	const project = projects.find((candidate) => candidate.id === item.projectId);
	if (!project) {
		return undefined;
	}
	const components = await deps.client().api.getComponentList({ orgId: org.id, orgHandle: org.handle, projectId: project.id, projectHandle: project.handler });
	const component = components.find((candidate) => candidate.metadata.id === item.component?.componentId);
	if (!component) {
		return undefined;
	}
	return `service:/${project.handler}/${component.metadata.handler}/v1/${item.component?.endpointId}/${params.visibility}`;
}
