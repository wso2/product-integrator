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
 * Reading public GitHub repositories through the platform.
 *
 * The platform proxies these unauthenticated, so only public repositories
 * answer. A private one needs a GitHub App installation, which is a separate
 * flow and not wired yet — the important thing here is that a private
 * repository reports as inaccessible rather than as an error, so the form can
 * say so instead of failing.
 */

/** One entry of the platform's repository tree. Paths are from the repo root. */
export interface RepoTreeNode {
	path: string;
	subPath: string;
	type: string;
	children?: RepoTreeNode[];
}

/** Flatten the nested tree into every path it contains. */
export function flattenTree(nodes: RepoTreeNode[] | undefined): string[] {
	const out: string[] = [];
	const walk = (list: RepoTreeNode[] | undefined) => {
		for (const node of list ?? []) {
			if (node.path) {
				out.push(node.path);
			}
			walk(node.children);
		}
	};
	walk(nodes);
	return out;
}

/** Strip leading and trailing slashes. "" and "/" both mean the repository root. */
export function normalizeSubPath(subPath: string | undefined): string {
	return (subPath ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Whether `subPath` holds no files in the given tree.
 *
 * The repository root counts as empty only when the repository itself is, and
 * a path is occupied when anything sits at or beneath it — "src" is not empty
 * when "src/main.bal" exists.
 */
export function isSubPathEmpty(paths: string[], subPath: string): boolean {
	const prefix = normalizeSubPath(subPath);
	if (!prefix) {
		return paths.length === 0;
	}
	return !paths.some(
		(path) => path === prefix || path.startsWith(`${prefix}/`),
	);
}

/** Whether a file of the given name exists directly in `subPath`. */
export function hasFileInPath(
	paths: string[],
	subPath: string,
	fileName: string,
): boolean {
	const prefix = normalizeSubPath(subPath);
	const target = prefix ? `${prefix}/${fileName}` : fileName;
	return paths.includes(target);
}

/**
 * Whether a clone failed because the branch it asked for does not exist.
 *
 * A repository created for this integration a moment ago has no commits, and
 * therefore no branches at all — not even the default one the picker offers.
 * Asking for one fails outright, which is a repository to be filled rather
 * than an error: the first push creates the branch.
 */
export function isMissingRemoteBranch(err: unknown): boolean {
	const text = [
		(err as { stderr?: unknown })?.stderr,
		(err as { message?: unknown })?.message,
	]
		.filter((part): part is string => typeof part === "string")
		.join("\n");
	return (
		/Remote branch .* not found in upstream/i.test(text) ||
		/Could not find remote branch/i.test(text)
	);
}

/**
 * Files the editor writes into the workspace for its own use, which are not
 * part of the integration and must not reach the user's repository.
 *
 * The container excludes these from git, but only when the workspace is
 * already a repository. A cloud editor starts without one — the repository is
 * chosen later, at deploy — so by the time there is something to exclude from,
 * the source has already been copied into the clone. Filtering the copy is
 * what holds in both cases.
 */
const EDITOR_LOCAL_ENTRIES = new Set([".mcp.json", ".vscode"]);

/** Whether a workspace entry belongs to the editor rather than to the integration. */
export function isEditorLocalEntry(name: string): boolean {
	return EDITOR_LOCAL_ENTRIES.has(name);
}
