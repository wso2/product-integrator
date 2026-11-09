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

import { existsSync, readFileSync } from "fs";
import * as os from "os";
import * as path from "path";
import type { WICloudCreateIntegrationParam, WICloudSubmitComponentsReq, WICloudSubmitComponentsResp } from "@wso2/wi-core";
import {
	type Build,
	type Component,
	type CreatedComponent,
	type Environment,
	type Project,
	RESOURCE_NAME,
	buildConsoleUrl,
	buildInProgress,
	buildSucceeded,
	integrationTypeFromScope,
	integrationTypeLabel,
	isCloudError,
	parseGitHubRepoUrl,
	poll,
	runtimeForBuildPack,
} from "@wso2/wso2-cloud-client";
import { DevantScopes, GitProvider, type ICreateNewIntegrationCmdParams, WICommandIds, parseGitURL } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, Uri, commands, env, window, workspace } from "vscode";
import { ext } from "../../extensionVariables";
import { ProjectType, StateMachine } from "../../stateMachine";
import { isSamePath, isSubpath } from "../../utils/pathUtils";
import { openCloudFormWebview } from "../../ws-managers/cloud/ws-manager";
import { linkContext, localContextEntry, readContextEntries, writeContextEntries } from "../context-file";
import type { Repository } from "../git/git";
import { initGit } from "../git/main";
import { getGitRemotes, getGitRoot, relativePath } from "../git/util";
import { handleCloudError } from "../platform/error-handler";
import { contextStore, repositorySubPathOf, repositoryUrlOf, waitForContextStoreToLoad } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import { isPlatformReady, requireSession, selectProjectWithCreateNew, setExtensionName, toProjectName, toResourceName } from "./cmd-utils";

/**
 * Source component ids already acted on. Clearing `SOURCE_COMPONENT_ID` from workspace state cannot
 * clear the environment variable the cloud editor injects, so a consumed id would otherwise be
 * re-resolved by every later deploy in the same session.
 */
const consumedSourceCompIds = new Set<string>();

const allIntegrationTypes = [
	DevantScopes.AUTOMATION,
	DevantScopes.AI_AGENT,
	DevantScopes.INTEGRATION_AS_API,
	DevantScopes.EVENT_INTEGRATION,
	DevantScopes.FILE_INTEGRATION,
	DevantScopes.MCP,
	DevantScopes.WORKFLOW,
];

