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
 * Wire types of the Integration Platform API.
 *
 * These mirror the server's response package field for field. Only what the
 * deploy path reads is declared — an unlisted field is not "unsupported", just
 * unused here.
 */

/** Every collection endpoint answers with this envelope. */
export interface ListResponse<T> {
	items: T[];
}

/** Mutations that report only an outcome answer with this. */
export interface MessageResponse {
	message?: string;
}

export interface IpaasOrgEntry {
	handle: string;
	numericId: number;
	uuid?: string;
}

export interface IpaasProject {
	id: string;
	orgId: number;
	name: string;
	handler: string;
	description: string;
	createdDate: string;
	updatedAt: string;
	region: string;
	defaultDeploymentPipelineId: string;
	gitProvider: string;
	gitOrganization: string;
	repository: string;
	branch: string;
	directoryPath: string;
	isPublicRepo: boolean;
	deleting: boolean;
}

/**
 * A component as the API returns it. Components are addressed by name, so
 * `id`, `handler` and the K8s object name are the same string; the K8s UID is
 * not usable as a path parameter and is not surfaced.
 */
export interface IpaasComponent {
	projectId: string;
	id: string;
	name: string;
	handler: string;
	displayName: string;
	/** Composite of buildpack and type, e.g. "biService". Empty for a component with neither. */
	displayType: string;
	description: string;
	status: string;
	/** Logical type, e.g. "service" | "automation" | "eventIntegration". */
	componentType?: string;
	componentSubType?: string | null;
	createdAt: string;
	lastBuildDate: string;
	labels?: string[];
	isPrebuilt: boolean;
	/** "BI" | "MI" | "other". */
	buildpackType?: string;
	deleting: boolean;
	/** Non-fatal post-create failure. The component exists; something after it did not. */
	warning?: string;
}

export interface IpaasComponentNameAvailability {
	componentNameUnique: boolean;
	alternateComponentName: string;
}

export interface IpaasEnvironment {
	id: string;
	name: string;
	critical: boolean;
	description?: string;
	createdAt?: string;
}

/** One task within a build. `phase` is the field the stepper reads. */
export interface IpaasWorkflowTask {
	name: string;
	phase?: string;
	startedAt?: string;
	completedAt?: string;
}

/**
 * A build. `status` is normalized server-side to a bare verb; the raw
 * OpenChoreo condition reasons are not exposed.
 */
export interface IpaasWorkflowRun {
	name?: string;
	status?: IpaasBuildStatus | string;
	startedAt?: string;
	completedAt?: string;
	componentName?: string;
	projectName?: string;
	image?: string;
	commit?: string;
	tasks?: IpaasWorkflowTask[];
	trigger?: "initial" | "manual" | "automatic";
}

/** The complete build vocabulary. */
export type IpaasBuildStatus = "Pending" | "Running" | "Succeeded" | "Failed";

export const BUILD_TERMINAL: readonly string[] = ["Succeeded", "Failed"];

/**
 * The complete deployment vocabulary. Unknown upstream conditions are reported
 * as ERROR rather than left pending, so a deployment never polls forever.
 */
export type IpaasDeploymentStatus =
	| "ACTIVE"
	| "SUSPENDED"
	| "IN_PROGRESS"
	| "ERROR";

export const DEPLOYMENT_TERMINAL: readonly string[] = [
	"ACTIVE",
	"SUSPENDED",
	"ERROR",
];

export interface IpaasComponentDeployment {
	releaseId: string;
	cron: string;
	cronTimezone: string;
	deploymentStatusV2?: IpaasDeploymentStatus | string;
	invokeUrl?: string;
	imageUrl?: string;
	configCount: number;
}

/** Answer to a build trigger. It does not name the run it started. */
export interface IpaasTriggerBuildResponse {
	message: string;
	success: boolean;
}

// --- Request bodies ---------------------------------------------------------

/**
 * Create-component body. The API takes the Kubernetes-shaped resource and
 * forwards it on with only `githubApp` removed, so the nesting here is the
 * nesting the platform stores.
 */
export interface IpaasCreateComponentBody {
	metadata: {
		name: string;
		annotations?: Record<string, string>;
	};
	spec: {
		owner: { projectName: string };
		componentType: { kind: string; name: string };
		autoDeploy: boolean;
		autoBuild: boolean;
		workflow: {
			kind: string;
			name: string;
			parameters: {
				repository: {
					url: string;
					revision: { branch: string };
					appPath: string;
					/**
					 * Present, and empty, only for a GitHub App component: the
					 * platform then renders no secret of its own because the git
					 * integration mints a per-build one. Absent otherwise —
					 * omitting the field and sending "" mean different things.
					 */
					secretRef?: string;
				};
			};
		};
	};
	githubApp?: {
		installationId: number;
		owner: string;
		repo: string;
		branch: string;
		appPath: string;
		repositoryUrl: string;
	};
}

export interface IpaasCreateProjectBody {
	name: string;
	displayName?: string;
	description?: string;
	deploymentPipeline: string;
}
