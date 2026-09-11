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

/**
 * Translation between the extension's platform-core types and the Integration
 * Platform wire shapes.
 *
 * Every function here is pure, which is the point: the create body is the one
 * place a wrong constant silently produces a component of the wrong kind, and
 * the platform accepts an unknown component type rather than rejecting it.
 */

import {
	ChoreoComponentSubType,
	ChoreoComponentType,
	type ComponentKind,
	type CreateComponentReq,
	type Organization,
	type Project,
} from "@wso2/wso2-platform-core";
import type {
	IpaasComponent,
	IpaasCreateComponentBody,
	IpaasEnvironment,
	IpaasOrgEntry,
	IpaasProject,
	IpaasWorkflowRun,
} from "./types";

/** Annotation keys the platform reads display name and description back from. */
const ANN_DISPLAY_NAME = "openchoreo.dev/display-name";
const ANN_DESCRIPTION = "openchoreo.dev/description";

/**
 * The build workflow for Ballerina integrations. The platform derives the
 * buildpack from this name rather than from any field the client sends, and it
 * must appear in the target component type's allowedWorkflows.
 */
export const BALLERINA_WORKFLOW = "ballerina-buildpack-builder";
const WORKFLOW_KIND = "ClusterWorkflow";
const COMPONENT_TYPE_KIND = "ComponentType";

/**
 * Component type per integration kind.
 *
 * An unlisted value is not rejected by the platform — it is silently treated as
 * an automation, which renders the wrong overview, icon and label. That is why
 * this is exhaustive over the types the create flow can produce, and why
 * `toComponentTypeName` throws rather than guessing.
 */
const COMPONENT_TYPE_BY_KIND: Record<string, string> = {
	[ChoreoComponentType.Service]: "deployment/integration-as-api",
	[ChoreoComponentType.ScheduledTask]: "cronjob/scheduled-task",
	[ChoreoComponentType.ManualTrigger]: "cronjob/scheduled-task",
	[ChoreoComponentType.EventHandler]: "deployment/event-integration",
	[ChoreoComponentType.Webhook]: "deployment/event-integration",
};

/** Sub-types that select a component type of their own, overriding the kind. */
const COMPONENT_TYPE_BY_SUB_TYPE: Record<string, string> = {
	[ChoreoComponentSubType.AiAgent]: "deployment/ai-agent",
	[ChoreoComponentSubType.MCP]: "deployment/mcp-server",
	[ChoreoComponentSubType.fileIntegration]: "deployment/file-integration",
};

/**
 * Resolve the platform component type. The sub-type wins when it names one,
 * because a file integration and an AI agent are both carried as a service or
 * event handler plus a sub-type.
 */
export function toComponentTypeName(type: string, subType?: string): string {
	const bySubType = subType ? COMPONENT_TYPE_BY_SUB_TYPE[subType] : undefined;
	if (bySubType) {
		return bySubType;
	}
	const byType = COMPONENT_TYPE_BY_KIND[type];
	if (!byType) {
		throw new Error(
			`Integration type "${type}" cannot be deployed to the Integration Platform yet. Supported types: ${Object.keys(COMPONENT_TYPE_BY_KIND).join(", ")}.`,
		);
	}
	return byType;
}

/**
 * Normalize a repository sub-path.
 *
 * The platform stores the path relative to the repository root. A leading
 * slash would send the build looking one level above it, and a backslash
 * separator — which a Windows caller produces — is not a path separator to the
 * Linux build agent that consumes this. "." is how a relative path spells the
 * root, and the root is spelled "" here.
 */
export function toAppPath(subPath: string | undefined): string {
	const normalized = (subPath ?? "")
		.replace(/\\/g, "/")
		.replace(/^\.?\/+/, "")
		.replace(/\/+$/, "");
	return normalized === "." ? "" : normalized;
}

/**
 * Build the create-component body.
 *
 * `repoSubPath` is the integration's path *within the repository*, not the
 * workspace path the request carries — `CreateComponentReq.componentDir` is an
 * absolute filesystem path, and resolving it against the git root needs the
 * repository, which a pure function has no business reaching for. The caller
 * resolves it.
 *
 * No `githubApp` binding is sent. That binding needs a GitHub App installation
 * id, and this request shape carries none, so a private repository cannot be
 * bound here — the build would fail to clone it. Adding it means plumbing an
 * installation id through the create flow first.
 */
