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
import { basename, join } from "path";
import { tmpdir } from "os";
import {
	WICommandIds,
	type ComponentKind,
	DevantScopes,
	type ICloneProjectCmdParams,
	type Organization,
	getComponentKindRepoSource,
	parseGitURL,
	Project,
} from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, type QuickPickItem, QuickPickItemKind, Uri, commands, window } from "vscode";
import { ext } from "../../extensionVariables";
import { BridgeLayer } from "../../BridgeLayer";
import { initGit } from "../git/main";
import { dataCacheStore } from "../stores/data-cache-store";
import { createDirectory, getDefaultCreationPath, openDirectory } from "../../utils/pathUtils";
import { getUserInfoForCmd, isRpcActive, selectOrg, selectProject, setExtensionName } from "./cmd-utils";
import { updateContextFile } from "./create-directory-context-cmd";

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

/**
 * `ICloneProjectCmdParams` plus the `singleIntegration` flag. When
 * set, the clone resolves exactly one integration instead of the whole project.
 */
type CloneProjectCmdParams = ICloneProjectCmdParams & {
	singleIntegration?: boolean;
};

export function cloneRepoCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.CloneProject, async (params: CloneProjectCmdParams) => {
			setExtensionName(params?.extName);
			try {
				isRpcActive(ext);
				const userInfo = await getUserInfoForCmd("clone project repository");
				if (userInfo) {
					const selectedOrg = params?.organization ?? (await selectOrg(userInfo, "Select organization"));

					const selectedProject =
						params?.project ??
						(await selectProject(
							selectedOrg,
							`Loading projects from '${selectedOrg.name}'`,
							`Select the project from '${selectedOrg.name}', that needs to be cloned`,
						));

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
					const projectCache = dataCacheStore.getState().getProjects(selectedOrg.handle);

					BridgeLayer.notifyCloneProgress("fetching_components");
					let components: ComponentKind[] = [];
					if (params?.component) {
						components = [params?.component];
					} else {
						components = await window.withProgress(
							{
								title: `Fetching ${ext.terminologies?.componentTermPlural} of project ${selectedProject.name}...`,
								location: ProgressLocation.Notification,
							},
							() =>
								ext.clients.rpcClient.getComponentList({
									orgId: selectedOrg.id.toString(),
									orgHandle: selectedOrg.handle,
									projectId: selectedProject.id,
									projectHandle: selectedProject.handler,
								}),
						);
					}

					const repoSet = new Set<string>();
					for (const component of components) {
						const repo = getComponentKindRepoSource(component.spec.source).repo;
						if (repo) {
							if (params?.componentName) {
								if (component.metadata.name === params?.componentName) {
									repoSet.add(repo);
								}
							} else {
								repoSet.add(repo);
							}
						}
					}

					// The integration the user chose to open. It drives both the repo to
					// clone and the sub-path to sparse-checkout / open. Pre-set when a
					// caller passes an explicit component (deep links / webview match).
					let selectedComponent: ComponentKind | undefined = params?.component;
					// True when the whole project/workspace should be cloned rather than a
					// single integration (mono-repo escape hatch, or the plain project flow).
					let cloneEntireProject = false;

					// Integrations backed by a repository (only these are openable).
					const repoBackedComponents = components.filter(
						(c) =>
							getComponentKindRepoSource(c.spec.source).repo &&
							(!params?.componentName || c.metadata.name === params?.componentName),
					);
					const componentTermPlural = ext.terminologies?.componentTermPlural ?? "integrations";
					const articleComponentTerm = ext.terminologies?.articleComponentTerm ?? "an integration";

					if (params?.singleIntegration) {
						// Integration-scoped open: resolve exactly one integration. The
						// webview passes an explicit component; this picker is a fallback
						// for direct invocations that don't.
						if (!selectedComponent && repoBackedComponents.length === 1) {
							selectedComponent = repoBackedComponents[0];
						} else if (!selectedComponent && repoBackedComponents.length > 1) {
							BridgeLayer.notifyCloneProgress("selecting_component");
							const componentItems: (QuickPickItem & { item?: ComponentKind })[] =
								repoBackedComponents.map((item) => ({
									label: item.metadata.displayName,
									detail: `Repository: ${getComponentKindRepoSource(item.spec.source).repo}`,
									item,
								}));
							const selection = await window.showQuickPick(componentItems, {
								title: "Select an integration or library to open",
								placeHolder: `Select which ${articleComponentTerm} you'd like to clone and open.`,
							});

							if (selection?.item) {
								selectedComponent = selection.item;
							} else {
								throw new UserCancellationError(
									`${ext.terminologies?.componentTerm || "Component"} selection was cancelled`,
								);
							}
						}
					} else if (repoSet.size > 1) {
						// Existing project-scoped flow: choose only when the project spans
						// multiple repositories.
						BridgeLayer.notifyCloneProgress("selecting_component");
						const componentItems: (QuickPickItem & { item?: ComponentKind })[] = repoBackedComponents.map((item) => ({
							label: item.metadata.name,
							detail: `Repository: ${getComponentKindRepoSource(item.spec.source).repo}`,
							item,
						}));
						const quickPickOptions: (QuickPickItem & { item?: ComponentKind })[] = params?.integrationOnly
							? componentItems
							: [
								{
									label: "Clone entire project",
									detail: "Clone all the repositories associated with the selected project",
									picked: true,
								},
								{ kind: QuickPickItemKind.Separator, label: `Clone ${articleComponentTerm} of the project` },
								...componentItems,
							];
						const selection = await window.showQuickPick(quickPickOptions, {
							title: params?.integrationOnly ? "Select an integration or library to open" : "Select an option",
							placeHolder: params?.integrationOnly
								? `This project contains ${componentTermPlural} across multiple repositories. Select which ${articleComponentTerm} you'd like to clone and open.`
								: undefined,
						});

						if (selection?.label === "Clone entire project") {
							cloneEntireProject = true;
						} else if (selection?.item) {
							selectedComponent = selection.item;
						} else {
							throw new UserCancellationError(
								`${ext.terminologies?.componentTerm || "Component"} selection was cancelled`,
							);
						}
					}

					// Narrow the repo set to the chosen integration's repository unless the
					// user asked for the whole project.
					if (selectedComponent && !cloneEntireProject) {
						const repo = getComponentKindRepoSource(selectedComponent.spec.source).repo;
						if (repo) {
							repoSet.clear();
							repoSet.add(repo);
						}
					}

					BridgeLayer.notifyCloneProgress("cloning");
					let selectedRepoUrl = "";
					if (repoSet.size === 1) {
						[selectedRepoUrl] = repoSet;

						const parsedRepo = parseGitURL(selectedRepoUrl);

						if (!parsedRepo) {
							throw new Error("Failed to parse selected Git URL");
						}

						const userInfo = ext.authProvider?.getState()?.state?.userInfo;
						if (!userInfo) {
							throw new Error("User information is not available. Please ensure you are logged in.");
						}

						const latestDeploymentTrack = selectedComponent?.deploymentTracks?.find((item) => item.latest);

						if (selectedComponent?.metadata?.isPrebuilt) {
							// For prebuilt integrations, we clone only the specific subpath of the repo that contains the component source,
							const subPath = getComponentKindRepoSource(selectedComponent.spec.source)?.path || "";
							const clonedPath = await cloneRepoSubpathOnly(
								selectedCloneDir.fsPath,
								selectedRepoUrl,
								latestDeploymentTrack?.branch,
								subPath,
								[".wso2", ".choreo", ".git"]
							);

							// Store the component in global state after cloning it.
							// When cloned directory is opened, we need to remove it from global state & add it to workspace state
							await ext.context.globalState.update("SOURCE_COMPONENT_ID", selectedComponent.metadata.id);
							updateContextFile(clonedPath, userInfo, selectedProject, selectedOrg, projectCache);
							await openClonedDirectory(clonedPath);
							return;
						}

						// For a single-integration open, check out only that integration's
						// sub-path (mono-repo package or poly-repo sub-directory) via
						// sparse-checkout. Opening the whole project/workspace keeps the full
						// checkout (subDir stays "").
						const subDir = !cloneEntireProject && selectedComponent?.spec?.source
							? getComponentKindRepoSource(selectedComponent.spec.source)?.path || ""
							: "";
						const clonedResp = await cloneRepositoryWithProgress(selectedCloneDir.fsPath, [
							{ branch: latestDeploymentTrack?.branch, repoUrl: selectedRepoUrl, sparsePaths: subDir ? [subDir] : undefined },
						]);

						// set context.yaml
						updateContextFile(clonedResp[0].clonedPath, userInfo, selectedProject, selectedOrg, projectCache);
						const subDirFullPath = join(clonedResp[0].clonedPath, subDir);
						if (params?.technology === "ballerina") {
							await ensureBallerinaFilesIfEmpty({
								org: selectedOrg,
								project: selectedProject,
								componentName: params?.componentName || "bal-integration",
								directoryPath: subDirFullPath,
								integrationDisplayType: params?.integrationDisplayType || DevantScopes.ANY
							});
						} else if (params?.technology === "mi" || params?.technology === "microintegrator") {
							await ensureMIFilesIfEmpty(
								params?.componentName || "mi-integration",
								subDirFullPath,
								params?.integrationDisplayType || DevantScopes.ANY,
							);
						}
						await openClonedDirectory(subDirFullPath);
					} else if (repoSet.size > 1) {
						const parsedRepos = Array.from(repoSet).map((item) => parseGitURL(item));
						if (parsedRepos.some((item) => !item)) {
							throw new Error("Failed to parse selected Git URL");
						}

						const { dirPath: projectDirPath } = createDirectory(selectedCloneDir.fsPath, selectedProject.name);

						await cloneRepositoryWithProgress(
							projectDirPath,
							Array.from(repoSet).map((selectedRepoUrl) => {
								const parsedRepo = parseGitURL(selectedRepoUrl);

								if (!parsedRepo) {
									throw new Error("Failed to parse selected Git URL");
								}

								const matchingComp = components?.find((item) => selectedRepoUrl === getComponentKindRepoSource(item.spec.source).repo);

								const latestDeploymentTrack = matchingComp?.deploymentTracks?.find((item) => item.latest);

								return { branch: latestDeploymentTrack?.branch, repoUrl: selectedRepoUrl };
							}),
						);
						await openClonedDirectory(projectDirPath);
					} else if (repoSet.size === 0) {
						await ensureBallerinaFilesIfEmpty({ org: selectedOrg, project: selectedProject, directoryPath: selectedCloneDir.fsPath })
						updateContextFile(selectedCloneDir.fsPath, userInfo, selectedProject, selectedOrg, projectCache);
						await openClonedDirectory(selectedCloneDir.fsPath);
					}
				}
			} catch (err: any) {
				if (err instanceof UserCancellationError) {
					throw err;
				}
				console.error("Failed to clone project", err);
				window.showErrorMessage(err?.message || "Failed to clone project");
			}
		}),
	);
}

