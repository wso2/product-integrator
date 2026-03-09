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
import * as vscode from "vscode";
import { ResponseError } from "vscode-jsonrpc";
import { ErrorCode } from "../choreo-cli-rpc/error-utils";
import { ext } from '../../extensionVariables';
import { isRpcActive, setExtensionName } from "./cmd-utils";

export function signInWithAuthCodeCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.SignInWithAuthCode, async (params: ICmdParamsBase) => {
			setExtensionName(params?.extName);
			try {
				isRpcActive(ext);
				// This is used in the extension test runner to sign into choreo
				ext.log("Signing in to WSO2 Platform using code");

				const authCode = await vscode.window.showInputBox({
					prompt: "Enter Authentication Code: ",
					placeHolder: "Code",
					ignoreFocusOut: true,
				});

				if (authCode) {
					ext.clients.rpcClient.signInWithAuthCode(authCode).then(async (userInfo) => {
						if (userInfo) {
							const region = await ext.clients.rpcClient.getCurrentRegion();
							ext.authProvider?.getState().loginSuccess(userInfo, region);
						}
					});
				} else {
					window.showErrorMessage("Auth Code is required to login");
				}
			} catch (error: any) {
				if (!(error instanceof ResponseError) || ![ErrorCode.NoOrgsAvailable, ErrorCode.NoAccountAvailable].includes(error.code)) {
					window.showErrorMessage("Sign in failed. Please check the logs for more details.");
				}
				ext.logError(`WSO2 Platform sign in Failed: ${error.message}`, error as Error);
			}
		}),
	);
}
