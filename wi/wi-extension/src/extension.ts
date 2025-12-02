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
import { ext } from "./extensionVariables";
import { StateMachine } from "./stateMachine";

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
