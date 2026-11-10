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
import { BadRequestError, type CloudClient } from "@wso2/wso2-cloud-client";
import { cloudConnections } from "../../cloud/connections";

type Call = [string, ...unknown[]];

/** A cloud client that records what is asked of it, answering from `answers`. */
function fakeCloud(answers: { links?: Record<string, unknown>; connectable?: unknown[]; failKeyLink?: boolean } = {}) {
	const calls: Call[] = [];
	const cloud = {
		config: {
			putLink: async (...args: unknown[]) => {
				calls.push(["config.putLink", ...args]);
				if (answers.failKeyLink && (args[1] as { key?: string }).key === "apiKey") {
					throw new Error("binding refused");
				}
				return { workload: "next_deploy" };
			},
			listLinks: async (...args: unknown[]) => {
				calls.push(["config.listLinks", ...args]);
				return { kind: "ballerina", sourceDefined: false, ...answers.links };
			},
			listConnectableEndpoints: async (...args: unknown[]) => {
				calls.push(["config.listConnectableEndpoints", ...args]);
				return answers.connectable ?? [];
			},
		},
	};
	return { cloud, calls };
}

const logged: string[] = [];
const apiWith = (cloud: unknown) => ({ connections: cloudConnections(cloud as CloudClient, (message) => logged.push(message)) });

const sameProject = { project: "shop", integration: "orders", endpoint: "api" };
const otherProject = { project: "finance", integration: "billing", endpoint: "api" };
const billing = { project: "finance", component: "billing", endpoint: "api", displayName: "Billing", scope: "organization", ref: "finance-billing-api", environments: [] as unknown[] };

describe("cloud connections", () => {
	it("links the URL configurable to an endpoint of the same project", async () => {
		const { cloud, calls } = fakeCloud();
		await apiWith(cloud).connections.createServiceConnection({
			integration: "basket",
			target: sameProject,
			access: "project",
			configurables: { url: "acme/basket:ordersUrl" },
			projectName: "shop",
		});
		assert.deepStrictEqual(calls, [["config.putLink", "basket", { configurable: "acme/basket:ordersUrl", endpoint: "shop/orders/api" }, "shop"]]);
	});

	it("links the URL and the API key to the outputs of another project's endpoint", async () => {
		const { cloud, calls } = fakeCloud();
		await apiWith(cloud).connections.createServiceConnection({
			integration: "basket",
			target: otherProject,
			access: "organization",
			configurables: { url: "acme/basket:billingUrl", apiKey: "acme/basket:billingKey" },
			projectName: "shop",
		});
		assert.deepStrictEqual(calls, [
			["config.putLink", "basket", { configurable: "acme/basket:billingUrl", endpoint: "finance/billing/api", key: "url" }, "shop"],
			["config.putLink", "basket", { configurable: "acme/basket:billingKey", endpoint: "finance/billing/api", key: "apiKey" }, "shop"],
		]);
	});

	it("links only the URL of an API that takes no key", async () => {
		const { cloud, calls } = fakeCloud();
		await apiWith(cloud).connections.createServiceConnection({
			integration: "basket",
			target: otherProject,
			access: "organization",
			configurables: { url: "acme/basket:billingUrl" },
			projectName: "shop",
		});
		assert.deepStrictEqual(calls, [["config.putLink", "basket", { configurable: "acme/basket:billingUrl", endpoint: "finance/billing/api", key: "url" }, "shop"]]);
	});

	it("takes the URL's link back when the API key's fails", async () => {
		const { cloud, calls } = fakeCloud({ failKeyLink: true });
		await assert.rejects(
			apiWith(cloud).connections.createServiceConnection({
				integration: "basket",
				target: otherProject,
				access: "organization",
				configurables: { url: "acme/basket:billingUrl", apiKey: "acme/basket:billingKey" },
				projectName: "shop",
			}),
			/binding refused/,
		);
		assert.deepStrictEqual(calls.at(-1), ["config.putLink", "basket", { configurable: "acme/basket:billingUrl" }, "shop"]);
	});

	it("refuses an access that does not match the endpoint's project, before writing anything", async () => {
		const { cloud, calls } = fakeCloud();
		const connections = apiWith(cloud).connections;
		await assert.rejects(
			connections.createServiceConnection({ integration: "basket", target: otherProject, access: "project", configurables: { url: "acme/basket:u" }, projectName: "shop" }),
			(error: unknown) => error instanceof BadRequestError && /organization access/.test(error.message),
		);
		await assert.rejects(
			connections.createServiceConnection({ integration: "basket", target: sameProject, access: "organization", configurables: { url: "acme/basket:u" }, projectName: "shop" }),
			(error: unknown) => error instanceof BadRequestError && /project access/.test(error.message),
		);
		await assert.rejects(
			connections.createServiceConnection({ integration: "basket", target: sameProject, access: "project", configurables: { url: "" }, projectName: "shop" }),
			/needs the configurable/,
		);
		assert.deepStrictEqual(calls, []);
	});

	it("lists the connectable endpoints", async () => {
		const { cloud, calls } = fakeCloud({ connectable: [billing] });
		assert.deepStrictEqual(await apiWith(cloud).connections.listConnectable("basket", "shop"), [billing]);
		assert.deepStrictEqual(calls, [["config.listConnectableEndpoints", "basket", "shop"]]);
	});

	it("lists address links, without reading the connectable endpoints, and unlinks one", async () => {
		const { cloud, calls } = fakeCloud({
			links: {
				endpointLinks: { "acme/basket:ordersUrl": "shop/orders/api", "acme/basket:paths": "shop/orders/v1/api", "acme/basket:bad": "orders/api" },
				orphaned: [{ target: "acme/basket:newUrl", kind: "endpoint", ref: "shop/cart/api" }],
			},
		});
		const api = apiWith(cloud);
		assert.deepStrictEqual(await api.connections.listEndpointLinks("basket", "shop"), [
			{ configurable: "acme/basket:ordersUrl", project: "shop", component: "orders", endpoint: "api" },
			{ configurable: "acme/basket:paths", project: "shop", component: "orders", endpoint: "v1/api" },
			{ configurable: "acme/basket:newUrl", project: "shop", component: "cart", endpoint: "api" },
		]);
		assert.ok(!calls.some(([name]) => name === "config.listConnectableEndpoints"));
		await api.connections.unlinkEndpoint({ integration: "basket", configurable: "acme/basket:ordersUrl", projectName: "shop" });
		assert.deepStrictEqual(calls.at(-1), ["config.putLink", "basket", { configurable: "acme/basket:ordersUrl" }, "shop"]);
	});

	it("lists the links to another project's endpoint by the connection they read", async () => {
		const { cloud } = fakeCloud({
			links: {
				fieldLinks: { "acme/basket:billingUrl": { ref: "finance-billing-api", key: "url" }, "acme/basket:dbHost": { ref: "orders-db", key: "host" } },
				orphaned: [{ target: "acme/basket:billingKey", kind: "configurable", ref: "finance-billing-api", key: "apiKey" }],
			},
			connectable: [billing],
		});
		assert.deepStrictEqual(await apiWith(cloud).connections.listEndpointLinks("basket", "shop"), [
			{ configurable: "acme/basket:billingUrl", project: "finance", component: "billing", endpoint: "api", key: "url" },
			{ configurable: "acme/basket:billingKey", project: "finance", component: "billing", endpoint: "api", key: "apiKey" },
		]);
	});
});