export function createNewComponentCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.CreateNewComponent, async (params: ICreateNewIntegrationCmdParams) => {
			try {
				isPlatformReady(ext);
				const session = await requireSession("Deploy Integration");
				if (!session) {
					return;
				}
				const orgHandle = session.org.handle;
				const cloud = ext.clients.platform.cloud;
				await waitForContextStoreToLoad();
				let selectedProject = contextStore.getState().state.selected?.project;

				if (params?.workspaceDir && !selectedProject) {
					selectedProject = await createProjectFromLocalMetadata(params.workspaceDir);
				}
				if (!selectedProject) {
					selectedProject = (await selectProjectWithCreateNew(`Loading projects from '${session.org.name}'`, `Select the project from '${session.org.name}', to deploy the integration in`)).selectedProject;
				}

				// A directory passed without its integration types offers them all, as a directory picked here does.
				const integrations = (params?.integrations || []).map((item) =>
					item.supportedIntegrationTypes?.length ? item : { ...item, supportedIntegrationTypes: allIntegrationTypes },
				);
				let workspaceDir = params?.workspaceDir;
				let buildPackLang = params?.buildPackLang;
				if (!buildPackLang) {
					if (StateMachine.getContext().projectType === ProjectType.BI_BALLERINA) {
						buildPackLang = "ballerina";
					} else if (StateMachine.getContext().projectType === ProjectType.MI) {
						buildPackLang = "microintegrator";
					} else {
						throw new Error("Please ensure that you are within a valid Ballerina or MI project to deploy an integration in the cloud");
					}
				}
				if (ext.isDevantCloudEditor && params?.integrations?.length > 1) {
					throw new Error("Workspace deployments are not yet supported in the cloud editor. Please select individual integration to deploy.");
				}

				if (!params?.workspaceDir || integrations.length === 0) {
					let defaultUri: Uri;
					if (workspace.workspaceFile && workspace.workspaceFile.scheme !== "untitled") {
						defaultUri = workspace.workspaceFile;
					} else if (workspace.workspaceFolders && workspace.workspaceFolders?.length > 0) {
						defaultUri = workspace.workspaceFolders[0].uri;
					} else {
						defaultUri = Uri.file(os.homedir());
					}
					const supPathUri = await window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, title: "Select integration directory", defaultUri });
					if (!supPathUri || supPathUri.length === 0) {
						throw new Error("Integration directory selection is required");
					}
					for (const item of supPathUri) {
						integrations.push({ fsPath: item.fsPath, name: path.basename(item.fsPath), supportedIntegrationTypes: allIntegrationTypes });
					}
					workspaceDir = workspace.workspaceFolders?.find((folder) => isSubpath(folder.uri.fsPath, supPathUri[0].fsPath))?.uri.fsPath;
				}

				const existing = await window.withProgress(
					{ title: `Fetching integrations of cloud project ${selectedProject.name}...`, location: ProgressLocation.Notification },
					() => cloud.components.list(selectedProject!.id),
				);
				dataCacheStore.getState().setIntegrations(orgHandle, selectedProject.id, existing);

				let gitRoot: string | undefined;
				let isGitInitialized = false;
				try {
					gitRoot = await getGitRoot(context, workspaceDir!);
					isGitInitialized = !!gitRoot;
				} catch {
					// not a git repository
				}

				// Is there already an integration for one of the selected directories?
				let integrationAlreadyExists = false;
				if (gitRoot) {
					const remotes = await getGitRemotes(ext.context, gitRoot);
					for (const integration of existing) {
						let repository = dataCacheStore.getState().getRepository(orgHandle, selectedProject.id, integration.id);
						if (!repository) {
							repository = await cloud.components.repository(integration.id, selectedProject.id).catch((): undefined => undefined);
							if (repository) {
								dataCacheStore.getState().setRepository(orgHandle, selectedProject.id, integration.id, repository);
							}
						}
						const parsedRepoUrl = parseGitURL(repositoryUrlOf(repository) ?? "");
						if (!parsedRepoUrl) {
							continue;
						}
						const [repoOrg, repoName, repoProvider] = parsedRepoUrl;
						const hasMatchingRemote = remotes.some((remote) => {
							const parsed = parseGitURL(remote.fetchUrl);
							return !!parsed && parsed[0] === repoOrg && parsed[1] === repoName && parsed[2] === repoProvider;
						});
						if (hasMatchingRemote) {
							const subPathDir = path.join(gitRoot, repositorySubPathOf(repository));
							if (integrations.some((item) => isSamePath(subPathDir, item.fsPath))) {
								integrationAlreadyExists = true;
								break;
							}
						}
					}
				}
				if (integrationAlreadyExists && gitRoot) {
					const resp = await window.showInformationMessage(
						`An integration for the selected directory already exists within your project (${selectedProject.name}). Do you want to proceed and create another integration?`,
						{ modal: true },
						"Proceed",
					);
					if (resp !== "Proceed") {
						linkContext(gitRoot, { org: orgHandle, project: selectedProject.id });
						contextStore.getState().refreshState();
						return;
					}
				}

				const isWithinWorkspace = workspace.workspaceFolders?.some((item) => integrations.every((int) => isSubpath(item.uri?.fsPath, int.fsPath)));
				const taken = new Set(existing.flatMap((c) => [c.id.toLowerCase(), c.name.toLowerCase(), (c.displayName ?? "").toLowerCase()]));
				for (const integration of integrations) {
					const baseName = integration?.name || path.basename(integration.fsPath);
					let candidate = baseName;
					let counter = 1;
					while (taken.has(candidate.toLowerCase())) {
						candidate = `${baseName}-${counter++}`;
					}
					integration.name = candidate;
					taken.add(candidate.toLowerCase());
				}

				if (isWithinWorkspace || workspace.workspaceFile) {
					if (gitRoot || params?.workspaceDir) {
						linkContext((gitRoot || params?.workspaceDir)!, { org: orgHandle, project: selectedProject.id });
						contextStore.getState().refreshState();
					}
					openCloudFormWebview({
						org: { id: session.org.id, uuid: session.org.uuid, handle: session.org.handle, name: session.org.name },
						project: selectedProject,
						workspaceFsPath: workspaceDir!,
						isNewCodeServerComp: !isGitInitialized && ext.isDevantCloudEditor,
						buildPackLang: buildPackLang!,
						integrations,
					});
				} else {
					throw new Error("Selected directory is outside of the workspace. Please select a directory within the workspace to create the integration.");
				}
			} catch (err) {
				ext.logError("Failed to deploy integration", err as Error);
				handleCloudError(err, "Failed to deploy the integration");
			}
		}),
	);
}

