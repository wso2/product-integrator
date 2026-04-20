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
import path from "path";
import { activateCloudFunctionality } from "./cloud/activate";
import { ext } from "./extensionVariables";
import { StateMachine } from "./stateMachine";
import { WICloudExtensionAPI } from "./cloud/cloud-ext-api";
import { IWso2PlatformExtensionAPI } from "@wso2/wso2-platform-core";
import { BridgeLayer } from "./BridgeLayer";
import { ViewType } from "@wso2/wi-core";
import { getPlatform } from "./ws-managers/main/utils";

interface ExtensionExports {
	cloudAPIs: IWso2PlatformExtensionAPI;
}

const EMBEDDED_WELCOME_PROJECT_URI = "__wso2_integrator_embedded_welcome__";
const GET_EMBEDDED_WELCOME_BOOTSTRAP_COMMAND = "wso2.integrator.getEmbeddedWelcomeBootstrap";

function registerEmbeddedWelcomeBootstrapCommand(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(GET_EMBEDDED_WELCOME_BOOTSTRAP_COMMAND, async () => {
			StateMachine.setCurrentView(ViewType.WELCOME);

			const bootstrap = BridgeLayer.startWebSocketServer(EMBEDDED_WELCOME_PROJECT_URI);
			BridgeLayer.notifyStateChanged(EMBEDDED_WELCOME_PROJECT_URI, {
				currentView: ViewType.WELCOME,
				projectUri: EMBEDDED_WELCOME_PROJECT_URI,
				platform: getPlatform(),
				pathSeparator: path.sep,
				env: {
					MI_SAMPLE_ICONS_GITHUB_URL: process.env.MI_SAMPLE_ICONS_GITHUB_URL || "",
					BI_SAMPLE_ICONS_GITHUB_URL: process.env.BI_SAMPLE_ICONS_GITHUB_URL || "",
					SAMPLES_INFO_URL: process.env.SAMPLES_INFO_URL || "",
					SAMPLES_REPOSITORY_URL: process.env.SAMPLES_REPOSITORY_URL || "",
					PREBUILT_INTEGRATIONS_URL: process.env.PREBUILT_INTEGRATIONS_URL || "",
				},
			});

			return bootstrap;
		}),
	);
}

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<ExtensionExports> {
	ext.context = context;
	ext.log("Activating WSO2 Integrator Extension");

	try {
		registerEmbeddedWelcomeBootstrapCommand(context);

		// Initialize state machine - this will handle everything:
		// 1. Project type detection
		// 2. Extension activation based on project type
		// 3. Tree view activation
		// 4. Command registration
		// 5. Webview manager setup
		StateMachine.initialize();

		// Boot cloud/RPC/auth functionality
		await activateCloudFunctionality(context);
		const exports: ExtensionExports = { cloudAPIs: new WICloudExtensionAPI() };
		ext.log("WSO2 Integrator Extension activated successfully");
		return exports;
	} catch (error) {
		ext.logError("Failed to activate WSO2 Integrator Extension", error as Error);
		vscode.window.showErrorMessage(
			`Failed to activate WSO2 Integrator Extension: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
	ext.log("Deactivating WSO2 Integrator Extension");
}
