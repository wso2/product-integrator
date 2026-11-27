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
import { type ExtensionContext, type QuickPickItem, commands, window } from "vscode";
import { ext } from "../../extensionVariables";
import { CHOREO_CLOUD_LABEL, CHOREO_CLOUD_PLATFORM } from "../backend/choreo-cloud";
import { DEVANT_LABEL, DEVANT_PLATFORM } from "../backend/devant";
import { WORKSPACE_PLATFORM_KEY } from "../backend/devant/detection";
import { handleCloudError } from "../platform/error-handler";
import { isPlatformReady } from "./cmd-utils";

export const SWITCH_PLATFORM_COMMAND = "wso2.integrator.cloud.auth.switchPlatform";
/** The context key that says whether another platform than Choreo Cloud is offered; the switch command shows by it. */
export const PLATFORMS_OFFERED_CONTEXT = "wso2.integrator.cloud.platformsOffered";

const LABELS: Record<string, string> = { [CHOREO_CLOUD_PLATFORM]: CHOREO_CLOUD_LABEL, [DEVANT_PLATFORM]: DEVANT_LABEL };

export function platformLabel(name: string): string {
	return LABELS[name] ?? name;
}

/** Asks which platform to work on, the current one first; the current one without asking where there is no other. */
export async function pickPlatform(options: { title: string; placeHolder: string }): Promise<string | undefined> {
	const platform = ext.clients.platform;
	if (platform.platforms.length < 2) {
		return platform.platform;
	}
	const ordered = [...platform.platforms].sort((a, b) => Number(b.name === platform.platform) - Number(a.name === platform.platform));
	const picked = await window.showQuickPick(
		ordered.map((item): QuickPickItem & { name: string } => ({
			name: item.name,
			label: platformLabel(item.name),
			description: item.name === platform.platform ? "Current" : item.name === DEVANT_PLATFORM ? "Your existing projects" : undefined,
		})),
		{ ...options, ignoreFocusOut: true },
	);
	return picked?.name;
}

/** Moves to `name` live and remembers it for this workspace; the session there is used if there is one. */
export async function switchPlatform(name: string): Promise<void> {
	const platform = ext.clients.platform;
	if (name === platform.platform) {
		return;
	}
	await platform.switchPlatform(name);
	await ext.context.workspaceState.update(WORKSPACE_PLATFORM_KEY, name);
	await ext.authProvider?.initAuth();
}

export function switchPlatformCommand(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(SWITCH_PLATFORM_COMMAND, async (target?: string) => {
			try {
				isPlatformReady(ext);
				const platform = ext.clients.platform;
				if (platform.platforms.length < 2) {
					window.showInformationMessage(`Only ${ext.backend.label} is available in this editor.`);
					return;
				}
				const chosen = target ?? (await pickPlatform({ title: "Switch Platform", placeHolder: "Select the platform your projects are on" }));
				if (!chosen || chosen === platform.platform) {
					return;
				}
				await switchPlatform(chosen);
				if (ext.authProvider?.isLoggedIn) {
					window.showInformationMessage(`Switched to ${ext.backend.label}.`);
					return;
				}
				const action = await window.showInformationMessage(`Switched to ${ext.backend.label}. Sign in to continue.`, "Sign In");
				if (action === "Sign In") {
					await commands.executeCommand(WICommandIds.SignIn);
				}
			} catch (error) {
				ext.logError("Could not switch the platform", error as Error);
				handleCloudError(error, "Could not switch the platform.");
			}
		}),
	);
}
