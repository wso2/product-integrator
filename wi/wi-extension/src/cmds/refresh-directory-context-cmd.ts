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

import { WICommandIds, type ICmdParamsBase } from "@wso2/wso2-platform-core";
import { type ExtensionContext, commands, window } from "vscode";
import { ext } from "../extensionVariables";
import { contextStore } from "../stores/context-store";
import { isRpcActive, setExtensionName } from "./cmd-utils";

export function refreshContextCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.RefreshDirectoryContext, async (params: ICmdParamsBase) => {
			try {
				isRpcActive(ext);
				setExtensionName(params?.extName);
				const userInfo = ext.authProvider?.getState().state.userInfo;
				if (!userInfo) {
					throw new Error("You are not logged in. Please log in and retry.");
				}

				await contextStore.getState().refreshState();
			} catch (err: any) {
				console.error("Failed to refresh directory context", err);
				window.showErrorMessage(err?.message || "Failed to refresh directory context");
			}
		}),
	);
}
