#!/usr/bin/env node

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

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const RELEASE_API_URL =
	process.env.WSO2_INTEGRATOR_RELEASE_API_URL ||
	"https://api.github.com/repos/wso2/product-integrator/releases/latest";
const TAGS_API_URL =
	process.env.WSO2_INTEGRATOR_TAGS_API_URL ||
	"https://api.github.com/repos/wso2/product-integrator/tags?per_page=20";
const RELEASES_PAGE_URL =
	process.env.WSO2_INTEGRATOR_RELEASES_PAGE_URL ||
	"https://github.com/wso2/product-integrator/releases";
const INSTALLED_VERSION =
	process.env.WSO2_INTEGRATOR_CURRENT_VERSION ||
	readRootPackageVersion() ||
	"0.0.0";
const STATE_DIR =
	process.env.WSO2_INTEGRATOR_STATE_DIR ||
	path.join(os.homedir(), ".wso2-integrator-update-check");
const STATE_PATH = path.join(STATE_DIR, "state.json");

async function main() {
	const latest = (await fetchLatestRelease()) || (await fetchLatestTag());

	if (!latest) {
		console.error("Unable to determine the latest WSO2 Integrator version.");
		process.exitCode = 1;
		return;
	}

	const state = readState();
	if (compareVersions(latest.version, INSTALLED_VERSION) <= 0) {
		console.log(
			`No update available. Installed version ${INSTALLED_VERSION} is current or newer than ${latest.version}.`,
		);
		writeState({
			...state,
			lastCheckedAt: new Date().toISOString(),
			lastSeenLatestVersion: latest.version,
		});
		return;
	}

	if (state.lastNotifiedVersion === latest.version && state.lastInstalledVersion === INSTALLED_VERSION) {
		console.log(`Update ${latest.version} was already notified for installed version ${INSTALLED_VERSION}.`);
		writeState({
			...state,
			lastCheckedAt: new Date().toISOString(),
			lastSeenLatestVersion: latest.version,
		});
		return;
	}

	const message = `WSO2 Integrator ${latest.version} is available. Current version: ${INSTALLED_VERSION}.`;
	sendNotification("WSO2 Integrator Update", message);
	console.log(message);
	console.log(`Release notes: ${latest.releaseUrl}`);

	writeState({
		lastCheckedAt: new Date().toISOString(),
		lastSeenLatestVersion: latest.version,
		lastNotifiedVersion: latest.version,
		lastInstalledVersion: INSTALLED_VERSION,
	});
}

async function fetchLatestRelease() {
	try {
		const payload = await getJson(RELEASE_API_URL);
		const version = extractVersion(payload.tag_name || payload.name);
		if (!version) {
			return undefined;
		}

		return {
			version,
			releaseUrl: payload.html_url || RELEASES_PAGE_URL,
		};
	} catch (error) {
		console.warn(`Release API lookup failed: ${error.message}`);
		return undefined;
	}
}

async function fetchLatestTag() {
	try {
		const payload = await getJson(TAGS_API_URL);
		if (!Array.isArray(payload)) {
			return undefined;
		}

		const versions = payload
			.map((tag) => ({ raw: tag.name, version: extractVersion(tag.name) }))
			.filter((tag) => tag.raw && tag.version)
			.sort((left, right) => compareVersions(right.version, left.version));

		if (versions.length === 0) {
			return undefined;
		}

		return {
			version: versions[0].version,
			releaseUrl: `${RELEASES_PAGE_URL}/tag/${versions[0].raw}`,
		};
	} catch (error) {
		console.warn(`Tags API lookup failed: ${error.message}`);
		return undefined;
	}
}

function getJson(url) {
	return new Promise((resolve, reject) => {
		const request = https.get(
			url,
			{
				headers: {
					Accept: "application/vnd.github+json",
					"User-Agent": "wso2-integrator-update-checker",
				},
			},
			(response) => {
				if (response.statusCode && response.statusCode >= 400) {
					reject(new Error(`HTTP ${response.statusCode} for ${url}`));
					response.resume();
					return;
				}

				let body = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					body += chunk;
				});
				response.on("end", () => {
					try {
						resolve(JSON.parse(body));
					} catch (error) {
						reject(error);
					}
				});
			},
		);

		request.on("error", reject);
	});
}

function sendNotification(title, message) {
	try {
		if (process.platform === "darwin") {
			execFileSync("osascript", [
				"-e",
				`display notification ${toAppleScriptString(message)} with title ${toAppleScriptString(title)}`,
			]);
			return;
		}

		if (process.platform === "linux") {
			execFileSync("notify-send", [title, message]);
			return;
		}

		if (process.platform === "win32") {
			execFileSync("powershell", [
				"-NoProfile",
				"-Command",
				`Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show(${toPowerShellString(
					message,
				)},${toPowerShellString(title)})`,
			]);
			return;
		}
	} catch (error) {
		console.warn(`Desktop notification failed: ${error.message}`);
	}
}

function readState() {
	try {
		return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
	} catch {
		return {};
	}
}

function writeState(state) {
	fs.mkdirSync(STATE_DIR, { recursive: true });
	fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function extractVersion(rawVersion) {
	if (!rawVersion) {
		return undefined;
	}

	const match = String(rawVersion).trim().match(/(\d+(?:\.\d+)+)/);
	return match ? match[1] : undefined;
}

function compareVersions(left, right) {
	const leftParts = String(left)
		.split(".")
		.map((part) => Number.parseInt(part, 10) || 0);
	const rightParts = String(right)
		.split(".")
		.map((part) => Number.parseInt(part, 10) || 0);
	const maxLength = Math.max(leftParts.length, rightParts.length);

	for (let index = 0; index < maxLength; index += 1) {
		const leftValue = leftParts[index] || 0;
		const rightValue = rightParts[index] || 0;

		if (leftValue > rightValue) {
			return 1;
		}

		if (leftValue < rightValue) {
			return -1;
		}
	}

	return 0;
}

function readRootPackageVersion() {
	try {
		const packageJsonPath = path.resolve(__dirname, "../../package.json");
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		return packageJson.version;
	} catch {
		return undefined;
	}
}

function toAppleScriptString(value) {
	return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function toPowerShellString(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
