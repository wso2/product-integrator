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
import { BallerinaUpdateServiceClient } from "./services/ballerinaUpdateServiceClient";
import { BIUpdateServiceClient } from "./services/biUpdateServiceClient";
import { MIUpdateServiceClient } from "./services/miUpdateServiceClient";
import { ICPUpdateServiceClient } from "./services/icpUpdateServiceClient";

const BACKGROUND_UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const STARTUP_BALLERINA_CHECK_DELAY_MS = 10 * 1000;

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

async function showAllUpdateResults(
	productUpdateService: ProductUpdateServiceClient,
	ballerinaUpdateService: BallerinaUpdateServiceClient,
	biUpdateService: BIUpdateServiceClient,
	miUpdateService: MIUpdateServiceClient,
	icpUpdateService: ICPUpdateServiceClient,
	force: boolean,
	showNonUpdateMessages: boolean,
): Promise<void> {
	await Promise.all([
		showUpdateResult(productUpdateService, force, showNonUpdateMessages, "Open Release Notes"),
		showUpdateResult(ballerinaUpdateService, force, showNonUpdateMessages, "Open Ballerina Release Notes"),
		showUpdateResult(biUpdateService, force, showNonUpdateMessages, "Open BI Release Notes"),
		showUpdateResult(miUpdateService, force, showNonUpdateMessages, "Open MI Release Notes"),
		showUpdateResult(icpUpdateService, force, showNonUpdateMessages, "Open ICP Release Notes"),
	]);
}

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	ext.context = context;
	ext.log("Activating WSO2 Integrator Extension");

	try {
		const productUpdateService = new ProductUpdateServiceClient(context);
		const ballerinaUpdateService = new BallerinaUpdateServiceClient(context);
		const biUpdateService = new BIUpdateServiceClient(context);
		const miUpdateService = new MIUpdateServiceClient(context);
		const icpUpdateService = new ICPUpdateServiceClient(context);
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
				await showAllUpdateResults(
					productUpdateService,
					ballerinaUpdateService,
					biUpdateService,
					miUpdateService,
					icpUpdateService,
					true,
					true,
				);
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
		const startupBallerinaCheck = setTimeout(() => {
			void showUpdateResult(ballerinaUpdateService, true, false, "Open Ballerina Release Notes");
		}, STARTUP_BALLERINA_CHECK_DELAY_MS);
		const startupBICheck = setTimeout(() => {
			void showUpdateResult(biUpdateService, true, false, "Open BI Release Notes");
		}, STARTUP_BALLERINA_CHECK_DELAY_MS);
		const startupMICheck = setTimeout(() => {
			void showUpdateResult(miUpdateService, true, false, "Open MI Release Notes");
		}, STARTUP_BALLERINA_CHECK_DELAY_MS);
		const startupICPCheck = setTimeout(() => {
			void showUpdateResult(icpUpdateService, true, false, "Open ICP Release Notes");
		}, STARTUP_BALLERINA_CHECK_DELAY_MS);
		const backgroundUpdateCheck = setInterval(() => {
			void showAllUpdateResults(
				productUpdateService,
				ballerinaUpdateService,
				biUpdateService,
				miUpdateService,
				icpUpdateService,
				true,
				false,
			);
		}, BACKGROUND_UPDATE_CHECK_INTERVAL_MS);
		context.subscriptions.push({
			dispose: () => clearTimeout(startupBallerinaCheck),
		});
		context.subscriptions.push({
			dispose: () => clearTimeout(startupBICheck),
		});
		context.subscriptions.push({
			dispose: () => clearTimeout(startupMICheck),
		});
		context.subscriptions.push({
			dispose: () => clearTimeout(startupICPCheck),
		});
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
