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

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
	buildAuthorizeUrl,
	buildRefreshBody,
	buildTokenBody,
	decodeSignInNonce,
	encodeSignInState,
	generatePkce,
	type IdpConfig,
	needsRefresh,
	newNonce,
	secondsLeft,
	type StoredSession,
	toStoredSession,
} from "./oidc";

const idp: IdpConfig = {
	authorizeEndpoint: "https://idp.example.dev/oauth2/authorize",
	tokenEndpoint: "https://idp.example.dev/oauth2/token",
	clientId: "IPAAS_CONSOLE",
	scope: "openid profile email",
};

describe("generatePkce", () => {
	// The editor holds no client secret, so the verifier is the only thing
	// proving the code is redeemed by whoever asked for it.
	it("produces a challenge that is the S256 of the verifier", () => {
		const { verifier, challenge } = generatePkce();
		const expected = createHash("sha256")
			.update(verifier)
			.digest("base64")
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		assert.strictEqual(challenge, expected);
	});

	it("is url-safe and long enough to resist guessing", () => {
		const { verifier, challenge } = generatePkce();
		for (const value of [verifier, challenge]) {
			assert.match(value, /^[A-Za-z0-9_-]+$/, `not url-safe: ${value}`);
			assert.ok(value.length >= 43, `too short: ${value.length}`);
		}
	});

	it("differs every time", () => {
		const seen = new Set(Array.from({ length: 20 }, () => generatePkce().verifier));
		assert.strictEqual(seen.size, 20);
	});
});

describe("sign-in state", () => {
	it("carries the editor's callback in the shape the console reads", () => {
		const state = encodeSignInState("http://localhost:8080/callback?x=1", "n1");
		const decoded = JSON.parse(Buffer.from(state, "base64").toString("binary"));
		assert.strictEqual(decoded.callbackUri, "http://localhost:8080/callback?x=1");
		assert.strictEqual(decoded.origin, "vscode.wso2-integrator");
	});

	it("round-trips the nonce", () => {
		assert.strictEqual(decodeSignInNonce(encodeSignInState("vscode://x/signin", "abc")), "abc");
	});

	// A callback carrying a state this editor did not issue answers no request
	// it made, so there is nothing to match and nothing to accept.
	it("returns nothing for a state it cannot read", () => {
		for (const bad of [null, undefined, "", "!!!", Buffer.from("nonsense").toString("base64")]) {
			assert.strictEqual(decodeSignInNonce(bad), null, `for ${JSON.stringify(bad)}`);
		}
	});

	it("mints a different nonce each time", () => {
		assert.notStrictEqual(newNonce(), newNonce());
	});
});

describe("buildAuthorizeUrl", () => {
	it("asks for a code with the challenge, never the verifier", () => {
		const { verifier, challenge } = generatePkce();
		const url = new URL(buildAuthorizeUrl(idp, "https://console.example.dev/signin", "st", challenge));
		assert.strictEqual(url.origin + url.pathname, idp.authorizeEndpoint);
		assert.strictEqual(url.searchParams.get("response_type"), "code");
		assert.strictEqual(url.searchParams.get("client_id"), "IPAAS_CONSOLE");
		assert.strictEqual(url.searchParams.get("redirect_uri"), "https://console.example.dev/signin");
		assert.strictEqual(url.searchParams.get("code_challenge"), challenge);
		assert.strictEqual(url.searchParams.get("code_challenge_method"), "S256");
		assert.strictEqual(url.searchParams.get("state"), "st");
		assert.ok(!url.toString().includes(verifier), "the verifier must not be sent");
	});

	it("falls back to the scopes a session needs", () => {
		const url = new URL(buildAuthorizeUrl({ ...idp, scope: "" }, "https://c/signin", "s", "c"));
		assert.strictEqual(url.searchParams.get("scope"), "openid profile email");
	});
});

describe("token bodies", () => {
	it("redeems a code with the verifier and the same redirect", () => {
		const body = new URLSearchParams(buildTokenBody(idp, "the-code", "https://c/signin", "v"));
		assert.strictEqual(body.get("grant_type"), "authorization_code");
		assert.strictEqual(body.get("code"), "the-code");
		assert.strictEqual(body.get("code_verifier"), "v");
		assert.strictEqual(body.get("redirect_uri"), "https://c/signin");
		// A public client authenticates with the verifier, not a secret.
		assert.strictEqual(body.get("client_secret"), null);
	});

	it("renews with the refresh token alone", () => {
		const body = new URLSearchParams(buildRefreshBody(idp, "r1"));
		assert.strictEqual(body.get("grant_type"), "refresh_token");
		assert.strictEqual(body.get("refresh_token"), "r1");
		assert.strictEqual(body.get("client_secret"), null);
	});
});

describe("toStoredSession", () => {
	const now = 1_000_000;

	it("keeps what the provider returned", () => {
		const s = toStoredSession({ access_token: "a", refresh_token: "r", expires_in: 3600 }, now);
		assert.deepStrictEqual(s, { accessToken: "a", refreshToken: "r", expiresAt: now + 3600_000 });
	});

	// A provider that rotates refresh tokens returns a new one; one that does
	// not returns none, and discarding the old one would end the session at the
	// next renewal.
	it("keeps the previous refresh token when none is returned", () => {
		const s = toStoredSession({ access_token: "a", expires_in: 60 }, now, "old-r");
		assert.strictEqual(s?.refreshToken, "old-r");
	});

	it("assumes an hour when the provider states no lifetime", () => {
		assert.strictEqual(toStoredSession({ access_token: "a" }, now)?.expiresAt, now + 3600_000);
	});

	it("is nothing without an access token", () => {
		for (const r of [null, undefined, {}, { refresh_token: "r" }]) {
			assert.strictEqual(toStoredSession(r, now), null, `for ${JSON.stringify(r)}`);
		}
	});
});

describe("needsRefresh", () => {
	const session = (expiresAt: number): StoredSession => ({ accessToken: "a", refreshToken: "r", expiresAt });

	it("reports what is left", () => {
		assert.strictEqual(secondsLeft(session(10_000), 4_000), 6);
		assert.ok(secondsLeft(session(1_000), 4_000) < 0);
	});

	// Renewed before it expires, not after it fails: a token that lapses between
	// the check and the call fails a request the user is waiting on.
	it("renews inside the margin, and after expiry", () => {
		assert.strictEqual(needsRefresh(session(100_000), 100_000 - 30_000), true);
		assert.strictEqual(needsRefresh(session(100_000), 200_000), true);
	});

	it("leaves a session with time on it alone", () => {
		assert.strictEqual(needsRefresh(session(100_000), 0), false);
	});
});
