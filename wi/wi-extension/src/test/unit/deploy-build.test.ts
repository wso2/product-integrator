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
import { requiredConfigurables } from "../../cloud/cmds/deploy-build";

const encode = (schema: object) => Buffer.from(JSON.stringify(schema)).toString("base64");

const moduleSchema = (required: string[] | undefined, properties: Record<string, object>) => ({ type: "object", properties, ...(required ? { required } : {}) });

describe("requiredConfigurables", () => {
	const schema = {
		type: "object",
		properties: {
			ballerina: { type: "object", properties: { log: moduleSchema(undefined, { level: { enum: ["INFO"] } }) } },
			wso2: {
				type: "object",
				properties: {
					orders: moduleSchema(["apiKey", "jira"], {
						apiKey: { type: "string" },
						jira: moduleSchema(["username"], { username: { type: "string" } }),
						port: { type: "integer" },
					}),
				},
			},
		},
	};

	it("names the module-level required configurables as org.module.name", () => {
		assert.deepStrictEqual(requiredConfigurables(encode(schema)), ["wso2.orders.apiKey", "wso2.orders.jira"]);
	});

	it("reads them at the requiredLevel WSO2 Cloud injects, not from inside a record configurable", () => {
		assert.deepStrictEqual(requiredConfigurables(encode({ ...schema, requiredLevel: 3 })), ["wso2.orders.apiKey", "wso2.orders.jira"]);
		assert.deepStrictEqual(requiredConfigurables(encode({ ...schema, requiredLevel: 4 })), ["wso2.orders.jira.username"]);
	});

	it("is empty when the build recorded no schema", () => {
		assert.deepStrictEqual(requiredConfigurables(""), []);
	});
});
