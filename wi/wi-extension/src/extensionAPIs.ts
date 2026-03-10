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
import { EXTENSION_DEPENDENCIES } from "@wso2/wi-core";
import type { BIExtensionAPI, MIExtensionAPI } from "@wso2/wi-core";
import type { IWso2PlatformExtensionAPI } from "@wso2/wso2-platform-core";
import { ext } from "./extensionVariables";
import { WICloudExtensionAPI } from "./cloud/cloud-ext-api";

/**
 * Extension APIs manager
 */
export class ExtensionAPIs {
	private biExtension: vscode.Extension<BIExtensionAPI> | undefined;
	private miExtension: vscode.Extension<MIExtensionAPI> | undefined;
	private siExtension: vscode.Extension<unknown> | undefined;

	/** Cloud APIs — exposes the same surface as IWso2PlatformExtensionAPI */
	public readonly cloudAPIs: IWso2PlatformExtensionAPI = new WICloudExtensionAPI();

	/**
	 * Initialize extension APIs
	 */
	public async initialize(extension: string): Promise<void> {
		// download extension if not present
		if (!vscode.extensions.getExtension(extension)) {
			try {
				await vscode.commands.executeCommand("workbench.extensions.installExtension", extension);
				ext.log(`Extension ${extension} installed successfully`);
			} catch (error) {
				ext.logError(`Failed to install extension ${extension}`, error as Error);
				await vscode.window.showErrorMessage(`Failed to install required extension: ${extension}. Please install it manually from the Extensions view.`);
				return;
			}
		}
		if (extension === EXTENSION_DEPENDENCIES.BALLERINA) {
			// Get Ballerina extension
			this.biExtension = vscode.extensions.getExtension<BIExtensionAPI>(EXTENSION_DEPENDENCIES.BALLERINA);

		} else if (extension === EXTENSION_DEPENDENCIES.MI) {
			// Get MI extension
			this.miExtension = vscode.extensions.getExtension<MIExtensionAPI>(EXTENSION_DEPENDENCIES.MI);
		} else if (extension === EXTENSION_DEPENDENCIES.SI) {
			// Get SI extension
			this.siExtension = vscode.extensions.getExtension<unknown>(EXTENSION_DEPENDENCIES.SI);
		}
	}

	public activateBIExtension(): void {
		if (this.biExtension && !this.biExtension.isActive) {
			this.biExtension.activate().then(
				() => {
					ext.log("BI Extension activated");
				},
				(error) => {
					ext.logError("Failed to activate BI extension", error as Error);
				},
			);
		}
	}

	public activateMIExtension(): void {
		if (this.miExtension && !this.miExtension.isActive) {
			this.miExtension.activate().then(
				() => {
					ext.log("MI Extension activated");
				},
				(error) => {
					ext.logError("Failed to activate MI extension", error as Error);
				},
			);
		}
	}

	/**
	 * Check if BI extension is available
	 */
	public isBIAvailable(): boolean {
		return this.biExtension !== undefined && this.biExtension.isActive;
	}

	/**
	 * Check if MI extension is available
	 */
	public isMIAvailable(): boolean {
		return this.miExtension !== undefined && this.miExtension.isActive;
	}

	/**
	 * Check if SI extension is available
	 */
	public isSIAvailable(): boolean {
		return this.siExtension !== undefined && this.siExtension.isActive;
	}

	/**
	 * Get BI status
	 */
	public getBIStatus(): string {
		if (!this.isBIAvailable() || !this.biExtension?.exports) {
			return "unavailable";
		}

		try {
			return this.biExtension.exports.getStatus();
		} catch (error) {
			ext.logError("Failed to get BI status", error as Error);
			return "error";
		}
	}

	/**
	 * Get MI status
	 */
	public getMIStatus(): string {
		if (!this.isMIAvailable() || !this.miExtension?.exports) {
			return "unavailable";
		}

		try {
			return this.miExtension.exports.getStatus();
		} catch (error) {
			ext.logError("Failed to get MI status", error as Error);
			return "error";
		}
	}

	/**
	 * Get SI status
	 */
	public getSIStatus(): string {
		if (!this.isSIAvailable() || !this.siExtension?.exports) {
			return "unavailable";
		}

		try {
			return (this.siExtension.exports as any).getStatus();
		} catch (error) {
			ext.logError("Failed to get SI status", error as Error);
			return "error";
		}
	}
}
