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

import { type Component, type OpenInConsoleParams, type Project, buildConsoleUrl } from "@wso2/wso2-cloud-client";
import { type ICmdParamsBase, type ICreateNewIntegrationCmdParams, WICommandIds } from "@wso2/wso2-platform-core";
import { type ExtensionContext, type QuickPickItem, QuickPickItemKind, Uri, commands, env, window } from "vscode";
import { ext } from "../../extensionVariables";
import { isSamePath } from "../../utils";
import { handleCloudError } from "../platform/error-handler";
import { contextStore } from "../stores/context-store";
import { dataCacheStore } from "../stores/data-cache-store";
import { webviewStateStore } from "../stores/webview-state-store";
import { isPlatformReady, quickPickWithLoader, requireSession, selectProject, setExtensionName } from "./cmd-utils";

/** The contract's parameters, plus the caller's extension name the base type carries. */
export interface IOpenInConsoleParams extends ICmdParamsBase, OpenInConsoleParams {
	newComponentParams?: { buildPackLang?: "ballerina" | "microintegrator" };
}

export function openInConsoleCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.OpenInConsole, async (params: IOpenInConsoleParams) => {
			setExtensionName(params?.extName);
			const extensionName = webviewStateStore.getState().state.extensionName;
			try {
				isPlatformReady(ext);
				const session = await requireSession(`open ${ext.terminologies.articleComponentTerm} in ${extensionName} console`);
				if (!session) {
					return;
				}
				const orgHandle = session.org.handle;
				const selected = contextStore.getState().state.selected;
				const selectedProject = params?.project ?? selected?.project ?? (await selectProject(`Loading projects from '${session.org.name}'`, `Select project from '${session.org.name}'`));
				const openIntegration = (integration: Component) =>
					env.openExternal(Uri.parse(buildConsoleUrl(ext.config.consoleUrl, { orgHandle, project: selectedProject.id, integration: integration.id })));
				const openProject = () => env.openExternal(Uri.parse(buildConsoleUrl(ext.config.consoleUrl, { orgHandle, project: selectedProject.id })));

				if (params?.component) {
					openIntegration(params.component);
					return;
				}
				if (params?.componentFsPath) {
					const matching = contextStore.getState().state?.integrations?.filter((item) => isSamePath(item.fsPath, params.componentFsPath!)) ?? [];
					if (matching.length === 0) {
						const res = await window.showInformationMessage(`No ${extensionName} ${ext.terminologies?.componentTerm} found in this directory. Do you want to create one?`, { modal: true }, "Proceed");
						if (res === "Proceed") {
							commands.executeCommand(WICommandIds.CreateNewComponent, {
								buildPackLang: params?.newComponentParams?.buildPackLang,
								workspaceDir: params?.componentFsPath,
								integrations: [{ fsPath: params?.componentFsPath }],
							} as ICreateNewIntegrationCmdParams);
						}
					} else if (matching.length === 1) {
						openIntegration(matching[0].integration);
					} else {
						const picks: (QuickPickItem & { item?: Component })[] = matching.map((item) => ({ label: item.integration.displayName || item.integration.name, item: item.integration }));
						const choice = await window.showQuickPick(picks, {
							title: `Multiple ${ext.terminologies?.componentTermPlural} detected. Please select ${ext.terminologies?.articleComponentTerm} to open`,
						});
						if (choice?.item) {
							openIntegration(choice.item);
						}
					}
					return;
				}

				type Pick = QuickPickItem & { item?: { data: Component | Project; type: "component" | "project" } };
				const toPicks = (integrations: Component[]): Pick[] => {
					const picks: Pick[] = [{ label: selectedProject.name, detail: `Open project in ${extensionName} console`, item: { data: selectedProject, type: "project" } }];
					if (integrations.length > 0) {
						picks.push(
							{ kind: QuickPickItemKind.Separator, label: ext.terminologies?.componentTermPlural },
							...integrations.map((item) => ({ label: item.displayName || item.name, item: { data: item, type: "component" as const } })),
						);
					}
					return picks;
				};
				const choice = await quickPickWithLoader<Pick["item"]>({
					cacheQuickPicks: toPicks(dataCacheStore.getState().getIntegrations(orgHandle, selectedProject.id)),
					loadQuickPicks: async () => {
						const integrations = await ext.clients.platform.cloud.components.list(selectedProject.id);
						dataCacheStore.getState().setIntegrations(orgHandle, selectedProject.id, integrations);
						return toPicks(integrations);
					},
					loadingTitle: `Loading ${ext.terminologies?.componentTermPlural} of project ${selectedProject.name}`,
					selectTitle: `Select an option to open in ${extensionName} Console`,
				});
				if (choice?.type === "project") {
					openProject();
				} else if (choice?.type === "component") {
					openIntegration(choice.data as Component);
				}
			} catch (err) {
				ext.logError(`Failed to open ${ext.terminologies?.componentTerm}`, err as Error);
				handleCloudError(err, `Failed to open ${ext.terminologies?.componentTerm}`);
			}
		}),
	);
}
