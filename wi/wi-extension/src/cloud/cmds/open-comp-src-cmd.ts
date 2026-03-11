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

import { WICommandIds, type IOpenCompSrcCmdParams, type Organization, type Project } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, commands, window } from "vscode";
import { ext } from "../../extensionVariables";
import { waitForContextStoreToLoad } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import { cloneOrOpenDir } from "../cloud-uri-handlers";
import { getUserInfoForCmd, isRpcActive, selectOrg, selectProject, setExtensionName } from "./cmd-utils";

export function openCompSrcCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.OpenCompSrcDir, async (params: IOpenCompSrcCmdParams) => {
			setExtensionName(params?.extName);
			try {
				isRpcActive(ext);
				const userInfo = await getUserInfoForCmd("clone project repository");
				if (userInfo) {
					let selectedOrg: Organization;
					if (typeof params?.org === "string") {
						selectedOrg =
							userInfo.organizations.find((item) => item.handle === params?.org || item.name === params?.org) ??
							(await selectOrg(userInfo, "Select organization"));
						if (!selectedOrg) {
							window
								.showErrorMessage(`Unable to find the organization ${params?.org} in your account. Please try signing in again.`, "Sign in")
								.then((res) => {
									if (res === "Sign in") {
										commands.executeCommand(WICommandIds.SignIn);
									}
								});
							return;
						}
					} else if (params?.org) {
						selectedOrg = params?.org;
					} else {
						selectedOrg = await selectOrg(userInfo, "Select organization");
					}

					let selectedProject: Project | undefined;
					if (typeof params?.project === "string") {
						const projectsCache = dataCacheStore.getState().getProjects(selectedOrg.handle);
						selectedProject = projectsCache.find(
							(item) => item.handler === params?.project || item.name === params?.project || item.id === params?.component,
						);

						if (!selectedProject) {
							const projects = await window.withProgress(
								{ title: `Fetching projects of organization ${selectedOrg.name}...`, location: ProgressLocation.Notification },
								() => ext.clients.rpcClient.getProjects(selectedOrg.id.toString()),
							);
							dataCacheStore.getState().setProjects(selectedOrg.handle, projects);
							selectedProject = projects.find(
								(item) => item.handler === params?.project || item.name === params?.project || item.id === params?.component,
							);
						}
					} else if (params?.project) {
						selectedProject = params?.project;
					}

					if (!selectedProject) {
						selectedProject = await selectProject(
							selectedOrg,
							`Loading projects from '${selectedOrg.name}'`,
							`Select the project from '${selectedOrg.name}', that needs to be cloned`,
						);
					}

					await waitForContextStoreToLoad();

					cloneOrOpenDir(
						selectedOrg,
						selectedProject,
						params?.component || null,
						params?.technology || null,
						params?.integrationType || null,
						params?.integrationDisplayType || null,
						params?.extName,
					);
				}
			} catch (err: any) {
				console.error(`Failed to open project/${ext.terminologies?.componentTerm}`, err);
				window.showErrorMessage(err?.message || `Failed to open project/${ext.terminologies?.componentTerm}`);
			}
		}),
	);
}
