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

import { exec } from "child_process";
import * as fs from "fs";
import { ext } from "../extensionVariables";
import { downloadCLI, getChoreoExecPath, getCliVersion } from "./cli-install";
import { RPCClient } from "./client";

function isChoreoCliInstalled(): Promise<boolean> {
	return new Promise((resolve) => {
		const rpcPath = getChoreoExecPath();
		ext.log(`RPC path: ${rpcPath}`);

		if (!fs.existsSync(rpcPath)) {
			return resolve(false);
		}

		const process = exec(`"${rpcPath}" --version`, (error) => {
			if (error) {
				console.error("error", error);
				fs.rmSync(rpcPath);
				resolve(false);
			} else {
				resolve(true);
			}
		});

		const timeout = setTimeout(() => {
			process.kill(); // Kill the process if it exceeds 5 seconds
			ext.logError("Timeout: Process took too long");
			fs.rmSync(rpcPath);
			ext.logError(`Delete RPC path and try again ${rpcPath}`);
			resolve(false);
		}, 5000);

		process.on("exit", () => clearTimeout(timeout));
	});
}

export async function initRPCServer() {
	const installed = await isChoreoCliInstalled();
	if (!installed) {
		ext.log(`WSO2 Platform RPC version ${getCliVersion()} not installed`);
		await downloadCLI();
	}

	await RPCClient.getInstance();
}
