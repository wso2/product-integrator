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

import type { AuthState, UserInfo } from "@wso2/wso2-platform-core";
import {
	type AuthenticationProvider,
	type AuthenticationProviderAuthenticationSessionsChangeEvent,
	type AuthenticationProviderSessionOptions,
	type AuthenticationSession,
	commands,
	Disposable,
	EventEmitter,
	type SecretStorage,
	window,
} from "vscode";
import type { ChoreoRPCClient } from "../choreo-rpc";
import { contextStore } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";

const WSO2_AUTH_PROVIDER_ID = "wso2-wi";
const WSO2_SESSIONS_SECRET_KEY = `${WSO2_AUTH_PROVIDER_ID}.sessions`;

interface AuthProviderDeps {
	rpcClient: ChoreoRPCClient;
	log: (msg: string) => void;
	logError: (msg: string, err?: Error) => void;
}

interface SessionData {
	id: string;
	accessToken: string;
	account: {
		id: string;
		label: string;
	};
	scopes: string[];
	userInfo: UserInfo;
	region: "US" | "EU";
}

export class WSO2AuthenticationProvider implements AuthenticationProvider, Disposable {
	private _sessionChangeEmitter = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
	private _stateChangeEmitter = new EventEmitter<{ state: AuthState }>();
	private _disposable: Disposable;
	private _state: AuthState = { userInfo: null, region: "US" };
	private _pendingSessionCreation: { resolve: (session: AuthenticationSession) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout } | undefined;

	constructor(
		private readonly secretStorage: SecretStorage,
		private readonly deps: AuthProviderDeps,
	) {
		console.log("WSO2AuthenticationProvider initialized");
		this._disposable = Disposable.from(
			this._sessionChangeEmitter,
			this._stateChangeEmitter
		);
	}

	get onDidChangeSessions() {
		return this._sessionChangeEmitter.event;
	}

	/**
	 * Subscribe to auth state changes
	 */
	public subscribe(callback: (store: { state: AuthState }) => void): () => void {
		const disposable = this._stateChangeEmitter.event(callback);
		// Call immediately with current state
		callback({ state: this._state });
		return () => disposable.dispose();
	}

	/**
	 * Get the current state
	 */
	public getState() {
		return {
			state: this._state,
			resetState: this.resetState.bind(this),
			loginSuccess: this.loginSuccess.bind(this),
			logout: this.logout.bind(this),
			initAuth: this.initAuth.bind(this),
		};
	}

	/**
	 * Get current auth state
	 */
	get state(): AuthState {
		return this._state;
	}

	/**
	 * Get the existing sessions
	 */
	public async getSessions(scopes?: readonly string[]): Promise<AuthenticationSession[]>;
	public async getSessions(scopes: readonly string[] | undefined, options: AuthenticationProviderSessionOptions): Promise<AuthenticationSession[]>;
	public async getSessions(scopes?: readonly string[], options?: AuthenticationProviderSessionOptions): Promise<AuthenticationSession[]> {
		const allSessions = await this.readSessions();

		if (scopes && scopes.length > 0) {
			const sessions = allSessions.filter((session) => scopes.every((scope) => session.scopes.includes(scope)));
			return sessions;
		}

		return allSessions;
	}

	/**
	 * Cancel any pending session creation
	 * This is called when user initiates a new sign-in while one is already pending
	 */
	public cancelPendingSessionCreation() {
		if (this._pendingSessionCreation) {
			console.log("Cancelling pending session creation");
			clearTimeout(this._pendingSessionCreation.timeout);
			const oldPending = this._pendingSessionCreation;
			this._pendingSessionCreation = undefined;
			oldPending.reject(new Error("Sign-in cancelled"));
		}
	}

