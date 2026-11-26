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

import type { Component, ComponentRepository, Project } from "@wso2/wso2-cloud-client";
import type { ComponentKind, Project as DevantProject } from "@wso2/wso2-platform-core";

/** A Devant project as the editor shows one: addressed by its handle, as Choreo Cloud's projects are. */
export function toProject(project: DevantProject): Project {
	return {
		id: project.handler,
		handler: project.handler,
		name: project.name,
		description: project.description ?? "",
		createdDate: project.createdData ?? (project as { createdDate?: string }).createdDate ?? "",
		updatedAt: "",
		defaultDeploymentPipelineId: "",
		deleting: false,
		directoryPath: "",
		repository: project.repository ?? "",
		branch: project.branch ?? "",
		gitOrganization: project.gitOrganization ?? "",
		gitProvider: project.gitProvider ?? "",
		isPublicRepo: false,
		orgId: Number(project.orgId) || 0,
		region: project.region ?? "",
		type: "",
		version: project.version ?? "",
	};
}

const COMPONENT_TYPES: Record<string, NonNullable<Component["componentType"]>> = {
	service: "service",
	scheduledTask: "automation",
	manualTask: "automation",
	scheduleTask: "automation",
	eventHandler: "eventIntegration",
	fileIntegration: "fileIntegration",
	proxy: "proxy",
	aiAgent: "aiAgent",
	mcpServer: "mcpServer",
};

/** A Devant component as the editor shows one: addressed by its name within the project's handle. */
export function toComponent(component: ComponentKind, projectHandle: string): Component {
	const { metadata, spec } = component;
	const type = COMPONENT_TYPES[spec?.subType] ?? COMPONENT_TYPES[spec?.type];
	return {
		id: metadata.name,
		name: metadata.name,
		handler: metadata.handler || metadata.name,
		displayName: metadata.displayName || metadata.name,
		displayType: spec?.type ?? "",
		description: "",
		projectId: projectHandle,
		componentType: type,
		componentSubType: spec?.subType || null,
		createdAt: component.createdAt ?? "",
		lastBuildDate: "",
		status: "",
		version: "",
		deleting: false,
		isPrebuilt: !!metadata.isPrebuilt,
	};
}

/** Where a Devant component is built from, as Choreo Cloud describes a repository; undefined when it has none. */
export function toRepository(component: ComponentKind): ComponentRepository | undefined {
	const source = component.spec?.source;
	const [gitProvider, git] = source?.github
		? (["github", source.github] as const)
		: source?.bitbucket
			? (["bitbucket", source.bitbucket] as const)
			: source?.gitlab
				? (["gitlab", source.gitlab] as const)
				: [undefined, undefined];
	if (!git?.repository) {
		return undefined;
	}
	const [owner, name] = repositoryParts(git.repository);
	return {
		gitProvider,
		serverUrl: git.repository,
		organizationApp: owner,
		nameApp: name,
		branch: git.branch,
		appSubPath: (git.path ?? "").replace(/^\.?\/+|\/+$/g, ""),
	};
}

function repositoryParts(url: string): [string | undefined, string | undefined] {
	const match = url.match(/[/:]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
	return match ? [match[1], match[2]] : [undefined, undefined];
}
