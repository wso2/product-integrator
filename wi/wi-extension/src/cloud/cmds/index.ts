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

import type { ExtensionContext } from "vscode";
import { cloneRepoCommand } from "./clone-project-cmd";
import { commitAndPushToGitCommand } from "./commit-and-push-to-git-cmd";
import { createNewComponentCommand } from "./create-component-cmd";
import { createDirectoryContextCommand } from "./create-directory-context-cmd";
import { deleteComponentCommand } from "./delete-component-cmd";
import { manageProjectContextCommand } from "./manage-dir-context-cmd";
import { openCompSrcCommand } from "./open-comp-src-cmd";
import { openInConsoleCommand } from "./open-in-console-cmd";
import { refreshContextCommand } from "./refresh-directory-context-cmd";
import { signInCommand } from "./sign-in-cmd";
import { signOutCommand } from "./sign-out-cmd";

// Note: the following platform commands are intentionally excluded from wi:
//   create-comp-dependency-cmd, create-project-workspace-cmd,
//   view-comp-dependency-cmd, view-component-cmd

export function activateCmds(context: ExtensionContext) {
	createNewComponentCommand(context);
	refreshContextCommand(context);
	deleteComponentCommand(context);
	signInCommand(context);
	signOutCommand(context);
	openInConsoleCommand(context);
	cloneRepoCommand(context);
	manageProjectContextCommand(context);
	createDirectoryContextCommand(context);
	commitAndPushToGitCommand(context);
	openCompSrcCommand(context);
}
