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

import path, { join } from "path";
import type { Component, OpenClonedDirRequest, Project } from "@wso2/wso2-cloud-client";
import { RESOURCE_NAME } from "@wso2/wso2-cloud-client";
import { type ExtensionName, WICommandIds, parseGitURL } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, type ProviderResult, type QuickPickItem, type Uri, commands, window, workspace } from "vscode";
import { BridgeLayer } from "../BridgeLayer";
import { ext } from "../extensionVariables";
import { isSamePath, openDirectory } from "../utils/pathUtils";
import type { ICloneIntegrationCmdParams } from "./cmds/clone-project-cmd";
import { isPlatformReady, requireSession } from "./cmds/cmd-utils";
import { linkContext } from "./context-file";
import { getGitRemotes, getGitRoot } from "./git/util";
import { handleCloudError } from "./platform/error-handler";
import { contextStore, getContextKey, repositorySubPathOf, repositoryUrlOf, waitForContextStoreToLoad } from "./stores/context-store";
import { dataCacheStore } from "./stores/data-cache-store";
import { locationStore } from "./stores/location-store";

/** Only what can be a name or a label goes on from a link into files the clone writes. */
const nameFromLink = (value: string | null, pattern: RegExp): string | undefined => (value && pattern.test(value) ? value : undefined);
const LABEL = /^[A-Za-z0-9 +_-]{1,64}$/;

export function activateURIHandlers(context: ExtensionContext) {
	const handler = window.registerUriHandler({
		handleUri(uri: Uri): ProviderResult<void> {
			ext.log(`Handling URI: ${uri.path}`);
			const receiver = ext.clients?.platform?.uriReceiver;
			if (receiver?.accepts(uri)) {
				// The browser came back from the sign-in; the login flow takes it from here.
				BridgeLayer.notifySignInInitiated();
				if (!receiver.pushUri(uri)) {
					ext.log("A sign-in callback arrived with no sign-in waiting; it is kept for the next one");
				}
				return;
			}
			if (uri.path === "/ghapp") {
				// The GitHub App callback was handled by the CLI; the platform's git integration
				// has no documented route for it yet, so the person is pointed at the console.
				window.showInformationMessage("Finish connecting GitHub in the WSO2 Cloud console, then refresh the repository check here.");
				return;
			}
			if (uri.path === "/open") {
				try {
					isPlatformReady(ext);
					const urlParams = new URLSearchParams(uri.query);
					openClonedDir({
						orgHandle: nameFromLink(urlParams.get("org"), RESOURCE_NAME),
						projectName: nameFromLink(urlParams.get("project"), RESOURCE_NAME) ?? "",
						integrationName: nameFromLink(urlParams.get("component") || urlParams.get("integration"), RESOURCE_NAME),
						technology: nameFromLink(urlParams.get("technology"), LABEL),
						integrationType: nameFromLink(urlParams.get("integrationType"), LABEL),
						integrationDisplayType: nameFromLink(urlParams.get("integrationDisplayType"), LABEL),
					});
				} catch (err: any) {
					console.error("Failed to handle /open uri handler", err);
					window.showErrorMessage(err?.message || "Failed to handle /open uri handler");
				}
			}
		},
	});
	context.subscriptions.push(handler);
}

export const openClonedDir = async (params: OpenClonedDirRequest & { orgHandle?: string }) => {
	if (!params.projectName) {
		return;
	}
	const session = await requireSession("open project");
	if (!session) {
		return;
	}
	if (params.orgHandle && params.orgHandle !== session.org.handle) {
		window
			.showErrorMessage(`This link is for the organization ${params.orgHandle}, and you are signed in to ${session.org.handle}. Sign in to ${params.orgHandle} to open it.`, "Switch organization")
			.then((choice) => {
				if (choice === "Switch organization") {
					commands.executeCommand(WICommandIds.SignIn, { reselectOrganization: true });
				}
			});
		return;
	}
	try {
		const cached = dataCacheStore.getState().getProjects(session.org.handle);
		let project = cached.find((item) => item.id === params.projectName || item.handler === params.projectName);
		if (!project) {
			const projects = await window.withProgress({ title: `Fetching projects of organization ${session.org.name}...`, location: ProgressLocation.Notification }, () =>
				ext.clients.platform.cloud.projects.list(),
			);
			dataCacheStore.getState().setProjects(session.org.handle, projects);
			project = projects.find((item) => item.id === params.projectName || item.handler === params.projectName);
		}
		if (!project) {
			window.showErrorMessage(`Failed to find project ${params.projectName}`);
			return;
		}
		await waitForContextStoreToLoad();
		await cloneOrOpenDir(project, params.integrationName ?? null, params.technology ?? null, params.integrationType ?? null, params.integrationDisplayType ?? null);
	} catch (error) {
		handleCloudError(error, "Failed to open the project");
	}
};

