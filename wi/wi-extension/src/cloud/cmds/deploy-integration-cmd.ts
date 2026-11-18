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
import { type Project, buildConsoleUrl, buildSucceeded, parseGitHubRepoUrl } from "@wso2/wso2-cloud-client";
import { parseGitURL } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, Uri, commands, env, window, workspace } from "vscode";
import { ext } from "../../extensionVariables";
import { isSubpath } from "../../utils/pathUtils";
import { CloudWsManager } from "../../ws-managers/cloud/ws-manager";
import { linkContext, localContextEntry, unlinkContext } from "../context-file";
import { type GitHubRepoAccess, connectGitHub, githubRepoAccess, installGitHubApp } from "../github-app";
import { describeCloudError, handleCloudError } from "../platform/error-handler";
import { contextStore, waitForContextStoreToLoad } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import {
	assignUniqueNames,
	deployRemote,
	deploySourceRoot,
	integrationNames,
	isIntegrationNameTaken,
	isPlatformReady,
	pickBranch,
	requireSession,
	resolveDeployProject,
} from "./cmd-utils";
import {
	type Release,
	confirmAnotherIntegration,
	deployBuild,
	hasIntegrationForDirs,
	localProjectDisplayName,
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

// The deploy command's first steps, without its prompts or writes: the linked project (or the one a local context entry names) and unique names.
async function getDeployContext(req: WICloudDeployContextReq): Promise<WICloudDeployContext> {
	isPlatformReady(ext);
	await ext.cloudReady;
	const integrations = req.integrations.map((item) => ({ ...item }));
	if (!signedIn()) {
		return { signedIn: false, projects: [], integrations };
	}
	await waitForContextStoreToLoad();
	const selected = contextStore.getState().state.selected?.project;
	const local = !selected && req.workspaceDir ? localContextEntry(req.workspaceDir) : undefined;
	const projects = await listProjects();
	const linked = selected ?? (local && projects.find((project) => project.id === local.project || project.handler === local.project));
	if (linked) {
		const existing = await ext.clients.platform.cloud.components.list(linked.id);
		dataCacheStore.getState().setIntegrations(ext.authProvider!.org!.handle, linked.id, existing);
		assignUniqueNames(existing, integrations);
	}
	return {
		signedIn: true,
		linkedProject: linked && { id: linked.id, name: linked.name },
		suggestedProjectName: local && !linked && req.workspaceDir ? localProjectDisplayName(req.workspaceDir, local.project) : undefined,
		projects: projects.map((project) => ({ id: project.id, name: project.name })),
		integrations,
	};
}

const NO_ACCESS: GitHubRepoAccess = { retrievedRepos: false, isAccessible: false, branches: [] };

type SourceReq = Pick<WICloudInspectSourceReq, "workspaceDir" | "gitRemote">;

// The GitHub account of the repository a deploy from `workspaceDir` builds from, as the check reads it.
async function sourceOwner(req?: SourceReq): Promise<string | undefined> {
	const gitData = req?.workspaceDir ? await new CloudWsManager().getLocalGitData(req.workspaceDir) : undefined;
	const remote = deployRemote(gitData, req?.gitRemote);
	return remote ? parseGitHubRepoUrl(remote)?.owner : undefined;
}

// The same reads the deploy form makes for its repository section, judged by the same rules.
async function inspectSource(req: WICloudInspectSourceReq): Promise<WICloudInspectSourceResp> {
	isPlatformReady(ext);
	await ext.cloudReady;
	if (!signedIn()) {
		const readiness = { message: "Sign in to WSO2 Cloud to check the repository.", tone: "info" as const, blocking: true };
		return { remotes: [], gitRemote: null, gitProvider: null, branches: [], branch: null, readiness };
	}
	const ws = new CloudWsManager();
	const gitData = (await ws.getLocalGitData(req.workspaceDir)) ?? null;
	const remotes = gitData?.remotes ?? [];
	const gitRemote = deployRemote(gitData, req.gitRemote);
	const gitProvider = (gitRemote && parseGitURL(gitRemote)?.[2]) || null;
	const github = gitRemote && gitProvider ? parseGitHubRepoUrl(gitRemote) : undefined;
	const repoAccess = gitRemote && gitProvider ? await (github ? githubRepoAccess(github.owner, github.repo) : NO_ACCESS) : undefined;
	const branches = repoAccess?.branches ?? [];
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
		const displayName = req.integration.displayName.trim();
		const nameError = validateIntegrationDisplayName(displayName);
		if (nameError) {
			throw new Error(nameError);
		}
		requireWithinWorkspace(req.integration.fsPath);
		const ws = new CloudWsManager();
		// Checked before a new project is created, so a request that cannot deploy leaves none behind.
		const gitRoot = await deploySourceRoot(req, await ws.getLocalGitData(req.workspaceDir), () => ws.getBranches({ repoUrl: req.gitRemote }));
		await waitForContextStoreToLoad();
		const org = session.org;
		const project = await resolveDeployProject(req.project, await listProjects());
		const projectRef = { id: project.id, name: project.name };
		const existing = await ext.clients.platform.cloud.components.list(project.id);
		dataCacheStore.getState().setIntegrations(org.handle, project.id, existing);
		if (await hasIntegrationForDirs(org.handle, project.id, existing, gitRoot, [req.integration.fsPath])) {
			if (!(await confirmAnotherIntegration(org.handle, project, gitRoot))) {
				return { outcome: "linkedExisting", project: projectRef };
			}
		}
		if (isIntegrationNameTaken(integrationNames(existing), displayName)) {
			throw new Error(`The project ${project.name} already has an integration named ${displayName}.`);
		}
		// The local entry names a project to create; the project this deploy uses replaces it.
		const local = localContextEntry(req.workspaceDir);
		if (local) {
			unlinkContext([req.workspaceDir], local);
		}
		linkContext(gitRoot, { org: org.handle, project: project.id });
		contextStore.getState().refreshState();
		const result = await submitCreateComponentHandler({
			org: { id: org.id, uuid: org.uuid, handle: org.handle, name: org.name },
			project,
			workspaceFsPath: req.workspaceDir,
			quiet: req.quiet,
			createParams: [
				{
					componentDir: req.integration.fsPath,
					displayName,
					name: displayName,
					integrationType: req.integration.integrationType,
					modelConfig: req.integration.modelConfig,
					mcpConfig: req.integration.mcpConfig,
					autoInstrumentation: req.integration.autoInstrumentation,
					buildPackLang: req.buildPackLang,
					repoUrl: req.gitRemote,
					branch: req.branch,
					gitProvider: parseGitURL(req.gitRemote)?.[2] ?? "",
				},
			],
		});
		return { outcome: "submitted", project: projectRef, ...result };
	} catch (err) {
		ext.logError("Failed to deploy integration", err as Error);
		return { outcome: "failed", message: failureMessage(err, "Failed to deploy the integration", req.quiet) };
	}
}

