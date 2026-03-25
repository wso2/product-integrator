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
import { COMMANDS, ProductUpdateCheckResponse, ViewType } from "@wso2/wi-core";
import { ext } from "./extensionVariables";
import { StateMachine } from "./stateMachine";
import { ProductUpdateServiceClient } from "./services/productUpdateServiceClient";

const BACKGROUND_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UpdateNotifier {
	checkForUpdates: (request: { force?: boolean }) => Promise<ProductUpdateCheckResponse>;
	openExternalUrl: (request: { url: string }) => Promise<void>;
}

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

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	ext.context = context;
	ext.log("Activating WSO2 Integrator Extension");

	try {
		const productUpdateService = new ProductUpdateServiceClient(context);
		context.subscriptions.push(
			vscode.commands.registerCommand(COMMANDS.OPEN_WELCOME, () => {
				try {
					StateMachine.openWebview(ViewType.WELCOME);
				} catch (error) {
					ext.logError("Failed to open welcome page", error as Error);
					vscode.window.showErrorMessage("Failed to open welcome page");
				}
			}),
		);
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

		void showUpdateResult(productUpdateService, true, false, "Open Release Notes");
		const backgroundUpdateCheck = setInterval(() => {
			void showUpdateResult(productUpdateService, true, false, "Open Release Notes");
		}, BACKGROUND_UPDATE_CHECK_INTERVAL_MS);
		context.subscriptions.push({
			dispose: () => clearInterval(backgroundUpdateCheck),
		});

		ext.log("WSO2 Integrator Extension activated successfully");
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
