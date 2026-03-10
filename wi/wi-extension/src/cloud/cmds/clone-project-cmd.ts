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

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import * as os from "os";
import { join } from "path";
import {
	WICommandIds,
	type ComponentKind,
	DevantScopes,
	type ICloneProjectCmdParams,
	type Organization,
	getComponentKindRepoSource,
	parseGitURL,
} from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, type QuickPickItem, QuickPickItemKind, Uri, commands, window } from "vscode";
import { ext } from "../../extensionVariables";
import { initGit } from "../git/main";
import { dataCacheStore } from "../stores/data-cache-store";
import { createDirectory, openDirectory } from "../../utils/pathUtils";
import { getUserInfoForCmd, isRpcActive, selectOrg, selectProject, setExtensionName } from "./cmd-utils";
import { updateContextFile } from "./create-directory-context-cmd";

export function cloneRepoCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.CloneProject, async (params: ICloneProjectCmdParams) => {
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

					const cloneDir = await window.showOpenDialog({
						canSelectFolders: true,
						canSelectFiles: false,
						canSelectMany: false,
						title: "Select a folder to clone the project repository",
						defaultUri: Uri.file(os.homedir()),
					});

					if (cloneDir === undefined || cloneDir.length === 0) {
						throw new Error("Directory is required in order to clone the repository in");
					}

					const selectedCloneDir = cloneDir[0];
					const projectCache = dataCacheStore.getState().getProjects(selectedOrg.handle);

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

					// clone single or multiple repos
					if (components.length === 0) {
						throw new Error(`No ${ext.terminologies?.componentTermPlural} found within ${selectedProject.name}.`);
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

					if (repoSet.size === 0) {
						throw new Error(`No repos found to link within ${selectedProject.name}.`);
					}

					if (repoSet.size > 1) {
						const quickPickOptions: QuickPickItem[] = [
							{
								label: "Clone entire project",
								detail: "Clone all the repositories associated with the selected project",
								picked: true,
							},
							{ kind: QuickPickItemKind.Separator, label: `Clone ${ext.terminologies?.articleComponentTerm} of the project` },
							...components.map((item) => ({
								label: item.metadata.name,
								detail: `Repository: ${getComponentKindRepoSource(item.spec.source).repo}`,
								item,
							})),
						];
						const selection = await window.showQuickPick(quickPickOptions, {
							title: "Select an option",
						});

						if (selection?.label === "Clone entire project") {
							// do nothing
						} else if ((selection as any)?.item) {
							repoSet.clear();
							repoSet.add(getComponentKindRepoSource((selection as any)?.item.spec.source).repo);
						} else {
							throw new Error(
								`Repository or ${ext.terminologies?.componentTerm} selection is required in order to clone the repository`,
							);
						}
					}

					let selectedRepoUrl = "";
					if (repoSet.size === 1) {
						[selectedRepoUrl] = repoSet;

						const parsedRepo = parseGitURL(selectedRepoUrl);

						if (!parsedRepo) {
							throw new Error("Failed to parse selected Git URL");
						}

						const latestDeploymentTrack = params?.component?.deploymentTracks?.find((item) => item.latest);
						const clonedResp = await cloneRepositoryWithProgress(selectedCloneDir.fsPath, [
							{ branch: latestDeploymentTrack?.branch, repoUrl: selectedRepoUrl },
						]);

						// set context.yaml
						const userInfo = ext.authProvider?.getState()?.state?.userInfo;
						if (!userInfo) {
							throw new Error("User information is not available. Please ensure you are logged in.");
						}
						updateContextFile(clonedResp[0].clonedPath, userInfo, selectedProject, selectedOrg, projectCache);
						const subDir = params?.component?.spec?.source ? getComponentKindRepoSource(params?.component?.spec?.source)?.path || "" : "";
						const subDirFullPath = join(clonedResp[0].clonedPath, subDir);
						if (params?.technology === "ballerina") {
							await ensureBallerinaFilesIfEmpty(
								selectedOrg,
								params?.componentName || "bal-integration",
								subDirFullPath,
								params?.integrationDisplayType || DevantScopes.ANY,
							);
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
					}
				}
			} catch (err: any) {
				console.error("Failed to clone project", err);
				window.showErrorMessage(err?.message || "Failed to clone project");
			}
		}),
	);
}

async function ensureBallerinaFilesIfEmpty(
	org: Organization,
	componentName: string,
	directoryPath: string,
	integrationDisplayType: string,
): Promise<void> {
	const createBalFiles = (directoryPath: string, integrationDisplayType: string) => {
		writeFileSync(
			join(directoryPath, "Ballerina.toml"),
			`[package]\norg = "${org.handle}"\nname = "${componentName.replace(/ /g, "_").replace(/-/g, "_")}"\nversion = "0.1.0"`,
			"utf8",
		);
		if (integrationDisplayType) {
			const scopeVal = integrationDisplayType.toLowerCase().replace(/ /g, "-").replace(/\+/g, "-");
			if (!existsSync(join(directoryPath, ".vscode"))) {
				mkdirSync(join(directoryPath, ".vscode"));
			}
			const settingsPath = join(directoryPath, ".vscode", "settings.json");
			if (existsSync(settingsPath)) {
				// add property
				const data = readFileSync(settingsPath, "utf8");
				const settings = JSON.parse(data);
				settings["ballerina.scope"] = scopeVal;
				settings["ballerina.isBI"] = true;
				writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
			} else {
				// create new json
				writeFileSync(settingsPath, JSON.stringify({ "ballerina.scope": scopeVal, "ballerina.isBI": true }, null, 2));
			}
		}
	};

	try {
		const files = readdirSync(directoryPath);
		if (!files.some((file) => file.toLowerCase() === "ballerina.toml")) {
			createBalFiles(directoryPath, integrationDisplayType);
		}
	} catch (err: any) {
		if (err.code === "ENOENT") {
			try {
				mkdirSync(directoryPath, { recursive: true });
				createBalFiles(directoryPath, integrationDisplayType);
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

const cloneRepositoryWithProgress = async (
	parentPath: string,
	repos: { branch?: string; repoUrl?: string }[],
): Promise<{ clonedPath: string; gitUrl: string }[]> => {
	return await window.withProgress(
		{
			title: `Cloning repository into ${parentPath}.`,
			location: ProgressLocation.Notification,
			cancellable: true,
		},
		async (progress, cancellationToken) => {
			const clonedRepos: { clonedPath: string; gitUrl: string }[] = [];
			for (const { branch, repoUrl } of repos) {
				const parsedRepo = parseGitURL(repoUrl);
				if (!parsedRepo) {
					throw new Error("Failed to parse selected Git URL");
				}

				const git = await initGit(ext.context);
				if (git) {
					const gitUrl = `${repoUrl}.git`;

					const clonedPath = await git.clone(
						gitUrl,
						{
							recursive: true,
							ref: branch,
							parentPath,
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