export function toCreateComponentBody(
	req: CreateComponentReq,
	repoSubPath: string,
): IpaasCreateComponentBody {
	return {
		metadata: {
			name: req.name,
			annotations: {
				[ANN_DISPLAY_NAME]: req.displayName || req.name,
				[ANN_DESCRIPTION]: "",
			},
		},
		spec: {
			owner: { projectName: req.projectHandle },
			componentType: {
				kind: COMPONENT_TYPE_KIND,
				name: toComponentTypeName(req.type, req.componentSubType),
			},
			// autoBuild starts the first build as part of the create, so the
			// deploy flow watches that run instead of triggering a second one.
			autoBuild: true,
			// autoDeploy leaves the platform able to finish on its own if the
			// editor is closed mid-flow. The deploy flow still drives and reports
			// the deployment; it just does not have to be the only thing that can.
			autoDeploy: true,
			workflow: {
				kind: WORKFLOW_KIND,
				name: BALLERINA_WORKFLOW,
				parameters: {
					repository: {
						url: req.repoUrl ?? "",
						revision: { branch: req.branch ?? "" },
						appPath: toAppPath(repoSubPath),
					},
				},
			},
		},
	};
}

/**
 * Present a platform component as a ComponentKind.
 *
 * Components are addressed by name, so id, handler and name are one value.
 * `deploymentTracks` and `apiVersions` stay empty: the platform has one
 * implicit version per component and no track resource, and callers in this
 * extension read neither.
 */
export function toComponentKind(component: IpaasComponent): ComponentKind {
	return {
		apiVersion: "",
		kind: "Component",
		metadata: {
			name: component.name || component.handler,
			displayName: component.displayName || component.name,
			projectName: component.projectId,
			id: component.id || component.handler,
			handler: component.handler || component.id,
			isPrebuilt: component.isPrebuilt,
		},
		spec: {
			type: component.componentType ?? "",
			subType: component.componentSubType ?? "",
			source: {},
			build: {},
		},
		deploymentTracks: [],
		apiVersions: [],
		createdAt: component.createdAt,
	};
}

/**
 * Present a platform project as a Project.
 *
 * `id` carries the handler rather than a UUID: every platform path addresses a
 * project by name, so storing anything else here would produce URLs that 404.
 */
export function toProject(project: IpaasProject, orgId: string): Project {
	return {
		createdData: project.createdDate,
		handler: project.handler,
		id: project.handler,
		name: project.name,
		orgId,
		region: project.region ?? "",
		version: "",
		description: project.description ?? "",
		repository: project.repository || undefined,
		branch: project.branch || undefined,
		gitOrganization: project.gitOrganization || undefined,
		gitProvider: project.gitProvider || undefined,
	};
}

/**
 * Present a platform organization entry as an Organization.
 *
 * `owner` has no platform equivalent and is filled with empty values rather
 * than invented; nothing on the deploy path reads it.
 */
export function toOrganization(entry: IpaasOrgEntry): Organization {
	return {
		id: entry.numericId ?? 0,
		uuid: entry.uuid ?? "",
		handle: entry.handle,
		name: entry.handle,
		owner: { id: "", idpId: "", createdAt: new Date(0) },
	};
}

/** The environment name, which is what every deploy call takes. Ids are names here too. */
export function toEnvironmentName(environment: IpaasEnvironment): string {
	return environment.name || environment.id;
}

/**
 * Millisecond stamp in a `{componentName}-{unixMillis}` run name.
 *
 * A build trigger does not name the run it started, so a run is matched by
 * being newer than the moment the trigger was sent. Returns null when the name
 * carries no stamp, which makes the run unmatchable rather than wrongly matched.
 */
export function runStamp(name: string, componentName?: string): number | null {
	const stamp =
		componentName && name.startsWith(`${componentName}-`)
			? name.slice(componentName.length + 1)
			: name.slice(name.lastIndexOf("-") + 1);
	if (!/^\d+$/.test(stamp)) {
		return null;
	}
	const value = Number(stamp);
	return Number.isSafeInteger(value) ? value : null;
}

/**
 * The newest build started at or after `since`.
 *
 * Runs are compared by their own stamp rather than by list order, so a list
 * that is not newest-first cannot make an older build look like the new one.
 */
export function newestRunSince(
	runs: IpaasWorkflowRun[],
	since: number,
): IpaasWorkflowRun | undefined {
	let best: IpaasWorkflowRun | undefined;
	let bestStamp = Number.NEGATIVE_INFINITY;
	for (const run of runs) {
		if (!run.name) {
			continue;
		}
		const stamp = runStamp(run.name, run.componentName);
		if (stamp === null || stamp < since) {
			continue;
		}
		if (stamp > bestStamp) {
			best = run;
			bestStamp = stamp;
		}
	}
	return best;
}
