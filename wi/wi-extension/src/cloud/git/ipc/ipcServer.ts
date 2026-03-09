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

import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import type { Disposable } from "vscode";
import type { ITerminalEnvironmentProvider } from "..//terminal";
import { toDisposable } from "../util";

function getIPCHandlePath(id: string): string {
	if (process.platform === "win32") {
		return `\\\\.\\pipe\\vscode-git-${id}-sock`;
	}

	if (process.env.XDG_RUNTIME_DIR) {
		return path.join(process.env.XDG_RUNTIME_DIR as string, `vscode-git-${id}.sock`);
	}

	return path.join(os.tmpdir(), `vscode-git-${id}.sock`);
}

export interface IIPCHandler {
	handle(request: any): Promise<any>;
}

export async function createIPCServer(context?: string): Promise<IPCServer> {
	const server = http.createServer();
	const hash = crypto.createHash("sha1");

	if (!context) {
		const buffer = await new Promise<Buffer>((c, e) => crypto.randomBytes(20, (err, buf) => (err ? e(err) : c(buf))));
		hash.update(buffer);
	} else {
		hash.update(context);
	}

	const ipcHandlePath = getIPCHandlePath(hash.digest("hex").substr(0, 10));

	if (process.platform !== "win32") {
		try {
			await fs.promises.unlink(ipcHandlePath);
		} catch {
			// noop
		}
	}

	return new Promise((c, e) => {
		try {
			server.on("error", (err) => e(err));
			server.listen(ipcHandlePath);
			c(new IPCServer(server, ipcHandlePath));
		} catch (err) {
			e(err);
		}
	});
}

export interface IIPCServer extends Disposable {
	readonly ipcHandlePath: string | undefined;
	getEnv(): { [key: string]: string };
	registerHandler(name: string, handler: IIPCHandler): Disposable;
}

export class IPCServer implements IIPCServer, ITerminalEnvironmentProvider, Disposable {
	private handlers = new Map<string, IIPCHandler>();
	get ipcHandlePath(): string {
		return this._ipcHandlePath;
	}

	constructor(
		private server: http.Server,
		private _ipcHandlePath: string,
	) {
		this.server.on("request", this.onRequest.bind(this));
	}

	registerHandler(name: string, handler: IIPCHandler): Disposable {
		this.handlers.set(`/${name}`, handler);
		return toDisposable(() => this.handlers.delete(name));
	}

	private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		if (!req.url) {
			console.warn("Request lacks url");
			return;
		}

		const handler = this.handlers.get(req.url);

		if (!handler) {
			console.warn(`IPC handler for ${req.url} not found`);
			return;
		}

		const chunks: Buffer[] = [];
		req.on("data", (d) => chunks.push(d));
		req.on("end", () => {
			const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
			handler.handle(request).then(
				(result) => {
					res.writeHead(200);
					res.end(JSON.stringify(result));
				},
				() => {
					res.writeHead(500);
					res.end();
				},
			);
		});
	}

	getEnv(): { [key: string]: string } {
		return { VSCODE_GIT_IPC_HANDLE: this.ipcHandlePath };
	}

	getTerminalEnv(): { [key: string]: string } {
		return { VSCODE_GIT_IPC_HANDLE: this.ipcHandlePath };
	}

	dispose(): void {
		this.handlers.clear();
		this.server.close();

		if (this._ipcHandlePath && process.platform !== "win32") {
			fs.unlinkSync(this._ipcHandlePath);
		}
	}
}