/** The https clone URL the platform builds from, for whatever remote form git reported. */
export function normalizeCloneUrl(repoUrl: string): string {
	const parsed = parseGitURL(repoUrl);
	if (parsed) {
		const [org, repo, provider] = parsed;
		if (provider === GitProvider.GITHUB) {
			return `https://github.com/${org}/${repo}.git`;
		}
		if (provider === GitProvider.BITBUCKET) {
			return `https://bitbucket.org/${org}/${repo}.git`;
		}
	}
	const trimmed = repoUrl.trim();
	const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(trimmed);
	if (ssh) {
		return `https://${ssh[1]}/${ssh[2]}.git`;
	}
	return trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`;
}

export const submitCreateComponentHandler = async ({ createParams, org, project, workspaceFsPath }: WICloudSubmitComponentsReq): Promise<WICloudSubmitComponentsResp> => {
	const totalCount = createParams.length;
	const result: WICloudSubmitComponentsResp = { created: [], failed: [], total: totalCount };
	const cloud = ext.clients.platform.cloud;
	// The platform acts for the signed-in organization; a form opened for another one is not submitted to it.
	if (ext.authProvider?.org?.handle !== org.handle) {
		throw new Error(`This form was opened for the organization ${org.name}, which is no longer the one signed in. Open the deployment form again.`);
	}

	const newGit = await initGit(ext.context);
	const gitRoot = await newGit?.getRepositoryRoot(workspaceFsPath).catch((): undefined => undefined);
	if (!gitRoot) {
		throw new Error(`${workspaceFsPath} is not inside a git repository. Initialize one, push it to GitHub, then deploy from it.`);
	}
	const dotGit = await newGit?.getRepositoryDotGit(workspaceFsPath);
	const repo = newGit?.open(gitRoot, dotGit);

	// The clone and prebuilt flows persist the source component in workspace state, while the cloud
	// editor only injects it into the environment; both are consulted.
	const stateCompId: string | null | undefined = ext.context.workspaceState.get("SOURCE_COMPONENT_ID");
	const envCompId = consumedSourceCompIds.has(process.env.SOURCE_COMPONENT_ID ?? "") ? undefined : process.env.SOURCE_COMPONENT_ID;
	const workspaceCompId = stateCompId || envCompId;
	ext.log(`Resolving source component: workspaceState='${stateCompId ?? ""}', env='${envCompId ?? ""}', resolved='${workspaceCompId ?? ""}', cloudEditor=${ext.isDevantCloudEditor}, cloudEnv=${ext.cloudEnv}`);
	if (workspaceCompId) {
		let component = dataCacheStore.getState().getIntegrations(org.handle, project.id).find((c) => c.id === workspaceCompId);
		if (!component) {
			try {
				component = await window.withProgress({ title: "Checking integration type...", location: ProgressLocation.Notification }, () => cloud.components.find(workspaceCompId, project.id));
			} catch (err) {
				ext.logError(`Failed to resolve the source integration ${workspaceCompId}`, err as Error);
				return {
					created: [],
					failed: createParams.map((item) => ({ name: item.displayName || item.name, error: `Could not read the linked integration: ${(err as Error).message}. Nothing was deployed, please retry.` })),
					total: totalCount,
				};
			}
		}
		if (component?.isPrebuilt) {
			// A prebuilt integration gets this repository as its source instead of a new integration being created.
			return await attachSourceToExistingIntegration(workspaceCompId, component, org.handle, project, createParams[0], workspaceFsPath, gitRoot, "Updating prebuilt integration repository...");
		}
		if (component?.componentType === "mcpServer") {
			// An MCP server created from an existing API has no source; attaching one turns it into a server built from source.
			const hasRepository = await cloud.components
				.repository(component.id, project.id)
				.then(() => true)
				.catch((error) => !(isCloudError(error) && error.code === "not_found"));
			if (!hasRepository) {
				return await attachSourceToExistingIntegration(workspaceCompId, component, org.handle, project, createParams[0], workspaceFsPath, gitRoot, "Attaching sources to MCP server...");
			}
		}
	}

	await checkSubscription();
	await checkIfSourcePushedToRemoteRepo(createParams, gitRoot);

	await window.withProgress(
		{
			title: totalCount === 1 ? `Creating integration '${createParams[0].displayName || createParams[0].name}'... ` : `Creating ${totalCount} integrations... `,
			location: ProgressLocation.Notification,
			cancellable: false,
		},
		async (progress) => {
			for (let i = 0; i < totalCount; i++) {
				const createParam = createParams[i];
				const label = createParam.displayName || createParam.name;
				if (totalCount > 1) {
					progress.report({ message: `(${i + 1}/${totalCount}) ${label}`, increment: 100 / totalCount });
				}
				try {
					const type = integrationTypeFromScope(createParam.integrationType);
					if (!type) {
						throw new Error(`${integrationTypeLabel(createParam.integrationType) || createParam.integrationType} integrations cannot be deployed to WSO2 Cloud yet.`);
					}
					const name = toResourceName(createParam.name);
					if (!RESOURCE_NAME.test(name)) {
						throw new Error(`${createParam.name} is not a name the platform accepts.`);
					}
					const appPath = relativePath(gitRoot, createParam.componentDir).replace(/\\/g, "/");
					const created = await cloud.components.create({
						projectName: project.id,
						name,
						displayName: createParam.displayName,
						type,
						runtime: runtimeForBuildPack(createParam.buildPackLang),
						repo: { url: normalizeCloneUrl(createParam.repoUrl), branch: createParam.branch, appPath: appPath && appPath !== "." ? appPath : undefined },
					});
					// Auto build and auto deploy are the component's own switches, set after the create
					// (enableBuildAutomation), where the platform's refusal of auto deploy is seen.

					result.created.push(created);
					await enableBuildAutomation(created, org.handle, project);
					const cache = dataCacheStore.getState().getIntegrations(org.handle, project.id);
					dataCacheStore.getState().setIntegrations(org.handle, project.id, [created, ...cache]);
					if (repo) {
						await updateCodeServerWithCreatedComp(created, repo, project);
					}
				} catch (error) {
					const errorMessage = isCloudError(error) ? error.message : error instanceof Error ? error.message : String(error);
					result.failed.push({ name: label, error: errorMessage });
					ext.logError(`Failed to create ${ext.terminologies?.componentTerm} ${label}:`, error as Error);
					if (isCloudError(error) && error.code === "plan_limit") {
						handleCloudError(error, errorMessage);
						break;
					}
				}
			}
		},
	);

	if (result.created.length > 0) {
		clearCodeServerLocalStorage();
		markCodeServerDeployed();
		if (gitRoot) {
			linkContext(gitRoot, { org: org.handle, project: project.id });
		}
		contextStore.getState().refreshState();

		const successMessage =
			result.failed.length === 0
				? result.created.length === 1
					? "Successfully created integration in the cloud"
					: "Successfully created multiple integrations in the cloud"
				: `Successfully created ${result.created.length} of ${totalCount} integrations in the cloud`;
		const isWithinWorkspace = workspace.workspaceFolders?.some((item) => isSubpath(item.uri?.fsPath, workspaceFsPath));
		if (workspace.workspaceFile) {
			window.showErrorMessage("Please make sure newly created integrations are added to workspace.");
		} else if (isWithinWorkspace) {
			showViewInConsoleMessage(successMessage, org.handle, project, result.created);
		} else {
			showReloadWorkspaceMessage(successMessage, workspaceFsPath);
		}
	}
	if (result.failed.length > 0) {
		window.showErrorMessage(`Failed to create the following integrations: ${result.failed.map((item) => item.name).join(", ")}`);
	}
	return result;
};

/**
 * The platform enforces the plan on create (a 402), so this only warns early
 * when the organization has no active subscription at all.
 */
const checkSubscription = async () => {
	const uuid = ext.authProvider?.org?.uuid;
	if (!uuid) {
		return;
	}
	try {
		const subscriptions = await ext.clients.platform.cloud.orgs.subscriptions(uuid);
		if (subscriptions.length === 0) {
			ext.log("The organization has no subscription recorded; the platform decides on create");
		}
	} catch (error) {
		ext.log(`Could not read the organization's subscription: ${(error as Error).message}`);
	}
};

