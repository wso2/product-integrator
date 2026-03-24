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
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import * as vscode from "vscode";
import { ExternalUrlRequest, ProductUpdateCheckRequest, ProductUpdateCheckResponse } from "@wso2/wi-core";
import { ext } from "../extensionVariables";
import { getActiveBallerinaExtension } from "../utils/ballerinaExtension";

interface BallerinaUpdateCheckConfig {
	enabled: boolean;
	checkOnStartup: boolean;
	checkIntervalHours: number;
	serviceURL: string;
	requestTimeoutMs: number;
}

const DEFAULT_SERVICE_URL = "http://localhost:8080/api/v1/ballerina-updates/check";
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const BALLERINA_VERSION_PATTERN = /(\d+\.\d+\.\d+(?:[-.][A-Za-z0-9]+)*)/;
const execFileAsync = promisify(execFile);

const LAST_CHECKED_AT_KEY = "wso2-integrator.ballerina-updates.lastCheckedAt";
const LAST_NOTIFIED_VERSION_KEY = "wso2-integrator.ballerina-updates.lastNotifiedVersion";
const LAST_NOTIFIED_INSTALLED_VERSION_KEY = "wso2-integrator.ballerina-updates.lastNotifiedInstalledVersion";

export class BallerinaUpdateServiceClient {
	constructor(private readonly context: vscode.ExtensionContext) {}

