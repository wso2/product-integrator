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

import type { WICloudCreateIntegrationParam, WICloudSubmitComponentsReq, WICloudSubmitComponentsResp } from "@wso2/wi-core";
import { PlanLimitError, type Organization } from "@wso2/wso2-cloud-client";
import type { DevantClient } from "@wso2/wso2-cloud-client/devant/vscode";
import { type ComponentKind, type CreateComponentReq, type Project as DevantProject, GitProvider, getTypeOfIntegrationType, makeURLSafe, parseGitURL } from "@wso2/wso2-platform-core";
import { ProgressLocation, Uri, env, window, workspace } from "vscode";
import { ext } from "../../../extensionVariables";
import { isSubpath } from "../../../utils/pathUtils";
import { showReloadWorkspaceMessage, showViewInConsoleMessage } from "../../cmds/create-messages";
import { initGit } from "../../git/main";
import { relativePath } from "../../git/util";
import { contextStore } from "../../stores/context-store";
import { dataCacheStore } from "../../stores/data-cache-store";
import { legacyContextFiles } from "./context-file";
import { toComponent } from "./mapping";

/** How many integrations an organization without a Devant subscription may have. */
const FREE_COMPONENT_LIMIT = 5;
/** Where a prebuilt integration opened for its source is named, by the clone and prebuilt flows. */
const SOURCE_COMPONENT_KEY = "SOURCE_COMPONENT_ID";

export interface DevantCreationDeps {
	client(): DevantClient;
	org(): Organization;
	/** The Devant project of a handle. */
	project(handle: string): Promise<DevantProject>;
	/** Keeps a created component, so the integration calls that follow find it. */
	remember(projectHandle: string, component: ComponentKind): void;
}

/** The legacy create request for one of the form's integrations. */
export function toCreateRequest(param: WICloudCreateIntegrationParam, org: Organization, project: DevantProject): CreateComponentReq {
	const mapped = getTypeOfIntegrationType(param.integrationType);
	return {
		orgId: org.id,
		orgUUID: org.uuid ?? "",
		projectId: project.id,
		projectHandle: project.handler,
		name: makeURLSafe(param.displayName || param.name),
		displayName: param.displayName,
		type: mapped.type ?? "",
		componentSubType: mapped.subType ?? "",
		buildPackLang: param.buildPackLang,
		componentDir: param.componentDir,
		repoUrl: param.repoUrl,
		gitProvider: param.gitProvider,
		gitCredRef: param.gitCredRef ?? "",
		branch: param.branch,
		langVersion: "",
		port: 0,
		spaBuildCommand: "",
		spaNodeVersion: "",
		spaOutputDir: "",
		originCloud: "devant",
	};
}

/** Creates the form's integrations on Devant, as WSO2 Integrator 5.1 did, or gives a prebuilt one this source. */
export async function submitDevantIntegrations(deps: DevantCreationDeps, request: WICloudSubmitComponentsReq): Promise<WICloudSubmitComponentsResp> {
	const { createParams, project, workspaceFsPath } = request;
	const org = deps.org();
	if (org.handle !== request.org.handle) {
		throw new Error(`This form was opened for the organization ${request.org.name}, which is no longer the one signed in. Open the form again.`);
	}
	const result: WICloudSubmitComponentsResp = { created: [], failed: [], total: createParams.length };
	const devantProject = await deps.project(project.id);
	const api = deps.client().api;

	const git = await initGit(ext.context);
	const gitRoot = await git?.getRepositoryRoot(workspaceFsPath).catch((): undefined => undefined);
	if (!gitRoot) {
		throw new Error(`${workspaceFsPath} is not inside a git repository. Initialize one and push it, then create the integration from it.`);
	}

	const sourceComponentId = ext.context.workspaceState.get<string | null>(SOURCE_COMPONENT_KEY);
	if (sourceComponentId) {
		const listed = await api.getComponentList({ orgId: org.id, orgHandle: org.handle, projectId: devantProject.id, projectHandle: devantProject.handler });
		const prebuilt = listed.find((item) => item.metadata.id === sourceComponentId && item.metadata.isPrebuilt);
		if (prebuilt) {
			return attachToPrebuilt(deps, prebuilt, org, devantProject, request, gitRoot);
		}
	}

	await assertWithinFreeLimit(deps.client(), org, createParams.length);
	await assertSourcePushed(deps.client(), org, createParams, gitRoot);

	await window.withProgress(
		{
			title: createParams.length === 1 ? `Creating integration '${createParams[0].displayName || createParams[0].name}'... ` : `Creating ${createParams.length} integrations... `,
			location: ProgressLocation.Notification,
		},
		async (progress) => {
			for (const [index, param] of createParams.entries()) {
				const label = param.displayName || param.name;
				if (createParams.length > 1) {
					progress.report({ message: `(${index + 1}/${createParams.length}) ${label}`, increment: 100 / createParams.length });
				}
				try {
					const created = await api.createComponent(toCreateRequest(param, org, devantProject));
					deps.remember(project.id, created);
					const component = toComponent(created, project.id);
					result.created.push(component);
					const cache = dataCacheStore.getState().getIntegrations(org.handle, project.id);
					dataCacheStore.getState().setIntegrations(org.handle, project.id, [component, ...cache]);
				} catch (error) {
					result.failed.push({ name: label, error: error instanceof Error ? error.message : String(error) });
					ext.logError(`Failed to create the integration ${label} on Devant`, error as Error);
				}
			}
		},
	);

	if (result.created.length > 0) {
		legacyContextFiles.link(gitRoot, { org: org.handle, project: project.id });
		void contextStore.getState().refreshState();
		const message =
			result.failed.length === 0
				? result.created.length === 1
					? "Created the integration in Devant."
					: "Created the integrations in Devant."
				: `Created ${result.created.length} of ${createParams.length} integrations in Devant.`;
		announce(message, org, project, result, workspaceFsPath);
	}
	if (result.failed.length > 0) {
		window.showErrorMessage(`Failed to create the following integrations: ${result.failed.map((item) => item.name).join(", ")}`);
	}
	return result;
}

