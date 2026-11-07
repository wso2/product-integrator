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

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import type { Component, ComponentRepository, Project } from "@wso2/wso2-cloud-client";
import { DevantScopes, type ICmdParamsBase, WICommandIds, parseGitURL } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, type QuickPickItem, QuickPickItemKind, Uri, commands, window } from "vscode";
import { BridgeLayer } from "../../BridgeLayer";
import { ext } from "../../extensionVariables";
import { createDirectory, getDefaultCreationPath, openDirectory } from "../../utils/pathUtils";
import { initGit } from "../git/main";
import { handleCloudError } from "../platform/error-handler";
import { repositorySubPathOf, repositoryUrlOf } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import { isPlatformReady, requireSession, selectProject, setExtensionName } from "./cmd-utils";
import { updateContextFile } from "./create-directory-context-cmd";

/** The parameters the clone command takes, in the platform's shapes. */
export interface ICloneIntegrationCmdParams extends ICmdParamsBase {
	project?: Project;
	component?: Component;
	repository?: ComponentRepository;
	componentName?: string;
	technology?: string;
	integrationType?: string;
	integrationDisplayType?: string;
	integrationOnly?: boolean;
}

/**
 * Error thrown when a user cancels an operation.
 * This is used to distinguish user-initiated cancellations from actual errors.
 */
class UserCancellationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UserCancellationError";
	}
}

interface CloneCandidate {
	integration: Component;
	repository: ComponentRepository;
	repoUrl: string;
}

