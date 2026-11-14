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

import { Uri, env, window } from "vscode";
import { BridgeLayer } from "../BridgeLayer";
import { ext } from "../extensionVariables";
import { buildConsoleUrl } from "@wso2/wso2-cloud-client";
import { GitHubAppConnector } from "./github-app";

/** The GitHub connector for this window, telling the person how connecting ended and the deployment form to recheck. */
export function createGitHubAppConnector(): GitHubAppConnector {
	return new GitHubAppConnector({
		cloud: () => ext.clients.platform.cloud,
		consoleUrl: () => buildConsoleUrl(ext.config.consoleUrl, { orgHandle: ext.authProvider?.org?.handle }),
		uriScheme: env.uriScheme,
		openExternal: (url) => env.openExternal(Uri.parse(url)),
		log: (message) => ext.log(message),
		outcome: {
			connected: (installations) => {
				const accounts = installations.map((item) => item.githubAccount).join(", ");
				window.showInformationMessage(accounts ? `GitHub is connected to WSO2 Cloud (${accounts}).` : "GitHub is connected to WSO2 Cloud.");
				BridgeLayer.notifyGitHubConnected();
			},
			requested: () => {
				window.showInformationMessage("The GitHub organization's owner has to approve the WSO2 Cloud app. Check the repository again once they have.");
			},
			cancelled: () => ext.log("Connecting GitHub was cancelled on GitHub"),
			failed: (message) => {
				window.showErrorMessage(message);
			},
		},
	});
}
