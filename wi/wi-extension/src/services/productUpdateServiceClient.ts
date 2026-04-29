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
import { ext } from "../extensionVariables";
import { ExternalUrlRequest, UpdateCheckRequest, UpdateCheckResponse } from "./updateServiceTypes";

interface UpdateCheckConfig {
	enabled: boolean;
	checkOnStartup: boolean;
	checkIntervalHours: number;
	serviceURL: string;
	requestTimeoutMs: number;
}

const DEFAULT_SERVICE_URL =
	"https://bc594c9c-e5f7-4bd4-8b83-3bdea4d32b49-prod.e1-us-east-azure.choreoapis.dev/product-integrator/product-update-service/v1.0";
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

const LAST_CHECKED_AT_KEY = "wso2-integrator.updates.lastCheckedAt";
const LAST_NOTIFIED_VERSION_KEY = "wso2-integrator.updates.lastNotifiedVersion";
const LAST_NOTIFIED_INSTALLED_VERSION_KEY = "wso2-integrator.updates.lastNotifiedInstalledVersion";
const APP_VERSION_ENV_KEY = "WSO2_INTEGRATOR_VERSION";

export class ProductUpdateServiceClient {
	constructor(private readonly context: vscode.ExtensionContext) {}

	public async checkForUpdates(request: UpdateCheckRequest = {}): Promise<UpdateCheckResponse> {
		const config = this.getConfig();

		if (!config.enabled) {
			return {
				status: "disabled",
				message: "WSO2 Integrator update checks are disabled in settings.",
			};
		}

		if (!request.force && !config.checkOnStartup) {
			return {
				status: "disabled",
				message: "Automatic WSO2 Integrator update checks are disabled in settings.",
			};
		}

		if (!request.force && !this.shouldCheckNow(config.checkIntervalHours)) {
			return {
				status: "throttled",
				message: "Skipping product update check because the configured interval has not elapsed.",
			};
		}

		const installedVersion = this.getInstalledVersion();
		if (!installedVersion) {
			return {
				status: "unavailable",
				message: "Unable to determine WSO2 Integrator app version.",
			};
		}
		ext.log(`Checking WSO2 Integrator updates. Installed version: ${installedVersion ?? "unknown"}`);

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
					message: `Update ${latestVersion.latestVersion} was already shown for installed version ${installedVersion ?? "unknown"}.`,
				};
			}

			await this.context.globalState.update(LAST_NOTIFIED_VERSION_KEY, latestVersion.latestVersion);
			await this.context.globalState.update(LAST_NOTIFIED_INSTALLED_VERSION_KEY, installedVersion ?? "unknown");

			return {
				status: "update-available",
				installedVersion,
				latestVersion: latestVersion.latestVersion,
				releaseUrl: latestVersion.releaseUrl,
				message: installedVersion
					? `WSO2 Integrator ${latestVersion.latestVersion} is available. Current version: ${installedVersion}.`
					: `A new WSO2 Integrator version ${latestVersion.latestVersion} is available.`,
			};
		} catch (error) {
			ext.logError("Product update service check failed", error as Error);
			return {
				status: "error",
				installedVersion,
				message: `Failed to check for WSO2 Integrator updates: ${
					error instanceof Error ? error.message : String(error)
				}`,
			};
		}
	}

	public async openExternalUrl(request: ExternalUrlRequest): Promise<void> {
		await vscode.env.openExternal(vscode.Uri.parse(request.url));
	}

	private getConfig(): UpdateCheckConfig {
		const config = vscode.workspace.getConfiguration("wso2-integrator");
		const configuredServiceURL = config.get<string>("updates.serviceUrl");
		const resolvedServiceURL =
			configuredServiceURL && configuredServiceURL.trim().length > 0
				? configuredServiceURL
				: DEFAULT_SERVICE_URL;

		return {
			enabled: config.get<boolean>("updates.enabled", true),
			checkOnStartup: config.get<boolean>("updates.checkOnStartup", true),
			checkIntervalHours: Math.max(1, config.get<number>("updates.checkIntervalHours", 24)),
			serviceURL: resolvedServiceURL,
			requestTimeoutMs: Math.max(1000, config.get<number>("updates.requestTimeoutMs", DEFAULT_REQUEST_TIMEOUT_MS)),
		};
	}

	private shouldCheckNow(checkIntervalHours: number): boolean {
		const lastCheckedAt = this.context.globalState.get<number>(LAST_CHECKED_AT_KEY);
		if (!lastCheckedAt) {
			return true;
		}

		return Date.now() - lastCheckedAt >= checkIntervalHours * 60 * 60 * 1000;
	}

	private hasAlreadyNotified(installedVersion: string | undefined, latestVersion: string): boolean {
		const lastNotifiedVersion = this.context.globalState.get<string>(LAST_NOTIFIED_VERSION_KEY);
		const lastNotifiedInstalledVersion = this.context.globalState.get<string>(LAST_NOTIFIED_INSTALLED_VERSION_KEY);
		return lastNotifiedVersion === latestVersion && lastNotifiedInstalledVersion === (installedVersion ?? "unknown");
	}

	private getInstalledVersion(): string | undefined {
		return this.getAppVersionFromEnv();
	}

	private getAppVersionFromEnv(): string | undefined {
		const appVersionFromEnv = process.env[APP_VERSION_ENV_KEY];
		if (!appVersionFromEnv) {
			return undefined;
		}

		const normalizedVersion = appVersionFromEnv.trim();
		return normalizedVersion.length > 0 ? normalizedVersion : undefined;
	}

	private async fetchLatestVersion(
		config: UpdateCheckConfig,
		installedVersion: string | undefined,
	): Promise<UpdateCheckResponse> {
		const response = await axios.post<UpdateCheckResponse>(
			config.serviceURL,
			{ installedVersion: installedVersion ?? "" },
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
