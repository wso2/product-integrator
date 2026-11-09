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
import { type CloudServiceUrlSources, readCloudServiceUrls, resolveCloudServiceUrls } from "../../cloud/service-urls";

const resolve = (sources: Partial<CloudServiceUrlSources>) => resolveCloudServiceUrls({ env: "prod", managedTokensByEnv: {}, ...sources });

describe("cloud service URLs", () => {
	it("has no managed-tokens host unless one is configured", () => {
		assert.strictEqual(resolve({}).managedTokensBaseUrl, undefined);
		assert.strictEqual(resolve({ managedTokensOverride: "  " }).managedTokensBaseUrl, undefined);
	});

	it("takes the managed-tokens host from WSO2_CLOUD_MANAGED_TOKENS_URL", () => {
		assert.strictEqual(readCloudServiceUrls("prod", { WSO2_CLOUD_MANAGED_TOKENS_URL: "https://tokens.example.com/" }).managedTokensBaseUrl, "https://tokens.example.com");
		assert.strictEqual(resolve({ managedTokensOverride: "http://localhost:9090" }).managedTokensBaseUrl, "http://localhost:9090");
	});

	it("lets the variable win over the environment's own managed-tokens host, as the other overrides do", () => {
		const byEnv = { managedTokensByEnv: { stage: "https://tokens.stage.example.com" } };
		assert.strictEqual(resolve({ ...byEnv, env: "stage", managedTokensOverride: "https://tokens.example.com" }).managedTokensBaseUrl, "https://tokens.example.com");
		assert.strictEqual(resolve({ ...byEnv, env: "stage" }).managedTokensBaseUrl, "https://tokens.stage.example.com");
	});

	it("refuses a URL the token would be sent to in the clear", () => {
		assert.throws(() => resolve({ managedTokensOverride: "http://tokens.example.com" }), /must use https/);
		assert.throws(() => resolve({ managedTokensOverride: "not a url" }), /is not a URL/);
	});
});
