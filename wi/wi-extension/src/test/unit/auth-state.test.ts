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


import * as assert from "assert";
import type { StoredSession } from "@wso2/wso2-cloud-client";
import { WIAuthState } from "../../cloud/auth/wso2-auth-provider";
import type { WIPlatform } from "../../cloud/platform/platform-client";
import { ext } from "../../extensionVariables";

/** A region's session manager as the auth state reads it, with a read that can be held. */
class FakeSessions {
	sessionGeneration = 0;
	private gate?: Promise<void>;
	release: () => void = () => undefined;
	reads = 0;
	constructor(private readonly stored: StoredSession | undefined) {}
	hold(): void {
		this.gate = new Promise((resolve) => {
			this.release = resolve;
		});
	}
	async current(): Promise<StoredSession | undefined> {
		this.reads++;
		await this.gate;
		return this.stored;
	}
	isFresh(): boolean {
		return true;
	}
	readonly updated: StoredSession[] = [];
	async update(change: (stored: StoredSession) => StoredSession): Promise<StoredSession | undefined> {
		if (!this.stored) {
			return undefined;
		}
		this.updated.push(change(this.stored));
		return this.updated.at(-1);
	}
	/** As the platform clients retire the manager of a region they leave. */
	retire(): void {
		this.sessionGeneration++;
	}
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function stored(env: StoredSession["env"], orgRead = true): StoredSession {
	return {
		version: 1,
		env,
		issuer: `https://${env}.idp.example.invalid`,
		clientId: "WSO2_INTEGRATOR_EXTENSION",
		tokens: { accessToken: "t", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
		claims: { sub: "u1", iss: "i", client_id: "c", ouId: "o1", ouName: "Acme", ouHandle: "acme", exp: 0, email: "us@example.com" },
		org: { id: "o1", handle: "acme", name: "Acme", uuid: orgRead ? "uuid-1" : undefined },
		account: { id: "u1", label: "us@example.com" },
		obtainedVia: "browser",
		createdAt: new Date().toISOString(),
	} as StoredSession;
}

describe("WIAuthState", () => {
	// The context store persists what is selected in the workspace state.
	before(() => {
		const values = new Map<string, unknown>();
		const workspaceState = { get: (key: string) => values.get(key), update: async (key: string, value: unknown): Promise<void> => void values.set(key, value) };
		ext.context = { workspaceState, globalState: workspaceState } as never;
	});

	it("publishes the session of the region in use after a switch away and back while it was read", async () => {
		// The first read finds nothing, so the next one is the retry of the second attempt.
		const usBefore = new FakeSessions(undefined);
		const europe = new FakeSessions(undefined);
		const usAgain = new FakeSessions(stored("prod"));
		let sessions = usBefore;
		const platform = {
			get sessions() {
				return sessions;
			},
			tokenSource: { getClaims: async (): Promise<undefined> => undefined },
			injected: false,
			environment: { name: "prod" },
			onDidChangeSession: () => (): undefined => undefined,
		} as unknown as WIPlatform;
		const auth = new WIAuthState({ platform, log: () => undefined, logError: () => undefined });
		try {
			usBefore.hold();
			europe.hold();
			const restoring = auth.initAuth();
			await tick();
			// To Europe while the United States session is read, then back before Europe's read answers.
			usBefore.retire();
			sessions = europe;
			usBefore.release();
			while (europe.reads === 0) {
				await tick();
			}
			europe.retire();
			sessions = usAgain;
			europe.release();
			await restoring;
			assert.strictEqual(auth.state.status, "signed-in");
			assert.strictEqual(auth.session?.env, "prod");
		} finally {
			auth.dispose();
		}
	});

	it("does not save the organization read for one region into the session of a region switched to meanwhile", async () => {
		const us = new FakeSessions(stored("prod", false));
		const europe = new FakeSessions(stored("prod-eu", false));
		let sessions = us;
		let answerOrg: ((org: { uuid: string; numericId: number }) => void) | undefined;
		const platform = {
			get sessions() {
				return sessions;
			},
			cloud: {
				orgs: {
					// The first read, the United States organization, is held; a later one answers Europe's at once.
					current: () =>
						answerOrg
							? Promise.resolve({ uuid: "eu-org-uuid", numericId: 2 })
							: new Promise((resolve) => {
									answerOrg = resolve;
								}),
				},
			},
			tokenSource: { getClaims: async (): Promise<undefined> => undefined },
			injected: false,
			environment: { name: "prod" },
			onDidChangeSession: () => (): undefined => undefined,
		} as unknown as WIPlatform;
		const auth = new WIAuthState({ platform, log: () => undefined, logError: () => undefined });
		try {
			const restoring = auth.initAuth();
			while (auth.state.status !== "signed-in") {
				await tick();
			}
			// The organization of the United States is being read when the person switches to Europe.
			sessions = europe;
			answerOrg?.({ uuid: "us-org-uuid", numericId: 1 });
			await restoring;
			assert.deepStrictEqual(
				europe.updated.map((session) => session.org.uuid),
				["eu-org-uuid"],
				"the Europe session gets Europe's organization, not the United States one",
			);
			assert.strictEqual(auth.org?.uuid, "eu-org-uuid");
		} finally {
			auth.dispose();
		}
	});
});
