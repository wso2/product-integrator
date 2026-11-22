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
import type { Uri } from "vscode";
import { Askpass } from "../../cloud/git/askpass";

const USER = "1234567";
const TOKEN = "gho_test_token";

describe("Askpass.handleAskpass", () => {
	const newAskpass = () => {
		const askpass = new Askpass();
		askpass.registerCredentialsProvider({
			async getCredentials(host: Uri) {
				return host.authority.replace(/^.*@/, "") === "github.com" ? { username: USER, password: TOKEN } : undefined;
			},
		});
		return askpass;
	};

	it("answers a username request from the provider", async () => {
		const askpass = newAskpass();
		assert.strictEqual(await askpass.handleAskpass("Username for 'https://github.com'", "https://github.com"), USER);
	});

	it("answers the password of the same round from the cache", async () => {
		const askpass = newAskpass();
		await askpass.handleAskpass("Username for 'https://github.com'", "https://github.com");
		assert.strictEqual(await askpass.handleAskpass(`Password for 'https://${USER}@github.com'`, `https://${USER}@github.com`), TOKEN);
	});

	it("answers a password request with no username before it", async () => {
		const askpass = newAskpass();
		assert.strictEqual(await askpass.handleAskpass(`Password for 'https://${USER}@github.com'`, `https://${USER}@github.com`), TOKEN);
	});

	it("still falls through when no provider answers for the host", async () => {
		const askpass = newAskpass();
		assert.strictEqual(await askpass.handleAskpass("Password for 'https://evil.example'", "https://evil.example"), "");
	});
});
