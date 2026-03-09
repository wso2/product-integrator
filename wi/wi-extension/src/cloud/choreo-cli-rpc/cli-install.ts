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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { workspace } from "vscode";
import { ext } from "../../extensionVariables";
import { RPCClient } from "./client";

export async function installRPCServer() {
	try {
		await choreoCliBinaryExists();
		await RPCClient.getInstance();
		ext.log("RPC server initialized successfully");
	} catch (error) {
		ext.logError(`Failed to initialize RPC server: ${error instanceof Error ? error.message : String(error)}`);
		// Allow extension to continue without RPC functionality
		// Important for test environments where CLI resources may not be available
	}
}

export const getCliVersion = (): string => {
	const packageJson = JSON.parse(fs.readFileSync(path.join(ext.context.extensionPath, "package.json"), "utf8"));
	return packageJson?.cliVersion;
};

export const getChoreoExecPath = () => {
	const OS = os.platform();
	const executablePath = workspace.getConfiguration().get<string>("WSO2.WSO2-Platform.Advanced.RpcPath");
	if (executablePath) {
		if (OS === "win32" && !executablePath.endsWith(".exe")) {
			return `${executablePath}.exe`;
		}
		return executablePath;
	}

	return path.join(getChoreoBinPath(), OS === "win32" ? "choreo.exe" : "choreo");
};

export const getChoreoEnv = (): string => {
	return (
		process.env.CHOREO_ENV ||
		process.env.CLOUD_ENV ||
		workspace.getConfiguration().get<string>("WSO2.WSO2-Platform.Advanced.ChoreoEnvironment") ||
		"prod"
	);
};

const getChoreoBinPath = () => {
	const OS = os.platform();
	const ARCH = getArchitecture();
	return path.join(ext.context.extensionPath, "resources", "choreo-cli", getCliVersion(), OS, ARCH);
};

const choreoCliBinaryExists = async () => {
	const OS = os.platform();
	const CHOREO_CLI_EXEC = getChoreoExecPath();

	if (!fs.existsSync(CHOREO_CLI_EXEC)) {
		throw new Error(`Choreo CLI binary not found at: ${CHOREO_CLI_EXEC}`);
	}

	// Ensure executable permissions on Unix systems (may be lost after git checkout or copy)
	if (OS !== "win32") {
		try {
			await fs.promises.chmod(CHOREO_CLI_EXEC, 0o755);
		} catch (error) {
			throw new Error(`Failed to set executable permissions on ${CHOREO_CLI_EXEC}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	ext.log("CLI binary exists and is executable");
};

function getArchitecture() {
	const arch = workspace.getConfiguration().get<string>("WSO2.WSO2-Platform.Advanced.RpcArchitecture");
	if (arch) {
		return arch;
	}
	const ARCH = os.arch();
	switch (ARCH) {
		case "x64":
			return "amd64";
		// case "x32":
		// 	return "386";
		case "arm64":
		case "aarch64":
			return "arm64";
		case "arm":
			return "arm";
		default:
			throw new Error(`Unsupported architecture: ${ARCH}`);
	}
}
