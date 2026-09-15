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

/**
 * The editor's own platform session.
 *
 * Kept in VS Code's secret storage rather than in memory, so that reloading the
 * window does not sign the user out — the window reload is the ordinary way an
 * editor session is interrupted, and the environment it would otherwise fall
 * back to holds the token the platform injected at provisioning, which is dead
 * an hour later.
 */

import type { SecretStorage } from "vscode";
import { ext } from "../../extensionVariables";
import {
	buildRefreshBody,
	type IdpConfig,
	needsRefresh,
	type StoredSession,
	toStoredSession,
	type TokenResponse,
} from "./oidc";

const SECRET_KEY = "wso2.integration-platform.session";

export class SessionStore {
	/** In flight, so concurrent callers renew once rather than each. */
	private refreshing: Promise<StoredSession | null> | null = null;

	constructor(
		private readonly secrets: SecretStorage,
		private readonly exchange: (body: string) => Promise<TokenResponse>,
		private readonly now: () => number = () => Date.now(),
	) {}

	async read(): Promise<StoredSession | null> {
		try {
			const raw = await this.secrets.get(SECRET_KEY);
			return raw ? (JSON.parse(raw) as StoredSession) : null;
		} catch {
			// Unreadable is indistinguishable from absent to every caller, and
			// both mean the same thing: sign in again.
			return null;
		}
	}

	async write(session: StoredSession): Promise<void> {
		await this.secrets.store(SECRET_KEY, JSON.stringify(session));
	}

	async clear(): Promise<void> {
		await this.secrets.delete(SECRET_KEY);
	}

	/**
	 * The access token to use now, renewing it first if it is about to expire.
	 *
	 * "" when there is no session, which leaves the caller to fall back to the
	 * token the platform injected — the right answer for an editor whose user
	 * has never signed in, and which has not been open long enough to need to.
	 */
	async accessToken(idp: IdpConfig | null): Promise<string> {
		const session = await this.read();
		if (!session) {
			return "";
		}
		if (!needsRefresh(session, this.now())) {
			return session.accessToken;
		}
		if (!idp || !session.refreshToken) {
			return "";
		}
		const renewed = await this.renew(idp, session);
		return renewed?.accessToken ?? "";
	}

	/** Renew once, however many callers ask at the same moment. */
	private renew(idp: IdpConfig, session: StoredSession): Promise<StoredSession | null> {
		if (this.refreshing) {
			return this.refreshing;
		}
		this.refreshing = (async () => {
			try {
				const response = await this.exchange(buildRefreshBody(idp, session.refreshToken));
				const renewed = toStoredSession(response, this.now(), session.refreshToken);
				if (!renewed) {
					// The provider answered without a token: the refresh token is
					// spent or revoked, and keeping it would retry forever.
					await this.clear();
					return null;
				}
				await this.write(renewed);
				return renewed;
			} catch (err) {
				// A failure that is not the provider's answer -- offline, a gateway
				// hiccup -- leaves the session alone, so a network blip does not
				// sign the user out.
				ext.logError("Could not renew the platform session", err as Error);
				return null;
			} finally {
				this.refreshing = null;
			}
		})();
		return this.refreshing;
	}
}
