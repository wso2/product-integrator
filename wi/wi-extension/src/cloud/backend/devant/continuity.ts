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

import { type Disposable, type ExtensionContext, commands, window } from "vscode";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { ext } from "../../../extensionVariables";
import { contextStore } from "../../stores/context-store";
import { DEVANT_PLATFORM } from "./index";
import { DEVANT_LABEL } from "./label";

/** Set once a Devant user who upgraded was told to sign in again. */
const SIGN_IN_AGAIN_KEY = "wso2-integrator.devant.signInAgainAsked";

/**
 * WSO2 Integrator 5.1 signed in through the Choreo CLI, whose session this version cannot read: someone who used
 * Devant starts signed out once after the upgrade, and is told why.
 */
export function askToSignInAgain(context: ExtensionContext): void {
	if (ext.backend?.platform !== DEVANT_PLATFORM || ext.authProvider?.isLoggedIn || context.globalState.get<boolean>(SIGN_IN_AGAIN_KEY)) {
		return;
	}
	void context.globalState.update(SIGN_IN_AGAIN_KEY, true);
	void window
		.showInformationMessage(`Sign in to ${DEVANT_LABEL} again to continue with your projects. This version signs you in without the Choreo CLI.`, "Sign In")
		.then((choice) => {
			if (choice) {
				void commands.executeCommand(WICommandIds.SignIn);
			}
		});
}

/**
 * 5.1 showed every organization of the person at once; a session now holds one. When the workspace is linked only
 * to another of the person's organizations, the session moves there, without the browser.
 */
export function followWorkspaceOrganization(): Disposable {
	const tried = new Set<string>();
	const unsubscribe = contextStore.subscribe(({ state }) => {
		const backend = ext.backend;
		const session = ext.authProvider?.session;
		if (!backend?.pickOrganization || !session || state.loading) {
			return;
		}
		const items = Object.values(state.items);
		if (items.length === 0 || items.some((item) => !item.foreignOrg)) {
			return;
		}
		const handles = [...new Set(items.map((item) => item.orgHandle))];
		const target = handles.length === 1 ? handles[0] : undefined;
		if (!target || tried.has(`${session.org.handle}>${target}`)) {
			return;
		}
		tried.add(`${session.org.handle}>${target}`);
		backend
			.changeOrganization(target)
			.then(() => ext.authProvider?.initAuth())
			.then(() => {
				void window.showInformationMessage(`Switched to the organization ${ext.authProvider?.org?.name ?? target}, which this workspace is linked to.`);
			})
			.catch((error) => ext.log(`Not following the workspace's organization ${target}: ${error instanceof Error ? error.message : String(error)}`));
	});
	return { dispose: unsubscribe };
}