const checkIfSourcePushedToRemoteRepo = async (createParams: WICloudCreateIntegrationParam[], gitRoot: string) => {
	if (ext.isDevantCloudEditor) {
		return; // the editor pushed the changes itself
	}
	await window.withProgress({ title: "Verifying source in remote repo", location: ProgressLocation.Notification, cancellable: false }, async (progress) => {
		for (let i = 0; i < createParams.length; i++) {
			const createParam = createParams[i];
			if (createParams.length > 1) {
				progress.report({ message: `(${i + 1}/${createParams.length}) ${createParam.displayName || createParam.name}`, increment: 100 / createParams.length });
			}
			const github = parseGitHubRepoUrl(createParam.repoUrl);
			if (!github) {
				continue; // the platform reads public GitHub repositories only
			}
			const subPathDir = relativePath(gitRoot, createParam.componentDir).replace(/\\/g, "/");
			const inspection = await ext.clients.platform.cloud.repos.inspect(github.owner, github.repo, createParam.branch, subPathDir === "." ? "" : subPathDir);
			if (subPathDir && subPathDir !== ".") {
				if (!inspection.isSubPathValid || inspection.isSubPathEmpty) {
					throw new Error(`The selected directory ${subPathDir} appears to be empty or invalid in the remote repository. Please push your changes and try again.`);
				}
			} else if (inspection.isBareRepo) {
				throw new Error("The selected repository appears to be empty. Please push your changes to the remote repository and try again.");
			}
		}
	});
};

