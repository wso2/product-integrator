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

import { WICommandIds } from "@wso2/wso2-platform-core";
import { type ExtensionContext, commands, window } from "vscode";
import { ext } from "../extensionVariables";
import { isRpcActive } from "./cmd-utils";

export function signOutCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.SignOut, async () => {
			try {
				isRpcActive(ext);
				ext.authProvider?.getState().logout();
			} catch (error: any) {
				ext.logError(`Error while signing out from WSO2 Platform. ${error?.message}${error?.cause ? `\nCause: ${error.cause.message}` : ""}`, error as Error);
				if (error instanceof Error) {
					window.showErrorMessage(error.message);
				}
			}
		}),
	);
}
