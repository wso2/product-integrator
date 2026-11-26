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

import type { CloudEnvironment, Logger } from "@wso2/wso2-cloud-client";
import { devantBackend } from "@wso2/wso2-cloud-client/devant/vscode";
import type { DevantClient } from "@wso2/wso2-cloud-client/devant/vscode";
import { CLOUD_ENV_SETTING, CLOUD_PLATFORM_STATE_KEY, readCloudEnvName } from "@wso2/wso2-cloud-client/vscode";
import { WICommandIds } from "@wso2/wso2-platform-core";
import * as vscode from "vscode";
import type { ConfigurationChangeEvent } from "vscode";
import { commands, window, workspace } from "vscode";
import { ext } from "../extensionVariables";
import { getExtVersion } from "../utils/commonUtils";
import { WIAuthState } from "./auth/wso2-auth-provider";
import { CHOREO_CLOUD_PLATFORM, choreoCloudBackend } from "./backend/choreo-cloud";
import { ChoreoCloudSourceControl } from "./backend/choreo-cloud-source-control";
import { DEVANT_PLATFORM, devantCloudBackend } from "./backend/devant";
import { ENABLE_DEVANT_SETTING, type PlatformSigns, isDevantOffered, startingPlatform } from "./backend/devant/detection";
import { CloudBackends } from "./backend/registry";
import type { WICloudExtensionAPI } from "./cloud-ext-api";
import { cloneOpenedIntegration } from "./clone-on-open";
import { activateURIHandlers } from "./cloud-uri-handlers";
import { activateCmds } from "./cmds";
import { submitCreateComponentHandler } from "./cmds/create-component-cmd";
import { PLATFORMS_OFFERED_CONTEXT } from "./cmds/platform-cmd";
import { MULTI_REGION_CONTEXT } from "./cmds/region-cmd";
import { createGitHubAppConnector } from "./github-app-host";
import { describeCloudError, handleCloudError } from "./platform/error-handler";
import { createWIPlatform } from "./platform/platform-client";
import { type CloudServiceUrls, readCloudServiceUrls } from "./service-urls";
import { watchContextFiles } from "./context-watcher";
import { contextStore } from "./stores/context-store";
import { dataCacheStore } from "./stores/data-cache-store";
import { locationStore } from "./stores/location-store";

/**
 * Boot the cloud functionality: environment → stores → platform client and the
 * `wso2-cloud` authentication provider → commands and URI handlers → restore the
 * session → mark the exported API active. Nothing is spawned and nothing waits
 * on a process, so this completes in milliseconds.
 */