	/**
	 * Create a new auth session by triggering the sign-in flow
	 * This is called when user clicks "Sign in" in VS Code's Accounts menu
	 */
	public async createSession(scopes: string[], options?: AuthenticationProviderSessionOptions): Promise<AuthenticationSession> {
		console.log("Creating new auth session via VS Code Accounts menu");
		const customOptions = options as any;
		const platform = customOptions?.platform;

		// Return a promise that will be resolved when login succeeds or timeout occurs
		return new Promise<AuthenticationSession>((resolve, reject) => {
			commands.executeCommand("wso2.wi.sign.in", {
				extName: platform,
			}).then(undefined, (error) => {
				console.error("Sign-in command failed:", error);
			});

			// Set up timeout
			const timeout = setTimeout(() => {
				console.log("Sign-in timeout reached");
				if (this._pendingSessionCreation) {
					this._pendingSessionCreation = undefined;
					reject(new Error("Sign-in timeout: User did not complete authentication within 2 minutes"));
				}
			}, 2 * 60 * 1000); // 2 minutes

			// Store the promise handlers so we can resolve/reject from loginSuccess
			this._pendingSessionCreation = { resolve, reject, timeout };
		});
	}

	/**
	 * Reset state to initial values
	 */
	public resetState() {
		this._state = { userInfo: null, region: "US" };
		this._stateChangeEmitter.fire({ state: this._state });
	}

	/**
	 * Handle successful login - updates state and stores session
	 */
	public async loginSuccess(userInfo: UserInfo, region: "US" | "EU") {
		// Update local state
		this._state = { userInfo, region };

		// Update related stores
		dataCacheStore.getState().setOrgs(userInfo.organizations);
		contextStore.getState().refreshState();

		// Store session in secure storage
		const session = await this.storeSession(userInfo, region);

		// Notify subscribers
		this._stateChangeEmitter.fire({ state: this._state });

		// Resolve pending session creation if there is one
		if (this._pendingSessionCreation) {
			clearTimeout(this._pendingSessionCreation.timeout);
			this._pendingSessionCreation.resolve(session);
			this._pendingSessionCreation = undefined;
		}
	}

	/**
	 * Handle logout - signs out from RPC and clears all state
	 */
	public async logout(silent = false, skipClearSessions = false) {
		this.deps.log("Signing out from WSO2 Platform");

		// Call RPC signOut first
		try {
			await this.deps.rpcClient.signOut();
		} catch (error) {
			this.deps.logError("Error during RPC signOut", error as Error);
		}

		// Clear VS Code session storage (unless already cleared by removeSession)
		if (!skipClearSessions) {
			try {
				await this.clearSessions();
			} catch (error) {
				this.deps.logError("Error clearing sessions", error as Error);
			}
		}

		// Clear local state
		this.resetState();

		if (!silent) {
			window.showInformationMessage("Successfully signed out from WSO2 Platform!");
		}
	}

	/**
	 * Initialize authentication on startup
	 */
	public async initAuth() {
		try {
			const userInfo = await this.deps.rpcClient.getUserInfo();
			if (userInfo) {
				const region = await this.deps.rpcClient.getCurrentRegion();
				await this.loginSuccess(userInfo, region);
				const contextStoreState = contextStore.getState().state;
				if (contextStoreState.selected?.org) {
					this.deps.rpcClient.changeOrgContext(contextStoreState.selected?.org?.id?.toString());
				}
			} else {
				this.resetState();
				this.clearSessions();
			}
		} catch (err) {
			this.deps.logError("Error during auth initialization", err as Error);
			this.resetState();
			this.clearSessions();
		}
	}

	/**
	 * Store or update a session with user info and region
	 * Called internally after successful RPC authentication
	 */
	private async storeSession(userInfo: UserInfo, region: "US" | "EU"): Promise<AuthenticationSession> {
		// Remove any existing sessions first (single account support)
		const existingSessions = await this.readSessions();
		const removedSessions = [...existingSessions];

		const sessionId = this.generateSessionId();
		const sessionData: SessionData = {
			id: sessionId,
			accessToken: "rpc-authenticated", // Placeholder since RPC handles auth
			account: {
				label: userInfo.displayName || userInfo.userEmail,
				id: userInfo.userId,
			},
			scopes: [],
			userInfo,
			region,
		};

		const session: AuthenticationSession = {
			id: sessionData.id,
			accessToken: sessionData.accessToken,
			account: sessionData.account,
			scopes: sessionData.scopes,
		};

		await this.storeSessions([session], sessionData);

		this._sessionChangeEmitter.fire({
			added: [session],
			removed: removedSessions,
			changed: []
		});

		return session;
	}

