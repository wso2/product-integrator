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

import axios from "axios";
import * as vscode from "vscode";
import { ExternalUrlRequest, ProductUpdateCheckRequest, ProductUpdateCheckResponse } from "@wso2/wi-core";
import { ext } from "../extensionVariables";

interface ICPUpdateCheckConfig {
	enabled: boolean;
	checkOnStartup: boolean;
	checkIntervalHours: number;
	serviceURL: string;
	requestTimeoutMs: number;
}

const DEFAULT_SERVICE_URL = "http://localhost:8080/api/v1/icp-updates/check";
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const ICP_EXTENSION_ID = "wso2.wso2-platform";

const LAST_CHECKED_AT_KEY = "wso2-integrator.icp-updates.lastCheckedAt";
const LAST_NOTIFIED_VERSION_KEY = "wso2-integrator.icp-updates.lastNotifiedVersion";
const LAST_NOTIFIED_INSTALLED_VERSION_KEY = "wso2-integrator.icp-updates.lastNotifiedInstalledVersion";

export class ICPUpdateServiceClient {
	constructor(private readonly context: vscode.ExtensionContext) {}

	public async checkForUpdates(request: ProductUpdateCheckRequest = {}): Promise<ProductUpdateCheckResponse> {
		const config = this.getConfig();

		if (!config.enabled) {
			return {
				status: "disabled",
				message: "ICP update checks are disabled in settings.",
			};
		}

		if (!request.force && !config.checkOnStartup) {
			return {
				status: "disabled",
				message: "Automatic ICP update checks are disabled in settings.",
			};
		}

		if (!request.force && !this.shouldCheckNow(config.checkIntervalHours)) {
			return {
				status: "throttled",
				message: "Skipping ICP update check because the configured interval has not elapsed.",
			};
		}

		const installedVersion = this.getInstalledVersion();
		if (!installedVersion) {
			return {
				status: "unavailable",
				message: "Unable to determine the installed ICP version.",
			};
		}

		ext.log(`Checking ICP updates. Installed version: ${installedVersion}`);

		try {
			const latestVersion = await this.fetchLatestVersion(config, installedVersion);
			await this.context.globalState.update(LAST_CHECKED_AT_KEY, Date.now());

			if (latestVersion.status !== "update-available") {
				return latestVersion;
			}

			if (!request.force && this.hasAlreadyNotified(installedVersion, latestVersion.latestVersion ?? "")) {
				return {
					status: "already-notified",
					installedVersion,
					latestVersion: latestVersion.latestVersion,
					releaseUrl: latestVersion.releaseUrl,
					message: `ICP update ${latestVersion.latestVersion} was already shown for installed version ${installedVersion}.`,
				};
			}

			await this.context.globalState.update(LAST_NOTIFIED_VERSION_KEY, latestVersion.latestVersion);
			await this.context.globalState.update(LAST_NOTIFIED_INSTALLED_VERSION_KEY, installedVersion);

			return {
				status: "update-available",
				installedVersion,
				latestVersion: latestVersion.latestVersion,
				releaseUrl: latestVersion.releaseUrl,
				message: `WSO2 Integrator: ICP ${latestVersion.latestVersion} is available. Current version: ${installedVersion}.`,
			};
		} catch (error) {
			ext.logError("ICP update service check failed", error as Error);
			return {
				status: "error",
				installedVersion,
				message: `Failed to check for ICP updates: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	public async openExternalUrl(request: ExternalUrlRequest): Promise<void> {
		await vscode.env.openExternal(vscode.Uri.parse(request.url));
	}

	private getConfig(): ICPUpdateCheckConfig {
		const config = vscode.workspace.getConfiguration("wso2-integrator");

		return {
			enabled: config.get<boolean>("icpUpdates.enabled", true),
			checkOnStartup: config.get<boolean>("icpUpdates.checkOnStartup", true),
			checkIntervalHours: Math.max(1, config.get<number>("icpUpdates.checkIntervalHours", 24)),
			serviceURL: config.get<string>("icpUpdates.serviceUrl", DEFAULT_SERVICE_URL),
			requestTimeoutMs: Math.max(1000, config.get<number>("icpUpdates.requestTimeoutMs", DEFAULT_REQUEST_TIMEOUT_MS)),
		};
	}

	private shouldCheckNow(checkIntervalHours: number): boolean {
		const lastCheckedAt = this.context.globalState.get<number>(LAST_CHECKED_AT_KEY);
		if (!lastCheckedAt) {
			return true;
		}

		const elapsed = Date.now() - lastCheckedAt;
		return elapsed >= checkIntervalHours * 60 * 60 * 1000;
	}

	private hasAlreadyNotified(installedVersion: string, latestVersion: string): boolean {
		const lastNotifiedVersion = this.context.globalState.get<string>(LAST_NOTIFIED_VERSION_KEY);
		const lastNotifiedInstalledVersion = this.context.globalState.get<string>(LAST_NOTIFIED_INSTALLED_VERSION_KEY);
		return lastNotifiedVersion === latestVersion && lastNotifiedInstalledVersion === installedVersion;
	}

	private getInstalledVersion(): string | undefined {
		const extension = vscode.extensions.getExtension(ICP_EXTENSION_ID);
		return extension?.packageJSON?.version;
	}

	private async fetchLatestVersion(
		config: ICPUpdateCheckConfig,
		installedVersion: string,
	): Promise<ProductUpdateCheckResponse> {
		const response = await axios.post<ProductUpdateCheckResponse>(
			config.serviceURL,
			{ installedVersion },
			{
				headers: {
					"Content-Type": "application/json",
				},
				timeout: config.requestTimeoutMs,
			},
		);

		return response.data;
	}
}
