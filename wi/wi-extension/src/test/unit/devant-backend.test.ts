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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import type { DevantClient } from "@wso2/wso2-cloud-client/devant/vscode";
import * as yaml from "js-yaml";
import { devantCloudBackend } from "../../cloud/backend/devant";
import { legacyContextFiles, parseLegacyContext } from "../../cloud/backend/devant/context-file";
import { KNOWN_DEVANT_USER_KEY, WORKSPACE_PLATFORM_KEY, isDevantOffered, startingPlatform, workspacePlatform } from "../../cloud/backend/devant/detection";
import { toCreateRequest } from "../../cloud/backend/devant/create";
import { isDevantGitHubCallback } from "../../cloud/backend/devant/github";
import { toComponent, toRepository } from "../../cloud/backend/devant/mapping";

class Memento {
	readonly values = new Map<string, unknown>();
	get<T>(key: string): T | undefined {
		return this.values.get(key) as T | undefined;
	}
	update(key: string, value: unknown): Thenable<void> {
		this.values.set(key, value);
		return Promise.resolve();
	}
}

const COMPONENT = {
	apiVersion: "core.choreo.dev/v1beta1",
	kind: "Component",
	createdAt: "2026-01-01T00:00:00Z",
	metadata: { name: "orders", displayName: "Orders", projectName: "shop", id: "uuid-orders", handler: "orders-h" },
	spec: { type: "service", subType: "", source: { github: { repository: "https://github.com/acme/shop", branch: "main", path: "./orders/" } }, build: {} },
	deploymentTracks: [],
	apiVersions: [],
} as never;

describe("Devant context files", () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(path.join(tmpdir(), "devant-ctx-"));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("reads the 5.1 list from .choreo, and the single object before it", () => {
		mkdirSync(path.join(root, ".choreo"));
		writeFileSync(path.join(root, ".choreo", "context.yaml"), yaml.dump([{ org: "acme", project: "shop" }]));
		const file = legacyContextFiles.find(root);
		assert.ok(file?.endsWith(path.join(".choreo", "context.yaml")));
		assert.deepStrictEqual(legacyContextFiles.read(file as string), [{ org: "acme", project: "shop" }]);
		assert.deepStrictEqual(parseLegacyContext({ org: "acme", project: "shop" }), [{ org: "acme", project: "shop" }]);
		assert.deepStrictEqual(parseLegacyContext({ version: 2, contexts: [] }), []);
	});

	it("links and unlinks in the 5.1 list, in the file the repository has", () => {
		legacyContextFiles.link(root, { org: "acme", project: "shop" });
		legacyContextFiles.link(root, { org: "acme", project: "billing", env: "dev" });
		const file = path.join(root, ".wso2", "context.yaml");
		assert.deepStrictEqual(yaml.load(readFileSync(file, "utf8")), [
			{ org: "acme", project: "shop" },
			{ org: "acme", project: "billing" },
		]);
		legacyContextFiles.unlink([root], { org: "acme", project: "shop" });
		assert.deepStrictEqual(yaml.load(readFileSync(file, "utf8")), [{ org: "acme", project: "billing" }]);
		legacyContextFiles.unlink([root], { org: "acme", project: "billing" });
		assert.strictEqual(legacyContextFiles.find(root), undefined);
	});

	it("tells a workspace linked to Devant from one linked to Choreo Cloud by the file's format", () => {
		mkdirSync(path.join(root, ".wso2"));
		const file = path.join(root, ".wso2", "context.yaml");
		writeFileSync(file, yaml.dump({ version: 2, contexts: [{ org: "acme", project: "shop" }] }));
		assert.strictEqual(workspacePlatform([root]), "choreo-cloud");
		writeFileSync(file, yaml.dump([{ org: "acme", project: "shop" }]));
		assert.strictEqual(workspacePlatform([root]), "devant");
	});
});

describe("Devant at start-up", () => {
	const signs = (globals: Record<string, unknown> = {}, workspaceRoots: string[] = [], devantEnabled = false, workspace: Record<string, unknown> = {}) => {
		const globalState = new Memento();
		const workspaceState = new Memento();
		for (const [key, value] of Object.entries(globals)) {
			globalState.values.set(key, value);
		}
		for (const [key, value] of Object.entries(workspace)) {
			workspaceState.values.set(key, value);
		}
		return { globalState, workspaceState, workspaceRoots, devantEnabled };
	};

	it("is not offered to someone never seen using it", () => {
		assert.strictEqual(isDevantOffered(signs()), false);
		assert.strictEqual(startingPlatform(signs(), undefined), undefined);
	});

	it("starts someone who used 5.1 on Devant, once, and remembers they did", () => {
		const seen = signs({ "data-cache-zustand-storage-v5": "{}" });
		assert.strictEqual(startingPlatform(seen, undefined), "devant");
		assert.strictEqual(seen.globalState.get(KNOWN_DEVANT_USER_KEY), true);
		assert.strictEqual(startingPlatform(seen, "choreo-cloud"), undefined, "the platform last used then decides");
	});

	it("lets the workspace's own switch win, and offers Devant to someone who turned it on", () => {
		const enabled = signs({}, [], true, { [WORKSPACE_PLATFORM_KEY]: "devant" });
		assert.strictEqual(isDevantOffered(enabled), true);
		assert.strictEqual(startingPlatform(enabled, "choreo-cloud"), "devant");
	});
});

