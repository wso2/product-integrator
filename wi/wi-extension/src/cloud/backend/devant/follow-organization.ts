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

/** What the follower reads of the workspace's projects. */
export interface WorkspaceRead {
	loading: boolean;
	items: readonly { orgHandle: string; foreignOrg?: boolean }[];
}

/**
 * Decides, once for a sign-in, whether to move to the organization the workspace is linked to: on the first finished
 * read of the workspace, when it is linked to projects of one other organization only. A move made by anything else
 * before then is the person's choice, and stands.
 */
export class OrganizationFollower {
	private decided = false;
	private wasLoading = true;
	private sessionOrg: string | undefined;

	/** The organization to move to, given the session's organization and the workspace as read now. */
	next(sessionOrg: string | undefined, read: WorkspaceRead): string | undefined {
		if (!sessionOrg) {
			this.decided = false;
			this.wasLoading = true;
			this.sessionOrg = undefined;
			return undefined;
		}
		if (this.sessionOrg && this.sessionOrg !== sessionOrg) {
			this.decided = true;
		}
		this.sessionOrg = sessionOrg;
		const finishedRead = this.wasLoading && !read.loading;
		this.wasLoading = read.loading;
		if (this.decided || !finishedRead || read.items.length === 0) {
			return undefined;
		}
		this.decided = true;
		const handles = [...new Set(read.items.map((item) => item.orgHandle))];
		if (read.items.some((item) => !item.foreignOrg) || handles.length !== 1) {
			return undefined;
		}
		return handles[0];
	}
}
