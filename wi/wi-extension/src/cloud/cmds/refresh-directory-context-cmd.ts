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

import { type ICmdParamsBase, WICommandIds } from "@wso2/wso2-platform-core";
import { type ExtensionContext, commands } from "vscode";
import { ext } from "../../extensionVariables";
import { handleCloudError } from "../platform/error-handler";
import { contextStore } from "../stores/context-store";
import { isPlatformReady, setExtensionName } from "./cmd-utils";

export function refreshContextCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.RefreshDirectoryContext, async (params: ICmdParamsBase) => {
			try {
				isPlatformReady(ext);
				setExtensionName(params?.extName);
				if (!ext.authProvider?.isLoggedIn) {
					throw new Error("You are not signed in. Please sign in and retry.");
				}
				await contextStore.getState().refreshState();
			} catch (err) {
				ext.logError("Failed to refresh directory context", err as Error);
				handleCloudError(err, "Failed to refresh directory context");
			}
		}),
	);
}
