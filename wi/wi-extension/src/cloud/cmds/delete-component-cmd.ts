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

import { basename } from "path";
import type { Component, Project } from "@wso2/wso2-cloud-client";
import { type ICmdParamsBase, WICommandIds } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, commands, window, workspace } from "vscode";
import { ext } from "../../extensionVariables";
import { handleCloudError } from "../platform/error-handler";
import { contextStore } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import { webviewStateStore } from "../stores/webview-state-store";
import { isPlatformReady, requireSession, selectIntegration, selectProject, setExtensionName } from "./cmd-utils";

/** The parameters the delete command takes, now in the platform's shapes. */
export interface IDeleteIntegrationCmdParams extends ICmdParamsBase {
	project?: Project;
	component?: Component;
}

export function deleteComponentCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.DeleteComponent, async (params: IDeleteIntegrationCmdParams) => {
			setExtensionName(params?.extName);
			try {
				isPlatformReady(ext);
				const extensionName = webviewStateStore.getState().state.extensionName;
				const session = await requireSession(`delete ${ext.terminologies.articleComponentTerm}`);
				if (!session) {
					return;
				}
				const selected = contextStore.getState().state.selected;
				const selectedProject = params?.project ?? selected?.project ?? (await selectProject(`Loading projects from '${session.org.name}'`, `Select project from '${session.org.name}'`));
				const integration =
					params?.component ??
					(await selectIntegration(
						selectedProject,
						`Loading ${ext.terminologies?.componentTermPlural} from '${selectedProject.name}'`,
						`Select ${ext.terminologies?.articleComponentTerm} from '${selectedProject.name}' to delete`,
					));

				const accepted = await window.showInformationMessage(
					`Are you sure you want to delete this ${extensionName} ${ext.terminologies?.componentTerm}? This action will not affect any local files and will only delete the ${ext.terminologies?.componentTerm} created in ${extensionName}, with its builds and deployments. Please note that this action is not reversible.`,
					{ modal: true },
					"Delete",
				);
				if (accepted !== "Delete") {
					return;
				}
				await window.withProgress({ title: `Deleting ${ext.terminologies?.componentTerm} ${integration.displayName || integration.name}...`, location: ProgressLocation.Notification }, async () => {
					await ext.clients.platform.cloud.components.delete(integration.id, selectedProject.id);
					const cache = dataCacheStore.getState().getIntegrations(session.org.handle, selectedProject.id);
					dataCacheStore.getState().setIntegrations(
						session.org.handle,
						selectedProject.id,
						cache.filter((item) => item.id !== integration.id),
					);
					if (workspace.workspaceFile && basename(workspace.workspaceFile.path) === `${selectedProject.id}.code-workspace`) {
						const folderIndex = workspace.workspaceFolders?.findIndex((item) => item.name === integration.name) ?? -1;
						if (folderIndex >= 0) {
							workspace.updateWorkspaceFolders(folderIndex, 1);
						}
					}
					contextStore.getState().refreshState();
					window.showInformationMessage(`${ext.terminologies?.componentTermCapitalized} ${integration.displayName || integration.name} is being deleted`);
				});
			} catch (err) {
				ext.logError(`Failed to delete ${ext.terminologies?.componentTerm}`, err as Error);
				handleCloudError(err, `Failed to delete ${ext.terminologies?.componentTerm}`);
			}
		}),
	);
}
