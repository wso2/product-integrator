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
import { type CloudClient, NotSupportedError } from "@wso2/wso2-cloud-client";
import { cloudConnections } from "../../cloud/connections";

type Call = [string, ...unknown[]];

/** A cloud client that records what is asked of it, answering from `answers`. */
function fakeCloud(answers: { deployed?: boolean; endpointLinks?: Record<string, string> } = {}) {
	const calls: Call[] = [];
	const cloud = {
		environments: { list: async () => [{ id: "development" }] },
		deployments: {
			get: async (...args: unknown[]) => {
				calls.push(["deployments.get", ...args]);
				return answers.deployed ? { status: "ACTIVE" } : undefined;
			},
		},
		endpoints: {
			listForEnvironment: async (...args: unknown[]) => {
				calls.push(["endpoints.listForEnvironment", ...args]);
				return [{ name: "api", exposure: "organization", visibilityStatus: { organization: { status: "ENABLED", url: "https://gw/orders" } } }];
			},
			createApiKey: async (...args: unknown[]) => {
				calls.push(["endpoints.createApiKey", ...args]);
				return { apiKey: "k", keyId: "k1" };
			},
		},
		config: {
			putLink: async (...args: unknown[]) => {
				calls.push(["config.putLink", ...args]);
				return { workload: "next_deploy" };
			},
			listLinks: async (...args: unknown[]) => {
				calls.push(["config.listLinks", ...args]);
				return { kind: "ballerina", sourceDefined: false, endpointLinks: answers.endpointLinks };
			},
			putEnvGroup: async (...args: unknown[]) => {
				calls.push(["config.putEnvGroup", ...args]);
			},
		},
	};
	return { cloud, calls };
}

const logged: string[] = [];
const apiWith = (cloud: unknown) => ({ connections: cloudConnections(cloud as CloudClient, (message) => logged.push(message)) });

const target = { project: "shop", integration: "orders", endpoint: "api" };

describe("cloud connections", () => {
	it("links the configurable to an endpoint of the same project, and writes no env group", async () => {
		const { cloud, calls } = fakeCloud();
		await apiWith(cloud).connections.createServiceConnection({
			integration: "basket",
			target,
			access: "project",
			name: "orders",
			projectName: "shop",
			configurable: "acme/basket:ordersUrl",
		});
		assert.deepStrictEqual(calls, [["config.putLink", "basket", { configurable: "acme/basket:ordersUrl", endpoint: "orders/api" }, "shop"]]);
	});

	it("refuses a project connection with no configurable to fill", async () => {
		const { cloud, calls } = fakeCloud();
		await assert.rejects(
			apiWith(cloud).connections.createServiceConnection({ integration: "basket", target, access: "project", name: "orders", projectName: "shop" }),
			/needs the configurable/,
		);
		assert.deepStrictEqual(calls, []);
	});

	it("refuses project access to another project's endpoint", async () => {
		const { cloud } = fakeCloud();
		await assert.rejects(
			apiWith(cloud).connections.createServiceConnection({
				integration: "basket",
				target,
				access: "project",
				name: "orders",
				projectName: "other",
				configurable: "acme/basket:ordersUrl",
			}),
			(error: unknown) => error instanceof NotSupportedError,
		);
	});

	it("asks for a deploy before a gateway connection, and issues no key", async () => {
		const { cloud, calls } = fakeCloud({ deployed: false });
		await assert.rejects(
			apiWith(cloud).connections.createServiceConnection({ integration: "basket", target, access: "gateway", name: "orders", projectName: "shop" }),
			/Deploy basket to development first/,
		);
		assert.ok(!calls.some(([name]) => name === "endpoints.createApiKey" || name === "config.putEnvGroup"));
	});

	it("writes the gateway URL and a key for a deployed consumer", async () => {
		const { cloud, calls } = fakeCloud({ deployed: true });
		await apiWith(cloud).connections.createServiceConnection({ integration: "basket", target, access: "gateway", name: "orders", projectName: "shop" });
		const put = calls.find(([name]) => name === "config.putEnvGroup");
		assert.deepStrictEqual(put, [
			"config.putEnvGroup",
			"basket",
			"development",
			"orders",
			{ name: "orders", sensitive: true, data: { ORDERS_SERVICE_URL: "https://gw/orders", ORDERS_API_KEY: "k" } },
			"shop",
		]);
	});

	it("lists endpoint links and unlinks one", async () => {
		const { cloud, calls } = fakeCloud({ endpointLinks: { "acme/basket:ordersUrl": "orders/api", "acme/basket:bad": "nope" } });
		const api = apiWith(cloud);
		assert.deepStrictEqual(await api.connections.listEndpointLinks("basket", "shop"), [
			{ configurable: "acme/basket:ordersUrl", component: "orders", endpoint: "api" },
		]);
		await api.connections.unlinkEndpoint({ integration: "basket", configurable: "acme/basket:ordersUrl", projectName: "shop" });
		assert.deepStrictEqual(calls.at(-1), ["config.putLink", "basket", { configurable: "acme/basket:ordersUrl" }, "shop"]);
	});
});
