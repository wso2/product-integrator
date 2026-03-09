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

import * as http from "http";

export class IPCClient {
	private ipcHandlePath: string;

	constructor(private handlerName: string) {
		const ipcHandlePath = process.env.VSCODE_GIT_IPC_HANDLE;

		if (!ipcHandlePath) {
			throw new Error("Missing VSCODE_GIT_IPC_HANDLE");
		}

		this.ipcHandlePath = ipcHandlePath;
	}

	call(request: any): Promise<any> {
		const opts: http.RequestOptions = {
			socketPath: this.ipcHandlePath,
			path: `/${this.handlerName}`,
			method: "POST",
		};

		return new Promise((c, e) => {
			const req = http.request(opts, (res) => {
				if (res.statusCode !== 200) {
					return e(new Error(`Bad status code: ${res.statusCode}`));
				}

				const chunks: Buffer[] = [];
				res.on("data", (d) => chunks.push(d));
				res.on("end", () => c(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
			});

			req.on("error", (err) => e(err));
			req.write(JSON.stringify(request));
			req.end();
		});
	}
}
