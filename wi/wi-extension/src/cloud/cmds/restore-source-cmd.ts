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

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getComponentKindRepoSource } from "@wso2/wso2-platform-core";
import { ProgressLocation, Uri, commands, window, workspace } from "vscode";
import { ext } from "../../extensionVariables";
import { initGit } from "../git/main";
import { getGitRoot } from "../git/util";
import {
	integrationPath,
	shouldRestoreSource,
	toSourceLocation,
} from "../ipaas/source-restore";

/**
 * Bring an existing integration's source into an editor that was opened for it.
 *
 * The platform hands the editor an integration id and nothing else, so the
 * working copy has to be fetched here. The clone is unauthenticated until git
 * says otherwise: a public repository needs no credential, and a private one
 * draws on the user's own GitHub session through the askpass provider — the
 * same credential that answers the push. Once the platform can issue a read
 * token, only the URL handed to clone changes.
 */
export async function restoreIntegrationSource(): Promise<void> {
	const sourceComponentId = process.env.SOURCE_COMPONENT_ID;
	const workspacePath = workspace.workspaceFolders?.[0]?.uri?.fsPath;
	if (!workspacePath) {
		return;
	}

	const workspaceIsRepository = !!(await getGitRoot(ext.context, workspacePath));
	if (
		!shouldRestoreSource({
			backend: ext.cloudBackend,
			sourceComponentId,
			workspaceIsRepository,
		})
	) {
		return;
	}

	const projectHandle = process.env.CLOUD_INITIAL_PROJECT_ID;
	if (!projectHandle) {
		ext.log("No project is known, so the integration's source cannot be located.");
		return;
	}

	try {
		const components = await ext.clients.rpcClient.getComponentList({
			projectHandle,
			orgId: "",
			orgHandler: "",
			projectId: projectHandle,
		} as never);
		const component = components.find(
			(item) => item.metadata?.id === sourceComponentId,
		);
		if (!component) {
			ext.log(`Integration ${sourceComponentId} was not found in ${projectHandle}.`);
			return;
		}

		const repoSource = getComponentKindRepoSource(component.spec.source);
		const location = toSourceLocation({
			repo: repoSource.repo,
			branch:
				component.spec.source?.github?.branch ||
				component.spec.source?.gitlab?.branch ||
				component.spec.source?.bitbucket?.branch ||
				"",
			path: repoSource.path,
		});
		if (!location) {
			// An integration with no repository recorded has no source to fetch.
			return;
		}

		const repoName = location.repoUrl.replace(/\/+$/, "").split("/").pop() ?? "source";
		const parentPath = dirname(workspacePath);
		const cloneRoot = join(parentPath, repoName);
		if (existsSync(cloneRoot)) {
			ext.log(`${cloneRoot} already exists; leaving it as it is.`);
			return;
		}

		const git = await initGit(ext.context);
		if (!git) {
			throw new Error("failed to retrieve Git details");
		}

		await window.withProgress(
			{
				title: `Fetching the source of ${component.metadata?.displayName || component.metadata?.name}`,
				location: ProgressLocation.Notification,
			},
			async (progress, cancellationToken) =>
				git.clone(
					location.repoUrl,
					{
						recursive: true,
						...(location.branch ? { ref: location.branch } : {}),
						parentPath,
						progress: {
							report: ({ increment, ...rest }: { increment: number }) =>
								progress.report({ increment, ...rest }),
						},
					},
					cancellationToken,
				),
		);

		const openAt = integrationPath(cloneRoot, location.subPath);
		if (!existsSync(openAt)) {
			// The recorded subpath is not in the branch that was cloned. Opening
			// the clone root would silently put the user in the wrong directory.
			window.showWarningMessage(
				`The integration's source was fetched, but "${location.subPath}" is not in ${location.branch || "the default branch"}.`,
			);
			return;
		}
		await commands.executeCommand("vscode.openFolder", Uri.file(openAt), {
			forceNewWindow: false,
		});
	} catch (err) {
		ext.logError("Could not fetch the integration's source", err as Error);
		window.showErrorMessage(
			`Could not fetch this integration's source: ${(err as Error).message}`,
		);
	}
}
