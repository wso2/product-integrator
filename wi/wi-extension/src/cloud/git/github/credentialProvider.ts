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

import { type Disposable, type Uri, workspace } from "vscode";
import type { Askpass } from "../askpass";
import { type Credentials, type CredentialsProvider } from "./../api/git";
import { getSession } from "./session";

const EmptyDisposable: Disposable = { dispose() {} };

class GitHubCredentialProvider implements CredentialsProvider {
	async getCredentials(host: Uri): Promise<Credentials | undefined> {
		if (!/github\.com/i.test(host.authority)) {
			return;
		}

		const session = await getSession();
		return { username: session.account.id, password: session.accessToken };
	}
}

export class GithubCredentialProviderManager {
	private providerDisposable: Disposable = EmptyDisposable;
	private readonly disposable: Disposable;

	private _enabled = false;
	private set enabled(enabled: boolean) {
		if (this._enabled === enabled) {
			return;
		}

		this._enabled = enabled;

		if (enabled) {
			this.providerDisposable = this.askPass.registerCredentialsProvider(new GitHubCredentialProvider());
		} else {
			this.providerDisposable.dispose();
		}
	}

	constructor(private askPass: Askpass) {
		this.disposable = workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("github")) {
				this.refresh();
			}
		});

		this.refresh();
	}

	private refresh(): void {
		const config = workspace.getConfiguration("github", null);
		const enabled = config.get<boolean>("gitAuthentication", true);
		this.enabled = !!enabled;
	}

	dispose(): void {
		this.enabled = false;
		this.disposable.dispose();
	}
}
