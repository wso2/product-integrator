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

import type { Logger } from "@wso2/wso2-cloud-client";
import { CLOUD_API_URL_SETTING, CLOUD_CLIENT_ID_SETTING, CLOUD_ENV_SETTING } from "@wso2/wso2-cloud-client/vscode";
import * as vscode from "vscode";
import type { ConfigurationChangeEvent } from "vscode";
import { commands, window, workspace } from "vscode";
import { ext } from "../extensionVariables";
import { getExtVersion } from "../utils/commonUtils";
import { WIAuthState } from "./auth/wso2-auth-provider";
import type { WICloudExtensionAPI } from "./cloud-ext-api";
import { activateURIHandlers } from "./cloud-uri-handlers";
import { activateCmds } from "./cmds";
import { handleCloudError } from "./platform/error-handler";
import { createWIPlatform } from "./platform/platform-client";
import { contextStore } from "./stores/context-store";
import { dataCacheStore } from "./stores/data-cache-store";
import { locationStore } from "./stores/location-store";
import { clearPreviousStoreVersions } from "./stores/store-utils";

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

	// 1. The platform client, sessions and authentication provider, from the environment setting.
	const platform = createWIPlatform({
		context,
		logger,
		extensionVersion: getExtVersion(context),
		onUnauthenticated: (error) => {
			void ext.authProvider?.logout(true);
			handleCloudError(error, "WSO2 Cloud rejected the session. Please sign in again.");
		},
	});
	ext.clients = { platform };
	ext.cloudEnv = platform.environment.name;
	ext.config = platform.environment;
	context.subscriptions.push(platform);

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
	activateCmds(context);
	activateURIHandlers(context);

	// 3. Log versions
	ext.log(`Extension version: ${getExtVersion(context)}`);
	ext.log(`WSO2 Cloud environment: ${platform.environment.name} (${platform.environment.apiBaseUrl})`);

	// 4. Rehydrate persistent stores, dropping what the CLI-era store versions kept.
	await clearPreviousStoreVersions(context);
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

	// 6. Restore the session (secret storage, or the cloud editor's injected token).
	await authProvider.initAuth();

	// 7. Prompt restart when Advanced configuration keys change
	context.subscriptions.push(registerPreInitHandlers());

	// 8. Mark the exported cloud APIs as active
	cloudAPIs.setActive(true);
}

function registerPreInitHandlers(): vscode.Disposable {
	return workspace.onDidChangeConfiguration(async ({ affectsConfiguration }: ConfigurationChangeEvent) => {
		if (affectsConfiguration(CLOUD_ENV_SETTING) || affectsConfiguration(CLOUD_CLIENT_ID_SETTING) || affectsConfiguration(CLOUD_API_URL_SETTING)) {
			const selection = await window.showInformationMessage(
				"WSO2 Integrator extension configuration changed. Please restart the editor for changes to take effect.",
				"Restart Now",
			);
			if (selection === "Restart Now") {
				if (affectsConfiguration(CLOUD_ENV_SETTING)) {
					await ext.authProvider?.logout(true);
				}
				commands.executeCommand("workbench.action.reloadWindow");
			}
		}
	});
}
