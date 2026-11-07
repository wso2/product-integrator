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

import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "fs";
import * as path from "path";
import {
	CONTEXT_FILE_DIR,
	CONTEXT_FILE_NAME,
	type ContextEntry,
	LEGACY_CONTEXT_FILE_DIR,
	readContextDocument,
	removeContextEntry,
	toContextDocument,
	upsertContextEntry,
} from "@wso2/wso2-cloud-client";
import * as yaml from "js-yaml";

/**
 * `.wso2/context.yaml`: which cloud project a repository belongs to.
 *
 * The file is read in every shape the extensions have written (the v2
 * document, the v1 list and the oldest single object) and from the legacy
 * `.choreo/` directory, and always written back as the v2 document under
 * `.wso2/`. The legacy file is left where it is; it may hold other things.
 */

export function contextFilePath(gitRoot: string): string {
	return path.join(gitRoot, CONTEXT_FILE_DIR, CONTEXT_FILE_NAME);
}

export function legacyContextFilePath(gitRoot: string): string {
	return path.join(gitRoot, LEGACY_CONTEXT_FILE_DIR, CONTEXT_FILE_NAME);
}

/** The context file to read for a repository: `.wso2/` first, then the legacy `.choreo/`. */
export function findContextFile(gitRoot: string): string | undefined {
	for (const candidate of [contextFilePath(gitRoot), legacyContextFilePath(gitRoot)]) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

export function readContextFile(filePath: string): ContextEntry[] {
	try {
		return readContextDocument(yaml.load(readFileSync(filePath, "utf8")));
	} catch {
		return [];
	}
}

export function readContextEntries(gitRoot: string): ContextEntry[] {
	const file = findContextFile(gitRoot);
	return file ? readContextFile(file) : [];
}

/** Writes the v2 document under `.wso2/`, creating the directory; removes the file when nothing is left. */
export function writeContextEntries(gitRoot: string, entries: ContextEntry[]): string {
	const target = contextFilePath(gitRoot);
	if (entries.length === 0) {
		if (existsSync(target)) {
			unlinkSync(target);
			const dir = path.dirname(target);
			if (existsSync(dir) && readdirSync(dir).length === 0) {
				rmdirSync(dir);
			}
		}
		return target;
	}
	const dir = path.dirname(target);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(target, yaml.dump(toContextDocument(entries), { lineWidth: 120 }));
	return target;
}

/** Links a repository to a project: adds or updates the entry and returns the file written. */
export function linkContext(gitRoot: string, entry: ContextEntry): string {
	return writeContextEntries(gitRoot, upsertContextEntry(readContextEntries(gitRoot), entry));
}

/** Removes a project's entry from each of the repositories named. */
export function unlinkContext(projectRoots: string[], entry: Pick<ContextEntry, "org" | "project">): void {
	for (const gitRoot of projectRoots) {
		const entries = readContextEntries(gitRoot);
		if (entries.length > 0) {
			writeContextEntries(gitRoot, removeContextEntry(entries, entry));
		}
	}
}

/** The entry marked `local: true`, which a deploy turns into a project. */
export function localContextEntry(gitRoot: string): ContextEntry | undefined {
	return readContextEntries(gitRoot).find((entry) => entry.local === true);
}

/**
 * One context file per repository: the `.wso2` one when both it and a
 * legacy `.choreo` one are there, since the migration leaves the old file
 * in place.
 */
export function pickContextFiles(files: string[]): string[] {
	const byRoot = new Map<string, string>();
	for (const file of files) {
		const root = path.dirname(path.dirname(file));
		const current = byRoot.get(root);
		if (!current || path.basename(path.dirname(file)) === ".wso2") {
			byRoot.set(root, file);
		}
	}
	return [...byRoot.values()];
}
