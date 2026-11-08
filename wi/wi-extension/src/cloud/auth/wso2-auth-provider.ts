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

import type { CloudOrganization, AuthState as WICloudAuthState } from "@wso2/wi-core";
import { type AuthState, type Organization, type PlatformSession, type StoredSession, isCloudError } from "@wso2/wso2-cloud-client";
import { PROMPT_LOGIN_SCOPE, WSO2_CLOUD_AUTH_PROVIDER_ID, scopeForEnv } from "@wso2/wso2-cloud-client/vscode";
import { Disposable, EventEmitter, authentication, window } from "vscode";
import type { WIPlatform } from "../platform/platform-client";
import { contextStore } from "../stores/context-store";

/** The id other extensions pass to `vscode.authentication.getSession`. */
export const WSO2_AUTH_PROVIDER_ID = WSO2_CLOUD_AUTH_PROVIDER_ID;

interface AuthStateDeps {
	platform: WIPlatform;
	log: (msg: string) => void;
	logError: (msg: string, err?: Error) => void;
}

const SIGNED_OUT: AuthState = { session: null, status: "signed-out" };

/**
 * The sign-in state the extension's commands, stores and webviews read.
 *
 * The `wso2-cloud` authentication provider in `@wso2/wso2-cloud-client` owns
 * the tokens; this holds the derived state (who is signed in, to which
 * organization) and tells the rest of the extension when it changes.
 */
export class WIAuthState implements Disposable {
	private _state: AuthState = SIGNED_OUT;
	private initializing?: Promise<void>;
	private readonly _stateChangeEmitter = new EventEmitter<{ state: AuthState }>();
	private readonly _disposables: Disposable[] = [];

	constructor(private readonly deps: AuthStateDeps) {
		this._disposables.push(
			this._stateChangeEmitter,
			authentication.onDidChangeSessions((e) => {
				if (e.provider.id === WSO2_AUTH_PROVIDER_ID) {
					void this.initAuth();
				}
			}),
		);
		this._disposables.push(
			new Disposable(
				deps.platform.sessions.onDidChange((event) => {
					if (event.reason === "expired" || event.reason === "signed-out") {
						this.resetState(event.reason === "expired" ? "expired" : "signed-out");
					}
				}),
			),
		);
	}

	/** The current state. */
	get state(): AuthState {
		return this._state;
	}

	get session(): PlatformSession | null {
		return this._state.session;
	}

	get org(): Organization | undefined {
		return this._state.session?.org;
	}

	/** Whether there is a session to work with; a sign-in in progress keeps the one there is. */
	get isLoggedIn(): boolean {
		return (this._state.status === "signed-in" || this._state.status === "signing-in") && !!this._state.session;
	}

	/** Subscribe to state changes; the callback is called at once with the current state. */
	public subscribe(callback: (store: { state: AuthState }) => void): () => void {
		const disposable = this._stateChangeEmitter.event(callback);
		callback({ state: this._state });
		return () => disposable.dispose();
	}

	/**
	 * Restores the state from the stored session on startup, or after the
	 * provider changed. One at a time: a second call while one runs awaits it.
	 */
	public initAuth(): Promise<void> {
		if (!this.initializing) {
			this.initializing = this.initAuthOnce().finally(() => {
				this.initializing = undefined;
			});
		}
		return this.initializing;
	}

	private async initAuthOnce(): Promise<void> {
		try {
			const stored = await this.deps.platform.sessions.current();
			if (!stored) {
				const claims = await this.deps.platform.tokenSource.getClaims().catch((): undefined => undefined);
				if (this.deps.platform.injected && claims) {
					// The cloud editor's token is a session too, read from the environment.
					this.setSession(
						sessionFromClaims(this.deps.platform.environment.name, claims.sub, claims.email, claims.name, claims.picture, { id: claims.ouId, handle: claims.ouHandle, name: claims.ouName }, claims.exp),
					);
					await this.fillOrganization();
					return;
				}
				this.resetState("signed-out");
				return;
			}
			if (!this.deps.platform.sessions.isFresh(stored)) {
				// Refresh now, so a stale token is not handed to the first call.
				try {
					await this.deps.platform.tokenSource.getAccessToken();
				} catch (error) {
					if (isCloudError(error) && (error.code === "unauthenticated" || error.code === "session_expired")) {
						this.resetState("expired");
						return;
					}
					this.deps.logError("Could not refresh the WSO2 Cloud session; keeping it", error as Error);
				}
			}
			this.setSession(toPlatformSession(stored));
			await this.fillOrganization();
		} catch (err) {
			this.deps.logError("Error during auth initialization", err as Error);
			this.resetState("signed-out");
		}
	}

