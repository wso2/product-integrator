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
import { RESOURCE_NAME } from "@wso2/wso2-cloud-client";
import { toResourceName } from "../../cloud/cmds/cmd-utils";

describe("toResourceName", () => {
	it("derives a name the platform accepts from what a person typed", () => {
		assert.strictEqual(toResourceName("  Orders API (v2)! "), "orders-api-v2");
	});

	it("does not end on a hyphen where the name is cut", () => {
		const name = toResourceName(`${"a".repeat(62)} b`);
		assert.strictEqual(name, "a".repeat(62));
		assert.ok(RESOURCE_NAME.test(name));
	});
});