export const cloneOrOpenDir = async (
	project: Project,
	integrationName: string | null,
	technology: string | null,
	integrationType: string | null,
	integrationDisplayType: string | null,
	extName?: ExtensionName,
) => {
	const orgHandle = ext.authProvider?.org?.handle;
	if (!orgHandle) {
		return;
	}
	const cloud = ext.clients.platform.cloud;
	const projectLocations = locationStore.getState().getLocations(project.id, orgHandle);

	if (integrationName) {
		const cache = dataCacheStore.getState().getIntegrations(orgHandle, project.id);
		let integration: Component | undefined = cache.find((item) => item.id === integrationName || item.name === integrationName);
		if (!integration) {
			integration = await window.withProgress({ title: `Fetching ${ext.terminologies?.componentTerm} details...`, location: ProgressLocation.Notification }, () =>
				cloud.components.find(integrationName, project.id),
			);
		}
		if (!integration) {
			window.showErrorMessage(`Failed to find ${ext.terminologies?.componentTerm} matching ${integrationName}`);
			return;
		}
		let repository = dataCacheStore.getState().getRepository(orgHandle, project.id, integration.id);
		if (!repository) {
			try {
				repository = await cloud.components.repository(integration.id, project.id);
				dataCacheStore.getState().setRepository(orgHandle, project.id, integration.id, repository);
			} catch (error) {
				ext.logError(`Failed to read the repository of ${integration.id}`, error as Error);
			}
		}

		const selectedPaths = new Set<string>();
		const subDir = repositorySubPathOf(repository);
		const parsedRepoUrl = parseGitURL(repositoryUrlOf(repository) ?? "");
		if (parsedRepoUrl) {
			const [repoOrg, repoName, repoProvider] = parsedRepoUrl;
			for (const projectLocation of projectLocations) {
				if (projectLocation.integrations.some((item) => item.integration.id === integration?.id)) {
					const gitRoot = await getGitRoot(ext.context, projectLocation.fsPath);
					if (gitRoot) {
						const remotes = await getGitRemotes(ext.context, gitRoot);
						const hasMatchingRemote = remotes.some((remote) => {
							const parsed = parseGitURL(remote.fetchUrl);
							return !!parsed && parsed[0] === repoOrg && parsed[1] === repoName && parsed[2] === repoProvider;
						});
						if (hasMatchingRemote) {
							selectedPaths.add(projectLocation.fsPath);
						}
					}
				}
			}
		}
		if (selectedPaths.size > 0) {
			const selectedPath = await getSelectedPath(Array.from(selectedPaths));
			if (selectedPath) {
				await switchContextAndOpenDir(join(selectedPath, subDir), project, integrationName);
			}
		} else {
			commands.executeCommand(WICommandIds.CloneProject, {
				project,
				componentName: integrationName,
				component: integration,
				repository,
				technology,
				integrationType,
				integrationDisplayType,
				extName,
			} satisfies ICloneIntegrationCmdParams);
		}
	} else if (projectLocations.length > 0) {
		const selectedPath = await getSelectedPath(projectLocations.map((item) => item.fsPath));
		if (selectedPath) {
			await switchContextAndOpenDir(selectedPath, project);
		}
	} else {
		commands.executeCommand(WICommandIds.CloneProject, {
			project,
			componentName: integrationName,
			technology,
			integrationType,
			integrationDisplayType,
		} satisfies ICloneIntegrationCmdParams);
	}
};

const switchContextAndOpenDir = async (selectedPath: string, project: Project, integrationName?: string | null) => {
	const org = ext.authProvider?.org;
	if (!org) {
		window.showErrorMessage("You are not signed in to WSO2 Cloud. Please sign in and try again.");
		return;
	}
	const gitRoot = await getGitRoot(ext.context, selectedPath);
	if (!gitRoot) {
		window.showErrorMessage(`Failed to find Git root of ${selectedPath}`);
		return;
	}
	const contextFilePath = linkContext(gitRoot, { org: org.handle, project: project.id });

	const isWithinWorkspace = workspace.workspaceFolders?.some((item) => isSamePath(item.uri?.fsPath, selectedPath));
	if (isWithinWorkspace) {
		const selected = contextStore.getState().state?.selected;
		if (selected?.orgHandle === org.handle && selected?.projectName === project.id) {
			window.showInformationMessage(`You are already within the ${integrationName ? ext.terminologies?.componentTerm : "project"} directory`);
		} else {
			const matching = contextStore.getState().state.items[getContextKey(org.handle, project)];
			if (matching) {
				contextStore.getState().changeContext(matching);
			} else {
				contextStore.getState().onSetNewContext(project, {
					contextFileFsPath: contextFilePath,
					dirFsPath: selectedPath,
					workspaceName: path.basename(gitRoot),
					projectRootFsPath: path.dirname(path.dirname(contextFilePath)),
				});
			}
			window.showInformationMessage(`Switching to ${project.name} within organization ${org.name}`);
		}
	} else {
		ext.context.globalState.update("open-local-repo", getContextKey(org.handle, project));
		openDirectory(selectedPath, `Where do you want to open the ${integrationName ? ext.terminologies?.componentTerm : "project"} directory ${selectedPath} ?`);
	}
};

const getSelectedPath = async (paths: string[]): Promise<string | undefined | null> => {
	if (paths.length === 0) {
		return null;
	}
	if (paths?.length === 1) {
		return paths[0];
	}
	const items: QuickPickItem[] = paths.map((item) => ({ label: item }));
	const directorySelection = await window.showQuickPick(items, { title: "Multiple directories detected", ignoreFocusOut: true });
	return directorySelection?.label;
};
