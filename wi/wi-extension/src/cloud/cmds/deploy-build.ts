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

import {
	type Build,
	type CreatedComponent,
	type Environment,
	type Project,
	buildConsoleUrl,
	buildInProgress,
	buildSucceeded,
	isCloudError,
	poll,
} from "@wso2/wso2-cloud-client";
import { ProgressLocation, Uri, env, window } from "vscode";
import { ext } from "../../extensionVariables";

/**
 * The Choreo CLI created every integration with auto build on commit and auto deploy on
 * build switched on, so a deploy from the editor ended in a running integration. The
 * platform keeps those as the component's own switches, set here after the create. It
 * refuses auto deploy for some runtimes (Ballerina: "deploy builds from the Deploy page"),
 * so the first build is followed from here and, when the platform will not deploy it,
 * deployed to the pipeline's entry environment by the extension.
 */
export async function enableBuildAutomation(created: CreatedComponent, orgHandle: string, project: Project, quiet?: boolean): Promise<void> {
	const cloud = ext.clients.platform.cloud;
	try {
		await cloud.components.setAutoBuild(created.id, true, project.id);
		ext.log(`Turned auto build on for ${created.id}`);
	} catch (error) {
		ext.log(`Could not turn auto build on for ${created.id}: ${(error as Error).message}`);
	}
	let platformDeploys = false;
	try {
		await cloud.components.setAutoDeploy(created.id, true, project.id);
		platformDeploys = true;
		ext.log(`Turned auto deploy on for ${created.id}`);
	} catch (error) {
		ext.log(`The platform will not auto deploy ${created.id} (${(error as Error).message}); the first build is deployed from here instead`);
	}
	if (created.sourceBindingError) {
		ext.log(`No build can start for ${created.id} until its source binding is fixed (${created.sourceBindingError})`);
		return;
	}
	// Not awaited: the create command returns while the build runs.
	void followFirstBuild(created, orgHandle, project, !platformDeploys, quiet);
}

/** How long the platform's own first build is given to show up before one is started here. */
const FIRST_BUILD_APPEAR_MS = 45_000;
const BUILD_LIST_INTERVAL_MS = 5_000;
/**
 * Pauses between build triggers the platform refuses as unavailable. Its 502 means the
 * component's source binding could not be read, which happens for a while after the
 * create, so the pauses grow to about four minutes in all.
 */
const BUILD_TRIGGER_BACKOFF_MS = [10_000, 20_000, 30_000, 45_000, 60_000, 60_000];

const sleep = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		const timer = setTimeout(done, ms);
		function done() {
			clearTimeout(timer);
			signal.removeEventListener("abort", done);
			resolve();
		}
		signal.addEventListener("abort", done, { once: true });
	});

/** The newest build of the integration, waiting a while for the platform to start the first. */
async function findFirstBuild(integrationId: string, projectName: string, signal: AbortSignal, waitMs: number): Promise<Build | undefined> {
	const cloud = ext.clients.platform.cloud;
	try {
		return await poll(
			async () => {
				const builds = await cloud.builds.list(integrationId, projectName);
				return { done: builds.length > 0, value: builds[0] as Build | undefined };
			},
			{ timeoutMs: waitMs, intervalMs: BUILD_LIST_INTERVAL_MS, signal, describe: () => `The first build of ${integrationId}` },
		);
	} catch (error) {
		if (isCloudError(error) && error.code === "timeout" && error.details.reason === "wait_timeout") {
			return undefined;
		}
		throw error;
	}
}

/** Starts a build, retrying while the platform's git integration is unavailable. */
async function startFirstBuild(integrationId: string, projectName: string, signal: AbortSignal): Promise<void> {
	const cloud = ext.clients.platform.cloud;
	for (let attempt = 1; ; attempt++) {
		try {
			await cloud.builds.trigger(integrationId, { projectName });
			ext.log(`Started the first build of ${integrationId}, since the platform had not`);
			return;
		} catch (error) {
			const pause = BUILD_TRIGGER_BACKOFF_MS[attempt - 1];
			const retryable = isCloudError(error) && error.code === "unavailable" && pause !== undefined && !signal.aborted;
			ext.log(
				`Could not start the first build of ${integrationId} (attempt ${attempt}): ${(error as Error).message}${retryable ? `; retrying in ${pause / 1000} s` : ""}`,
			);
			if (!retryable) {
				throw error;
			}
			await sleep(pause, signal);
			if (signal.aborted) {
				throw error;
			}
		}
	}
}

async function entryEnvironment(projectName: string): Promise<Environment> {
	const cloud = ext.clients.platform.cloud;
	const { entry } = await cloud.pipelines.ofProject(projectName);
	if (entry) {
		return cloud.environments.resolve(entry);
	}
	// Without a pipeline entry, the first build goes to the first non-production environment, never to production.
	const first = (await cloud.environments.list()).find((environment) => !environment.critical);
	if (!first) {
		throw new Error("The organization has no non-production environment to deploy the first build to.");
	}
	return first;
}

export interface Release {
	target: Environment;
	releaseId?: string;
}

/**
 * The required configurables of the integration's build that have no value in `environment`, by name.
 * The platform does not report them: a deployment without them stays in progress.
 */
async function missingConfigurations(integrationId: string, environment: Environment, projectName: string): Promise<string[]> {
	try {
		const { jsonSchema, configurations } = await ext.clients.platform.cloud.config.getConfigSchema(integrationId, environment.id, projectName);
		const set = new Set((configurations ?? []).filter((item) => item.isSet || item.values.some((value) => value.value)).map((item) => item.key));
		const missing = requiredConfigurables(jsonSchema).filter((key) => !set.has(key));
		ext.log(`Required configurations of ${integrationId} in ${environment.name}: ${missing.length ? `missing ${missing.join(", ")}` : "all set"}`);
		return missing;
	} catch (error) {
		ext.log(`Could not check the configurations of ${integrationId} in ${environment.name}: ${(error as Error).message}`);
		return [];
	}
}

