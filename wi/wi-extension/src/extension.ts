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

import * as vscode from "vscode";
import type { ConfigurationChangeEvent } from "vscode";
import { authentication, commands, window, workspace } from "vscode";
import { WSO2AuthenticationProvider, WSO2_AUTH_PROVIDER_ID } from "./auth/wso2-auth-provider";
import { ChoreoRPCClient } from "./choreo-rpc";
import { installRPCServer } from "./choreo-rpc/activate";
import { getCliVersion } from "./choreo-rpc/cli-install";
import { activateCmds } from "./cmds";
import { ext } from "./extensionVariables";
import { StateMachine } from "./stateMachine";
import { contextStore } from "./stores/context-store";
import { dataCacheStore } from "./stores/data-cache-store";
import { locationStore } from "./stores/location-store";
import { activateURIHandlers } from "./uri-handlers";
import { getExtVersion } from "./utils";

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	ext.context = context;
	ext.log("Activating WSO2 Integrator Extension");

	try {
		// Initialize state machine - this will handle everything:
		// 1. Project type detection
		// 2. Extension activation based on project type
		// 3. Tree view activation
		// 4. Command registration
		// 5. Webview manager setup
		StateMachine.initialize();

		// Boot cloud/RPC/auth functionality
		await activateCloudFunctionality(context);

		ext.log("WSO2 Integrator Extension activated successfully");
	} catch (error) {
		ext.logError("Failed to activate WSO2 Integrator Extension", error as Error);
		vscode.window.showErrorMessage(
			`Failed to activate WSO2 Integrator Extension: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Boot the cloud-connected functionality — mirrors the platform extension's activate():
 * cloudEnv → store rehydration → auth provider → RPC client → initAuth → config → pre-init handler
 */
async function activateCloudFunctionality(context: vscode.ExtensionContext): Promise<void> {
	// 1. Resolve cloud environment
	ext.cloudEnv =
		process.env.CHOREO_ENV ||
		process.env.CLOUD_ENV ||
		workspace.getConfiguration().get<string>("WSO2.WSO2-Platform.Advanced.ChoreoEnvironment") ||
		"prod";

	// 2. Log versions
	ext.log(`Extension version: ${getExtVersion(context)}`);
	ext.log(`CLI version: ${getCliVersion()}`);

	// 3. Rehydrate persistent stores
	await contextStore.persist.rehydrate();
	await dataCacheStore.persist.rehydrate();
	await locationStore.persist.rehydrate();

	// 4. Sync contextStore state to VS Code context keys
	contextStore.subscribe(({ state }) => {
		vscode.commands.executeCommand("setContext", "isLoadingContextDirs", state.loading);
		vscode.commands.executeCommand("setContext", "hasSelectedProject", !!state.selected);
	});

	// 5. Install and start the Choreo RPC server
	await installRPCServer();

	// 6. Create RPC client and wait for it to become active
	const rpcClient = new ChoreoRPCClient();
	await rpcClient.waitUntilActive();
	ext.clients = { rpcClient };

	// 7. Register authentication provider
	const authProvider = new WSO2AuthenticationProvider(context.secrets, {
		rpcClient,
		log: ext.log.bind(ext),
		logError: ext.logError.bind(ext),
	});
	ext.authProvider = authProvider;
	context.subscriptions.push(
		authentication.registerAuthenticationProvider(WSO2_AUTH_PROVIDER_ID, "WSO2 Integrator", authProvider, {
			supportsMultipleAccounts: false,
		}),
	);

	// 8. Sync auth state to VS Code context key
	authProvider.subscribe(({ state }) => {
		vscode.commands.executeCommand("setContext", "isLoggedIn", !!state.userInfo);
	});

	// 9. Initialize authentication (restores session from CLI if already signed in)
	await authProvider.getState().initAuth();

	// 10. Fetch remote config (billing/console URLs etc.)
	ext.config = await ext.clients.rpcClient.getConfigFromCli();

	// 11. Prompt restart when Advanced configuration keys change
	registerPreInitHandlers();

	// 12. Register VS Code commands
	activateCmds(context);

	// 13. Register URI handlers (sign-in callback, deep-link open)
	activateURIHandlers();
}

function registerPreInitHandlers(): void {
	workspace.onDidChangeConfiguration(async ({ affectsConfiguration }: ConfigurationChangeEvent) => {
		if (
			affectsConfiguration("WSO2.WSO2-Platform.Advanced.ChoreoEnvironment") ||
			affectsConfiguration("WSO2.WSO2-Platform.Advanced.RpcPath")
		) {
			const selection = await window.showInformationMessage(
				"WSO2 Platform extension configuration changed. Please restart VS Code for changes to take effect.",
				"Restart Now",
			);
			if (selection === "Restart Now") {
				if (affectsConfiguration("WSO2.WSO2-Platform.Advanced.ChoreoEnvironment")) {
					ext.authProvider?.getState().logout();
				}
				commands.executeCommand("workbench.action.reloadWindow");
			}
		}
	});
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
	ext.log("Deactivating WSO2 Integrator Extension");
}
