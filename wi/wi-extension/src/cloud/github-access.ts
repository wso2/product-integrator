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

import { ext } from "../extensionVariables";
import { type GitHubRepoAccess, sharedGitHubAccess } from "./github-app";

/** What the person is told when the WSO2 Cloud sign-in changed before an action about GitHub went on. */
export const SIGN_IN_CHANGED_MESSAGE = "Your Choreo Cloud sign-in changed, so connecting GitHub was stopped. Start again from the form.";

/** Who is signed in to WSO2 Cloud, and to which organization; undefined when no one is. */
export function signedInScope(): string | undefined {
	const session = ext.authProvider?.session;
	return session ? `${session.user.userId}/${session.org.handle}` : undefined;
}

/** How WSO2 Cloud can read `owner/repo`, shared for a few seconds by the checks of one repository. */
export function gitHubAccessFor(owner: string, repo: string): Promise<GitHubRepoAccess> {
	const scope = signedInScope();
	return sharedGitHubAccess(ext.clients.platform.cloud, scope ?? "", owner, repo, { log: ext.log.bind(ext), isCurrent: () => signedInScope() === scope });
}
