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

import type { ContextItemEnriched } from "@wso2/wso2-cloud-client";
import { type IManageDirContextCmdParams, WICommandIds } from "@wso2/wso2-platform-core";
import { type ExtensionContext, type QuickPickItem, QuickPickItemKind, commands, window } from "vscode";
import { ext } from "../../extensionVariables";
import { handleCloudError } from "../platform/error-handler";
import { unlinkContext } from "../context-file";
import { contextStore, waitForContextStoreToLoad } from "../stores/context-store";
import { isPlatformReady, requireSession, setExtensionName } from "./cmd-utils";
import type { IOpenInConsoleParams } from "./open-in-console-cmd";

export function manageProjectContextCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.ManageDirectoryContext, async (params: IManageDirContextCmdParams) => {
			setExtensionName(params?.extName);
			try {
				isPlatformReady(ext);
				const session = await requireSession("manage project");
				if (!session) {
					return;
				}
				type Pick = QuickPickItem & { item?: ContextItemEnriched };
				const quickPickOptions: Pick[] = [];
				const selected = contextStore.getState().state?.selected;
				if (selected) {
					quickPickOptions.push(
						{ kind: QuickPickItemKind.Separator, label: "Selected Project" },
						{ label: selected.project?.name ?? selected.projectName, detail: session.org.name, picked: true },
						{ label: "Open in Console", detail: `Open the project '${selected.project?.name ?? selected.projectName}' in web console` },
					);
				}

				const unSelectedItems = contextStore
					.getState()
					.getValidItems()
					.filter((item) => item.projectName !== selected?.projectName);
				if (unSelectedItems.length > 0) {
					quickPickOptions.push(
						{ kind: QuickPickItemKind.Separator, label: "Associated Projects" },
						...unSelectedItems.map((item) => ({ label: item.project?.name ?? item.projectName, detail: item.orgHandle, item })),
					);
				}

				quickPickOptions.push(
					{ kind: QuickPickItemKind.Separator, label: "Other options" },
					{ label: selected ? "Link with a different project" : "Link with a project", detail: `Associate your workspace with a${selected ? " different" : ""} project` },
				);
				if (!params?.onlyShowSwitchProject && selected) {
					quickPickOptions.push({ label: "Unlink workspace", detail: `Remove the association between ${selected.project?.name ?? selected.projectName} and currently opened workspace` });
				}
				quickPickOptions.push(
					{ kind: QuickPickItemKind.Separator, label: "Account" },
					{ label: "Switch Organization", description: `Signed in to ${session.org.name}`, detail: "Sign in again and choose another organization" },
					{ label: "Sign Out", description: `Signed in as ${session.user.email ?? session.user.displayName}`, detail: "Sign Out of your account" },
				);

				const selection = await window.showQuickPick(quickPickOptions, { title: "Manage Project" });
				if (selection?.label === "Open in Console") {
					commands.executeCommand(WICommandIds.OpenInConsole, { project: selected?.project } satisfies IOpenInConsoleParams);
				} else if (selection?.label === "Link with a different project" || selection?.label === "Link with a project") {
					commands.executeCommand(WICommandIds.CreateDirectoryContext);
				} else if (selection?.item) {
					await waitForContextStoreToLoad();
					contextStore.getState().changeContext(selection.item);
				} else if (selection?.label === "Unlink workspace" && selected) {
					await waitForContextStoreToLoad();
					unlinkContext(
						selected.contextDirs.map((item) => item.projectRootFsPath),
						{ org: selected.orgHandle, project: selected.projectName },
					);
					contextStore.getState().refreshState();
				} else if (selection?.label === "Switch Organization") {
					commands.executeCommand(WICommandIds.SignIn, { reselectOrganization: true });
				} else if (selection?.label === "Sign Out") {
					commands.executeCommand(WICommandIds.SignOut);
				}
			} catch (err) {
				ext.logError("Failed to run manage project context", err as Error);
				handleCloudError(err, "Failed to run manage project context");
			}
		}),
	);
}