async function attachToPrebuilt(
	deps: DevantCreationDeps,
	prebuilt: ComponentKind,
	org: Organization,
	devantProject: DevantProject,
	request: WICloudSubmitComponentsReq,
	gitRoot: string,
): Promise<WICloudSubmitComponentsResp> {
	const param = request.createParams[0];
	const result: WICloudSubmitComponentsResp = { created: [], failed: [], total: 1 };
	try {
		await window.withProgress({ title: "Updating prebuilt integration repository...", location: ProgressLocation.Notification }, () =>
			deps.client().api.changePrebuiltIntegrationRepository({
				componentId: prebuilt.metadata.id,
				isPublicRepo: false,
				orgHandler: org.handle,
				orgId: org.id,
				projectId: devantProject.id,
				srcGitRepoUrl: param.repoUrl,
				repositorySubPath: relativePath(request.workspaceFsPath, param.componentDir),
				originCloud: "devant",
				repositoryBranch: param.branch,
				secretRef: param.gitCredRef ?? "",
			}),
		);
		result.created.push(toComponent(prebuilt, request.project.id));
		await ext.context.workspaceState.update(SOURCE_COMPONENT_KEY, null);
		legacyContextFiles.link(gitRoot, { org: org.handle, project: request.project.id });
		void contextStore.getState().refreshState();
		announce("Updated the prebuilt integration with this repository.", org, request.project, result, request.workspaceFsPath);
	} catch (error) {
		ext.logError(`Failed to update the repository of the prebuilt integration ${prebuilt.metadata.name}`, error as Error);
		result.failed.push({ name: prebuilt.metadata.name, error: `Failed to update the prebuilt integration's repository: ${(error as Error).message}` });
	}
	return result;
}

function announce(message: string, org: Organization, project: WICloudSubmitComponentsReq["project"], result: WICloudSubmitComponentsResp, workspaceFsPath: string): void {
	if (workspace.workspaceFile) {
		window.showErrorMessage("Please make sure newly created integrations are added to workspace.");
		showViewInConsoleMessage(message, org.handle, project, result.created);
	} else if (workspace.workspaceFolders?.some((item) => isSubpath(item.uri?.fsPath, workspaceFsPath))) {
		showViewInConsoleMessage(message, org.handle, project, result.created);
	} else {
		showReloadWorkspaceMessage(message, workspaceFsPath);
	}
}

/** An organization without a subscription may have only a few integrations; the editor says so before creating. */
async function assertWithinFreeLimit(client: DevantClient, org: Organization, count: number): Promise<void> {
	const subscriptions = await window.withProgress({ title: "Checking organization subscription...", location: ProgressLocation.Notification }, () =>
		client.api.getSubscriptions({ orgId: org.id, cloudType: "devant" }),
	);
	if (subscriptions?.list?.some((item) => item.subscriptionType === "devant-subscription")) {
		return;
	}
	const usage = await window.withProgress({ title: "Checking integration usage within your organization...", location: ProgressLocation.Notification }, () =>
		client.api.getComponentUsage({ orgId: org.id, orgUuid: org.uuid ?? "", cloudOrigin: "devant" }),
	);
	const remaining = FREE_COMPONENT_LIMIT - (usage?.data?.billableComponentCount ?? 0);
	if (count <= remaining) {
		return;
	}
	const message =
		remaining <= 0
			? "Your organization has reached Devant's free usage limit. Upgrade the subscription to create more integrations."
			: `You can create ${remaining} more integration(s). Upgrade the subscription to create more integrations.`;
	const billingUrl = client.deployment().billingUrl;
	if (billingUrl && org.uuid) {
		void window.showErrorMessage(message, "Upgrade").then((choice) => {
			if (choice === "Upgrade") {
				void env.openExternal(Uri.parse(`${billingUrl}/cloud/devant/upgrade?orgId=${encodeURIComponent(org.uuid ?? "")}`));
			}
		});
	}
	throw new PlanLimitError(message);
}

/** Devant builds from the remote repository: a GitHub path with nothing pushed would give an integration that cannot build. */
async function assertSourcePushed(client: DevantClient, org: Organization, params: WICloudCreateIntegrationParam[], gitRoot: string): Promise<void> {
	await window.withProgress({ title: "Verifying source in remote repo", location: ProgressLocation.Notification }, async () => {
		for (const param of params) {
			const parsed = parseGitURL(param.repoUrl);
			if (!parsed) {
				throw new Error(`Failed to parse git URL: ${param.repoUrl}`);
			}
			const [repoOrg, repoName, provider] = parsed;
			if (provider !== GitProvider.GITHUB) {
				continue;
			}
			const subPath = relativePath(gitRoot, param.componentDir);
			const { metadata } = await client.api.getGitRepoMetadata({
				branch: param.branch,
				gitOrgName: repoOrg,
				gitRepoName: repoName,
				orgId: org.id,
				relativePath: subPath,
				secretRef: param.gitCredRef ?? "",
			});
			if (subPath && subPath !== ".") {
				if (metadata.isSubPathEmpty || !metadata.isSubPathValid) {
					throw new Error(`The directory ${subPath} appears to be empty or missing in the remote repository. Push your changes and try again.`);
				}
			} else if (metadata.isBareRepo) {
				throw new Error("The repository appears to be empty. Push your changes and try again.");
			}
		}
	});
}
