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
import { isGitHubAuthority } from "../../cloud/git/github/credentialProvider";

// The session's access token is handed to whichever host this accepts, so a
// host that merely contains "github.com" must not be one of them.
describe("isGitHubAuthority", () => {
	it("accepts GitHub's own hosts, with userinfo and port", () => {
		for (const authority of ["github.com", "GitHub.com", "gist.github.com", "github.com:443", "1234567@github.com", "1234567@github.com:443"]) {
			assert.strictEqual(isGitHubAuthority(authority), true, authority);
		}
	});

	it("rejects a host that only contains github.com", () => {
		for (const authority of [
			"github.com.attacker.example",
			"notgithub.com",
			"github.com.evil.example:443",
			"attacker@github.com.evil.example",
			"raw.githubusercontent.com",
			"gitlab.com",
			"",
		]) {
			assert.strictEqual(isGitHubAuthority(authority), false, authority);
		}
	});
});
