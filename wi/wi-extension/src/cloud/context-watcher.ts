/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import type * as vscode from "vscode";

/** What watching context files needs from VS Code and from the extension. */
export interface ContextWatchDeps {
	createFileSystemWatcher(glob: string): vscode.FileSystemWatcher;
	isLoggedIn(): boolean;
	refresh(): void;
	/** How long a burst of changes has to settle before the files are read again. */
	delayMs?: number;
}

/**
 * Reads the project context again when a `.wso2/context.yaml` is created, edited or deleted outside the
 * commands, by hand or by git, so the link it records, or its absence, takes effect without a reload.
 * Deleting the `.wso2` folder reports only the folder, so the folder is watched for deletion too.
 */
export function watchContextFiles(deps: ContextWatchDeps): vscode.Disposable {
	const files = deps.createFileSystemWatcher("**/.wso2/context.yaml");
	const folders = deps.createFileSystemWatcher("**/.wso2");
	let timer: ReturnType<typeof setTimeout> | undefined;
	// A checkout or a save can touch the file several times in a row: read it once they settle.
	const refresh = () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (deps.isLoggedIn()) {
				deps.refresh();
			}
		}, deps.delayMs ?? 500);
	};
	const subscriptions = [
		files,
		folders,
		files.onDidCreate(refresh),
		files.onDidChange(refresh),
		files.onDidDelete(refresh),
		folders.onDidDelete(refresh),
	];
	return {
		dispose: () => {
			clearTimeout(timer);
			for (const subscription of subscriptions) {
				subscription.dispose();
			}
		},
	};
}
