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
	WICloudDeployCommands,
	type WICloudDeployBuildReq,
	type WICloudDeployBuildResp,
	type WICloudDeployContext,
	type WICloudDeployContextReq,
	type WICloudDeployReq,
	type WICloudDeployResp,
	type WICloudInspectSourceReq,
	type WICloudInspectSourceResp,
	sourceReadiness,
	validateIntegrationDisplayName,
} from "@wso2/wi-core";
import { type Project, buildConsoleUrl, buildSucceeded } from "@wso2/wso2-cloud-client";
import { parseGitURL } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, Uri, commands, env, window, workspace } from "vscode";
import { ext } from "../../extensionVariables";
import { isSubpath } from "../../utils/pathUtils";
import { CloudWsManager } from "../../ws-managers/cloud/ws-manager";
import { linkContext } from "../context-file";
import { getGitRoot } from "../git/util";
import { handleCloudError } from "../platform/error-handler";
import { contextStore, waitForContextStoreToLoad } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import { createProjectNamed, isPlatformReady, requireSession, validateProjectName } from "./cmd-utils";
import {
	assignUniqueNames,
	confirmAnotherIntegration,
	createProjectFromLocalMetadata,
	deployBuild,
	hasIntegrationForDirs,
	submitCreateComponentHandler,
	waitForRelease,
} from "./create-component-cmd";

const signedIn = () => ext.authProvider?.state?.status === "signed-in" && !!ext.authProvider.org;

async function listProjects(): Promise<Project[]> {
	const org = ext.authProvider!.org!;
	const projects = await ext.clients.platform.cloud.projects.list();
	dataCacheStore.getState().setProjects(org.handle, projects);
	return projects;
}

// The deploy command's first steps, without its prompts: the linked project (or the one a local context entry names) and unique names.
async function getDeployContext(req: WICloudDeployContextReq): Promise<WICloudDeployContext> {
	isPlatformReady(ext);
	await ext.cloudReady;
	const integrations = req.integrations.map((item) => ({ ...item }));
	if (!signedIn()) {
		return { signedIn: false, projects: [], integrations };
	}
	await waitForContextStoreToLoad();
	const linked = contextStore.getState().state.selected?.project ?? (req.workspaceDir ? await createProjectFromLocalMetadata(req.workspaceDir) : undefined);
	const projects = await listProjects();
	if (linked) {
		const existing = await ext.clients.platform.cloud.components.list(linked.id);
		dataCacheStore.getState().setIntegrations(ext.authProvider!.org!.handle, linked.id, existing);
		assignUniqueNames(existing, integrations);
	}
	return {
		signedIn: true,
		linkedProject: linked && { id: linked.id, name: linked.name },
		projects: projects.map((project) => ({ id: project.id, name: project.name })),
		integrations,
	};
}

function pickBranch(branches: string[], ...preferred: (string | undefined | null)[]): string | null {
	return [...preferred, "main", "master"].find((branch) => !!branch && branches.includes(branch)) ?? branches[0] ?? null;
}

// The same reads the deploy form makes for its repository section, judged by the same rules.
async function inspectSource(req: WICloudInspectSourceReq): Promise<WICloudInspectSourceResp> {
	const ws = new CloudWsManager();
	const orgId = ext.authProvider?.org?.id?.toString() ?? "";
	const gitData = (await ws.getLocalGitData(req.workspaceDir)) ?? null;
	const remotes = gitData?.remotes ?? [];
	const gitRemote = (req.gitRemote && remotes.includes(req.gitRemote) ? req.gitRemote : gitData?.upstream?.remoteUrl || remotes[0]) || null;
	const gitProvider = (gitRemote && parseGitURL(gitRemote)?.[2]) || null;
	const target = gitRemote && gitProvider ? { repoUrl: gitRemote, orgId, credRef: "" } : undefined;
	const [repoAccess, branches] = target
		? await Promise.all([ws.isRepoAuthorized(target), ws.getBranches(target).catch((): string[] => [])])
		: [undefined, [] as string[]];
	const branch = pickBranch(branches, req.branch, gitData?.upstream?.name);
	const [configDriftFiles, hasDirtyRepo] = await Promise.all([
		gitRemote && branch ? ws.getConfigFileDrifts({ type: "", repoDir: req.workspaceDir, branch, repoUrl: gitRemote }) : Promise.resolve([] as string[]),
		gitData ? ws.hasDirtyRepo(req.workspaceDir) : Promise.resolve(false),
	]);
	const readiness = sourceReadiness({
		gitData,
		gitRemote,
		gitProvider,
		branch,
		branches,
		branchesLoading: false,
		repoAccess,
		repoAccessLoading: false,
		configDriftFiles,
		hasDirtyRepo,
	});
	return { remotes, gitRemote, gitProvider, branches, branch, readiness };
}

