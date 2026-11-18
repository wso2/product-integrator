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
import { SIGN_IN_CHANGED_MESSAGE, endingConnect, signedInScope } from "./github-access";
import { GitHubAppConnector, type IgnoredGitHubReturn, forgetGitHubAccess } from "./github-app";

const IGNORED_RETURN_MESSAGES: Record<IgnoredGitHubReturn, string> = {
	"not-started": "GitHub returned to a window that didn't start connecting it, so nothing was connected here. Finish in the window you started from, or start again.",
	expired: "Connecting GitHub took more than 10 minutes, so GitHub's return was ignored. Start again.",
	"signed-in-changed": "Your WSO2 Cloud sign-in changed while GitHub was open, so GitHub's return was ignored. Start again.",
};

/** Offers GitHub's account picker, to connect with another GitHub account, for the organization signed in when it was offered. */
function offerAnotherAccount(message: string, owner: string | undefined): void {
	const useAnother = "Use Another GitHub Account";
	const scope = signedInScope();
	void window.showWarningMessage(message, useAnother).then((choice) => {
		if (choice !== useAnother) {
			return;
		}
		if (signedInScope() !== scope) {
			window.showWarningMessage(SIGN_IN_CHANGED_MESSAGE);
			return;
		}
		return ext.githubApp?.connect(owner, "select-account");
	});
}

/** The GitHub connector for this window, telling the person how connecting ended and the deployment form to recheck. */
export function createGitHubAppConnector(): GitHubAppConnector {
	return new GitHubAppConnector({
		cloud: () => ext.clients.platform.cloud,
		consoleUrl: () => buildConsoleUrl(ext.config.consoleUrl, { orgHandle: ext.authProvider?.org?.handle }),
		session: signedInScope,
		uriScheme: env.uriScheme,
		openExternal: (url) => env.openExternal(Uri.parse(url)),
		log: (message) => ext.log(message),
		// Installations bound before an install leg must reach the form even when that leg is abandoned.
		onBound: () => {
			forgetGitHubAccess();
			BridgeLayer.notifyGitHubConnected();
		},
		outcome: endingConnect({
			connected: (installations, missingOwner) => {
				const accounts = installations.map((item) => item.githubAccount).join(", ");
				const connected = accounts ? `GitHub is connected to WSO2 Cloud (${accounts})` : "GitHub is connected to WSO2 Cloud";
				if (!missingOwner) {
					window.showInformationMessage(`${connected}.`);
					return;
				}
				// The app is on the owner, but this GitHub user can't see it: the browser is likely signed in to another GitHub account.
				offerAnotherAccount(`${connected}, but not to ${missingOwner}. If another GitHub account has access to ${missingOwner}, connect with that account.`, missingOwner);
			},
			noInstallationVisible: (owner) => {
				const where = owner ?? "any GitHub account";
				offerAnotherAccount(`The GitHub account you authorized can't see the WSO2 Cloud app on ${where}. If another GitHub account has access, connect with that account.`, owner);
			},
			requested: () => {
				window.showInformationMessage("The GitHub organization's owner has to approve the WSO2 Cloud app. Check the repository again once they have.");
			},
			ignored: (reason) => {
				window.showWarningMessage(IGNORED_RETURN_MESSAGES[reason]);
			},
			cancelled: () => ext.log("Connecting GitHub was cancelled on GitHub"),
			failed: (message) => {
				window.showErrorMessage(message);
			},
		}),
	});
}
