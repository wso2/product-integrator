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
import { tmpdir } from "os";
import { join } from "path";
import type { WICloudDeployReq } from "@wso2/wi-core";
import { type Component, type Project, RESOURCE_NAME } from "@wso2/wso2-cloud-client";
import {
	assignUniqueNames,
	deploySourceRoot,
	integrationNames,
	isIntegrationNameTaken,
	pickBranch,
	resolveDeployProject,
	toResourceName,
	toValidProjectName,
	validateProjectName,
} from "../../cloud/cmds/cmd-utils";
import { ext } from "../../extensionVariables";

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

describe("resolveDeployProject", () => {
	const ORDERS = { id: "orders", name: "Orders" } as Project;
	let created: { name: string; displayName: string }[];
	const saved = { authProvider: ext.authProvider, context: (ext as unknown as { _context: unknown })._context, clients: ext.clients };
	after(() => {
		ext.authProvider = saved.authProvider;
		(ext as unknown as { _context: unknown })._context = saved.context;
		ext.clients = saved.clients;
	});

	function platform(integrations: Record<string, Component[]>): void {
		created = [];
		ext.authProvider = { org: { handle: "acme" } } as typeof ext.authProvider;
		ext.context = { globalState: { get: (): undefined => undefined, update: async (): Promise<void> => undefined } } as unknown as typeof ext.context;
		ext.clients = {
			platform: {
				cloud: {
					components: { list: async (project: string) => integrations[project] ?? [] },
					projects: {
						checkHandler: async () => ({ handlerUnique: true }),
						create: async (params: { name: string; displayName: string }) => {
							created.push(params);
							return { id: params.name, name: params.displayName };
						},
					},
				},
			},
		} as unknown as typeof ext.clients;
	}

	it("reuses the empty project its own failed deploy created, so a retry does not fail", async () => {
		platform({});
		const first = await resolveDeployProject({ newName: "Retry" }, [ORDERS]);
		assert.strictEqual(await resolveDeployProject({ newName: "Retry" }, [ORDERS, first]), first);
		assert.strictEqual(created.length, 1);
	});

	it("refuses an empty project of that name it didn't create, and one being deleted", async () => {
		platform({});
		await assert.rejects(resolveDeployProject({ newName: "Orders" }, [ORDERS]), /Project name already exists/);
		const first = await resolveDeployProject({ newName: "Going" }, [ORDERS]);
		await assert.rejects(resolveDeployProject({ newName: "Going" }, [ORDERS, { ...first, deleting: true }]), /Project name already exists/);
	});

	it("refuses a new project name an existing project with integrations uses", async () => {
		platform({ orders: [{ id: "api", name: "api" } as Component] });
		await assert.rejects(resolveDeployProject({ newName: "Orders" }, [ORDERS]), /Project name already exists/);
	});

	it("creates a project for a free name and finds an existing one by id", async () => {
		platform({});
		assert.deepStrictEqual(await resolveDeployProject({ newName: "Billing" }, [ORDERS]), { id: "billing", name: "Billing" });
		assert.deepStrictEqual(created, [{ name: "billing", displayName: "Billing" }]);
		assert.strictEqual(await resolveDeployProject({ id: "orders" }, [ORDERS]), ORDERS);
		await assert.rejects(resolveDeployProject({ id: "gone" }, [ORDERS]), /no longer exists/);
	});
});

