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
import type { CloudClient } from "@wso2/wso2-cloud-client";
import { CHOREO_CLOUD_LABEL, CHOREO_CLOUD_PLATFORM, choreoCloudBackend } from "../../cloud/backend/choreo-cloud";

function backendWith(projects: Partial<CloudClient["projects"]>, components: Partial<CloudClient["components"]> = {}) {
	const cloud = { projects, components } as unknown as CloudClient;
	return choreoCloudBackend({ cloud: () => cloud, consoleUrl: () => "https://console.example.invalid", orgHandle: () => "acme" });
}

describe("Choreo Cloud backend", () => {
	it("names the platform as the switch and the messages do", () => {
		const backend = backendWith({});
		assert.strictEqual(backend.platform, CHOREO_CLOUD_PLATFORM);
		assert.strictEqual(backend.label, CHOREO_CLOUD_LABEL);
	});

	it("creates a project under the free name the platform suggests", async () => {
		const created: unknown[] = [];
		const backend = backendWith({
			checkHandler: async () => ({ handlerUnique: false, alternateHandlerCandidate: "my-app-2" }) as never,
			create: async (request) => {
				created.push(request);
				return { id: request.name } as never;
			},
		});
		const project = await backend.projects.create("My App");
		assert.strictEqual(project.id, "my-app-2");
		assert.deepStrictEqual(created, [{ name: "my-app-2", displayName: "My App" }]);
	});

	it("creates under the typed name when the check fails, and refuses a name the platform does not accept", async () => {
		const backend = backendWith({
			checkHandler: async () => {
				throw new Error("down");
			},
			create: async (request) => ({ id: request.name }) as never,
		});
		assert.strictEqual((await backend.projects.create("My App")).id, "my-app");
		await assert.rejects(backend.projects.create("---"), /not a name the platform accepts/);
	});

	it("passes integration calls through with the project", async () => {
		const calls: string[] = [];
		const backend = backendWith(
			{},
			{
				list: async (project) => {
					calls.push(`list ${project}`);
					return [];
				},
				delete: async (name, project) => {
					calls.push(`delete ${name} ${project}`);
				},
			},
		);
		await backend.integrations.list("p1");
		await backend.integrations.delete("i1", "p1");
		assert.deepStrictEqual(calls, ["list p1", "delete i1 p1"]);
	});

	it("links into the console under the organization signed in to", () => {
		const backend = backendWith({});
		assert.strictEqual(backend.links.console(), "https://console.example.invalid/integration/organizations/acme");
		assert.strictEqual(
			backend.links.console({ project: "p1", integration: "i1" }),
			"https://console.example.invalid/integration/organizations/acme/projects/p1/components/i1/overview",
		);
	});
});
