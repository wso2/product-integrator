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
 * Watching an integration from "created" to "running".
 *
 * Creating a component starts a build on its own, so this watches that build
 * rather than starting a second one. Once the build succeeds, a deployment may
 * appear without being asked for — autoDeploy — so the deployment is requested
 * only when none has turned up, which keeps the flow correct whether or not the
 * platform got there first.
 */

import { newestRunSince } from "./mappers";
import {
	BUILD_TERMINAL,
	DEPLOYMENT_TERMINAL,
	type IpaasComponentDeployment,
	type IpaasWorkflowRun,
} from "./types";

export type DeployStage = "building" | "deploying";

export interface DeployOutcome {
	ok: boolean;
	stage: DeployStage;
	/** Platform status at the point the watch stopped, e.g. "Succeeded" or "ERROR". */
	status: string;
	/** Name of the build that was watched, when one was identified. */
	buildName?: string;
	/** Release the deployment is bound to, when it got that far. */
	releaseId?: string;
	message: string;
}

export function isBuildTerminal(status: string | undefined): boolean {
	return !!status && BUILD_TERMINAL.includes(status);
}

export function isDeploymentTerminal(status: string | undefined): boolean {
	return !!status && DEPLOYMENT_TERMINAL.includes(status);
}

export function isBuildSuccess(status: string | undefined): boolean {
	return status === "Succeeded";
}

/**
 * Whether a deployment has reached a state worth reporting as success.
 * SUSPENDED is terminal but is not running, so it is reported as itself.
 */
export function isDeploymentSuccess(status: string | undefined): boolean {
	return status === "ACTIVE";
}

/** What the user is told for a given terminal status. */
export function describeOutcome(
	stage: DeployStage,
	status: string | undefined,
): string {
	if (stage === "building") {
		if (isBuildSuccess(status)) {
			return "Build succeeded";
		}
		return status === "Failed"
			? "Build failed"
			: `Build ended as ${status ?? "unknown"}`;
	}
	switch (status) {
		case "ACTIVE":
			return "Deployment is active";
		case "SUSPENDED":
			return "Deployment is suspended";
		case "ERROR":
			return "Deployment failed";
		default:
			return `Deployment ended as ${status ?? "unknown"}`;
	}
}

/** Injected so the watch is exercised without real time passing. */
export interface DeployDeps {
	listBuilds(componentName: string): Promise<IpaasWorkflowRun[]>;
	getBuild(componentName: string, buildName: string): Promise<IpaasWorkflowRun>;
	getDeployment(
		componentName: string,
		environment: string,
	): Promise<IpaasComponentDeployment | null>;
	deploy(componentName: string, environment: string): Promise<void>;
	sleep(ms: number): Promise<void>;
	now(): number;
	report(message: string): void;
	isCancelled?(): boolean;
}

export interface DeployOptions {
	componentName: string;
	environment: string;
	/** Builds older than this are not this deploy's. Take it before the component is created. */
	startedAt: number;
	pollIntervalMs?: number;
	buildTimeoutMs?: number;
	deployTimeoutMs?: number;
	/** How long to let autoDeploy produce a deployment before asking for one. */
	autoDeployGraceMs?: number;
}

const DEFAULTS = {
	pollIntervalMs: 5_000,
	// A cold Ballerina build pulling dependencies is slow; this bounds the wait
	// rather than describing a normal one.
	buildTimeoutMs: 20 * 60_000,
	deployTimeoutMs: 10 * 60_000,
	autoDeployGraceMs: 20_000,
};

class Cancelled extends Error {}

/**
 * Watch an integration from created to running.
 *
 * Never throws for a platform outcome — a failed build or a failed deployment
 * is a result, not an error. It throws only when the watch itself cannot
 * continue, and returns early when cancelled.
 */