async function resolveProject(choice: WICloudDeployReq["project"]): Promise<Project> {
	const projects = await listProjects();
	if ("id" in choice) {
		const project = projects.find((item) => item.id === choice.id);
		if (!project) {
			throw new Error(`The project ${choice.id} no longer exists in WSO2 Cloud.`);
		}
		return project;
	}
	const error = validateProjectName(choice.newName, projects);
	if (error) {
		throw new Error(error);
	}
	return createProjectNamed(choice.newName);
}

function requireWithinWorkspace(fsPath: string): void {
	const inWorkspace = workspace.workspaceFolders?.some((folder) => isSubpath(folder.uri?.fsPath, fsPath));
	if (!inWorkspace && !workspace.workspaceFile) {
		throw new Error("Selected directory is outside of the workspace. Please select a directory within the workspace to create the integration.");
	}
}

// The deploy command and its form's submit, with the form's answers given by the caller.
async function deploy(req: WICloudDeployReq): Promise<WICloudDeployResp> {
	try {
		isPlatformReady(ext);
		const session = await requireSession("Deploy Integration");
		if (!session) {
			return { outcome: "cancelled" };
		}
		const nameError = validateIntegrationDisplayName(req.integration.displayName);
		if (nameError) {
			throw new Error(nameError);
		}
		requireWithinWorkspace(req.integration.fsPath);
		await waitForContextStoreToLoad();
		const org = session.org;
		const project = await resolveProject(req.project);
		const existing = await ext.clients.platform.cloud.components.list(project.id);
		dataCacheStore.getState().setIntegrations(org.handle, project.id, existing);
		const gitRoot = await getGitRoot(ext.context, req.workspaceDir).catch((): undefined => undefined);
		if (gitRoot && (await hasIntegrationForDirs(org.handle, project.id, existing, gitRoot, [req.integration.fsPath]))) {
			if (!(await confirmAnotherIntegration(org.handle, project, gitRoot))) {
				return { outcome: "linkedExisting" };
			}
		}
		if (gitRoot) {
			linkContext(gitRoot, { org: org.handle, project: project.id });
			contextStore.getState().refreshState();
		}
		const result = await submitCreateComponentHandler({
			org: { id: org.id, uuid: org.uuid, handle: org.handle, name: org.name },
			project,
			workspaceFsPath: req.workspaceDir,
			createParams: [
				{
					componentDir: req.integration.fsPath,
					displayName: req.integration.displayName,
					name: req.integration.displayName,
					integrationType: req.integration.integrationType,
					modelConfig: req.integration.modelConfig,
					mcpConfig: req.integration.mcpConfig,
					buildPackLang: req.buildPackLang,
					repoUrl: req.gitRemote,
					branch: req.branch,
					gitProvider: parseGitURL(req.gitRemote)?.[2] ?? "",
				},
			],
		});
		return { outcome: "submitted", ...result };
	} catch (err) {
		ext.logError("Failed to deploy integration", err as Error);
		return { outcome: "failed", message: handleCloudError(err, "Failed to deploy the integration") };
	}
}

// Returns once the platform accepts the deploy; the rollout is followed in a notification.
async function deployLatestBuild({ integrationId, projectId }: WICloudDeployBuildReq): Promise<WICloudDeployBuildResp> {
	try {
		isPlatformReady(ext);
		const builds = await ext.clients.platform.cloud.builds.list(integrationId, projectId);
		const buildName = builds.find(buildSucceeded)?.name;
		if (!buildName) {
			throw new Error("The integration has no successful build to deploy.");
		}
		const release = await deployBuild(integrationId, buildName, projectId, () => undefined);
		void window
			.withProgress({ location: ProgressLocation.Notification, title: `${integrationId} in WSO2 Cloud` }, (progress) =>
				waitForRelease(integrationId, projectId, release, new AbortController().signal, (message) => progress.report({ message })),
			)
			.then(
				() => window.showInformationMessage(`Deployed ${integrationId} to ${release.target.name}.`),
				(err) => {
					ext.logError(`The deployment of ${integrationId} did not roll out`, err as Error);
					const url = buildConsoleUrl(ext.config.consoleUrl, { orgHandle: ext.authProvider?.org?.handle, project: projectId, integration: integrationId });
					window.showErrorMessage(`${integrationId}: ${(err as Error).message}`, "View in Console").then((choice) => {
						if (choice) {
							void env.openExternal(Uri.parse(url));
						}
					});
				},
			);
		return { success: true };
	} catch (err) {
		ext.logError("Failed to deploy the build", err as Error);
		return { success: false, message: handleCloudError(err, "Failed to deploy the build") };
	}
}

export function deployIntegrationCommands(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICloudDeployCommands.GetDeployContext, getDeployContext),
		commands.registerCommand(WICloudDeployCommands.InspectSource, inspectSource),
		commands.registerCommand(WICloudDeployCommands.Deploy, deploy),
		commands.registerCommand(WICloudDeployCommands.DeployBuild, deployLatestBuild),
	);
}