	/**
	 * Signs in through the `wso2-cloud` provider, which opens the browser.
	 * `reselectOrganization` asks the identity provider to let the person pick
	 * an organization again, which is how an organization is switched.
	 */
	public async signIn(options: { reselectOrganization?: boolean } = {}): Promise<PlatformSession> {
		const previous = this._state;
		this._state = { ...previous, status: "signing-in" };
		this._stateChangeEmitter.fire({ state: this._state });
		try {
			if (options.reselectOrganization) {
				await this.deps.platform.sessions.signOut({ revoke: true });
			}
			const scopes = [scopeForEnv(this.deps.platform.environment.name)];
			if (options.reselectOrganization) {
				scopes.push(PROMPT_LOGIN_SCOPE);
			}
			// The provider is this extension's own: asking it directly skips the consent
			// prompt VS Code shows when an extension asks a provider for a new session.
			await this.deps.platform.auth.createSession(scopes);
			await this.initAuth();
			if (!this._state.session) {
				throw new Error("The sign-in completed but no session was stored.");
			}
			return this._state.session;
		} catch (error) {
			// Back to where it was: the session there was, or none.
			if (this._state.status === "signing-in") {
				this._state = previous.session ? { session: previous.session, status: "signed-in" } : { session: null, status: previous.status === "signing-in" ? "signed-out" : previous.status };
				this._stateChangeEmitter.fire({ state: this._state });
			}
			throw error;
		}
	}

	public cancelPendingSignIn(): void {
		this.deps.platform.auth.cancelPendingLogin();
	}

	/** Ends the session, telling the identity provider to revoke it. */
	public async logout(silent = true): Promise<void> {
		this.deps.log("Signing out from WSO2 Cloud");
		this.resetState("signed-out");
		try {
			await this.deps.platform.sessions.signOut({ revoke: true });
		} catch (error) {
			this.deps.logError("Error while signing out", error as Error);
		}
		if (!silent) {
			window.showInformationMessage("Signed out of WSO2 Cloud.");
		}
	}

	public resetState(status: AuthState["status"] = "signed-out"): void {
		this._state = status === "signed-in" && this._state.session ? this._state : { session: null, status };
		if (!this._state.session) {
			// Nothing of the person who left stays selected.
			contextStore.getState().resetState();
		}
		this._stateChangeEmitter.fire({ state: this._state });
	}

	private setSession(session: PlatformSession): void {
		const previous = this._state.session;
		this._state = { session, status: "signed-in" };
		this._stateChangeEmitter.fire({ state: this._state });
		// A refreshed token is the same person in the same organization: the projects listed stay right.
		const samePerson = previous?.user.userId === session.user.userId && previous?.org.id === session.org.id && previous?.env === session.env;
		if (!samePerson) {
			void contextStore.getState().refreshState();
		}
	}

	/** Fills in the organization's uuid from the API, which the subscription routes take. */
	private async fillOrganization(): Promise<void> {
		const session = this._state.session;
		if (!session || session.org.uuid) {
			return;
		}
		try {
			const org = await this.deps.platform.cloud.orgs.current();
			if (org && this._state.session === session) {
				const filled: PlatformSession = { ...session, org: { ...session.org, uuid: org.uuid, numericId: org.numericId } };
				await this.deps.platform.sessions.update((stored) => ({ ...stored, org: filled.org }));
				this._state = { session: filled, status: "signed-in" };
				this._stateChangeEmitter.fire({ state: this._state });
			}
		} catch (error) {
			this.deps.logError("Could not read the organization from the platform", error as Error);
		}
	}

	/**
	 * The shape the webviews were written against: a `userInfo` with one
	 * organization. Kept at the bridge so the views need not change for the
	 * platform move.
	 */
	public legacyAuthState(): WICloudAuthState {
		const session = this._state.session;
		if (!session) {
			return { userInfo: null, status: this._state.status };
		}
		const org: CloudOrganization = { id: session.org.id, uuid: session.org.uuid, handle: session.org.handle, name: session.org.name };
		return {
			status: this._state.status,
			selectedOrgId: org.id,
			userInfo: {
				userId: session.user.userId,
				displayName: session.user.displayName,
				userEmail: session.user.email ?? "",
				userProfilePictureUrl: session.user.pictureUrl,
				organizations: [org],
			},
		};
	}

	public dispose(): void {
		for (const disposable of this._disposables) {
			disposable.dispose();
		}
	}
}

export function toPlatformSession(stored: StoredSession): PlatformSession {
	return sessionFromClaims(stored.env, stored.account.id, stored.claims.email, stored.claims.name ?? stored.account.label, stored.claims.picture, stored.org, undefined, stored.tokens.expiresAt, stored.obtainedVia);
}

function sessionFromClaims(
	env: PlatformSession["env"],
	userId: string,
	email: string | undefined,
	name: string | undefined,
	picture: string | undefined,
	org: Organization,
	exp?: number,
	expiresAt?: string,
	obtainedVia: PlatformSession["obtainedVia"] = "injected",
): PlatformSession {
	return {
		user: { userId, email, displayName: name ?? email ?? userId, pictureUrl: picture },
		org,
		env,
		expiresAt: expiresAt ?? (exp ? new Date(exp * 1000).toISOString() : new Date().toISOString()),
		obtainedVia,
	};
}
