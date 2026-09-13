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

/**
 * Bringing an existing integration's source into a freshly started editor.
 *
 * An editor opened from an integration is given that integration's id, not its
 * source: the platform records where the source lives, and the working copy is
 * the editor's to obtain. Until the platform can issue a read credential, the
 * clone is authenticated by the user's own GitHub session — the same one that
 * already answers the push — which is why it happens here rather than in the
 * container's startup script, where no session exists yet.
 */

/** Where an integration's source lives, as the platform records it. */
export interface SourceLocation {
	repoUrl: string;
	branch: string;
	/** Path within the repository, without leading or trailing slashes. "" at the root. */
	subPath: string;
}

/** What the editor knows about itself when it starts. */
export interface RestoreContext {
	backend: string;
	/** The integration this editor was opened for, "" for a fresh one. */
	sourceComponentId: string | undefined;
	/** Whether the open workspace is already a git repository. */
	workspaceIsRepository: boolean;
}

/**
 * Whether this editor should fetch an integration's source before the user
 * starts work.
 *
 * Only an editor opened *for* an integration has anything to fetch, and only
 * one whose workspace is not already a repository: a workspace that is one has
 * either been restored already or holds work the user has not pushed, and
 * replacing it would discard that.
 */
export function shouldRestoreSource(ctx: RestoreContext): boolean {
	return (
		ctx.backend === "ipaas" &&
		!!ctx.sourceComponentId &&
		!ctx.workspaceIsRepository
	);
}

/**
 * The directory the integration occupies once cloned.
 *
 * The repository is cloned whole and the integration sits at its recorded
 * subpath, so this is where the editor opens — not the clone root, which for a
 * repository holding several integrations is somebody else's source.
 */
export function integrationPath(cloneRoot: string, subPath: string): string {
	const relative = normalizeSubPath(subPath);
	return relative ? `${cloneRoot.replace(/\/+$/, "")}/${relative}` : cloneRoot;
}

/** Reduce a recorded subpath to a relative path, or "" for the repository root. */
export function normalizeSubPath(subPath: string | undefined): string {
	const normalized = (subPath ?? "")
		.replace(/\\/g, "/")
		.replace(/^\.?\/+/, "")
		.replace(/\/+$/, "");
	return normalized === "." ? "" : normalized;
}

/**
 * The location recorded for an integration, or null when it has none.
 *
 * A component with no repository binding cannot be restored: it was never
 * given a source, so there is nothing to fetch and nothing to report as
 * missing.
 */
export function toSourceLocation(
	source:
		| { repo?: string; branch?: string; path?: string }
		| null
		| undefined,
): SourceLocation | null {
	const repoUrl = source?.repo?.trim();
	if (!repoUrl) {
		return null;
	}
	return {
		repoUrl,
		branch: source?.branch?.trim() ?? "",
		subPath: normalizeSubPath(source?.path),
	};
}