export function cloneRepoCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.CloneProject, async (params: ICloneIntegrationCmdParams) => {
			setExtensionName(params?.extName);
			try {
				isPlatformReady(ext);
				const session = await requireSession("clone project repository");
				if (!session) {
					return;
				}
				const orgHandle = session.org.handle;
				const cloud = ext.clients.platform.cloud;
				const selectedProject =
					params?.project ?? (await selectProject(`Loading projects from '${session.org.name}'`, `Select the project from '${session.org.name}', that needs to be cloned`));

				BridgeLayer.notifyCloneProgress("selecting_folder");
				const cloneDir = await window.showOpenDialog({
					canSelectFolders: true,
					canSelectFiles: false,
					canSelectMany: false,
					title: "Select a folder to clone the project repository",
					defaultUri: Uri.file(getDefaultCreationPath()),
				});
				if (cloneDir === undefined || cloneDir.length === 0) {
					throw new UserCancellationError("Directory selection was cancelled");
				}
				const selectedCloneDir = cloneDir[0];

				BridgeLayer.notifyCloneProgress("fetching_components");
				let integrations: Component[];
				if (params?.component) {
					integrations = [params.component];
				} else {
					integrations = await window.withProgress(
						{ title: `Fetching ${ext.terminologies?.componentTermPlural} of project ${selectedProject.name}...`, location: ProgressLocation.Notification },
						() => cloud.components.list(selectedProject.id),
					);
					dataCacheStore.getState().setIntegrations(orgHandle, selectedProject.id, integrations);
				}

				// The listing carries no repository; read each (cached) to know what to clone.
				const candidates: CloneCandidate[] = [];
				for (const integration of integrations) {
					if (params?.componentName && integration.id !== params.componentName && integration.name !== params.componentName) {
						continue;
					}
					let repository = params?.component?.id === integration.id ? params?.repository : undefined;
					repository ??= dataCacheStore.getState().getRepository(orgHandle, selectedProject.id, integration.id);
					if (!repository) {
						try {
							repository = await cloud.components.repository(integration.id, selectedProject.id);
							dataCacheStore.getState().setRepository(orgHandle, selectedProject.id, integration.id, repository);
						} catch {
							continue;
						}
					}
					const repoUrl = repositoryUrlOf(repository);
					if (repoUrl) {
						candidates.push({ integration, repository, repoUrl });
					}
				}
				const repoSet = new Set(candidates.map((c) => c.repoUrl));

				let chosen: CloneCandidate[] = candidates;
				if (repoSet.size > 1) {
					BridgeLayer.notifyCloneProgress("selecting_component");
					const componentItems: (QuickPickItem & { item?: CloneCandidate })[] = candidates.map((item) => ({
						label: item.integration.displayName || item.integration.name,
						detail: `Repository: ${item.repoUrl}`,
						item,
					}));
					const quickPickOptions: (QuickPickItem & { item?: CloneCandidate })[] = params?.integrationOnly
						? componentItems
						: [
								{ label: "Clone entire project", detail: "Clone all the repositories associated with the selected project", picked: true },
								{ kind: QuickPickItemKind.Separator, label: `Clone ${ext.terminologies?.articleComponentTerm} of the project` },
								...componentItems,
							];
					const componentTermPlural = ext.terminologies?.componentTermPlural ?? "integrations";
					const articleComponentTerm = ext.terminologies?.articleComponentTerm ?? "an integration";
					const selection = await window.showQuickPick(quickPickOptions, {
						title: params?.integrationOnly ? "Select an integration or library to open" : "Select an option",
						placeHolder: params?.integrationOnly
							? `This project contains ${componentTermPlural} across multiple repositories. Select which ${articleComponentTerm} you'd like to clone and open.`
							: undefined,
					});
					if (selection?.label === "Clone entire project") {
						// keep every candidate
					} else if (selection?.item) {
						chosen = [selection.item];
					} else {
						throw new UserCancellationError(`${ext.terminologies?.componentTerm || "Component"} selection was cancelled`);
					}
				}
				const chosenRepos = Array.from(new Set(chosen.map((c) => c.repoUrl)));

				BridgeLayer.notifyCloneProgress("cloning");
				if (chosenRepos.length === 1) {
					const candidate = chosen.find((c) => c.repoUrl === chosenRepos[0])!;
					const branch = candidate.repository.branch;
					const subPath = repositorySubPathOf(candidate.repository);

					if (params?.component?.isPrebuilt) {
						// For prebuilt integrations, clone only the subpath that holds the integration's source.
						const clonedPath = await cloneRepoSubpathOnly(selectedCloneDir.fsPath, candidate.repoUrl, branch, subPath, [".wso2", ".choreo", ".git"]);
						// Remembered until the cloned directory is opened, when it moves to workspace state.
						await ext.context.globalState.update("SOURCE_COMPONENT_ID", params.component.id);
						updateContextFile(clonedPath, selectedProject);
						await openClonedDirectory(clonedPath);
						return;
					}
					const clonedResp = await cloneRepositoryWithProgress(selectedCloneDir.fsPath, [{ branch, repoUrl: candidate.repoUrl }]);
					updateContextFile(clonedResp[0].clonedPath, selectedProject);
					const subDirFullPath = join(clonedResp[0].clonedPath, subPath);
					if (params?.technology === "ballerina") {
						await ensureBallerinaFilesIfEmpty({
							orgHandle,
							project: selectedProject,
							componentName: params?.componentName || "bal-integration",
							directoryPath: subDirFullPath,
							integrationDisplayType: params?.integrationDisplayType || DevantScopes.ANY,
						});
					} else if (params?.technology === "mi" || params?.technology === "microintegrator") {
						await ensureMIFilesIfEmpty(params?.componentName || "mi-integration", subDirFullPath, params?.integrationDisplayType || DevantScopes.ANY);
					}
					await openClonedDirectory(subDirFullPath);
				} else if (chosenRepos.length > 1) {
					const { dirPath: projectDirPath } = createDirectory(selectedCloneDir.fsPath, selectedProject.name);
					await cloneRepositoryWithProgress(
						projectDirPath,
						chosenRepos.map((repoUrl) => ({ repoUrl, branch: chosen.find((c) => c.repoUrl === repoUrl)?.repository.branch })),
					);
					await openClonedDirectory(projectDirPath);
				} else {
					await ensureBallerinaFilesIfEmpty({ orgHandle, project: selectedProject, directoryPath: selectedCloneDir.fsPath });
					updateContextFile(selectedCloneDir.fsPath, selectedProject);
					await openClonedDirectory(selectedCloneDir.fsPath);
				}
			} catch (err) {
				if (err instanceof UserCancellationError) {
					throw err;
				}
				ext.logError("Failed to clone project", err as Error);
				handleCloudError(err, "Failed to clone project");
			}
		}),
	);
}

