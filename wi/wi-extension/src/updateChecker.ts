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

import axios from "axios";
import * as vscode from "vscode";
import { EXTENSION_ID, EXTENSION_PUBLISHER } from "@wso2/wi-core";
import { ext } from "./extensionVariables";

type UpdateCheckTrigger = "startup" | "manual";

interface UpdateCheckConfig {
	enabled: boolean;
	checkOnStartup: boolean;
	checkIntervalHours: number;
	releaseApiUrl: string;
	tagsApiUrl: string;
	releasesPageUrl: string;
}

interface GithubReleaseResponse {
	tag_name?: string;
	name?: string;
	html_url?: string;
}

interface GithubTagResponse {
	name?: string;
}

interface RemoteVersionDetails {
	version: string;
	releaseUrl: string;
}

const DEFAULT_RELEASE_API_URL = "https://api.github.com/repos/wso2/product-integrator/releases/latest";
const DEFAULT_TAGS_API_URL = "https://api.github.com/repos/wso2/product-integrator/tags?per_page=20";
const DEFAULT_RELEASES_PAGE_URL = "https://github.com/wso2/product-integrator/releases";

const LAST_CHECKED_AT_KEY = "wso2-integrator.updates.lastCheckedAt";
const LAST_NOTIFIED_VERSION_KEY = "wso2-integrator.updates.lastNotifiedVersion";
const LAST_NOTIFIED_INSTALLED_VERSION_KEY = "wso2-integrator.updates.lastNotifiedInstalledVersion";

export class UpdateChecker {
	constructor(private readonly context: vscode.ExtensionContext) {}