	/**
	 * Remove an existing session
	 * This is called when user signs out from VS Code's Accounts menu
	 */
	public async removeSession(sessionId: string): Promise<void> {
		const allSessions = await this.readSessions();
		const sessionIdx = allSessions.findIndex((s) => s.id === sessionId);
		const session = allSessions[sessionIdx];
		if (!session) {
			return;
		}

		allSessions.splice(sessionIdx, 1);
		await this.storeSessions(allSessions);
		this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });

		// Trigger full logout flow (skipClearSessions=true to avoid loop)
		await this.logout(false, true);
	}

	/**
	 * Remove all sessions
	 */
	public async clearSessions(): Promise<void> {
		const allSessions = await this.readSessions();
		if (allSessions.length === 0) {
			return;
		}

		await this.secretStorage.delete(WSO2_SESSIONS_SECRET_KEY);

		this._sessionChangeEmitter.fire({ added: [], removed: allSessions, changed: [] });
	}

	/**
	 * Get session data including userInfo and region
	 */
	public async getSessionData(sessionId?: string): Promise<SessionData | undefined> {
		const sessions = await this.readSessionsData();
		if (sessionId) {
			return sessions.find((s) => s.id === sessionId);
		}
		// Return the first session if no ID is provided (single account support)
		return sessions[0];
	}

	/**
	 * Dispose the provider
	 */
	public async dispose() {
		this._disposable.dispose();
	}

	/**
	 * Get the user info from stored session (for backward compatibility)
	 */
	public getUserInfo(): UserInfo | null {
		return this._state.userInfo;
	}

	/**
	 * Get the region from stored session (for backward compatibility)
	 */
	public getRegion(): "US" | "EU" {
		return this._state.region;
	}

	/**
	 * Read sessions from secret storage
	 */
	private async readSessions(): Promise<AuthenticationSession[]> {
		try {
			const sessionsJson = await this.secretStorage.get(WSO2_SESSIONS_SECRET_KEY);
			if (!sessionsJson) {
				return [];
			}

			const sessionData: SessionData[] = JSON.parse(sessionsJson);
			return sessionData.map((data) => ({
				id: data.id,
				accessToken: data.accessToken,
				account: data.account,
				scopes: data.scopes,
			}));
		} catch (e) {
			this.deps.logError("Error reading sessions", e as Error);
			return [];
		}
	}

	/**
	 * Store sessions to secret storage
	 */
	private async storeSessions(sessions: readonly AuthenticationSession[], newSessionData?: SessionData): Promise<void> {
		try {
			const existingSessions = await this.readSessionsData();
			let updatedSessions: SessionData[];

			if (newSessionData) {
				// Add or update session
				const existingIndex = existingSessions.findIndex((s) => s.id === newSessionData.id);
				if (existingIndex >= 0) {
					updatedSessions = [...existingSessions];
					updatedSessions[existingIndex] = newSessionData;
				} else {
					updatedSessions = [...existingSessions, newSessionData];
				}
			} else {
				// Filter out removed sessions
				const sessionIds = sessions.map((s) => s.id);
				updatedSessions = existingSessions.filter((s) => sessionIds.includes(s.id));
			}

			await this.secretStorage.store(WSO2_SESSIONS_SECRET_KEY, JSON.stringify(updatedSessions));
		} catch (e) {
			this.deps.logError("Error storing sessions", e as Error);
		}
	}

	/**
	 * Read full session data including userInfo and region
	 */
	private async readSessionsData(): Promise<SessionData[]> {
		try {
			const sessionsJson = await this.secretStorage.get(WSO2_SESSIONS_SECRET_KEY);
			if (!sessionsJson) {
				return [];
			}

			return JSON.parse(sessionsJson);
		} catch (e) {
			this.deps.logError("Error reading session data", e as Error);
			return [];
		}
	}

	/**
	 * Generate a session ID
	 */
	private generateSessionId(): string {
		return `wso2-${Date.now()}-${Math.random().toString(36).substring(2)}`;
	}
}
