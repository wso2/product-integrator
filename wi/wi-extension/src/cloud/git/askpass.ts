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

import * as path from "path";
import { type Disposable, type InputBoxOptions, type QuickPickOptions, Uri, l10n, window, workspace } from "vscode";
import type { Credentials, CredentialsProvider } from "./api/git";
import type { IIPCHandler, IIPCServer } from "./ipc/ipcServer";
import type { ITerminalEnvironmentProvider } from "./terminal";
import { EmptyDisposable, type IDisposable, toDisposable } from "./util";

export class Askpass implements IIPCHandler, ITerminalEnvironmentProvider {
	private env: { [key: string]: string };
	private sshEnv: { [key: string]: string };
	private disposable: IDisposable = EmptyDisposable;
	private cache = new Map<string, Credentials>();
	private credentialsProviders = new Set<CredentialsProvider>();

	constructor(private ipc?: IIPCServer) {
		if (ipc) {
			this.disposable = ipc.registerHandler("askpass", this);
		}

		this.env = {
			// GIT_ASKPASS
			GIT_ASKPASS: path.join(__dirname, this.ipc ? "askpass.sh" : "askpass-empty.sh"),
			// VSCODE_GIT_ASKPASS
			VSCODE_GIT_ASKPASS_NODE: process.execPath,
			VSCODE_GIT_ASKPASS_EXTRA_ARGS: process.versions.electron && process.versions["microsoft-build"] ? "--ms-enable-electron-run-as-node" : "",
			VSCODE_GIT_ASKPASS_MAIN: path.join(__dirname, "askpass-main.js"),
		};

		this.sshEnv = {
			// SSH_ASKPASS
			SSH_ASKPASS: path.join(__dirname, this.ipc ? "ssh-askpass.sh" : "ssh-askpass-empty.sh"),
			SSH_ASKPASS_REQUIRE: "force",
		};
	}

	async handle(
		payload:
			| { askpassType: "https"; request: string; host: string }
			| { askpassType: "ssh"; request: string; host?: string; file?: string; fingerprint?: string },
	): Promise<string> {
		const config = workspace.getConfiguration("git", null);
		const enabled = config.get<boolean>("enabled");

		if (!enabled) {
			return "";
		}

		// https
		if (payload.askpassType === "https") {
			return await this.handleAskpass(payload.request, payload.host);
		}

		// ssh
		return await this.handleSSHAskpass(payload.request, payload.host, payload.file, payload.fingerprint);
	}

	async handleAskpass(request: string, host: string): Promise<string> {
		const uri = Uri.parse(host);
		const authority = uri.authority.replace(/^.*@/, "");
		const password = /password/i.test(request);
		const cached = this.cache.get(authority);

		if (cached && password) {
			this.cache.delete(authority);
			return cached.password;
		}

		if (!password) {
			for (const credentialsProvider of this.credentialsProviders) {
				try {
					const credentials = await credentialsProvider.getCredentials(uri);

					if (credentials) {
						this.cache.set(authority, credentials);
						setTimeout(() => this.cache.delete(authority), 60_000);
						return credentials.username;
					}
				} catch {}
			}
		}

		const options: InputBoxOptions = {
			password,
			placeHolder: request,
			prompt: `Git: ${host}`,
			ignoreFocusOut: true,
		};

		return (await window.showInputBox(options)) || "";
	}

	async handleSSHAskpass(request: string, host?: string, file?: string, fingerprint?: string): Promise<string> {
		// passphrase
		if (/passphrase/i.test(request)) {
			const options: InputBoxOptions = {
				password: true,
				placeHolder: l10n.t("Passphrase"),
				prompt: `SSH Key: ${file}`,
				ignoreFocusOut: true,
			};

			return (await window.showInputBox(options)) || "";
		}

		// authenticity
		const options: QuickPickOptions = {
			canPickMany: false,
			ignoreFocusOut: true,
			placeHolder: l10n.t("Are you sure you want to continue connecting?"),
			title: l10n.t('"{0}" has fingerprint "{1}"', host ?? "", fingerprint ?? ""),
		};
		const items = [l10n.t("yes"), l10n.t("no")];
		return (await window.showQuickPick(items, options)) ?? "";
	}

	getEnv(): { [key: string]: string } {
		const config = workspace.getConfiguration("git");
		return config.get<boolean>("useIntegratedAskPass") ? { ...this.env, ...this.sshEnv } : {};
	}

	getTerminalEnv(): { [key: string]: string } {
		const config = workspace.getConfiguration("git");
		return config.get<boolean>("useIntegratedAskPass") && config.get<boolean>("terminalAuthentication") ? this.env : {};
	}

	registerCredentialsProvider(provider: CredentialsProvider): Disposable {
		this.credentialsProviders.add(provider);
		return toDisposable(() => this.credentialsProviders.delete(provider));
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
