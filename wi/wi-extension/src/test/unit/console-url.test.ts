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
import { type CloudEnvName, ENVIRONMENTS } from "@wso2/wso2-cloud-client";
import { CONSOLE_URL_VAR, withConsoleUrl } from "../../cloud/console-url";

const urls: Partial<Record<CloudEnvName, string>> = { stage: "https://console.example.com/" };

describe("WSO2 Cloud console URL", () => {
	it("points stage deploy links at WSO2 Integrator's console, without a trailing slash", () => {
		assert.strictEqual(withConsoleUrl(ENVIRONMENTS.stage, {}, urls).consoleUrl, "https://console.example.com");
	});

	it("ships the Choreo Labs staging console and keeps the library's prod console", () => {
		assert.strictEqual(withConsoleUrl(ENVIRONMENTS.stage, {}).consoleUrl, "https://console.stg.cloud.choreolabs.com");
		assert.strictEqual(withConsoleUrl(ENVIRONMENTS.prod, {}), ENVIRONMENTS.prod);
	});

	it("leaves the rest of the environment as it is", () => {
		const { consoleUrl: _ignored, ...rest } = withConsoleUrl(ENVIRONMENTS.stage, {}, urls);
		const { consoleUrl: _base, ...baseRest } = ENVIRONMENTS.stage;
		assert.deepStrictEqual(rest, baseRest);
	});

	it("lets WSO2_CLOUD_CONSOLE_URL win, as the client library already applied it", () => {
		const overridden = { ...ENVIRONMENTS.stage, consoleUrl: "https://override.example.com" };
		assert.strictEqual(withConsoleUrl(overridden, { [CONSOLE_URL_VAR]: "https://override.example.com" }, urls), overridden);
	});

	it("leaves environments it has no console URL for unchanged", () => {
		assert.strictEqual(withConsoleUrl(ENVIRONMENTS.prod, {}, urls), ENVIRONMENTS.prod);
	});
});