	public async checkForUpdates(trigger: UpdateCheckTrigger): Promise<void> {
		const config = this.getConfig();

		if (!config.enabled) {
			ext.log("Update check skipped because it is disabled in configuration");
			if (trigger === "manual") {
				vscode.window.showInformationMessage("WSO2 Integrator update checks are disabled in settings.");
			}
			return;
		}

		if (trigger === "startup" && !config.checkOnStartup) {
			ext.log("Startup update check skipped because checkOnStartup is disabled");
			return;
		}

		if (trigger === "startup" && !this.shouldCheckNow(config.checkIntervalHours)) {
			ext.log("Startup update check skipped because the configured interval has not elapsed");
			return;
		}

		const installedVersion = this.getInstalledVersion();
		ext.log(`Checking for product updates. Installed version: ${installedVersion ?? "unknown"}`);

		try {
			const latestVersion = await this.fetchLatestVersion(config);
			await this.context.globalState.update(LAST_CHECKED_AT_KEY, Date.now());

			if (!latestVersion) {
				ext.log("Unable to resolve the latest product version from configured sources");
				if (trigger === "manual") {
					vscode.window.showWarningMessage("Couldn't determine the latest WSO2 Integrator version right now.");
				}
				return;
			}

			if (installedVersion && compareVersions(latestVersion.version, installedVersion) <= 0) {
				ext.log(`No update available. Installed version ${installedVersion} is current or newer than ${latestVersion.version}`);
				if (trigger === "manual") {
					vscode.window.showInformationMessage(`WSO2 Integrator is up to date. Current version: ${installedVersion}.`);
				}
				return;
			}

			if (trigger === "startup" && this.hasAlreadyNotified(installedVersion, latestVersion.version)) {
				ext.log(`Skipping duplicate update notification for installed=${installedVersion ?? "unknown"} latest=${latestVersion.version}`);
				return;
			}

			await this.context.globalState.update(LAST_NOTIFIED_VERSION_KEY, latestVersion.version);
			await this.context.globalState.update(LAST_NOTIFIED_INSTALLED_VERSION_KEY, installedVersion ?? "unknown");

			const message = installedVersion
				? `WSO2 Integrator ${latestVersion.version} is available. Current version: ${installedVersion}.`
				: `A new WSO2 Integrator version ${latestVersion.version} is available.`;
			const selection = await vscode.window.showInformationMessage(message, "Open Release Notes", "Dismiss");

			if (selection === "Open Release Notes") {
				await vscode.env.openExternal(vscode.Uri.parse(latestVersion.releaseUrl));
			}
		} catch (error) {
			ext.logError("Product update check failed", error as Error);
			if (trigger === "manual") {
				vscode.window.showErrorMessage(
					`Failed to check for WSO2 Integrator updates: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}

	private getConfig(): UpdateCheckConfig {
		const config = vscode.workspace.getConfiguration("wso2-integrator");

		return {
			enabled: config.get<boolean>("updates.enabled", true),
			checkOnStartup: config.get<boolean>("updates.checkOnStartup", true),
			checkIntervalHours: Math.max(1, config.get<number>("updates.checkIntervalHours", 24)),
			releaseApiUrl: config.get<string>("updates.releaseApiUrl", DEFAULT_RELEASE_API_URL),
			tagsApiUrl: config.get<string>("updates.tagsApiUrl", DEFAULT_TAGS_API_URL),
			releasesPageUrl: config.get<string>("updates.releasesPageUrl", DEFAULT_RELEASES_PAGE_URL),
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

	private hasAlreadyNotified(installedVersion: string | undefined, latestVersion: string): boolean {
		const lastNotifiedVersion = this.context.globalState.get<string>(LAST_NOTIFIED_VERSION_KEY);
		const lastNotifiedInstalledVersion = this.context.globalState.get<string>(LAST_NOTIFIED_INSTALLED_VERSION_KEY);
		return lastNotifiedVersion === latestVersion && lastNotifiedInstalledVersion === (installedVersion ?? "unknown");
	}

	private getInstalledVersion(): string | undefined {
		const extensionId = `${EXTENSION_PUBLISHER}.${EXTENSION_ID}`;
		const extension =
			vscode.extensions.getExtension(extensionId) ??
			vscode.extensions.all.find(
				(item) => item.packageJSON?.publisher === EXTENSION_PUBLISHER && item.packageJSON?.name === EXTENSION_ID,
			);

		return extension?.packageJSON?.version;
	}

	private async fetchLatestVersion(config: UpdateCheckConfig): Promise<RemoteVersionDetails | undefined> {
		const githubHeaders = {
			Accept: "application/vnd.github+json",
			"User-Agent": "wso2-integrator-extension",
		};

		try {
			const response = await axios.get<GithubReleaseResponse>(config.releaseApiUrl, { headers: githubHeaders });
			const version = extractVersion(response.data.tag_name ?? response.data.name);

			if (version) {
				ext.log(`Resolved latest version ${version} from release API`);
				return {
					version,
					releaseUrl: response.data.html_url ?? config.releasesPageUrl,
				};
			}
		} catch (error) {
			ext.logError("Failed to resolve latest version from release API", error as Error);
		}

		try {
			const response = await axios.get<GithubTagResponse[]>(config.tagsApiUrl, { headers: githubHeaders });
			const tags = Array.isArray(response.data) ? response.data : [];
			const versions = tags
				.map((tag) => ({ raw: tag.name, version: extractVersion(tag.name) }))
				.filter((tag): tag is { raw: string; version: string } => Boolean(tag.raw && tag.version))
				.sort((left, right) => compareVersions(right.version, left.version));

			if (versions.length > 0) {
				ext.log(`Resolved latest version ${versions[0].version} from tags API`);
				return {
					version: versions[0].version,
					releaseUrl: `${config.releasesPageUrl}/tag/${versions[0].raw}`,
				};
			}
		} catch (error) {
			ext.logError("Failed to resolve latest version from tags API", error as Error);
		}

		return undefined;
	}
}

function extractVersion(rawVersion: string | undefined): string | undefined {
	if (!rawVersion) {
		return undefined;
	}

	const match = rawVersion.trim().match(/(\d+(?:\.\d+)+)/);
	return match?.[1];
}

function compareVersions(left: string, right: string): number {
	const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
	const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
	const maxLength = Math.max(leftParts.length, rightParts.length);

	for (let index = 0; index < maxLength; index += 1) {
		const leftValue = leftParts[index] ?? 0;
		const rightValue = rightParts[index] ?? 0;

		if (leftValue > rightValue) {
			return 1;
		}

		if (leftValue < rightValue) {
			return -1;
		}
	}

	return 0;
}
