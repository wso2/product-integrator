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

interface BIUpdateCheckConfig {
	enabled: boolean;
	checkOnStartup: boolean;
	checkIntervalHours: number;
	serviceURL: string;
	requestTimeoutMs: number;
}

const DEFAULT_SERVICE_URL = "http://localhost:8080/api/v1/bi-updates/check";
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const BI_EXTENSION_ID = "wso2.ballerina-integrator";

const LAST_CHECKED_AT_KEY = "wso2-integrator.bi-updates.lastCheckedAt";
const LAST_NOTIFIED_VERSION_KEY = "wso2-integrator.bi-updates.lastNotifiedVersion";
const LAST_NOTIFIED_INSTALLED_VERSION_KEY = "wso2-integrator.bi-updates.lastNotifiedInstalledVersion";

export class BIUpdateServiceClient {
	constructor(private readonly context: vscode.ExtensionContext) {}

	public async checkForUpdates(request: ProductUpdateCheckRequest = {}): Promise<ProductUpdateCheckResponse> {
		const config = this.getConfig();

		if (!config.enabled) {
			return {
				status: "disabled",
				message: "BI update checks are disabled in settings.",
			};
		}

		if (!request.force && !config.checkOnStartup) {
			return {
				status: "disabled",
				message: "Automatic BI update checks are disabled in settings.",
			};
		}

		if (!request.force && !this.shouldCheckNow(config.checkIntervalHours)) {
			return {
				status: "throttled",
				message: "Skipping BI update check because the configured interval has not elapsed.",
			};
		}

		const installedVersion = this.getInstalledVersion();
		if (!installedVersion) {
			return {
				status: "unavailable",
				message: "Unable to determine the installed BI version.",
			};
		}

		ext.log(`Checking BI updates. Installed version: ${installedVersion}`);

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
					message: `BI update ${latestVersion.latestVersion} was already shown for installed version ${installedVersion}.`,
				};
			}

			await this.context.globalState.update(LAST_NOTIFIED_VERSION_KEY, latestVersion.latestVersion);
			await this.context.globalState.update(LAST_NOTIFIED_INSTALLED_VERSION_KEY, installedVersion);

			return {
				status: "update-available",
				installedVersion,
				latestVersion: latestVersion.latestVersion,
				releaseUrl: latestVersion.releaseUrl,
				message: `WSO2 Integrator: BI ${latestVersion.latestVersion} is available. Current version: ${installedVersion}.`,
			};
		} catch (error) {
			ext.logError("BI update service check failed", error as Error);
			return {
				status: "error",
				installedVersion,
				message: `Failed to check for BI updates: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	public async openExternalUrl(request: ExternalUrlRequest): Promise<void> {
		await vscode.env.openExternal(vscode.Uri.parse(request.url));
	}

	private getConfig(): BIUpdateCheckConfig {
		const config = vscode.workspace.getConfiguration("wso2-integrator");

		return {
			enabled: config.get<boolean>("biUpdates.enabled", true),
			checkOnStartup: config.get<boolean>("biUpdates.checkOnStartup", true),
			checkIntervalHours: Math.max(1, config.get<number>("biUpdates.checkIntervalHours", 24)),
			serviceURL: config.get<string>("biUpdates.serviceUrl", DEFAULT_SERVICE_URL),
			requestTimeoutMs: Math.max(1000, config.get<number>("biUpdates.requestTimeoutMs", DEFAULT_REQUEST_TIMEOUT_MS)),
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
		const extension = vscode.extensions.getExtension(BI_EXTENSION_ID);
		return extension?.packageJSON?.version;
	}

	private async fetchLatestVersion(
		config: BIUpdateCheckConfig,
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