async function ensureBallerinaFilesIfEmpty(params: {
	org: Organization,
	project?: Project,
	componentName?: string,
	directoryPath: string,
	integrationDisplayType?: string,
}): Promise<void> {
	const createBalFiles = (directoryPath: string, integrationDisplayType: string = "") => {
		if (params.componentName) {
			// create individual ballerina integration
			writeFileSync(
				join(directoryPath, "Ballerina.toml"),
				`[package]\norg = "${params.org.handle}"\nname = "${params.componentName.replace(/ /g, "_").replace(/-/g, "_")}"\nversion = "0.1.0"`,
				"utf8",
			);
		} else {
			// create as workspace
			writeFileSync(
				join(directoryPath, "Ballerina.toml"),
				`[workspace]\ntitle = "${params?.project?.name || "Project"}"\npackages = []`,
				"utf8",
			);
		}

		const scopeVal = integrationDisplayType.toLowerCase().replace(/ /g, "-").replace(/\+/g, "-");
		if (!existsSync(join(directoryPath, ".vscode"))) {
			mkdirSync(join(directoryPath, ".vscode"));
		}
		const settingsPath = join(directoryPath, ".vscode", "settings.json");
		if (existsSync(settingsPath)) {
			// add property
			const data = readFileSync(settingsPath, "utf8");
			const settings = JSON.parse(data);
			if (scopeVal) {
				settings["ballerina.scope"] = scopeVal;
			}
			settings["ballerina.isBI"] = true;
			writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
		} else {
			// create new json
			const settingsContent: any = { "ballerina.isBI": true };
			if (scopeVal) {
				settingsContent["ballerina.scope"] = scopeVal;
			}
			writeFileSync(settingsPath, JSON.stringify(settingsContent, null, 2));
		}
	};

	try {
		const files = readdirSync(params?.directoryPath);
		if (!files.some((file) => file.toLowerCase() === "ballerina.toml")) {
			createBalFiles(params.directoryPath, params.integrationDisplayType);
		}
	} catch (err: any) {
		if (err.code === "ENOENT") {
			try {
				mkdirSync(params.directoryPath, { recursive: true });
				createBalFiles(params.directoryPath, params.integrationDisplayType);
			} catch (mkdirError: any) {
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
		await commands.executeCommand("MI.project-explorer.create-project", {
			name: name.replace(/-/g, "_").replace(/ /g, "_"),
			path: directoryPath,
			scope: scopeVal,
		});
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
			} catch (mkdirError: any) {
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
 * This avoids placing the full repo in the target when only a subpath is needed.
 */
async function cloneRepoSubpathOnly(
	targetDir: string,
	repoUrl: string,
	branch: string | undefined,
	subPath: string,
	ignoredDirs: string[] = [],
): Promise<string> {

	const tempDir = mkdtempSync(join(tmpdir(), "wi-clone-"));
	try {
		const clonedResp = await cloneRepositoryWithProgress(tempDir, [{ branch, repoUrl }], targetDir);
		const sourcePath = join(clonedResp[0].clonedPath, subPath);
		cpSync(sourcePath, targetDir, {
			recursive: true,
			filter: (src) => !ignoredDirs.includes(basename(src)),
		});
		return targetDir;
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

const cloneRepositoryWithProgress = async (
	parentPath: string,
	repos: { branch?: string; repoUrl?: string; sparsePaths?: string[] }[],
	displayPath?: string,
): Promise<{ clonedPath: string; gitUrl: string }[]> => {
	return await window.withProgress(
		{
			title: `Cloning repository into ${displayPath || parentPath}.`,
			location: ProgressLocation.Notification,
			cancellable: true,
		},
		async (progress, cancellationToken) => {
			const clonedRepos: { clonedPath: string; gitUrl: string }[] = [];
			for (const { branch, repoUrl, sparsePaths } of repos) {
				const parsedRepo = parseGitURL(repoUrl);
				if (!parsedRepo) {
					throw new Error("Failed to parse selected Git URL");
				}

				const git = await initGit(ext.context);
				if (git) {
					const gitUrl = `${repoUrl}.git`;

					// Sparse-checkout (partial clone + cone mode) checks out only the
					// integration's sub-path. Cone `sparse-checkout set` needs git >= 2.27;
					// on older git we fall back to a full clone (the sub-path is still
					// present, just alongside the rest of the repo).
					const wantSparse =
						!!sparsePaths && sparsePaths.length > 0 && git.compareGitVersionTo("2.27.0") >= 0;

					const clonedPath = await git.clone(
						gitUrl,
						{
							recursive: true,
							ref: branch,
							parentPath,
							filter: wantSparse ? "blob:none" : undefined,
							sparse: wantSparse,
							sparseCheckoutPaths: wantSparse ? sparsePaths : undefined,
							progress: {
								report: ({ increment, ...rest }: { increment: number }) =>
									progress.report({
										increment: increment / repos.length,
										message: `Cloning ${parsedRepo[0]}/${parsedRepo[1]} repository into selected directory`,
										...rest,
									}),
							},
						},
						cancellationToken,
					);
					clonedRepos.push({ clonedPath, gitUrl });
				} else {
					throw new Error("Git was not initialized.");
				}
			}
			return clonedRepos;
		},
	);
};

async function openClonedDirectory(openingPath: string) {
	openDirectory(openingPath, "Where do you want to open the cloned repository workspace?");
}
