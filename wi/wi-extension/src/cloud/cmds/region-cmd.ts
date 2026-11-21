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

import type { CloudEnvName, CloudEnvironment } from "@wso2/wso2-cloud-client";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { type ExtensionContext, type QuickPickItem, commands, window } from "vscode";
import { ext } from "../../extensionVariables";
import { handleCloudError } from "../platform/error-handler";
import { isPlatformReady } from "./cmd-utils";

/** The context key that says whether there is another region to switch to; the switch command is enabled by it. */
export const MULTI_REGION_CONTEXT = "wso2.integrator.cloud.multiRegion";

/** The region's name as the person is shown it: `Europe`. */
function regionLabel(environment: CloudEnvironment): string {
	return environment.region?.label ?? environment.name;
}

/** Where the person works, for messages: `WSO2 Cloud (Europe region)`, or `WSO2 Cloud` where there is no region to select. */
export function cloudPlaceName(environment: CloudEnvironment = ext.clients.platform.environment): string {
	return ext.clients.platform.regions.length > 1 && environment.region ? `Choreo Cloud (${regionLabel(environment)} region)` : "Choreo Cloud";
}

/**
 * Asks the person to select one of production's regions, the current one
 * listed first. The current region, without asking, where there is no
 * choice; undefined when the person closed the list.
 */
export async function pickRegion(options: { title: string; placeHolder: string }): Promise<CloudEnvName | undefined> {
	const platform = ext.clients.platform;
	const current = platform.environment.name;
	if (platform.regions.length < 2) {
		return current;
	}
	const ordered = [...platform.regions].sort((a, b) => Number(b.name === current) - Number(a.name === current));
	const picked = await window.showQuickPick(
		ordered.map((region): QuickPickItem & { name: CloudEnvName } => ({
			name: region.name,
			label: regionLabel(region),
			description: region.name === current ? "Current region" : undefined,
		})),
		{ title: options.title, placeHolder: options.placeHolder, ignoreFocusOut: true },
	);
	return picked?.name;
}

/** Moves to another of production's regions; the person is signed in there if they were before, and offered to sign in otherwise. */
export function switchRegionCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(WICommandIds.SwitchRegion, async () => {
			try {
				isPlatformReady(ext);
				const platform = ext.clients.platform;
				if (platform.regions.length < 2) {
					window.showInformationMessage("This Choreo Cloud environment has only one region.");
					return;
				}
				const chosen = await pickRegion({ title: "Switch Choreo Cloud Region", placeHolder: "Select the region to create and deploy your integrations in" });
				if (!chosen || chosen === platform.environment.name) {
					return;
				}
				await platform.switchEnvironment(chosen);
				await ext.authProvider?.initAuth();
				const region = regionLabel(platform.environment);
				if (ext.authProvider?.isLoggedIn) {
					window.showInformationMessage(`Switched to the ${region} region of Choreo Cloud.`);
					return;
				}
				const action = await window.showInformationMessage(`Switched to the ${region} region of Choreo Cloud. Sign in to continue.`, "Sign In");
				if (action === "Sign In") {
					await commands.executeCommand(WICommandIds.SignIn, { region: chosen });
				}
			} catch (error) {
				ext.logError("Could not switch the Choreo Cloud region", error as Error);
				handleCloudError(error, "Could not switch the Choreo Cloud region.");
			}
		}),
	);
}