export async function watchDeployment(
	deps: DeployDeps,
	options: DeployOptions,
): Promise<DeployOutcome> {
	const pollIntervalMs = options.pollIntervalMs ?? DEFAULTS.pollIntervalMs;
	const buildTimeoutMs = options.buildTimeoutMs ?? DEFAULTS.buildTimeoutMs;
	const deployTimeoutMs = options.deployTimeoutMs ?? DEFAULTS.deployTimeoutMs;
	const autoDeployGraceMs =
		options.autoDeployGraceMs ?? DEFAULTS.autoDeployGraceMs;

	const checkCancelled = () => {
		if (deps.isCancelled?.()) {
			throw new Cancelled();
		}
	};

	try {
		// --- build -----------------------------------------------------------
		deps.report("Waiting for the build to start...");
		const buildDeadline = deps.now() + buildTimeoutMs;
		let build: IpaasWorkflowRun | undefined;
		let lastBuildStatus: string | undefined;

		while (deps.now() < buildDeadline) {
			checkCancelled();
			// The run is re-resolved from the list until it is identified,
			// because a trigger does not name the run it starts.
			if (!build?.name) {
				build = newestRunSince(
					await deps.listBuilds(options.componentName),
					options.startedAt,
				);
				if (build?.name) {
					deps.report(`Building (${build.name})...`);
				}
			} else {
				build = await deps.getBuild(options.componentName, build.name);
			}

			const status = build?.status;
			if (status && status !== lastBuildStatus) {
				lastBuildStatus = status;
				deps.report(`Build ${status.toLowerCase()}...`);
			}
			if (isBuildTerminal(status)) {
				break;
			}
			await deps.sleep(pollIntervalMs);
		}

		if (!isBuildTerminal(lastBuildStatus)) {
			return {
				ok: false,
				stage: "building",
				status: lastBuildStatus ?? "unknown",
				buildName: build?.name,
				message: build?.name
					? `Timed out waiting for build ${build.name}. It may still be running — check the integration in the console.`
					: "Timed out waiting for a build to start. The integration was created but has not built.",
			};
		}
		if (!isBuildSuccess(lastBuildStatus)) {
			return {
				ok: false,
				stage: "building",
				status: lastBuildStatus,
				buildName: build?.name,
				message: `${describeOutcome("building", lastBuildStatus)}. Open the build logs in the console to see why.`,
			};
		}

		// --- deployment ------------------------------------------------------
		// autoDeploy may already be acting on the successful build. Asking for a
		// deployment as well would snapshot a second release for the same build,
		// so wait briefly and only ask if nothing appears.
		deps.report("Build succeeded. Waiting for deployment...");
		const graceDeadline = deps.now() + autoDeployGraceMs;
		let deployment: IpaasComponentDeployment | null = null;
		while (deps.now() < graceDeadline) {
			checkCancelled();
			deployment = await deps.getDeployment(
				options.componentName,
				options.environment,
			);
			if (deployment) {
				break;
			}
			await deps.sleep(pollIntervalMs);
		}

		if (!deployment) {
			deps.report("Deploying...");
			await deps.deploy(options.componentName, options.environment);
		}

		const deployDeadline = deps.now() + deployTimeoutMs;
		let lastDeployStatus: string | undefined = deployment?.deploymentStatusV2;
		let releaseId = deployment?.releaseId;

		while (deps.now() < deployDeadline) {
			checkCancelled();
			deployment = await deps.getDeployment(
				options.componentName,
				options.environment,
			);
			releaseId = deployment?.releaseId ?? releaseId;
			const status = deployment?.deploymentStatusV2;
			if (status && status !== lastDeployStatus) {
				lastDeployStatus = status;
				deps.report(`Deployment ${status.toLowerCase()}...`);
			}
			if (isDeploymentTerminal(status)) {
				break;
			}
			await deps.sleep(pollIntervalMs);
		}

		if (!isDeploymentTerminal(lastDeployStatus)) {
			return {
				ok: false,
				stage: "deploying",
				status: lastDeployStatus ?? "unknown",
				buildName: build?.name,
				releaseId,
				message:
					"Timed out waiting for the deployment to settle. It may still be converging — check the console.",
			};
		}

		return {
			ok: isDeploymentSuccess(lastDeployStatus),
			stage: "deploying",
			status: lastDeployStatus,
			buildName: build?.name,
			releaseId,
			message: describeOutcome("deploying", lastDeployStatus),
		};
	} catch (err) {
		if (err instanceof Cancelled) {
			return {
				ok: false,
				stage: "building",
				status: "cancelled",
				message:
					"Stopped watching. The build and deployment continue on the platform.",
			};
		}
		throw err;
	}
}
