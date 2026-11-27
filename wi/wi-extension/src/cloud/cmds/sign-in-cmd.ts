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

import { type CloudEnvName, isCloudError } from "@wso2/wso2-cloud-client";
import { type ICmdParamsBase, WICommandIds } from "@wso2/wso2-platform-core";
import { type ExtensionContext, ProgressLocation, commands, window } from "vscode";
import { BridgeLayer } from "../../BridgeLayer";
import { ext } from "../../extensionVariables";
import { handleCloudError } from "../platform/error-handler";
import { isPlatformReady, setExtensionName } from "./cmd-utils";
import { pickPlatform, switchPlatform } from "./platform-cmd";
import { cloudPlaceName, pickRegion } from "./region-cmd";

export function signInCommand(context: ExtensionContext) {
	context.subscriptions.push(
		// `region` signs in to that production region without asking; otherwise the person is asked where there is a choice.
		commands.registerCommand(WICommandIds.SignIn, async (params: ICmdParamsBase & { reselectOrganization?: boolean; region?: CloudEnvName }) => {
			setExtensionName(params?.extName);
			try {
				isPlatformReady(ext);
				if (!ext.authProvider) {
					throw new Error("The cloud layer is not active yet.");
				}
				// Choosing an organization again stays in the region the session is in.
				if (!params?.reselectOrganization) {
					const platform = ext.clients.platform;
					// Someone offered Devant says which platform first; a region named is Choreo Cloud's.
					if (!params?.region) {
						const chosen = await pickPlatform({ title: "Sign In", placeHolder: "Select the platform your projects are on" });
						if (!chosen) {
							ext.log("Sign-in cancelled");
							return;
						}
						if (chosen !== platform.platform) {
							await switchPlatform(chosen);
							if (ext.authProvider.isLoggedIn && ext.authProvider.session) {
								const kept = ext.authProvider.session;
								window.showInformationMessage(`Signed in to ${cloudPlaceName()} as ${kept.user.email ?? kept.user.displayName} (${kept.org.name})`);
								return;
							}
						}
					}
					const named = platform.regions.find((region) => region.name === params?.region)?.name;
					const region = named ?? (await pickRegion({ title: `Sign In to ${ext.backend.label}`, placeHolder: "Select the region where you want to create and deploy your integrations" }));
					if (!region) {
						ext.log("Sign-in cancelled");
						return;
					}
					if (region !== platform.environment.name) {
						await platform.switchEnvironment(region);
						// The region may hold a session from before: that is the sign-in asked for.
						await ext.authProvider.initAuth();
						if (ext.authProvider.isLoggedIn && ext.authProvider.session) {
							const kept = ext.authProvider.session;
							window.showInformationMessage(`Signed in to ${cloudPlaceName()} as ${kept.user.email ?? kept.user.displayName} (${kept.org.name})`);
							return;
						}
					}
				}
				ext.log(`Signing in to ${cloudPlaceName()}`);
				BridgeLayer.notifySignInInitiated();
				const session = await window.withProgress(
					{ title: "Waiting for the sign-in in your browser...", location: ProgressLocation.Notification, cancellable: true },
					async (_progress, token) => {
						token.onCancellationRequested(() => ext.authProvider?.cancelPendingSignIn());
						return ext.authProvider!.signIn({ reselectOrganization: params?.reselectOrganization });
					},
				);
				window.showInformationMessage(`Signed in to ${cloudPlaceName()} as ${session.user.email ?? session.user.displayName} (${session.org.name})`);
			} catch (error) {
				if (isCloudError(error) && error.code === "login_cancelled") {
					ext.log("Sign-in cancelled");
					return;
				}
				ext.logError(`Error while signing in to ${ext.backend.label}`, error as Error);
				handleCloudError(error, "Sign in failed. Please check the logs for more details.");
				// Re-throw so that callers who await executeCommand (e.g. the SSO flow
				// in the migration wizard) receive the failure immediately.
				throw error;
			}
		}),
		commands.registerCommand(WICommandIds.CancelSignIn, () => {
			ext.authProvider?.cancelPendingSignIn();
		}),
	);
}
