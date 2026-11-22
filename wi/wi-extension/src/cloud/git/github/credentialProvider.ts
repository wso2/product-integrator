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

// The hosts this session's token belongs to. The match has to be the whole
// hostname: a substring test also accepts github.com.attacker.example and
// notgithub.com, and answering either of those hands an unrelated host the
// access token.
const GITHUB_HOSTS = new Set(["github.com", "gist.github.com"]);

// Uri.authority carries optional userinfo and port, as in user@github.com:443,
// so both are stripped before the hostname is compared.
export function isGitHubAuthority(authority: string): boolean {
	const hostname = authority
		.replace(/^.*@/, "")
		.replace(/:\d+$/, "")
		.toLowerCase();
	return GITHUB_HOSTS.has(hostname);
}

class GitHubCredentialProvider implements CredentialsProvider {
	async getCredentials(host: Uri): Promise<Credentials | undefined> {
		if (!isGitHubAuthority(host.authority)) {
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
