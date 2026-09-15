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
 * Signing in from the editor.
 *
 * The editor is handed a platform token when it is provisioned, and that token
 * expires an hour later with nothing to replace it. Signing in is how it gets
 * one of its own — and, unlike the injected token, one that comes with a
 * refresh token, so the session outlives the hour.
 *
 * The flow is the ordinary authorization-code-with-PKCE one, with a detour: the
 * identity provider will only redirect to an address registered against the
 * client, and an editor's address is a per-component subdomain that cannot be.
 * The console's own callback is registered, so the editor asks to be returned
 * there and names itself in `state`; the console forwards. That is the same
 * detour the GitHub App flow takes, for the same reason.
 */

import { createHash, randomBytes } from "node:crypto";

/** The platform's OIDC endpoints, as the console publishes them. */
export interface IdpConfig {
	authorizeEndpoint: string;
	tokenEndpoint: string;
	clientId: string;
	scope: string;
}

/** A PKCE pair. The verifier never leaves the editor; only its hash is sent. */
export interface Pkce {
	verifier: string;
	challenge: string;
}

/** What a sign-in is waiting for, kept between opening the browser and the callback. */
export interface PendingSignIn {
	pkce: Pkce;
	/** Echoed back by the provider, and checked, so a stray code is not accepted. */
	nonce: string;
	redirectUri: string;
}

const base64Url = (input: Buffer): string =>
	input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * A PKCE verifier and its S256 challenge.
 *
 * The editor is a public client — it holds no secret — so the verifier is what
 * proves the code is being redeemed by whoever asked for it. 32 random bytes is
 * the length RFC 7636 calls for once base64url-encoded.
 */
export function generatePkce(): Pkce {
	const verifier = base64Url(randomBytes(32));
	return {
		verifier,
		challenge: base64Url(createHash("sha256").update(verifier).digest()),
	};
}

/**
 * The `state` the provider echoes back.
 *
 * It carries where the editor wants the result sent, in the shape the console
 * already reads for the GitHub flow, plus a nonce this editor checks on return.
 * Both travel by way of the provider, so neither is trusted as a secret: the
 * nonce proves only that the callback answers a request this editor made.
 */
export function encodeSignInState(callbackUri: string, nonce: string): string {
	return Buffer.from(
		JSON.stringify({ origin: "vscode.wso2-integrator", callbackUri, nonce }),
		"binary",
	).toString("base64");
}

/** The nonce carried by a state, or null when it carries none. */
export function decodeSignInNonce(state: string | undefined | null): string | null {
	if (!state) {
		return null;
	}
	try {
		const decoded = JSON.parse(Buffer.from(state, "base64").toString("binary"));
		return typeof decoded?.nonce === "string" && decoded.nonce ? decoded.nonce : null;
	} catch {
		return null;
	}
}

/** A random value for one sign-in attempt. */
export const newNonce = (): string => base64Url(randomBytes(16));

/** The URL that asks the provider to authenticate the user. */
export function buildAuthorizeUrl(
	idp: IdpConfig,
	redirectUri: string,
	state: string,
	challenge: string,
): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: idp.clientId,
		redirect_uri: redirectUri,
		scope: idp.scope || "openid profile email",
		state,
		code_challenge: challenge,
		code_challenge_method: "S256",
	});
	return `${idp.authorizeEndpoint}?${params.toString()}`;
}

/**
 * The body that redeems an authorization code.
 *
 * `redirect_uri` is sent again because the provider compares it with the one
 * the code was issued for; it identifies the request, and is not somewhere the
 * response is sent.
 */
export function buildTokenBody(
	idp: IdpConfig,
	code: string,
	redirectUri: string,
	verifier: string,
): string {
	return new URLSearchParams({
		grant_type: "authorization_code",
		client_id: idp.clientId,
		code,
		redirect_uri: redirectUri,
		code_verifier: verifier,
	}).toString();
}

/** The body that trades a refresh token for a fresh access token. */
export function buildRefreshBody(idp: IdpConfig, refreshToken: string): string {
	return new URLSearchParams({
		grant_type: "refresh_token",
		client_id: idp.clientId,
		refresh_token: refreshToken,
	}).toString();
}

/** A token response, as the provider returns it. */
export interface TokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
}

/** What the editor keeps between sessions. */
export interface StoredSession {
	accessToken: string;
	refreshToken: string;
	/** Epoch milliseconds. */
	expiresAt: number;
}

/**
 * A token response as something worth storing, or null when it carries no
 * access token — a response that cannot be used is not a session.
 */
export function toStoredSession(
	response: TokenResponse | null | undefined,
	now: number,
	previousRefreshToken = "",
): StoredSession | null {
	const accessToken = response?.access_token;
	if (!accessToken) {
		return null;
	}
	return {
		accessToken,
		// A provider that rotates refresh tokens returns a new one; one that does
		// not returns none, and the existing one stays valid.
		refreshToken: response?.refresh_token || previousRefreshToken,
		expiresAt: now + (response?.expires_in ?? 3600) * 1000,
	};
}

/** How long a stored session has left, in seconds. Negative once it has passed. */
export const secondsLeft = (session: StoredSession, now: number): number =>
	Math.floor((session.expiresAt - now) / 1000);

/**
 * Whether a session should be renewed before it is used.
 *
 * Renewed early rather than on failure: a token that expires between the check
 * and the call it authorises fails a request the user is waiting on, and the
 * margin costs nothing.
 */
export function needsRefresh(session: StoredSession, now: number, marginSeconds = 60): boolean {
	return secondsLeft(session, now) <= marginSeconds;
}
