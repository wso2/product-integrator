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

import type { Organization } from "@wso2/wso2-cloud-client";
import type { DevantClient } from "@wso2/wso2-cloud-client/devant/vscode";
import { Uri, env, window } from "vscode";
import { ext } from "../../../extensionVariables";

/** The path the console's GitHub page sends the editor back to; Devant's callbacks are told apart by `platform=devant`. */
export const GITHUB_CALLBACK_PATH = "/ghapp";
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

/** Whether a URI the editor was handed is Devant's GitHub callback. */
export function isDevantGitHubCallback(uri: { path: string; query: string }): boolean {
	return uri.path === GITHUB_CALLBACK_PATH && new URLSearchParams(uri.query).get("platform") === "devant";
}

/** The state the console's GitHub page reads: where to send the editor back to, and for which organization. */
async function githubState(org: Organization): Promise<string> {
	const callback = await env.asExternalUri(Uri.parse(`${env.uriScheme}://${ext.context.extension.id}${GITHUB_CALLBACK_PATH}?platform=devant`));
	return Buffer.from(JSON.stringify({ origin: "vscode.choreo.ext", orgId: org.id, callbackUri: callback.toString(), extensionName: "Devant" })).toString("base64");
}

/** Authorizes Devant's GitHub app for the person, through GitHub and then the console, as WSO2 Integrator 5.1 did. */
export async function authorizeGitHub(client: DevantClient, org: Organization): Promise<void> {
	const deployment = client.deployment();
	const params = new URLSearchParams({ redirect_uri: `${deployment.consoleUrl}/ghapp`, client_id: deployment.githubApp.clientId, state: await githubState(org) });
	await env.openExternal(Uri.parse(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`));
}

/** Installs Devant's GitHub app; GitHub asks on which account. */
export async function installGitHubApp(client: DevantClient, org: Organization): Promise<void> {
	const params = new URLSearchParams({ state: await githubState(org) });
	await env.openExternal(Uri.parse(`${client.deployment().githubApp.installUrl}?${params.toString()}`));
}

/** Completes the GitHub authorization the console handed back: the code is exchanged for Devant's GitHub access. */
export async function completeGitHubCallback(client: DevantClient, query: string): Promise<void> {
	// The console encodes the code once more than VS Code decodes.
	const params = new URLSearchParams(query);
	const code = params.get("code");
	const orgId = params.get("orgId");
	if (!code || !orgId) {
		// The install flow returns with no code: the app is on the owner now.
		void window.showInformationMessage("The Devant GitHub app was installed. Refresh the form to see the repositories.");
		return;
	}
	await client.api.obtainGithubToken({ code, orgId });
	void window.showInformationMessage("GitHub is connected to Devant. Refresh the form to see the repositories.");
}
