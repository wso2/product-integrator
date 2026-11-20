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
import { profilePictureOf } from "../../cloud/auth/profile-picture";

const jwt = (payload: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

const stored = (claims: Record<string, unknown>, idToken?: Record<string, unknown>) =>
	({ claims, tokens: { idToken: idToken ? jwt(idToken) : undefined } }) as unknown as Pick<StoredSession, "claims" | "tokens">;

describe("profile picture", () => {
	it("takes the access token's picture first", () => {
		assert.equal(profilePictureOf(stored({ picture: "https://a.example/p.png" }, { picture: "https://b.example/p.png" })), "https://a.example/p.png");
	});

	it("reads the ID token's picture when the access token has none", () => {
		assert.equal(profilePictureOf(stored({}, { picture: "https://lh3.googleusercontent.com/a/x" })), "https://lh3.googleusercontent.com/a/x");
	});

	it("answers none without a picture, or with one that is not an https URL", () => {
		assert.equal(profilePictureOf(stored({})), undefined);
		assert.equal(profilePictureOf(stored({ picture: "http://a.example/p.png" }, { picture: "javascript:alert(1)" })), undefined);
		assert.equal(profilePictureOf({ claims: {}, tokens: { idToken: "not-a-jwt" } } as unknown as Pick<StoredSession, "claims" | "tokens">), undefined);
	});
});
