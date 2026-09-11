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
import { decodeClaims, secondsUntilExpiry } from "./claims";

/** Assemble a token with the given payload. Only the payload segment is read. */
function token(payload: unknown): string {
	const encode = (value: unknown) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${encode({ alg: "RS256" })}.${encode(payload)}.signature`;
}

describe("decodeClaims", () => {
	it("reads the claims the platform issues", () => {
		const claims = decodeClaims(
			token({
				sub: "user-1",
				ouHandle: "acme",
				ouId: "org-uuid",
				email: "a@b.c",
				name: "A B",
			}),
		);
		assert.equal(claims?.sub, "user-1");
		assert.equal(claims?.ouHandle, "acme");
		assert.equal(claims?.ouId, "org-uuid");
		assert.equal(claims?.email, "a@b.c");
	});

	// base64url is what a JWT actually uses, and a payload carrying - or _ is
	// ordinary. Decoding it as plain base64 would drop the whole token.
	it("decodes a base64url payload containing - and _", () => {
		const claims = decodeClaims(
			token({ sub: "a-b_c", ouHandle: "x~y", name: "ǝ" }),
		);
		assert.equal(claims?.sub, "a-b_c");
		assert.equal(claims?.name, "ǝ");
	});

	const malformed: Array<[string, string]> = [
		["an empty string", ""],
		["a token with no payload segment", "onlyheader"],
		["a payload that is not base64", "h.!!!!.s"],
		[
			"a payload that is not JSON",
			`h.${Buffer.from("nonsense").toString("base64url")}.s`,
		],
	];
	for (const [name, value] of malformed) {
		it(`returns null for ${name}`, () =>
			assert.equal(decodeClaims(value), null));
	}

	// JSON.parse accepts a bare number or string, neither of which is a claim set.
	it("returns null for a payload that is not an object", () => {
		assert.equal(decodeClaims(token(42)), null);
		assert.equal(decodeClaims(token("a string")), null);
	});
});

describe("secondsUntilExpiry", () => {
	const now = 1_700_000_000_000;

	it("reports the remaining lifetime", () => {
		assert.equal(secondsUntilExpiry({ exp: now / 1000 + 600 }, now), 600);
	});
	it("goes negative once expired", () => {
		assert.equal(secondsUntilExpiry({ exp: now / 1000 - 30 }, now), -30);
	});
	it("returns null when there is no expiry to read", () => {
		assert.equal(secondsUntilExpiry({}, now), null);
		assert.equal(secondsUntilExpiry(null, now), null);
	});
});
