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

import { commands, ConfigurationTarget, window as w, workspace } from "vscode";
import { ResponseError } from "vscode-jsonrpc";
import { ext } from "../../extensionVariables";
import { webviewStateStore } from "../stores/webview-state-store";

export enum ErrorCode {
	ParseError = -32700,
	InvalidRequest = -32600,
	MethodNotFound = -32601,
	InvalidParams = -32602,
	InternalError = -32603,
	UnauthorizedError = -32000,
	TokenNotFoundError = -32001,
	InvalidTokenError = -32002,
	ForbiddenError = -32003,
	RefreshTokenError = -32004,
	ComponentNotFound = -32005,
	ProjectNotFound = -32006,
	MaxProjectCountError = -32007,
	RepoAccessNeeded = -32008,
	EpYamlNotFound = -32009,
	UserNotFound = -32010,
	MaxComponentCountError = -32011,
	InvalidSubPath = -32012,
	NoOrgsAvailable = -32013,
	NoAccountAvailable = -32014,
	KeyringAccessError = -32015,
}

export function handlerError(err: any) {
	const extensionName = webviewStateStore.getState().state.extensionName;
	if (err instanceof ResponseError) {
		switch (err.code) {
			case ErrorCode.ParseError:
				ext.logError("ParseError", err as Error);
				break;
			case ErrorCode.InvalidRequest:
				ext.logError("InvalidRequest", err as Error);
				break;
			case ErrorCode.MethodNotFound:
				ext.logError("MethodNotFound", err as Error);
				break;
			case ErrorCode.InvalidParams:
				ext.logError("InvalidParams", err as Error);
				break;
			case ErrorCode.InternalError:
				ext.logError("InternalError", err as Error);
				break;
			case ErrorCode.UnauthorizedError:
				if (ext.authProvider?.getState().state?.userInfo) {
					ext.authProvider?.getState().logout();
					w.showErrorMessage("Unauthorized. Please sign in again.");
				}
				break;
			case ErrorCode.TokenNotFoundError:
				if (ext.authProvider?.getState().state?.userInfo) {
					ext.authProvider?.getState().logout();
					w.showErrorMessage("Token not found. Please sign in again.");
				}
				break;
			case ErrorCode.InvalidTokenError:
				if (ext.authProvider?.getState().state?.userInfo) {
					ext.authProvider?.getState().logout();
					w.showErrorMessage("Invalid token. Please sign in again.");
				}
				break;
			case ErrorCode.ForbiddenError:
				ext.logError("ForbiddenError", err as Error);
				break;
			case ErrorCode.RefreshTokenError:
				if (ext.authProvider?.getState().state?.userInfo) {
					ext.authProvider?.getState().logout();
					w.showErrorMessage("Failed to refresh user session. Please sign in again.");
				}
				break;
			case ErrorCode.ComponentNotFound:
				w.showErrorMessage(`${ext.terminologies?.componentTermCapitalized} not found`);
				break;
			case ErrorCode.ProjectNotFound:
				w.showErrorMessage("Project not found");
				break;
			case ErrorCode.UserNotFound:
				// Ignore error
				break;
			case ErrorCode.MaxProjectCountError:
				w.showErrorMessage("Failed to create project due to reaching maximum number of projects allowed within the free tier.", "Upgrade").then(
					(res) => {
						if (res === "Upgrade") {
							commands.executeCommand(
								"vscode.open",
								`${ext.config?.billingConsoleUrl}/cloud/${extensionName === "Devant" ? "devant" : "choreo"}/upgrade`,
							);
						}
					},
				);
				break;
			case ErrorCode.MaxComponentCountError:
				w.showErrorMessage(
					`Failed to create ${ext.terminologies?.componentTerm} due to reaching maximum number of ${ext.terminologies?.componentTermPlural} allowed within the free tier.`,
					"Upgrade",
				).then((res) => {
					if (res === "Upgrade") {
						commands.executeCommand(
							"vscode.open",
							`${ext.config?.billingConsoleUrl}/cloud/${extensionName === "Devant" ? "devant" : "choreo"}/upgrade`,
						);
					}
				});
				break;
			case ErrorCode.EpYamlNotFound:
				w.showErrorMessage(
					".wso2/component.yaml file is required in your remote repository. Try again after committing & pushing your component.yaml file",
					"View Documentation",
				).then((res) => {
					if (res === "View Documentation") {
						commands.executeCommand("vscode.open", "https://wso2.com/choreo/docs/develop-components/configure-endpoints/");
					}
				});
				break;
			case ErrorCode.InvalidSubPath:
				w.showErrorMessage(
					`Failed to create ${ext.terminologies?.componentTerm}. Please try again after synching your local repo directory changes with your remote directory.`,
				);
				break;
			case ErrorCode.NoAccountAvailable:
				w.showErrorMessage(`It looks like you don't have an account yet. Please sign up before logging in.`, "Sign Up").then((res) => {
					if (res === "Sign Up") {
						commands.executeCommand(
							"vscode.open",
							` ${extensionName === "Devant" ? ext.config?.devantConsoleUrl : ext.config?.choreoConsoleUrl}/signup`,
						);
					}
				});
				break;
			case ErrorCode.NoOrgsAvailable:
				w.showErrorMessage(
					`No organizations attached to the user. Please create an organization in ${extensionName} and try logging in again`,
					`Open ${extensionName} Console`,
				).then((res) => {
					if (res === `Open ${extensionName} Console`) {
						commands.executeCommand("vscode.open", extensionName === "Devant" ? ext.config?.devantConsoleUrl : ext.config?.choreoConsoleUrl);
					}
				});
				break;
			case ErrorCode.KeyringAccessError:
				w.showErrorMessage(
					`Failed to access system keyring for storing authentication tokens. Please retry signing in after skipping keyring usage and reloading window`,
					`Skip keyring usage`,
				).then((res) => {
					if (res === `Skip keyring usage`) {
						workspace.getConfiguration().update("integrator.advanced.skipKeyring", true, ConfigurationTarget.Workspace).then(() => {
							commands.executeCommand("workbench.action.reloadWindow");
						});
					}
				});
				break;
			default:
				ext.logError("Unknown error", err as Error);
				break;
		}
	}
}