/**
 * The keys (`org.module.name`) of the configurables a base64 Ballerina config schema marks required:
 * the `required` lists at its `requiredLevel`, counted from 1 at the root, which is a module's level.
 */
export function requiredConfigurables(jsonSchema: string): string[] {
	if (!jsonSchema) {
		return [];
	}
	const schema = JSON.parse(Buffer.from(jsonSchema, "base64").toString("utf8"));
	const level: number = typeof schema.requiredLevel === "number" ? schema.requiredLevel : 3;
	const walk = (node: SchemaNode | undefined, path: string[]): string[] =>
		path.length === level - 1
			? (node?.required ?? []).map((name) => [...path, name].join("."))
			: Object.entries(node?.properties ?? {}).flatMap(([name, child]) => walk(child, [...path, name]));
	return walk(schema, []);
}

interface SchemaNode {
	properties?: Record<string, SchemaNode>;
	required?: string[];
}

/** Deploys a built image to the project's entry environment, unless required configurations are not set there. */
export async function deployBuild(integrationId: string, buildName: string, projectName: string, report: (message: string) => void): Promise<Release> {
	const target = await entryEnvironment(projectName);
	const missing = await missingConfigurations(integrationId, target, projectName);
	if (missing.length > 0) {
		const names = missing.map((key) => key.slice(key.lastIndexOf(".") + 1)).join(", ");
		throw new Error(`Required configurations are not set in ${target.name}: ${names}. Set them in the console, then deploy.`);
	}
	report(`deploying to ${target.name}`);
	const { releaseId, observed } = await ext.clients.platform.cloud.deployments.deploy(integrationId, {
		environment: target.id,
		imageId: buildName,
		projectName,
		allowAnyEnvironment: true,
	});
	ext.log(
		`Deploying build ${buildName} of ${integrationId} to ${target.name}${releaseId ? ` as release ${releaseId}` : ""}${
			observed ? " (the gateway lost the platform's answer; the deployment was found by reading the environment)" : ""
		}`,
	);
	return { target, releaseId: releaseId || undefined };
}

export async function waitForRelease(integrationId: string, projectName: string, { target, releaseId }: Release, signal: AbortSignal, report: (message: string) => void) {
	await ext.clients.platform.cloud.deployments.waitForRollout(integrationId, target.id, {
		releaseId,
		projectName,
		signal,
		onProgress: (current) => report(`deploying to ${target.name}: ${current?.deploymentStatusV2 ?? "starting"}`),
	});
}

/**
 * Follows the first build in a progress notification and, when asked, deploys it to the
 * pipeline's entry environment. Every outcome ends in a message with a link to the console.
 */
async function followFirstBuild(created: CreatedComponent, orgHandle: string, project: Project, deployAfter: boolean, quiet?: boolean): Promise<void> {
	const cloud = ext.clients.platform.cloud;
	const label = created.displayName || created.id;
	const consoleUrl = buildConsoleUrl(ext.config.consoleUrl, { orgHandle, project: project.id, integration: created.id });
	const tell = (message: string, level: "info" | "warning" | "error") => {
		if (quiet && level === "info") {
			ext.log(message);
			return;
		}
		const show = level === "info" ? window.showInformationMessage : level === "warning" ? window.showWarningMessage : window.showErrorMessage;
		show(message, "View in console").then((resp) => {
			if (resp === "View in console") {
				void env.openExternal(Uri.parse(consoleUrl));
			}
		});
	};
	const controller = new AbortController();
	const signal = controller.signal;
	try {
		const location = quiet ? ProgressLocation.Window : ProgressLocation.Notification;
		await window.withProgress({ location, title: `${label} in WSO2 Cloud`, cancellable: !quiet }, async (progress, token) => {
			token.onCancellationRequested(() => controller.abort());
			progress.report({ message: "waiting for the first build to start" });
			let build = await findFirstBuild(created.id, project.id, signal, FIRST_BUILD_APPEAR_MS);
			if (!build) {
				progress.report({ message: "starting the first build" });
				await startFirstBuild(created.id, project.id, signal);
				build = await findFirstBuild(created.id, project.id, signal, FIRST_BUILD_APPEAR_MS);
				if (!build) {
					throw new Error("The build was accepted but has not appeared in the build list.");
				}
			}
			const buildName = build.name as string;
			build = await poll(
				async () => {
					const current = await cloud.builds.get(created.id, buildName, project.id);
					progress.report({ message: `build ${buildName}: ${current.status ?? "running"}` });
					return { done: !buildInProgress(current.status), value: current };
				},
				{ signal, describe: () => `The first build of ${label}` },
			);
			if (!buildSucceeded(build)) {
				tell(`The first build of ${label} finished as ${build.status ?? "unknown"}.`, "error");
				return;
			}
			if (!deployAfter) {
				tell(`${label} is built; WSO2 Cloud deploys it automatically.`, "info");
				return;
			}
			const report = (message: string) => progress.report({ message });
			const release = await deployBuild(created.id, buildName, project.id, report);
			await waitForRelease(created.id, project.id, release, signal, report);
			tell(`Deployed ${label} to ${release.target.name}.`, "info");
		});
	} catch (error) {
		if (signal.aborted) {
			ext.log(`Stopped following the first build of ${created.id}`);
			return;
		}
		ext.logError(`The first build of ${created.id} could not be followed to a deployment`, error as Error);
		tell(`${label}: ${(error as Error).message}`, "warning");
	}
}
