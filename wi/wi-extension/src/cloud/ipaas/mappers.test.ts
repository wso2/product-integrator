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

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	ChoreoComponentSubType,
	ChoreoComponentType,
	type CreateComponentReq,
	DevantScopes,
	getTypeOfIntegrationType,
} from "@wso2/wso2-platform-core";
import {
	BALLERINA_WORKFLOW,
	newestRunSince,
	runStamp,
	toAppPath,
	toComponentKind,
	toComponentTypeName,
	toCreateComponentBody,
	toEnvironmentName,
	toOrganization,
	toProject,
} from "./mappers";
import type { IpaasComponent, IpaasProject, IpaasWorkflowRun } from "./types";

function req(overrides: Partial<CreateComponentReq> = {}): CreateComponentReq {
	return {
		orgId: "1",
		orgUUID: "org-uuid",
		projectId: "proj",
		projectHandle: "proj",
		name: "my-int",
		displayName: "My Int",
		type: ChoreoComponentType.Service,
		componentSubType: "",
		buildPackLang: "ballerina",
		componentDir: "/home/u/ws/my-int",
		repoUrl: "https://github.com/acme/repo",
		gitProvider: "github",
		gitCredRef: "",
		branch: "main",
		langVersion: "",
		port: 0,
		spaBuildCommand: "",
		spaNodeVersion: "",
		spaOutputDir: "",
		...overrides,
	};
}

describe("toComponentTypeName", () => {
	// Every integration type the create flow can produce must land on a type the
	// platform knows. An unlisted value is accepted and silently treated as an
	// automation, so a gap here is invisible until the component renders wrong.
	const expected: Record<string, string> = {
		[DevantScopes.AUTOMATION]: "cronjob/scheduled-task",
		[DevantScopes.INTEGRATION_AS_API]: "deployment/integration-as-api",
		[DevantScopes.EVENT_INTEGRATION]: "deployment/event-integration",
		[DevantScopes.FILE_INTEGRATION]: "deployment/file-integration",
		[DevantScopes.AI_AGENT]: "deployment/ai-agent",
		[DevantScopes.MCP]: "deployment/mcp-server",
	};

	for (const [scope, want] of Object.entries(expected)) {
		it(`maps the ${scope} integration type`, () => {
			const { type, subType } = getTypeOfIntegrationType(scope);
			assert.equal(toComponentTypeName(type ?? "", subType), want);
		});
	}

	it("covers every deployable integration type the picker offers", () => {
		const deployable = Object.values(DevantScopes).filter(
			(scope) => scope !== DevantScopes.ANY && scope !== DevantScopes.LIBRARY,
		);
		assert.deepEqual(new Set(Object.keys(expected)), new Set(deployable));
	});

	it("lets a sub-type override the kind", () => {
		assert.equal(
			toComponentTypeName(
				ChoreoComponentType.Service,
				ChoreoComponentSubType.AiAgent,
			),
			"deployment/ai-agent",
		);
		assert.equal(
			toComponentTypeName(
				ChoreoComponentType.EventHandler,
				ChoreoComponentSubType.fileIntegration,
			),
			"deployment/file-integration",
		);
	});

	// Guessing would produce a component of the wrong kind that cannot be fixed
	// without deleting it, so refuse instead.
	it("refuses a type it cannot map", () => {
		assert.throws(
			() => toComponentTypeName(ChoreoComponentType.WebApplication),
			/cannot be deployed/,
		);
		assert.throws(() => toComponentTypeName(""), /cannot be deployed/);
	});
});

describe("toAppPath", () => {
	const cases: Array<[string | undefined, string]> = [
		["src/orders", "src/orders"],
		["/src/orders", "src/orders"],
		["///src/orders", "src/orders"],
		["./src/orders", "src/orders"],
		// A Windows caller produces backslashes; the build agent reading this is Linux.
		["src\\orders", "src/orders"],
		["src/orders/", "src/orders"],
		[".", ""],
		["", ""],
		[undefined, ""],
	];
	for (const [input, want] of cases) {
		it(`normalizes ${JSON.stringify(input)}`, () =>
			assert.equal(toAppPath(input), want));
	}
});

describe("toCreateComponentBody", () => {
	it("builds the body the platform expects", () => {
		const body = toCreateComponentBody(req(), "src/orders");
		assert.deepEqual(body, {
			metadata: {
				name: "my-int",
				annotations: {
					"openchoreo.dev/display-name": "My Int",
					"openchoreo.dev/description": "",
				},
			},
			spec: {
				owner: { projectName: "proj" },
				componentType: {
					kind: "ComponentType",
					name: "deployment/integration-as-api",
				},
				autoBuild: true,
				autoDeploy: true,
				workflow: {
					kind: "ClusterWorkflow",
					name: BALLERINA_WORKFLOW,
					parameters: {
						repository: {
							url: "https://github.com/acme/repo",
							revision: { branch: "main" },
							appPath: "src/orders",
						},
					},
				},
			},
		});
	});

	// The platform reads the label back from the annotation, so a component
	// created without one lists under its slug instead of its name.
	it("falls back to the slug when no display name is given", () => {
		const body = toCreateComponentBody(req({ displayName: "" }), "");
		assert.equal(
			body.metadata.annotations?.["openchoreo.dev/display-name"],
			"my-int",
		);
	});

	// Omitting secretRef and sending "" are different instructions to the
	// platform, and "" is only correct alongside a GitHub App binding, which
	// this request shape cannot carry.
	it("sends no secretRef and no githubApp binding", () => {
		const body = toCreateComponentBody(req(), "");
		assert.ok(!("secretRef" in body.spec.workflow.parameters.repository));
		assert.equal(body.githubApp, undefined);
	});

	it("always builds with the Ballerina workflow", () => {
		const body = toCreateComponentBody(
			req({ buildPackLang: "microintegrator" }),
			"",
		);
		assert.equal(body.spec.workflow.name, "ballerina-buildpack-builder");
	});

	// The request's componentDir is an absolute workspace path; sending it would
	// make the build look for sources at a path that does not exist in the repo.
	it("uses the supplied repository sub-path, not componentDir", () => {
		const body = toCreateComponentBody(
			req({ componentDir: "/home/u/ws/my-int" }),
			"my-int",
		);
		assert.equal(body.spec.workflow.parameters.repository.appPath, "my-int");
	});
});

