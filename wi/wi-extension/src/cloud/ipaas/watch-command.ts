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
 * Binds the deployment watch to the editor: a cancellable progress
 * notification, the output channel, and the platform client.
 */

import type { ComponentKind } from "@wso2/wso2-platform-core";
import { ProgressLocation, window } from "vscode";
import { ext } from "../../extensionVariables";
import type { IpaasRpcClient } from "./client";
import { type DeployOutcome, watchDeployment } from "./deploy";

/**
 * The environment to deploy into.
 *
 * Environments are organization-scoped and ordered, and the first is the one
 * the platform itself deploys to when nothing selects one — so this matches
 * what the console shows first and what a prebuilt integration would get.
 */
export async function firstEnvironment(
	client: IpaasRpcClient,
): Promise<string> {
	const environments = await client.getEnvs({} as never);
	if (environments.length === 0) {
		throw new Error("The organization has no environments to deploy into.");
	}
	return environments[0].name;
}

/**
 * Watch one created integration through build and deployment, reporting into a
 * cancellable notification. Cancelling stops the watch, not the deployment.
 */
export async function watchCreatedIntegration(
	client: IpaasRpcClient,
	component: ComponentKind,
	startedAt: number,
): Promise<DeployOutcome> {
	const componentName = component.metadata.handler || component.metadata.name;
	const label = component.metadata.displayName || componentName;
	const environment = await firstEnvironment(client);

	return window.withProgress(
		{
			title: `Deploying ${label} to ${environment}`,
			location: ProgressLocation.Notification,
			cancellable: true,
		},
		async (progress, token) => {
			const outcome = await watchDeployment(
				{
					listBuilds: (name) => client.listBuilds(name),
					getBuild: (name, buildName) => client.getBuild(name, buildName),
					getDeployment: (name, env) => client.getDeployment(name, env),
					deploy: (name, env) => client.deploy(name, env),
					sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
					now: () => Date.now(),
					report: (message) => {
						progress.report({ message });
						ext.log(`[${componentName}] ${message}`);
					},
					isCancelled: () => token.isCancellationRequested,
				},
				{ componentName, environment, startedAt },
			);

			ext.log(`[${componentName}] ${outcome.message}`);
			return outcome;
		},
	);
}

/** Surface the outcome, keeping the failure path a notification the user can act on. */
export function reportOutcome(label: string, outcome: DeployOutcome): void {
	if (outcome.ok) {
		window.showInformationMessage(`${label}: ${outcome.message}.`);
		return;
	}
	if (outcome.status === "cancelled") {
		window.showInformationMessage(`${label}: ${outcome.message}`);
		return;
	}
	window.showWarningMessage(`${label}: ${outcome.message}`);
}
