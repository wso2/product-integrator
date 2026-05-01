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
import { COMMANDS } from "@wso2/wi-core";
import { activateCloudFunctionality } from "./cloud/activate";
import { ext } from "./extensionVariables";
import { StateMachine } from "./stateMachine";
import { WICloudExtensionAPI } from "./cloud/cloud-ext-api";
import { IWso2PlatformExtensionAPI } from "@wso2/wso2-platform-core";
import { BridgeLayer } from "./BridgeLayer";
import { ViewType } from "@wso2/wi-core";
import { getPlatform } from "./ws-managers/main/utils";
import { ProductUpdateServiceClient } from "./services/productUpdateServiceClient";
import { UpdateCheckResponse } from "./services/updateServiceTypes";

interface ExtensionExports {
	cloudAPIs: IWso2PlatformExtensionAPI;
}

interface UpdateNotifier {
	checkForUpdates: (request: { force?: boolean }) => Promise<UpdateCheckResponse>;
	openExternalUrl: (request: { url: string }) => Promise<void>;
}

const EMBEDDED_WELCOME_PROJECT_URI = "__wso2_integrator_embedded_welcome__";
const GET_EMBEDDED_WELCOME_BOOTSTRAP_COMMAND = "wso2.integrator.getEmbeddedWelcomeBootstrap";
const BACKGROUND_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_UPDATE_CHECK_DELAY_MS = 5 * 1000;

async function showUpdateResult(
	updateService: UpdateNotifier,
	force: boolean,
	showNonUpdateMessages: boolean,
	openReleaseNotesLabel: string,
): Promise<void> {
	const result = await updateService.checkForUpdates({ force });

	if (result.status === "update-available" && result.releaseUrl) {
		const selection = await vscode.window.showInformationMessage(
			result.message,
			openReleaseNotesLabel,
			"Dismiss",
		);
		if (selection === openReleaseNotesLabel) {
			await updateService.openExternalUrl({ url: result.releaseUrl });
		}
		return;
	}

	if (showNonUpdateMessages && (result.status === "up-to-date" || result.status === "disabled")) {
		vscode.window.showInformationMessage(result.message);
		return;
	}

	if (showNonUpdateMessages && result.status === "error") {
		vscode.window.showErrorMessage(result.message);
		return;
	}

	if (
		showNonUpdateMessages &&
		result.status !== "already-notified" &&
		result.status !== "throttled"
	) {
		vscode.window.showWarningMessage(result.message);
	}
}

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
		const productUpdateService = new ProductUpdateServiceClient(context);

		registerEmbeddedWelcomeBootstrapCommand(context);
		context.subscriptions.push(
			vscode.commands.registerCommand(COMMANDS.CHECK_FOR_UPDATES, async () => {
				await showUpdateResult(productUpdateService, true, true, "Open Release Notes");
			}),
		);

		// Initialize state machine - this will handle everything:
		// 1. Project type detection
		// 2. Extension activation based on project type
		// 3. Tree view activation
		// 4. Command registration
		// 5. Webview manager setup
		StateMachine.initialize();

		// Run update checks independently from cloud startup so notification still works
		// when the Choreo RPC client is unavailable in local/dev setups.
		const startupUpdateCheck = setTimeout(() => {
			void showUpdateResult(productUpdateService, true, false, "Open Release Notes");
		}, STARTUP_UPDATE_CHECK_DELAY_MS);
		context.subscriptions.push({
			dispose: () => clearTimeout(startupUpdateCheck),
		});

		const backgroundUpdateCheck = setInterval(() => {
			void showUpdateResult(productUpdateService, true, false, "Open Release Notes");
		}, BACKGROUND_UPDATE_CHECK_INTERVAL_MS);
		context.subscriptions.push({
			dispose: () => clearInterval(backgroundUpdateCheck),
		});

		// Boot cloud/RPC/auth functionality in the background so product update
		// notifications are not blocked by Choreo RPC startup in local/dev setups.
		void activateCloudFunctionality(context).catch((error) => {
			ext.logError("Cloud functionality failed to activate", error as Error);
		});

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
