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
import { ext } from "./extensionVariables";
import { ballerinaContext } from "./bi/ballerinaContext";

/**
 * Extension APIs manager
 */
export class ExtensionAPIs {
	private biExtension: vscode.Extension<BIExtensionAPI> | undefined;
	private miExtension: vscode.Extension<MIExtensionAPI> | undefined;
	private siExtension: vscode.Extension<unknown> | undefined;

	/**
	 * Initialize extension APIs
	 */
	public async initialize(extension: string, activate?: boolean): Promise<void> {
		// download extension if not present
		if (!vscode.extensions.getExtension(extension)) {
			try {
				if (extension === EXTENSION_DEPENDENCIES.BALLERINA) {
					await this.installExtension(extension, true);
				} else {
					await this.installExtension(extension, false);
				}
				ext.log(`Extension ${extension} installed successfully`);
			} catch (stableInstallError) {
				ext.logError(`Failed to install stable version of extension ${extension}`, stableInstallError as Error);
				try {
					await this.installExtension(extension, true);
					ext.log(`Pre-release version of extension ${extension} installed successfully`);
				} catch (preReleaseInstallError) {
					ext.logError(`Failed to install pre-release version of extension ${extension}`, preReleaseInstallError as Error);
					await vscode.window.showErrorMessage(
						`Failed to install required extension: ${extension}. Tried stable and pre-release versions. Please install it manually from the Extensions view.`,
					);
					return;
				}
			}

			// ask to reload window after installation (do not block initialize on notification interaction)
			vscode.window
				.showInformationMessage(
					`Extension ${extension} installed successfully. Please reload the window to activate it.`,
					"Reload Window"
				)
				.then((selection) => {
					if (selection === "Reload Window") {
						vscode.commands.executeCommand("workbench.action.reloadWindow");
					}
				});

			// newly installed extensions are not immediately available without reload
			return;
		}

		if (activate) {
			try {
				await this.activateExtension(extension);
				ext.log(`Extension ${extension} activated successfully`);
			} catch (error) {
				ext.logError(`Failed to activate extension ${extension}`, error as Error);
				vscode.window.showErrorMessage(
					`Failed to activate required extension: ${extension}. Please ensure it is activated properly.`,
				);
				return;
			}
		}

		if (extension === EXTENSION_DEPENDENCIES.BALLERINA) {
			// Get Ballerina extension
			this.biExtension = vscode.extensions.getExtension<BIExtensionAPI>(EXTENSION_DEPENDENCIES.BALLERINA);

			if (activate) {
				try {
					ballerinaContext.init(this.biExtension.exports);
				} catch (error) {
					ext.logError(`Failed to initialize Ballerina context`, error as Error);
				}
			}

		} else if (extension === EXTENSION_DEPENDENCIES.MI) {
			// Get MI extension
			this.miExtension = vscode.extensions.getExtension<MIExtensionAPI>(EXTENSION_DEPENDENCIES.MI);
		} else if (extension === EXTENSION_DEPENDENCIES.SI) {
			// Get SI extension
			this.siExtension = vscode.extensions.getExtension<unknown>(EXTENSION_DEPENDENCIES.SI);
		}
	}

	public async installExtension(extensionName: string, preRelease: boolean): Promise<void> {
		try {
			await vscode.commands.executeCommand(
				"workbench.extensions.installExtension",
				extensionName,
				{ installPreReleaseVersion: preRelease },
			);
			ext.log(`Extension ${extensionName} installed successfully`);
		} catch (error) {
			ext.logError(`Failed to install extension ${extensionName}`, error as Error);
			throw error;
		}
	}

	/**
	 * Activate an extension by its name
	 * @param extensionName The name of the extension to activate
	 */
	public async activateExtension(extensionName: string): Promise<void> {
		const extension = vscode.extensions.getExtension(extensionName);
		if (extension) {
			try {
				if (extension.isActive) {
					ext.log(`Extension ${extensionName} is already active`);
					return;
				}
				await extension.activate();
				ext.log(`Extension ${extensionName} activated successfully`);

				if (extensionName === EXTENSION_DEPENDENCIES.BALLERINA) {
					// if installed extension is release version, show warning to install pre-release version as the stable version does not have the required API
					// check if the installed version has the required command: BI.project.createBIProjectPure registered, if not, show warning to install pre-release version
					const hasRequiredCommand = await vscode.commands.getCommands(true).then((commands) => {
						return commands.includes("BI.project.createBIProjectPure");
					});
					if (!hasRequiredCommand) {
						ext.logError(`Installed version of Ballerina extension does not have the required API`, new Error("Incompatible Ballerina extension version"));
						vscode.window
							.showWarningMessage(
								`The installed version of the Ballerina extension does not have the required API. Please install the pre-release version of the Ballerina extension for full functionality.`,
								"Install Pre-release Version"
							)
							.then(async (selection) => {
								if (selection === "Install Pre-release Version") {
									try {
										await this.installExtension(EXTENSION_DEPENDENCIES.BALLERINA, true);
										ext.log(`Pre-release version of Ballerina extension installed successfully`);
									} catch (error) {
										ext.logError(`Failed to install pre-release version of Ballerina extension`, error as Error);
										await vscode.window.showErrorMessage(
											`Failed to install pre-release version of Ballerina extension. Please install it manually from the Extensions view.`,
										);
									}
								}
							});
					}
				}
			} catch (error) {
				ext.logError(`Failed to activate extension ${extensionName}`, error as Error);
				throw error;
			}
		} else {
			ext.logError(`Extension ${extensionName} not found`, new Error("Extension not found"));
			throw new Error("Extension not found");
		}
	}

	/**
	 * Check if BI extension is available
	 */
	public isBIAvailable(isActive: boolean = true): boolean {
		const ext = vscode.extensions.getExtension<BIExtensionAPI>(EXTENSION_DEPENDENCIES.BALLERINA)
		return ext !== undefined && ext.isActive === isActive;
	}

	/**
	 * Check if MI extension is available
	 */
	public isMIAvailable(isActive: boolean = true): boolean {
		const ext = vscode.extensions.getExtension<MIExtensionAPI>(EXTENSION_DEPENDENCIES.MI)
		return ext !== undefined && ext.isActive === isActive;
	}

	/**
	 * Check if SI extension is available
	 */
	public isSIAvailable(isActive: boolean = true): boolean {
		const ext = vscode.extensions.getExtension<any>(EXTENSION_DEPENDENCIES.SI)
		return ext !== undefined && ext.isActive === isActive;
	}

	/**
	 * Get BI status
	 */
	public getBIStatus(): string {
		const balExt = vscode.extensions.getExtension<BIExtensionAPI>(EXTENSION_DEPENDENCIES.BALLERINA);
		if (!balExt || !balExt.isActive || !balExt.exports) {
			return "unavailable";
		}

		try {
			return balExt.exports.getStatus();
		} catch (error) {
			ext.logError("Failed to get BI status", error as Error);
			return "error";
		}
	}

	/**
	 * Get MI status
	 */
	public getMIStatus(): string {
		const miExt = vscode.extensions.getExtension<MIExtensionAPI>(EXTENSION_DEPENDENCIES.MI);
		if (!miExt || !miExt.isActive || !miExt.exports) {
			return "unavailable";
		}

		try {
			return miExt.exports.getStatus();
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
