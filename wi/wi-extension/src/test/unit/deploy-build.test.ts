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
import { deployBuild, requiredConfigurables, unsetConfigurations } from "../../cloud/cmds/deploy-build";
import { ext } from "../../extensionVariables";

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

describe("deployBuild", () => {
	const saved = ext.clients;
	after(() => {
		ext.clients = saved;
	});
	const schema = encode({ properties: { acme: { properties: { orders: moduleSchema(["apiKey", "jira", "url"], {}) } } } });
	let deployed: string[];

	function platform(configurations: { key: string; isSet?: boolean; values: { value: string }[] }[], links: object): void {
		deployed = [];
		ext.clients = {
			platform: {
				cloud: {
					pipelines: { ofProject: async () => ({}) },
					environments: { list: async () => [{ id: "development", name: "Development", critical: false }] },
					config: { getConfigSchema: async () => ({ jsonSchema: schema, configurations }), listLinks: async () => links },
					deployments: {
						deploy: async (integration: string) => {
							deployed.push(integration);
							return { releaseId: "r1" };
						},
					},
				},
			},
		} as unknown as typeof ext.clients;
	}

	it("refuses with the names of the required configurations that have no value", async () => {
		platform([{ key: "acme.orders.apiKey", isSet: true, values: [] }], {});
		await assert.rejects(deployBuild("orders", "b1", "default", () => undefined), /not set in Development: jira, url\./);
		assert.deepStrictEqual(deployed, []);
	});

	it("counts a value, a record's per-field keys and a link from a connection as set", async () => {
		platform([{ key: "acme.orders.apiKey", values: [{ value: "k" }] }, { key: "acme.orders.jira.username", values: [{ value: "u" }] }], {
			endpointLinks: { "acme.orders.url": "p/c/e" },
		});
		assert.strictEqual((await deployBuild("orders", "b1", "default", () => undefined)).target.name, "Development");
		assert.deepStrictEqual(deployed, ["orders"]);
	});

	it("names the unset required configurations and their environment without deploying", async () => {
		platform([{ key: "acme.orders.apiKey", values: [{ value: "k" }] }], { fieldLinks: { "acme.orders.url": "p/c/e" } });
		assert.deepStrictEqual(await unsetConfigurations("orders", "default"), { environment: "Development", names: ["jira"] });
		assert.deepStrictEqual(deployed, []);
	});
});
