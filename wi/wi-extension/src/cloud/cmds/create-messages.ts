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

import type { Component, Project } from "@wso2/wso2-cloud-client";
import { Uri, commands, env, window } from "vscode";
import { ext } from "../../extensionVariables";

/** Says what was created and offers to reopen the folder, which is outside the workspace, to work on it. */
export const showReloadWorkspaceMessage = (message: string, workspaceFsPath: string, warn = false) => {
	(warn ? window.showWarningMessage : window.showInformationMessage)(`${message} Reload workspace to continue`, { modal: true }, "Continue").then(async (resp) => {
		if (resp === "Continue") {
			commands.executeCommand("vscode.openFolder", Uri.file(workspaceFsPath), { forceNewWindow: false });
		}
	});
};

/** Says what was created and offers the console's page of it. */
export const showViewInConsoleMessage = (message: string, orgHandle: string, project: Project, created: Component[], warn = false) => {
	(warn ? window.showWarningMessage : window.showInformationMessage)(message, "View in console").then(async (resp) => {
		if (resp === "View in console") {
			const url = ext.backend.links.console({ orgHandle, project: project.id, integration: created.length === 1 ? created[0].id : undefined });
			void env.openExternal(Uri.parse(url));
		}
	});
};
