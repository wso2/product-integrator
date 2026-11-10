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
import { redactUrlCredentials } from "../../cloud/git/redact";

describe("redactUrlCredentials", () => {
	it("masks the user and token of a clone URL in a logged command", () => {
		assert.strictEqual(
			redactUrlCredentials("> git clone https://jane:ghp_secret@github.com/acme/orders.git /tmp/orders --progress [812ms]"),
			"> git clone https://***@github.com/acme/orders.git /tmp/orders --progress [812ms]",
		);
	});

	it("masks a token that holds an @, and a URL quoted in git's own output", () => {
		assert.strictEqual(redactUrlCredentials("> git remote add r https://jane:p@ss@host/r.git"), "> git remote add r https://***@host/r.git");
		assert.strictEqual(
			redactUrlCredentials("fatal: unable to access 'https://x-access-token:tok@github.com/acme/orders.git/': 403"),
			"fatal: unable to access 'https://***@github.com/acme/orders.git/': 403",
		);
	});

	it("masks a token that holds a quote", () => {
		assert.strictEqual(redactUrlCredentials("> git clone https://jane:p'ss@host/r.git"), "> git clone https://***@host/r.git");
	});

	it("masks every URL on a line, and leaves text with no credentials alone", () => {
		assert.strictEqual(redactUrlCredentials("a http://u:p@h1/x b https://t@h2"), "a http://***@h1/x b https://***@h2");
		for (const text of ["> git push origin main", "https://github.com/acme/orders.git", "git@github.com:acme/orders.git", "Author: Jane <jane@acme.com>"]) {
			assert.strictEqual(redactUrlCredentials(text), text);
		}
	});
});
