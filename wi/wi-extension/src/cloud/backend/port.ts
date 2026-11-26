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

import type { WICloudAPI, WICloudSubmitComponentsReq, WICloudSubmitComponentsResp } from "@wso2/wi-core";
import type { Component, ComponentRepository, ConsoleLink, ContextEntry, Project } from "@wso2/wso2-cloud-client";

/** The projects of the organization signed in to. */
export interface CloudProjects {
	list(): Promise<Project[]>;
	/** Creates a project for the name the person typed, picking a free resource name for it. */
	create(displayName: string): Promise<Project>;
}

/** The integrations of a project, addressed by the ids the platform hands out. */
export interface CloudIntegrations {
	list(projectId: string): Promise<Component[]>;
	/** The integration `ref` names, by id or name. */
	find(ref: string, projectId: string): Promise<Component>;
	repository(integrationId: string, projectId: string): Promise<ComponentRepository>;
	delete(integrationId: string, projectId: string): Promise<void>;
}

export interface CloudLinks {
	/** A page of the platform's console; the organization's home when `link` names nothing. */
	console(link?: ConsoleLink): string;
}

/** Which projects a repository belongs to, in the context file the platform's editors read. */
export interface CloudContextFiles {
	/** The repository's context file, when it has one. */
	find(gitRoot: string): string | undefined;
	read(filePath: string): ContextEntry[];
	/** Adds or updates the project's entry and answers the file written. */
	link(gitRoot: string, entry: ContextEntry): string;
	/** Removes the project's entry from each of the repositories named. */
	unlink(gitRoots: string[], entry: Pick<ContextEntry, "org" | "project">): void;
}

/** What the create form asks about the repository an integration is built from, and how access to it is given. */
export type CloudSourceControl = Pick<
	WICloudAPI,
	| "triggerGithubAuthFlow"
	| "triggerGithubInstallFlow"
	| "getBranches"
	| "getAuthorizedGitOrgs"
	| "getCredentials"
	| "getCredentialDetails"
	| "isRepoAuthorized"
	| "getGitRepoMetadata"
>;

export interface CloudCreation {
	/** Creates the integrations the form was submitted with, or gives an existing one this source. */
	submit(request: WICloudSubmitComponentsReq): Promise<WICloudSubmitComponentsResp>;
}

/** What the editor's cloud features need of the platform in use. */
export interface CloudBackend {
	/** The platform's name in the package's platform switch. */
	readonly platform: string;
	/** The platform as messages and pages name it. */
	readonly label: string;
	/** Put in front of the caches' keys, so platforms with the same organization handles keep apart; "" for Choreo Cloud. */
	readonly cacheNamespace: string;
	readonly projects: CloudProjects;
	readonly integrations: CloudIntegrations;
	readonly links: CloudLinks;
	readonly contextFiles: CloudContextFiles;
	readonly sourceControl: CloudSourceControl;
	readonly creation: CloudCreation;
	/** Moves to another of the person's organizations. */
	changeOrganization(orgId: string): Promise<void>;
}
