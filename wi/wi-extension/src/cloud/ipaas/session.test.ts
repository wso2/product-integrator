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
import { describe, it } from "node:test";
import type { SecretStorage } from "vscode";
import type { IdpConfig, TokenResponse } from "./oidc";
import { SessionStore } from "./session";

const idp: IdpConfig = {
	authorizeEndpoint: "https://idp.test/oauth2/authorize",
	tokenEndpoint: "https://idp.test/oauth2/token",
	clientId: "IPAAS_CONSOLE",
	scope: "openid",
};

/** A secret storage that keeps what it is given, like the real one. */
function fakeSecrets(initial?: string): SecretStorage & { value: string | undefined } {
	const store = {
		value: initial,
		get: async (_key: string) => store.value,
		store: async (_key: string, value: string) => {
			store.value = value;
		},
		delete: async (_key: string) => {
			store.value = undefined;
		},
		onDidChange: (() => ({ dispose: (): void => undefined })) as never,
	};
	return store as unknown as SecretStorage & { value: string | undefined };
}

const NOW = 1_000_000_000;
const session = (accessToken: string, expiresAt: number, refreshToken = "r1") =>
	JSON.stringify({ accessToken, refreshToken, expiresAt });

describe("SessionStore.accessToken", () => {
	// The editor that has never signed in has nothing here, and the caller falls
	// back to the token the platform injected. Returning "" is what makes that
	// bootstrap work rather than an error path.
	it("is empty when no one has signed in", async () => {
		const store = new SessionStore(fakeSecrets(), async () => ({}), () => NOW);
		assert.equal(await store.accessToken(idp), "");
	});

	it("is empty when what is stored cannot be read", async () => {
		const store = new SessionStore(fakeSecrets("not json"), async () => ({}), () => NOW);
		assert.equal(await store.accessToken(idp), "");
	});

	it("hands back a session with time left, renewing nothing", async () => {
		let renewals = 0;
		const store = new SessionStore(
			fakeSecrets(session("good", NOW + 3600_000)),
			async () => {
				renewals++;
				return {};
			},
			() => NOW,
		);
		assert.equal(await store.accessToken(idp), "good");
		assert.equal(renewals, 0);
	});

	it("renews one that is about to expire, and keeps the result", async () => {
		const secrets = fakeSecrets(session("stale", NOW + 10_000));
		const store = new SessionStore(
			secrets,
			async (): Promise<TokenResponse> => ({ access_token: "fresh", refresh_token: "r2", expires_in: 3600 }),
			() => NOW,
		);
		assert.equal(await store.accessToken(idp), "fresh");
		const stored = JSON.parse(secrets.value ?? "{}");
		assert.equal(stored.accessToken, "fresh");
		// Rotation is on, so the new refresh token replaces the spent one.
		assert.equal(stored.refreshToken, "r2");
	});

	// Several calls can find the session stale at the same moment. Renewing per
	// call would spend the refresh token repeatedly, and with rotation on, each
	// renewal revokes the one the others are about to use.
	it("renews once however many callers ask together", async () => {
		let renewals = 0;
		const store = new SessionStore(
			fakeSecrets(session("stale", NOW + 10_000)),
			async () => {
				renewals++;
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { access_token: "fresh", expires_in: 3600 };
			},
			() => NOW,
		);
		const results = await Promise.all([
			store.accessToken(idp),
			store.accessToken(idp),
			store.accessToken(idp),
		]);
		assert.deepEqual(results, ["fresh", "fresh", "fresh"]);
		assert.equal(renewals, 1);
	});

	// A refresh token the provider will not honour is spent. Keeping it would
	// retry forever; clearing it sends the user to sign in once.
	it("forgets a session the provider refuses to renew", async () => {
		const secrets = fakeSecrets(session("stale", NOW + 10_000));
		const store = new SessionStore(secrets, async () => ({}), () => NOW);
		assert.equal(await store.accessToken(idp), "");
		assert.equal(secrets.value, undefined);
	});

	// Offline is not the same as revoked: a blip must not sign the user out, so
	// the session is left alone and the next call tries again.
	it("keeps the session when the renewal could not be attempted", async () => {
		const secrets = fakeSecrets(session("stale", NOW + 10_000));
		const store = new SessionStore(
			secrets,
			async () => {
				throw new Error("connect ETIMEDOUT");
			},
			() => NOW,
		);
		assert.equal(await store.accessToken(idp), "");
		assert.notEqual(secrets.value, undefined, "the session should survive a network failure");
	});

	it("cannot renew without somewhere to renew against", async () => {
		const store = new SessionStore(
			fakeSecrets(session("stale", NOW + 10_000)),
			async () => ({ access_token: "fresh" }),
			() => NOW,
		);
		assert.equal(await store.accessToken(null), "");
	});
});