describe("Devant backend", () => {
	const fakeClient = (calls: string[]) =>
		({
			region: "US",
			deployment: () => ({ consoleUrl: "https://console.devant.example.invalid/" }),
			organizations: async () => [{ id: "101", uuid: "uuid-acme", handle: "acme", name: "Acme" }, { id: "102", uuid: "uuid-beta", handle: "beta", name: "Beta" }],
			selectOrganization: async (handle: string) => {
				calls.push(`select ${handle}`);
			},
			api: {
				getProjects: async (orgId: string) => {
					calls.push(`projects ${orgId}`);
					return [{ id: "uuid-shop", handler: "shop", name: "Shop", orgId: "101", createdData: "", region: "US", version: "1.0.0", description: "" }];
				},
				getComponentList: async (params: { projectId: string; projectHandle: string }) => {
					calls.push(`components ${params.projectId} ${params.projectHandle}`);
					return [COMPONENT];
				},
				deleteComponent: async (params: { componentId: string; projectId: string }) => {
					calls.push(`delete ${params.componentId} ${params.projectId}`);
				},
			},
		}) as unknown as DevantClient;

	it("addresses projects and integrations by handle and name, and calls Devant with their ids", async () => {
		const calls: string[] = [];
		const backend = devantCloudBackend({ client: () => fakeClient(calls), org: () => ({ id: "101", handle: "acme", name: "Acme", uuid: "uuid-acme" }) });
		const [project] = await backend.projects.list();
		assert.strictEqual(project.id, "shop");
		const [integration] = await backend.integrations.list("shop");
		assert.strictEqual(integration.id, "orders");
		assert.strictEqual(integration.componentType, "service");
		const repository = await backend.integrations.repository("orders", "shop");
		assert.deepStrictEqual(repository, { gitProvider: "github", serverUrl: "https://github.com/acme/shop", organizationApp: "acme", nameApp: "shop", branch: "main", appSubPath: "orders" });
		await backend.integrations.delete("orders", "shop");
		assert.deepStrictEqual(calls, ["projects 101", "components uuid-shop shop", "delete uuid-orders uuid-shop"]);
		assert.strictEqual(backend.cacheNamespace, "devant:");
	});

	it("links into Devant's console by handles, with no product path", async () => {
		const calls: string[] = [];
		const backend = devantCloudBackend({ client: () => fakeClient(calls), org: () => ({ id: "101", handle: "acme", name: "Acme" }) });
		await backend.integrations.list("shop");
		assert.strictEqual(
			backend.links.console({ project: "shop", integration: "orders" }),
			"https://console.devant.example.invalid/organizations/acme/projects/shop/components/orders-h/overview",
		);
	});

	it("moves to another organization without the browser", async () => {
		const calls: string[] = [];
		const backend = devantCloudBackend({ client: () => fakeClient(calls), org: () => ({ id: "101", handle: "acme", name: "Acme" }) });
		await backend.changeOrganization("102");
		assert.deepStrictEqual(calls, ["select beta"]);
		await assert.rejects(backend.changeOrganization("999"));
	});

	it("maps a component with no source to no repository", () => {
		const bare = { ...(COMPONENT as object), spec: { type: "service", subType: "", source: {}, build: {} } } as never;
		assert.strictEqual(toRepository(bare), undefined);
		assert.strictEqual(toComponent(bare, "shop").projectId, "shop");
	});
});

describe("Devant create", () => {
	const param = {
		componentDir: "/work/shop/orders",
		displayName: "Order Events",
		name: "order-events",
		integrationType: "event-integration",
		buildPackLang: "ballerina" as const,
		repoUrl: "https://bitbucket.org/acme/shop",
		branch: "main",
		gitProvider: "bitbucket",
		gitCredRef: "cred-1",
	};
	const org = { id: "101", uuid: "uuid-acme", handle: "acme", name: "Acme" };
	const project = { id: "uuid-shop", handler: "shop", name: "Shop" } as never;

	it("asks Devant for the type of the scope the form picked, with the project's id and handle", () => {
		const request = toCreateRequest({ ...param, integrationType: "file-integration" }, org, project);
		assert.strictEqual(request.projectId, "uuid-shop");
		assert.strictEqual(request.projectHandle, "shop");
		assert.strictEqual(request.orgUUID, "uuid-acme");
		assert.strictEqual(request.name, "order-events");
		assert.strictEqual(request.gitCredRef, "cred-1");
		assert.strictEqual(request.originCloud, "devant");
		assert.ok(request.type, "a known scope maps to a type");
	});

	it("takes only its own GitHub callbacks", () => {
		assert.ok(isDevantGitHubCallback({ path: "/ghapp", query: "platform=devant&code=x&orgId=101" }));
		assert.ok(!isDevantGitHubCallback({ path: "/ghapp", query: "code=x" }));
		assert.ok(!isDevantGitHubCallback({ path: "/signin", query: "platform=devant" }));
	});
});
