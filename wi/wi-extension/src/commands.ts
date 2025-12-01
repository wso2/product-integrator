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
import { COMMANDS } from "@wso2/wi-core";
import { ViewType } from "@wso2/wi-core";
import { ext } from "./extensionVariables";
import { WebviewManager } from "./webviewManager";
import { ExtensionAPIs } from "./extensionAPIs";
import { StateMachine } from "./stateMachine";

/**
 * Register all extension commands
 */
export function registerCommands(
	context: vscode.ExtensionContext,
	webviewManager: WebviewManager,
	extensionAPIs: ExtensionAPIs,
): void {
	// Open welcome page command
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

	// Create project command
	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.CREATE_PROJECT, () => {
			try {
				StateMachine.openWebview(ViewType.CREATE_PROJECT);
			} catch (error) {
				ext.logError("Failed to open create project view", error as Error);
				vscode.window.showErrorMessage("Failed to open create project view");
			}
		}),
	);

	// Explore samples command
	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.EXPLORE_SAMPLES, () => {
			try {
				StateMachine.openWebview(ViewType.SAMPLES);
			} catch (error) {
				ext.logError("Failed to open samples view", error as Error);
				vscode.window.showErrorMessage("Failed to open samples view");
			}
		}),
	);

	// Import project command
	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.IMPORT_PROJECT, () => {
			try {
				StateMachine.openWebview(ViewType.IMPORT_EXTERNAL);
			} catch (error) {
				ext.logError("Failed to open import project view", error as Error);
				vscode.window.showErrorMessage("Failed to open import project view");
			}
		}),
	);

	// Open BI integration command
	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.OPEN_BI_INTEGRATION, () => {
			if (extensionAPIs.isBIAvailable()) {
				vscode.commands.executeCommand("workbench.view.extension.ballerina-integrator");
			} else {
				vscode.window.showInformationMessage(
					"BI Extension is not available. Please install the Ballerina Integrator extension.",
					"Install",
				).then((selection) => {
					if (selection === "Install") {
						vscode.commands.executeCommand("workbench.extensions.search", "@id:wso2.ballerina-integrator");
					}
				});
			}
		}),
	);

	// Open MI integration command
	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.OPEN_MI_INTEGRATION, () => {
			if (extensionAPIs.isMIAvailable()) {
				vscode.commands.executeCommand("workbench.view.extension.micro-integrator");
			} else {
				vscode.window.showInformationMessage(
					"MI Extension is not available. Please install the Micro Integrator extension.",
					"Install",
				).then((selection) => {
					if (selection === "Install") {
						vscode.commands.executeCommand("workbench.extensions.search", "@id:wso2.micro-integrator");
					}
				});
			}
		}),
	);

	// Close webview command
	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.CLOSE_WEBVIEW, () => {
			try {
				webviewManager.closeWebview();
			} catch (error) {
				ext.logError("Failed to close webview", error as Error);
				vscode.window.showErrorMessage("Failed to close webview");
			}
		}),
	);
}