/**
 * The Choreo CLI created every integration with auto build on commit and auto deploy on
 * build switched on, so a deploy from the editor ended in a running integration. The
 * platform keeps those as the component's own switches, set here after the create. It
 * refuses auto deploy for some runtimes (Ballerina: "deploy builds from the Deploy page"),
 * so the first build is followed from here and, when the platform will not deploy it,
 * deployed to the pipeline's entry environment by the extension.
 */
async function enableBuildAutomation(created: CreatedComponent, orgHandle: string, project: Project): Promise<void> {
	const cloud = ext.clients.platform.cloud;
	ext.log(
		`Created ${created.id}${created.warning ? `; warning: ${created.warning}` : ""}${created.sourceBindingError ? `; source binding: ${created.sourceBindingError}` : ""}`,
	);
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
	void followFirstBuild(created, orgHandle, project, !platformDeploys);
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

/**
 * Follows the first build in a progress notification and, when asked, deploys it to the
 * pipeline's entry environment. Every outcome ends in a message with a link to the console.
 */
async function followFirstBuild(created: CreatedComponent, orgHandle: string, project: Project, deployAfter: boolean): Promise<void> {
	const cloud = ext.clients.platform.cloud;
	const label = created.displayName || created.id;
	const consoleUrl = buildConsoleUrl(ext.config.consoleUrl, { orgHandle, project: project.id, integration: created.id });
	const tell = (message: string, level: "info" | "warning" | "error") => {
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
		await window.withProgress({ location: ProgressLocation.Notification, title: `${label} in WSO2 Cloud`, cancellable: true }, async (progress, token) => {
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
			const target = await entryEnvironment(project.id);
			progress.report({ message: `deploying to ${target.name}` });
			const { releaseId, observed } = await cloud.deployments.deploy(created.id, {
				environment: target.id,
				imageId: buildName,
				projectName: project.id,
				allowAnyEnvironment: true,
			});
			ext.log(
				`Deploying build ${buildName} of ${created.id} to ${target.name}${releaseId ? ` as release ${releaseId}` : ""}${
					observed ? " (the gateway lost the platform's answer; the deployment was found by reading the environment)" : ""
				}`,
			);
			await cloud.deployments.waitForRollout(created.id, target.id, {
				releaseId: releaseId || undefined,
				projectName: project.id,
				signal,
				onProgress: (current) => progress.report({ message: `deploying to ${target.name}: ${current?.deploymentStatusV2 ?? "starting"}` }),
			});
			tell(`Deployed ${label} to ${target.name}.`, "info");
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

/** Points an existing integration's build at this repository and starts a build. */
async function attachSourceToExistingIntegration(
	integrationId: string,
	integration: Component,
	orgHandle: string,
	project: Project,
	createParam: WICloudCreateIntegrationParam,
	workspaceFsPath: string,
	gitRoot: string,
	title: string,
): Promise<WICloudSubmitComponentsResp> {
	const result: WICloudSubmitComponentsResp = { created: [], failed: [], total: 1 };
	const label = integration.displayName || integration.name;
	const missing = [!gitRoot && "git repository root", !createParam?.repoUrl && "repository URL", !createParam?.branch && "repository branch"].filter((item): item is string => typeof item === "string");
	if (missing.length > 0) {
		const error = `Cannot attach sources to ${label}: missing ${missing.join(", ")}.`;
		ext.logError(error, new Error(error));
		result.failed.push({ name: label, error });
		return result;
	}
	try {
		const cloud = ext.clients.platform.cloud;
		const appPath = relativePath(gitRoot, createParam.componentDir).replace(/\\/g, "/");
		await window.withProgress({ title, location: ProgressLocation.Notification }, async () => {
			await cloud.components.updateBuildParameters(
				integrationId,
				cloud.components.workflowFor(runtimeForBuildPack(createParam.buildPackLang), { url: normalizeCloneUrl(createParam.repoUrl), branch: createParam.branch, appPath: appPath && appPath !== "." ? appPath : undefined }),
				project.id,
			);
			await cloud.builds.trigger(integrationId, { projectName: project.id });
		});
		// The cached repository is the one the integration had; the next refresh reads the new one.
		dataCacheStore.getState().setRepository(orgHandle, project.id, integrationId, undefined);
		result.created.push(integration);
		consumedSourceCompIds.add(integrationId);
		await ext.context.workspaceState.update("SOURCE_COMPONENT_ID", null);
		clearCodeServerLocalStorage();
		linkContext(gitRoot, { org: orgHandle, project: project.id });
		contextStore.getState().refreshState();
		const isWithinWorkspace = workspace.workspaceFolders?.some((item) => isSubpath(item.uri?.fsPath, workspaceFsPath));
		const successMessage = `Successfully attached the sources to ${label}`;
		if (isWithinWorkspace) {
			showViewInConsoleMessage(successMessage, orgHandle, project, result.created);
		} else {
			showReloadWorkspaceMessage(successMessage, workspaceFsPath);
		}
	} catch (err) {
		ext.logError(`Failed to attach the repository to ${label}`, err as Error);
		result.failed.push({ name: label, error: `Failed to attach the repository: ${(err as Error).message}` });
	}
	return result;
}

async function updateCodeServerWithCreatedComp(created: Component, repo: Repository, project: Project): Promise<void> {
	if (!ext.isDevantCloudEditor) {
		return;
	}
	try {
		const head = await repo.getHEAD();
		if (head?.name) {
			const commit = await repo.getCommit(head.name);
			await window.withProgress({ title: "Updating cloud editor with newly created integration...", location: ProgressLocation.Notification }, () =>
				ext.clients.platform.cloud.codeServer.ensure({ projectId: project.id, componentId: created.id, sourceCommitHash: commit.hash }),
			);
		}
	} catch (err) {
		ext.logError("Failed to update the code server after creating the integration", err as Error);
	}
}

const showReloadWorkspaceMessage = (message: string, workspaceFsPath: string) => {
	window.showInformationMessage(`${message} Reload workspace to continue`, { modal: true }, "Continue").then(async (resp) => {
		if (resp === "Continue") {
			commands.executeCommand("vscode.openFolder", Uri.file(workspaceFsPath), { forceNewWindow: false });
		}
	});
};

const showViewInConsoleMessage = (successMessage: string, orgHandle: string, project: Project, created: Component[]) => {
	window.showInformationMessage(successMessage, "View in console").then(async (resp) => {
		if (resp === "View in console") {
			const url = buildConsoleUrl(ext.config.consoleUrl, { orgHandle, project: project.id, integration: created.length === 1 ? created[0].id : undefined });
			void env.openExternal(Uri.parse(url));
		}
	});
};

const clearCodeServerLocalStorage = async () => {
	if (ext.isDevantCloudEditor) {
		try {
			await commands.executeCommand("devantEditor.clearLocalStorage");
		} catch (err) {
			ext.logError(`Failed to execute devantEditor.clearLocalStorage command: ${err}`, err as Error);
		}
	}
};

/** Tells the cloud editor the work in this session was deployed; only the editor build registers the command. */
const markCodeServerDeployed = async () => {
	if (ext.isDevantCloudEditor) {
		try {
			await commands.executeCommand("devantEditor.markDeployed");
		} catch (err) {
			ext.logError(`Failed to execute devantEditor.markDeployed command: ${err}`, err as Error);
		}
	}
};

/** If the context file has an entry marked `local: true`, creates the project it names and clears the mark. */
const createProjectFromLocalMetadata = async (workspacePath: string): Promise<Project | undefined> => {
	try {
		const localEntry = localContextEntry(workspacePath);
		if (!localEntry) {
			return undefined;
		}
		const session = ext.authProvider?.session;
		if (!session) {
			return undefined;
		}
		if (localEntry.org !== session.org.handle) {
			window.showWarningMessage(`The workspace is linked to the organization ${localEntry.org}; you are signed in to ${session.org.handle}. The project is created in ${session.org.handle}.`);
		}
		const cloud = ext.clients.platform.cloud;
		const projects = await window.withProgress({ title: `Fetching cloud projects of organization ${session.org.name}...`, location: ProgressLocation.Notification }, () => cloud.projects.list());
		dataCacheStore.getState().setProjects(session.org.handle, projects);

		const finish = (project: Project) => {
			const entries = readContextEntries(workspacePath).map((entry) => (entry.org === localEntry.org && entry.project === localEntry.project ? { ...entry, org: session.org.handle, project: project.id, local: undefined } : entry));
			writeContextEntries(workspacePath, entries);
			return project;
		};

		const existing = projects.find((project) => project.id === localEntry.project || project.handler === localEntry.project);
		if (existing) {
			return finish(existing);
		}

		// A readable name from Ballerina.toml [workspace].title, else from the handle.
		let displayName: string | undefined;
		const ballerinaTomlPath = path.join(workspacePath, "Ballerina.toml");
		if (existsSync(ballerinaTomlPath)) {
			const titleMatch = readFileSync(ballerinaTomlPath, "utf8").match(/^\[workspace\][^[]*title\s*=\s*"([^"]+)"/ms);
			displayName = titleMatch?.[1];
		}
		displayName ??= localEntry.project
			.split("-")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
		const name = toProjectName(localEntry.project);
		const created = await window.withProgress({ title: `Creating new cloud project ${displayName}...`, location: ProgressLocation.Notification }, () => cloud.projects.create({ name, displayName }));
		dataCacheStore.getState().setProjects(session.org.handle, [...projects, created]);
		return finish(created);
	} catch (err) {
		ext.logError("Failed to create the project from the workspace's context file", err as Error);
		return undefined;
	}
};