async function ensureBallerinaFilesIfEmpty(params: { orgHandle: string; project?: Project; componentName?: string; directoryPath: string; integrationDisplayType?: string }): Promise<void> {
	const createBalFiles = (directoryPath: string, integrationDisplayType = "") => {
		if (params.componentName) {
			writeFileSync(
				join(directoryPath, "Ballerina.toml"),
				`[package]\norg = "${params.orgHandle}"\nname = "${params.componentName.replace(/ /g, "_").replace(/-/g, "_")}"\nversion = "0.1.0"`,
				"utf8",
			);
		} else {
			writeFileSync(join(directoryPath, "Ballerina.toml"), `[workspace]\ntitle = "${params?.project?.name || "Project"}"\npackages = []`, "utf8");
		}
		const scopeVal = integrationDisplayType.toLowerCase().replace(/ /g, "-").replace(/\+/g, "-");
		if (!existsSync(join(directoryPath, ".vscode"))) {
			mkdirSync(join(directoryPath, ".vscode"));
		}
		const settingsPath = join(directoryPath, ".vscode", "settings.json");
		const settings: Record<string, unknown> = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
		if (scopeVal) {
			settings["ballerina.scope"] = scopeVal;
		}
		settings["ballerina.isBI"] = true;
		writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
	};

	try {
		const files = readdirSync(params.directoryPath);
		if (!files.some((file) => file.toLowerCase() === "ballerina.toml")) {
			createBalFiles(params.directoryPath, params.integrationDisplayType);
		}
	} catch (err: any) {
		if (err.code === "ENOENT") {
			try {
				mkdirSync(params.directoryPath, { recursive: true });
				createBalFiles(params.directoryPath, params.integrationDisplayType);
			} catch (mkdirError) {
				console.error("Error creating directory or files:", mkdirError);
			}
		} else {
			console.error("Error checking or creating files:", err);
		}
	}
}

async function ensureMIFilesIfEmpty(name: string, directoryPath: string, integrationDisplayType: string): Promise<void> {
	const createMiFiles = async () => {
		const scopeVal = integrationDisplayType.toLowerCase().replace(/ /g, "-").replace(/\+/g, "-");
		await commands.executeCommand("MI.project-explorer.create-project", { name: name.replace(/-/g, "_").replace(/ /g, "_"), path: directoryPath, scope: scopeVal });
	};
	try {
		const files = readdirSync(directoryPath);
		if (!files.some((file) => file.toLowerCase() === "pom.xml")) {
			await createMiFiles();
		}
	} catch (err: any) {
		if (err.code === "ENOENT") {
			try {
				mkdirSync(directoryPath, { recursive: true });
				await createMiFiles();
			} catch (mkdirError) {
				console.error("Error creating directory or files:", mkdirError);
			}
		} else {
			console.error("Error checking or creating files:", err);
		}
	}
}

/**
 * Clones a repo into a temp directory, copies only the specified subpath
 * into the target directory, and cleans up the temp directory.
 */
async function cloneRepoSubpathOnly(targetDir: string, repoUrl: string, branch: string | undefined, subPath: string, ignoredDirs: string[] = []): Promise<string> {
	const tempDir = mkdtempSync(join(tmpdir(), "wi-clone-"));
	try {
		const clonedResp = await cloneRepositoryWithProgress(tempDir, [{ branch, repoUrl }], targetDir);
		const sourcePath = join(clonedResp[0].clonedPath, subPath);
		cpSync(sourcePath, targetDir, { recursive: true, filter: (src) => !ignoredDirs.includes(basename(src)) });
		return targetDir;
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

const cloneRepositoryWithProgress = async (parentPath: string, repos: { branch?: string; repoUrl?: string }[], displayPath?: string): Promise<{ clonedPath: string; gitUrl: string }[]> => {
	return await window.withProgress(
		{ title: `Cloning repository into ${displayPath || parentPath}.`, location: ProgressLocation.Notification, cancellable: true },
		async (progress, cancellationToken) => {
			const clonedRepos: { clonedPath: string; gitUrl: string }[] = [];
			for (const { branch, repoUrl } of repos) {
				const parsedRepo = parseGitURL(repoUrl ?? "");
				if (!parsedRepo) {
					throw new Error("Failed to parse selected Git URL");
				}
				const git = await initGit(ext.context);
				if (!git) {
					throw new Error("Git was not initialized.");
				}
				const gitUrl = repoUrl!.endsWith(".git") ? repoUrl! : `${repoUrl}.git`;
				const clonedPath = await git.clone(
					gitUrl,
					{
						recursive: true,
						ref: branch,
						parentPath,
						progress: {
							report: ({ increment, ...rest }: { increment: number }) =>
								progress.report({ increment: increment / repos.length, message: `Cloning ${parsedRepo[0]}/${parsedRepo[1]} repository into selected directory`, ...rest }),
						},
					},
					cancellationToken,
				);
				clonedRepos.push({ clonedPath, gitUrl });
			}
			return clonedRepos;
		},
	);
};

async function openClonedDirectory(openingPath: string) {
	openDirectory(openingPath, "Where do you want to open the cloned repository workspace?");
}
