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
import { IPCClient } from "./ipc/ipcClient";

function fatal(err: any): void {
	console.error("Missing or invalid credentials.");
	console.error(err);
	process.exit(1);
}

function main(argv: string[]): void {
	if (!process.env.VSCODE_GIT_ASKPASS_PIPE) {
		return fatal("Missing pipe");
	}

	if (!process.env.VSCODE_GIT_ASKPASS_TYPE) {
		return fatal("Missing type");
	}

	if (process.env.VSCODE_GIT_ASKPASS_TYPE !== "https" && process.env.VSCODE_GIT_ASKPASS_TYPE !== "ssh") {
		return fatal(`Invalid type: ${process.env.VSCODE_GIT_ASKPASS_TYPE}`);
	}

	if (process.env.VSCODE_GIT_COMMAND === "fetch" && !!process.env.VSCODE_GIT_FETCH_SILENT) {
		return fatal("Skip silent fetch commands");
	}

	const output = process.env.VSCODE_GIT_ASKPASS_PIPE as string;
	const askpassType = process.env.VSCODE_GIT_ASKPASS_TYPE as "https" | "ssh";

	// HTTPS (username | password), SSH (passphrase | authenticity)
	const request = askpassType === "https" ? argv[2] : argv[3];

	let host: string | undefined;
	let file: string | undefined;
	let fingerprint: string | undefined;

	if (askpassType === "https") {
		host = argv[4].replace(/^["']+|["':]+$/g, "");
	}

	if (askpassType === "ssh") {
		if (/passphrase/i.test(request)) {
			// passphrase
			file = argv[6].replace(/^["']+|["':]+$/g, "");
		} else {
			// authenticity
			host = argv[6].replace(/^["']+|["':]+$/g, "");
			fingerprint = argv[15];
		}
	}

	const ipcClient = new IPCClient("askpass");
	ipcClient
		.call({ askpassType, request, host, file, fingerprint })
		.then((res) => {
			fs.writeFileSync(output, `${res}\n`);
			setTimeout(() => process.exit(0), 0);
		})
		.catch((err) => fatal(err));
}

main(process.argv);
