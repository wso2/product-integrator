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

import { buildConsoleUrl, isCloudError } from "@wso2/wso2-cloud-client";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { Uri, commands, env, window } from "vscode";
import { ext } from "../../extensionVariables";

/** A plain sentence for a failure, keeping the platform's own words when it gave any. */
export function describeCloudError(error: unknown, fallback: string): string {
	if (isCloudError(error)) {
		return error.message || fallback;
	}
	if (error instanceof Error) {
		return error.message || fallback;
	}
	return fallback;
}

/**
 * Shows a failure to the person, with the action that fits it: sign in again
 * when the session is gone, upgrade when the plan refuses, and the plain
 * message otherwise. Returns the message shown, for logs.
 */
export function handleCloudError(error: unknown, fallback: string): string {
	const message = describeCloudError(error, fallback);
	if (isCloudError(error)) {
		switch (error.code) {
			case "unauthenticated":
			case "session_expired":
				window.showErrorMessage(`${message}`, "Sign in").then((choice) => {
					if (choice === "Sign in") {
						commands.executeCommand(WICommandIds.SignIn);
					}
				});
				return message;
			case "plan_limit":
				window.showErrorMessage(message, "Upgrade").then((choice) => {
					if (choice === "Upgrade") {
						const org = ext.authProvider?.state.session?.org;
						env.openExternal(Uri.parse(buildConsoleUrl(ext.config.consoleUrl, { orgHandle: org?.handle })));
					}
				});
				return message;
			case "login_cancelled":
				return message;
			case "not_supported":
				window.showWarningMessage(message);
				return message;
			default:
				break;
		}
	}
	window.showErrorMessage(message);
	return message;
}