// A quiet caller shows the returned message itself, so it is not also shown here.
const failureMessage = (err: unknown, fallback: string, quiet?: boolean) => (quiet ? describeCloudError(err, fallback) : handleCloudError(err, fallback));

// Returns once the platform accepts the deploy; unless the caller is quiet, the rollout is followed in a notification.
async function deployLatestBuild({ integrationId, projectId, quiet }: WICloudDeployBuildReq): Promise<WICloudDeployBuildResp> {
	try {
		isPlatformReady(ext);
		const builds = await ext.clients.platform.cloud.builds.list(integrationId, projectId);
		const buildName = builds.find(buildSucceeded)?.name;
		if (!buildName) {
			throw new Error("The integration has no successful build to deploy.");
		}
		const release = await deployBuild(integrationId, buildName, projectId, () => undefined);
		if (!quiet) {
			void followRelease(integrationId, projectId, release);
		}
		return { success: true };
	} catch (err) {
		ext.logError("Failed to deploy the build", err as Error);
		return { success: false, message: failureMessage(err, "Failed to deploy the build", quiet) };
	}
}

async function followRelease(integrationId: string, projectId: string, release: Release): Promise<void> {
	const controller = new AbortController();
	try {
		await window.withProgress({ location: ProgressLocation.Notification, title: `${integrationId} in WSO2 Cloud`, cancellable: true }, (progress, token) => {
			token.onCancellationRequested(() => controller.abort());
			return waitForRelease(integrationId, projectId, release, controller.signal, (message) => progress.report({ message }));
		});
		window.showInformationMessage(`Deployed ${integrationId} to ${release.target.name}.`);
	} catch (err) {
		if (controller.signal.aborted) {
			ext.log(`Stopped following the deployment of ${integrationId}`);
			return;
		}
		ext.logError(`The deployment of ${integrationId} did not roll out`, err as Error);
		const url = buildConsoleUrl(ext.config.consoleUrl, { orgHandle: ext.authProvider?.org?.handle, project: projectId, integration: integrationId });
		window.showErrorMessage(`${integrationId}: ${(err as Error).message}`, "View in Console").then((choice) => {
			if (choice) {
				void env.openExternal(Uri.parse(url));
			}
		});
	}
}

export function deployIntegrationCommands(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICloudDeployCommands.GetDeployContext, getDeployContext),
		commands.registerCommand(WICloudDeployCommands.InspectSource, inspectSource),
		commands.registerCommand(WICloudDeployCommands.Deploy, deploy),
		commands.registerCommand(WICloudDeployCommands.DeployBuild, deployLatestBuild),
		commands.registerCommand(WICloudDeployCommands.ConnectGitHub, async (req?: SourceReq) => connectGitHub(await sourceOwner(req))),
		commands.registerCommand(WICloudDeployCommands.InstallGitHubApp, async (req?: SourceReq) => installGitHubApp(await sourceOwner(req))),
	);
}
