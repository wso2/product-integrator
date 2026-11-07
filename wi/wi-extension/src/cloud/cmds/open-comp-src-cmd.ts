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

import type { Project } from "@wso2/wso2-cloud-client";
import { type ICmdParamsBase, WICommandIds } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, commands, window } from "vscode";
import { ext } from "../../extensionVariables";
import { cloneOrOpenDir } from "../cloud-uri-handlers";
import { handleCloudError } from "../platform/error-handler";
import { waitForContextStoreToLoad } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import { isPlatformReady, requireSession, selectProject, setExtensionName } from "./cmd-utils";

export interface IOpenIntegrationSrcCmdParams extends ICmdParamsBase {
	/** An organization handle; the link is refused when it is not the session's. */
	org?: string;
	/** A project name, or the project itself. */
	project?: string | Project;
	component?: string;
	technology?: string;
	integrationType?: string;
	integrationDisplayType?: string;
}

export function openCompSrcCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.OpenCompSrcDir, async (params: IOpenIntegrationSrcCmdParams) => {
			setExtensionName(params?.extName);
			try {
				isPlatformReady(ext);
				const session = await requireSession("clone project repository");
				if (!session) {
					return;
				}
				if (params?.org && params.org !== session.org.handle && params.org !== session.org.name) {
					window.showErrorMessage(`This is for the organization ${params.org}, and you are signed in to ${session.org.handle}.`, "Switch organization").then((res) => {
						if (res === "Switch organization") {
							commands.executeCommand(WICommandIds.SignIn, { reselectOrganization: true });
						}
					});
					return;
				}

				let selectedProject: Project | undefined;
				if (typeof params?.project === "string") {
					const wanted = params.project;
					const match = (p: Project) => p.id === wanted || p.handler === wanted || p.name === wanted;
					selectedProject = dataCacheStore.getState().getProjects(session.org.handle).find(match);
					if (!selectedProject) {
						const projects = await window.withProgress({ title: `Fetching projects of organization ${session.org.name}...`, location: ProgressLocation.Notification }, () =>
							ext.clients.platform.cloud.projects.list(),
						);
						dataCacheStore.getState().setProjects(session.org.handle, projects);
						selectedProject = projects.find(match);
					}
				} else if (params?.project) {
					selectedProject = params.project;
				}
				if (!selectedProject) {
					selectedProject = await selectProject(`Loading projects from '${session.org.name}'`, `Select the project from '${session.org.name}', that needs to be cloned`);
				}

				await waitForContextStoreToLoad();
				await cloneOrOpenDir(selectedProject, params?.component || null, params?.technology || null, params?.integrationType || null, params?.integrationDisplayType || null, params?.extName);
			} catch (err) {
				ext.logError(`Failed to open project/${ext.terminologies?.componentTerm}`, err as Error);
				handleCloudError(err, `Failed to open project/${ext.terminologies?.componentTerm}`);
			}
		}),
	);
}