	public async checkForUpdates(request: ProductUpdateCheckRequest = {}): Promise<ProductUpdateCheckResponse> {
		const config = this.getConfig();

		if (!config.enabled) {
			return {
				status: "disabled",
				message: "Ballerina update checks are disabled in settings.",
			};
		}

		if (!request.force && !config.checkOnStartup) {
			return {
				status: "disabled",
				message: "Automatic Ballerina update checks are disabled in settings.",
			};
		}

		if (!request.force && !this.shouldCheckNow(config.checkIntervalHours)) {
			return {
				status: "throttled",
				message: "Skipping Ballerina update check because the configured interval has not elapsed.",
			};
		}

		const installedVersion = await this.getInstalledVersion();
		if (!installedVersion) {
			return {
				status: "unavailable",
				message: "Unable to determine the installed Ballerina version.",
			};
		}

		ext.log(`Checking Ballerina updates. Installed version: ${installedVersion}`);

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
					message: `Ballerina update ${latestVersion.latestVersion} was already shown for installed version ${installedVersion}.`,
				};
			}

			await this.context.globalState.update(LAST_NOTIFIED_VERSION_KEY, latestVersion.latestVersion);
			await this.context.globalState.update(LAST_NOTIFIED_INSTALLED_VERSION_KEY, installedVersion);

			return {
				status: "update-available",
				installedVersion,
				latestVersion: latestVersion.latestVersion,
				releaseUrl: latestVersion.releaseUrl,
				message: `Ballerina ${latestVersion.latestVersion} is available. Current version: ${installedVersion}.`,
			};
		} catch (error) {
			ext.logError("Ballerina update service check failed", error as Error);
			return {
				status: "error",
				installedVersion,
				message: `Failed to check for Ballerina updates: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	public async openExternalUrl(request: ExternalUrlRequest): Promise<void> {
		await vscode.env.openExternal(vscode.Uri.parse(request.url));
	}

	private getConfig(): BallerinaUpdateCheckConfig {
		const config = vscode.workspace.getConfiguration("wso2-integrator");

		return {
			enabled: config.get<boolean>("ballerinaUpdates.enabled", true),
			checkOnStartup: config.get<boolean>("ballerinaUpdates.checkOnStartup", true),
			checkIntervalHours: Math.max(1, config.get<number>("ballerinaUpdates.checkIntervalHours", 24)),
			serviceURL: config.get<string>("ballerinaUpdates.serviceUrl", DEFAULT_SERVICE_URL),
			requestTimeoutMs: Math.max(1000, config.get<number>("ballerinaUpdates.requestTimeoutMs", DEFAULT_REQUEST_TIMEOUT_MS)),
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

	private async getInstalledVersion(): Promise<string | undefined> {
		try {
			const ballerinaExtension = await getActiveBallerinaExtension();
			const instanceVersion = this.normalizeRuntimeVersion((ballerinaExtension as any)?.ballerinaVersion);
			if (instanceVersion) {
				return instanceVersion;
			}

			const exportedVersion = this.normalizeRuntimeVersion((ballerinaExtension.exports as any)?.ballerinaVersion);
			if (exportedVersion) {
				return exportedVersion;
			}

			const exportedInstanceVersion = this.normalizeRuntimeVersion(
				(ballerinaExtension.exports as any)?.ballerinaExtInstance?.ballerinaVersion,
			);
			if (exportedInstanceVersion) {
				return exportedInstanceVersion;
			}

			const versionFromRuntime = await this.getVersionFromRuntimeHome();
			if (versionFromRuntime) {
				return versionFromRuntime;
			}

			return undefined;
		} catch (error) {
			ext.logError("Failed to resolve installed Ballerina version", error as Error);
			return undefined;
		}
	}

	private async getVersionFromRuntimeHome(): Promise<string | undefined> {
		const runtimeHome = this.getBallerinaHome();
		if (!runtimeHome) {
			return undefined;
		}

		const versionFromScript = this.getVersionFromStartupScript(runtimeHome);
		if (versionFromScript) {
			return versionFromScript;
		}

		const versionFromCommand = await this.getVersionFromRuntimeCommand(runtimeHome);
		if (versionFromCommand) {
			return versionFromCommand;
		}

		return undefined;
	}

	private getBallerinaHome(): string | undefined {
		const configuredHome = vscode.workspace.getConfiguration("ballerina").get<string>("home");
		if (configuredHome?.trim()) {
			return configuredHome.trim();
		}

		const envHome = process.env.BALLERINA_HOME?.trim();
		if (envHome) {
			return envHome;
		}

		return undefined;
	}

	private getVersionFromStartupScript(runtimeHome: string): string | undefined {
		const scriptCandidates = [
			path.join(runtimeHome, "bin", "bal"),
			path.join(runtimeHome, "bin", "bal.bat"),
		];

		for (const scriptPath of scriptCandidates) {
			if (!fs.existsSync(scriptPath)) {
				continue;
			}

			try {
				const contents = fs.readFileSync(scriptPath, "utf8");
				const versionMatch = contents.match(/-Dballerina\.version=([^\s"'`]+)/);
				const version = this.normalizeRuntimeVersion(versionMatch?.[1]);
				if (version) {
					return version;
				}
			} catch (error) {
				ext.logError(`Failed to read Ballerina startup script: ${scriptPath}`, error as Error);
			}
		}

		return undefined;
	}

	private async getVersionFromRuntimeCommand(runtimeHome: string): Promise<string | undefined> {
		const commandCandidates =
			process.platform === "win32"
				? [path.join(runtimeHome, "bin", "bal.bat")]
				: [path.join(runtimeHome, "bin", "bal")];

		for (const commandPath of commandCandidates) {
			if (!fs.existsSync(commandPath)) {
				continue;
			}

			try {
				const { stdout, stderr } = await execFileAsync(commandPath, ["version"], {
					timeout: 10000,
					env: {
						...process.env,
						BALLERINA_HOME: runtimeHome,
					},
				});
				const version = this.normalizeRuntimeVersion(`${stdout}\n${stderr}`);
				if (version) {
					return version;
				}
			} catch (error) {
				ext.logError(`Failed to execute Ballerina runtime command: ${commandPath}`, error as Error);
			}
		}

		return undefined;
	}

	private normalizeRuntimeVersion(rawVersion: unknown): string | undefined {
		if (typeof rawVersion !== "string") {
			return undefined;
		}

		const match = rawVersion.match(BALLERINA_VERSION_PATTERN);
		if (!match) {
			return undefined;
		}

		const version = match[1];
		if (!version.includes(".")) {
			return undefined;
		}

		const major = Number(version.split(".")[0]);
		if (Number.isNaN(major) || major < 1000) {
			return undefined;
		}

		return version;
	}

	private async fetchLatestVersion(
		config: BallerinaUpdateCheckConfig,
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