describe("deploySourceRoot", () => {
	const root = join(tmpdir(), "orders");
	const REMOTE = "https://github.com/acme/orders.git";
	const gitData = { remotes: [REMOTE], gitRoot: root };
	const request = (change: Partial<WICloudDeployReq> = {}, fsPath = join(root, "api")): WICloudDeployReq => ({
		workspaceDir: root,
		buildPackLang: "ballerina",
		integration: { fsPath, displayName: "API", integrationType: "service" },
		project: { id: "orders" },
		gitRemote: REMOTE,
		branch: "main",
		...change,
	});
	const branches = async () => ["main"];

	it("returns the git root for a directory, remote and branch of the workspace repository", async () => {
		assert.strictEqual(await deploySourceRoot(request(), gitData, branches), root);
	});

	it("refuses a remote the repository does not have, and a branch the remote does not have", async () => {
		await assert.rejects(deploySourceRoot(request({ gitRemote: "https://github.com/eve/orders.git" }), gitData, branches), /not a remote/);
		await assert.rejects(deploySourceRoot(request({ branch: "dev" }), gitData, branches), /not a branch/);
	});

	it("refuses a directory outside the workspace directory, or a workspace outside a Git repository", async () => {
		await assert.rejects(deploySourceRoot(request({}, join(tmpdir(), "other")), gitData, branches), /outside the workspace directory/);
		await assert.rejects(deploySourceRoot(request(), undefined, branches), /not in a Git repository/);
	});

	it("refuses a branch it cannot read, also when the list is empty or unreadable", async () => {
		await assert.rejects(deploySourceRoot(request(), gitData, async () => []), /not a branch Choreo Cloud can read/);
		await assert.rejects(deploySourceRoot(request(), gitData, () => Promise.reject(new Error("offline"))), /Couldn't read the branches.*offline/);
	});

	it("matches the remote in any URL form git reports", async () => {
		assert.strictEqual(await deploySourceRoot(request({ gitRemote: "git@github.com:Acme/orders.git" }), gitData, branches), root);
	});
});

describe("isIntegrationNameTaken", () => {
	const taken = integrationNames([{ id: "orders-api", name: "orders-api", displayName: "Orders Service" } as Component]);

	it("matches an id, name or display name whatever its case and surrounding spaces", () => {
		assert.ok(isIntegrationNameTaken(taken, " orders service "));
		assert.ok(isIntegrationNameTaken(taken, "ORDERS-API"));
	});

	it("matches a display name whose resource name an integration already uses", () => {
		assert.ok(isIntegrationNameTaken(taken, "Orders API"));
		assert.ok(!isIntegrationNameTaken(taken, "Billing"));
	});
});

describe("assignUniqueNames", () => {
	it("suffixes names the project uses, whatever their case, and names taken earlier in the same batch", () => {
		const existing = [{ id: "orders", name: "orders", displayName: "Orders" } as Component];
		const integrations: { name?: string; fsPath: string }[] = [{ fsPath: join(tmpdir(), "orders") }, { name: "ORDERS", fsPath: join(tmpdir(), "api") }, { name: "Billing", fsPath: join(tmpdir(), "billing") }];
		assignUniqueNames(existing, integrations);
		assert.deepStrictEqual(
			integrations.map((item) => item.name),
			["orders-1", "ORDERS-2", "Billing"],
		);
	});

	it("suffixes a name whose resource name an integration already uses", () => {
		const integrations = [{ name: "Orders API", fsPath: join(tmpdir(), "api") }];
		assignUniqueNames([{ id: "orders-api", name: "orders-api" } as Component], integrations);
		assert.strictEqual(integrations[0].name, "Orders API-1");
	});
});

describe("pickBranch", () => {
	it("takes the first preferred branch the remote has, then main, then master, then its first branch", () => {
		assert.strictEqual(pickBranch(["dev", "main", "feature"], "feature", "dev"), "feature");
		assert.strictEqual(pickBranch(["dev", "main"], "gone", null, undefined), "main");
		assert.strictEqual(pickBranch(["dev", "master"]), "master");
		assert.strictEqual(pickBranch(["dev", "release"], ""), "dev");
		assert.strictEqual(pickBranch([], "main"), null);
	});
});

describe("toValidProjectName", () => {
	it("keeps the letters, digits, spaces, hyphens and underscores of a title, from its first letter", () => {
		assert.strictEqual(toValidProjectName("Orders (v2)"), "Orders v2");
		assert.strictEqual(toValidProjectName(" 12 Orders! "), "Orders");
		assert.strictEqual(validateProjectName(toValidProjectName(`Orders ${"x".repeat(80)}`) ?? ""), null);
	});

	it("suggests nothing when too little is left", () => {
		assert.strictEqual(toValidProjectName("A!"), undefined);
	});
});

describe("validateProjectName", () => {
	const projects = [{ id: "orders-api", name: "Orders" } as Project];

	it("accepts 3 to 60 letters, digits, spaces, hyphens and underscores that start with a letter", () => {
		assert.strictEqual(validateProjectName("Billing Team_2-x", projects), null);
		assert.strictEqual(validateProjectName(`a${"b".repeat(59)}`), null);
	});

	it("refuses an empty name, and a name or derived id an existing project uses", () => {
		assert.strictEqual(validateProjectName(""), "Project name is required");
		assert.strictEqual(validateProjectName("Orders", projects), "Project name already exists");
		assert.strictEqual(validateProjectName("Orders API", projects), "Project name already exists");
	});

	it("refuses a name of the wrong length, start or characters", () => {
		assert.strictEqual(validateProjectName("ab"), "Project name must be between 3 and 60 characters");
		assert.strictEqual(validateProjectName("a".repeat(61)), "Project name must be between 3 and 60 characters");
		assert.strictEqual(validateProjectName("1orders"), "Project name must start with an alphabetic letter");
		assert.strictEqual(validateProjectName("orders.api"), "Project name cannot have any special characters");
	});
});