describe("toComponentKind", () => {
	const component: IpaasComponent = {
		projectId: "proj",
		id: "my-int",
		name: "my-int",
		handler: "my-int",
		displayName: "My Int",
		displayType: "biService",
		description: "",
		status: "Ready",
		componentType: "service",
		componentSubType: null,
		createdAt: "2026-01-01T00:00:00Z",
		lastBuildDate: "",
		isPrebuilt: false,
		buildpackType: "BI",
		deleting: false,
	};

	it("carries identity into every id field callers read", () => {
		const kind = toComponentKind(component);
		assert.equal(kind.metadata.id, "my-int");
		assert.equal(kind.metadata.handler, "my-int");
		assert.equal(kind.metadata.name, "my-int");
		assert.equal(kind.metadata.projectName, "proj");
		assert.equal(kind.metadata.displayName, "My Int");
		assert.equal(kind.spec.type, "service");
		assert.equal(kind.spec.subType, "");
	});

	it("falls back to the handler when a name is absent", () => {
		const kind = toComponentKind({ ...component, name: "", id: "" });
		assert.equal(kind.metadata.name, "my-int");
		assert.equal(kind.metadata.id, "my-int");
	});
});

describe("toProject", () => {
	const project: IpaasProject = {
		id: "ignored-uuid",
		orgId: 1,
		name: "My Project",
		handler: "my-project",
		description: "d",
		createdDate: "2026-01-01T00:00:00Z",
		updatedAt: "",
		region: "us",
		defaultDeploymentPipelineId: "",
		gitProvider: "",
		gitOrganization: "",
		repository: "",
		branch: "",
		directoryPath: "",
		isPublicRepo: false,
		deleting: false,
	};

	// Every platform path addresses a project by name, so an id that is not the
	// handler produces URLs that 404.
	it("uses the handler as the id", () => {
		const mapped = toProject(project, "org-uuid");
		assert.equal(mapped.id, "my-project");
		assert.equal(mapped.handler, "my-project");
		assert.equal(mapped.orgId, "org-uuid");
	});

	it("leaves absent git metadata undefined rather than empty", () => {
		const mapped = toProject(project, "org-uuid");
		assert.equal(mapped.repository, undefined);
		assert.equal(mapped.branch, undefined);
	});
});

describe("toOrganization", () => {
	it("maps a platform org entry", () => {
		const org = toOrganization({ handle: "acme", numericId: 7, uuid: "u-1" });
		assert.equal(org.handle, "acme");
		assert.equal(org.id, 7);
		assert.equal(org.uuid, "u-1");
	});
	it("tolerates a missing uuid", () => {
		assert.equal(toOrganization({ handle: "acme", numericId: 0 }).uuid, "");
	});
});

describe("toEnvironmentName", () => {
	it("prefers the name", () => {
		assert.equal(
			toEnvironmentName({ id: "i", name: "development", critical: false }),
			"development",
		);
	});
	it("falls back to the id", () => {
		assert.equal(
			toEnvironmentName({ id: "development", name: "", critical: false }),
			"development",
		);
	});
});

describe("runStamp", () => {
	it("reads the stamp after the component name", () => {
		assert.equal(runStamp("my-int-1700000000000", "my-int"), 1700000000000);
	});
	// A component name containing a hyphen makes the last-hyphen rule wrong, so
	// the component name is stripped first when it is known.
	it("handles a hyphenated component name", () => {
		assert.equal(
			runStamp("my-long-int-1700000000000", "my-long-int"),
			1700000000000,
		);
	});
	it("falls back to the last segment when the component is unknown", () => {
		assert.equal(runStamp("my-int-1700000000000"), 1700000000000);
	});
	it("returns null for a name with no stamp", () => {
		assert.equal(runStamp("my-int-abc", "my-int"), null);
		assert.equal(runStamp("my-int", "my-int"), null);
	});
});

describe("newestRunSince", () => {
	const run = (name: string): IpaasWorkflowRun => ({
		name,
		componentName: "my-int",
	});

	it("picks the newest run at or after the cutoff", () => {
		const runs = [run("my-int-100"), run("my-int-300"), run("my-int-200")];
		assert.equal(newestRunSince(runs, 150)?.name, "my-int-300");
	});

	// The build that a trigger started is identified by being newer than the
	// trigger, so a pre-existing run must never be mistaken for it.
	it("ignores runs older than the cutoff", () => {
		assert.equal(newestRunSince([run("my-int-100")], 150), undefined);
	});

	it("includes a run exactly at the cutoff", () => {
		assert.equal(newestRunSince([run("my-int-150")], 150)?.name, "my-int-150");
	});

	it("ignores unnamed and unstamped runs", () => {
		const runs = [
			{ componentName: "my-int" },
			run("my-int-nope"),
			run("my-int-200"),
		];
		assert.equal(newestRunSince(runs, 0)?.name, "my-int-200");
	});

	it("does not depend on list order", () => {
		const ascending = [run("my-int-100"), run("my-int-200"), run("my-int-300")];
		const descending = [...ascending].reverse();
		assert.equal(
			newestRunSince(ascending, 0)?.name,
			newestRunSince(descending, 0)?.name,
		);
	});
});