export async function activateCloudFunctionality(context: vscode.ExtensionContext, cloudAPIs: WICloudExtensionAPI): Promise<void> {
	const logger: Logger = {
		debug: (message) => ext.log(message),
		info: (message) => ext.log(message),
		warn: (message) => ext.log(`WARN: ${message}`),
		error: (message, error) => ext.logError(message, error as Error),
	};

	// Commands registered below may run before the session is restored (a console link that
	// activated the extension, the Ballerina SSO flow); they wait for this.
	let restored: () => void = () => undefined;
	ext.cloudReady = new Promise<void>((resolve) => {
		restored = resolve;
	});

	// Registered first: a configuration that leaves the cloud features off below is fixed by changing it.
	context.subscriptions.push(registerPreInitHandlers());

	// 1. The platform client, sessions and authentication provider, from the environment setting.
	let platform: ReturnType<typeof createWIPlatform>;
	try {
		// Before the clients: a managed-tokens URL that is not https leaves the cloud features off, as an
		// API URL that is not does, rather than the token being sent there.
		readCloudServiceUrls(readCloudEnvName());
		// Devant is offered only to someone seen using it, or who turned it on; nobody else is asked about it.
		const signs: PlatformSigns = {
			globalState: context.globalState,
			workspaceState: context.workspaceState,
			workspaceRoots: (workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
			devantEnabled: workspace.getConfiguration().get<boolean>(ENABLE_DEVANT_SETTING) === true,
		};
		const devant = isDevantOffered(signs) ? devantBackend({ deployment: readCloudEnvName() }) : undefined;
		platform = createWIPlatform({
			backends: devant ? [devant] : undefined,
			initialPlatform: devant ? startingPlatform(signs, context.globalState.get<string>(CLOUD_PLATFORM_STATE_KEY)) : undefined,
			context,
			logger,
			extensionVersion: getExtVersion(context),
			onUnauthenticated: (error) => {
				// An editor started with a token cannot sign in again, and signing it out would only
				// restore the same token and fail again: it is reported, not ended, and offers no sign-in.
				if (platform.injected) {
					void window.showErrorMessage(describeCloudError(error, "WSO2 Cloud rejected this editor's token."));
					return;
				}
				void ext.authProvider?.logout(true);
				handleCloudError(error, "WSO2 Cloud rejected the session. Please sign in again.");
			},
		});
	} catch (error) {
		// An environment that cannot be used (a dev deployment with no hosts set) leaves the cloud
		// features off rather than failing the extension.
		ext.logError("WSO2 Cloud is not available", error as Error);
		vscode.window.showErrorMessage(`WSO2 Cloud features are off: ${error instanceof Error ? error.message : String(error)}`);
		restored();
		return;
	}
	ext.clients = { platform };
	const backends = new CloudBackends(
		new Map([
			[
				CHOREO_CLOUD_PLATFORM,
				() =>
					choreoCloudBackend({
						cloud: () => platform.cloud,
						consoleUrl: () => ext.config.consoleUrl,
						orgHandle: () => ext.authProvider?.org?.handle,
						sourceControl: new ChoreoCloudSourceControl(),
						submit: submitCreateComponentHandler,
						reselectOrganization: async () => {
							await vscode.commands.executeCommand(WICommandIds.SignIn, { reselectOrganization: true });
						},
					}),
			],
			[
				DEVANT_PLATFORM,
				() =>
					devantCloudBackend({
						client: () => platform.backendClient<DevantClient>(DEVANT_PLATFORM),
						org: () => ext.authProvider?.org,
					}),
			],
		]),
	);
	ext.backend = backends.for(platform);
	vscode.commands.executeCommand("setContext", CLOUD_PLATFORM_CONTEXT, ext.backend.platform);
	applyEnvironment(platform.environment);
	vscode.commands.executeCommand("setContext", MULTI_REGION_CONTEXT, platform.regions.length > 1);
	vscode.commands.executeCommand("setContext", PLATFORMS_OFFERED_CONTEXT, platform.platforms.length > 1);
	context.subscriptions.push(platform);
	// Production's regions are switched between while the editor runs; what is read per environment follows.
	context.subscriptions.push(
		platform.onDidChangeEnvironment((environment) => {
			applyEnvironment(environment);
			ext.log(`WSO2 Cloud environment: ${environment.name} (${environment.apiBaseUrl})`);
		}),
	);
	// Platforms are switched between live too: fired before the environment it brings, then the session.
	context.subscriptions.push(
		platform.onDidChangePlatform(() => {
			ext.backend = backends.for(platform);
			vscode.commands.executeCommand("setContext", CLOUD_PLATFORM_CONTEXT, ext.backend.platform);
			vscode.commands.executeCommand("setContext", MULTI_REGION_CONTEXT, platform.regions.length > 1);
			contextStore.getState().resetState();
			ext.log(`Cloud platform: ${ext.backend.label}`);
		}),
	);

	// 2. The sign-in state the commands, stores and webviews read, and the commands and URI
	// handlers, before anything is awaited: activate() does not wait for this function, and a
	// caller (the Ballerina extension's SSO flow) may run a command as soon as it returns.
	const authProvider = new WIAuthState({ platform, log: ext.log.bind(ext), logError: ext.logError.bind(ext) });
	ext.authProvider = authProvider;
	context.subscriptions.push(authProvider);
	context.subscriptions.push(
		new vscode.Disposable(
			authProvider.subscribe(() => {
				vscode.commands.executeCommand("setContext", "isLoggedIn", authProvider.isLoggedIn);
			}),
		),
	);
	ext.githubApp = createGitHubAppConnector();
	activateCmds(context);
	activateURIHandlers(context);

	// 3. Log versions
	ext.log(`Extension version: ${getExtVersion(context)}`);
	ext.log(`WSO2 Cloud environment: ${platform.environment.name} (${platform.environment.apiBaseUrl})`);

	// 4. Rehydrate persistent stores.
	await contextStore.persist.rehydrate();
	await dataCacheStore.persist.rehydrate();
	await locationStore.persist.rehydrate();

	// 5. Sync contextStore state to VS Code context keys
	context.subscriptions.push(
		new vscode.Disposable(
			contextStore.subscribe(({ state }) => {
				vscode.commands.executeCommand("setContext", "isLoadingContextDirs", state.loading);
				vscode.commands.executeCommand("setContext", "hasSelectedProject", !!state.selected);
			}),
		),
	);

	// 5b. Context files changed outside the commands are read again.
	context.subscriptions.push(
		watchContextFiles({
			createFileSystemWatcher: (glob) => workspace.createFileSystemWatcher(glob),
			isLoggedIn: () => !!ext.authProvider?.isLoggedIn,
			refresh: () => void contextStore.getState().refreshState(),
		}),
	);

	// 6. Restore the session (secret storage, or the cloud editor's injected token).
	try {
		await authProvider.initAuth();
	} finally {
		restored();
	}

	// 6b. A cloud editor opened for an existing integration has none of its source yet.
	// Not awaited: the fetch needs the network and ends by reopening the window, and
	// everything below is what the rest of the extension waits on.
	void cloneOpenedIntegration();

	// 7. Mark the exported cloud APIs as active
	cloudAPIs.setActive(true);
}

/** The context key menus read the platform in use from. */
export const CLOUD_PLATFORM_CONTEXT = "wso2-integrator.cloud.platform";

/** Points what the extension reads per environment at `environment`: the caches' keys and the hosts it hands out. The webviews refetch the console URL when the auth state changes, which a switch does. */
function applyEnvironment(environment: CloudEnvironment): void {
	const services: CloudServiceUrls = readCloudServiceUrls(environment.name);
	ext.cloudEnv = environment.name;
	// Named only for another platform than Choreo Cloud, which a consumer that knows of no other assumes.
	const platform = ext.backend.platform === CHOREO_CLOUD_PLATFORM ? undefined : ext.backend.platform;
	ext.config = { ...environment, ...services, ...(platform ? { platform } : {}) };
}

function registerPreInitHandlers(): vscode.Disposable {
	return workspace.onDidChangeConfiguration(async ({ affectsConfiguration }: ConfigurationChangeEvent) => {
		if (affectsConfiguration(ENABLE_DEVANT_SETTING)) {
			const selection = await window.showInformationMessage("Reload the window to change which platforms are offered.", "Reload Window");
			if (selection === "Reload Window") {
				commands.executeCommand("workbench.action.reloadWindow");
			}
		}
		if (affectsConfiguration(CLOUD_ENV_SETTING)) {
			// The session was issued for the deployment before: kept, its token would go to another one. Ended now, not only on "Restart Now", since the
			// editor may be restarted some other way.
			await ext.authProvider?.logout(true);
			const selection = await window.showInformationMessage(
				"WSO2 Integrator extension configuration changed. Please restart the editor for changes to take effect.",
				"Restart Now",
			);
			if (selection === "Restart Now") {
				commands.executeCommand("workbench.action.reloadWindow");
			}
		}
	});
}
