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
import type { ContextEntry } from "@wso2/wso2-cloud-client";
import * as yaml from "js-yaml";
import type { CloudContextFiles } from "../port";

/** Where WSO2 Integrator 5.1 kept a repository's projects: `.wso2/context.yaml`, or `.choreo/context.yaml` before it. */
const CONTEXT_DIRS = [".wso2", ".choreo"];
const CONTEXT_FILE = "context.yaml";

/** One project in the 5.1 file: the organization's and the project's handles. */
interface LegacyContextItem {
	org: string;
	project: string;
}

/** The 5.1 file of the repository, `.wso2` first. */
export function findLegacyContextFile(gitRoot: string): string | undefined {
	return CONTEXT_DIRS.map((dir) => path.join(gitRoot, dir, CONTEXT_FILE)).find((file) => existsSync(file));
}

/** The entries of a 5.1 file: a list of `{org, project}`, or, earlier still, one such object. */
export function parseLegacyContext(data: unknown): ContextEntry[] {
	const items = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
	return items
		.filter((item): item is LegacyContextItem => !!item && typeof item.org === "string" && typeof item.project === "string" && !!item.org && !!item.project)
		.map((item) => ({ org: item.org, project: item.project }));
}

/** Whether `data` is a 5.1 file rather than the versioned document Choreo Cloud's editors write. */
export function isLegacyContext(data: unknown): boolean {
	return parseLegacyContext(data).length > 0 && (Array.isArray(data) || !("version" in (data as object)));
}

function readLegacyContextFile(filePath: string): ContextEntry[] {
	try {
		return parseLegacyContext(yaml.load(readFileSync(filePath, "utf8")));
	} catch {
		return [];
	}
}

function writeLegacyContextFile(gitRoot: string, entries: ContextEntry[]): string {
	const target = findLegacyContextFile(gitRoot) ?? path.join(gitRoot, CONTEXT_DIRS[0], CONTEXT_FILE);
	if (entries.length === 0) {
		if (existsSync(target)) {
			unlinkSync(target);
			const dir = path.dirname(target);
			if (readdirSync(dir).length === 0) {
				rmdirSync(dir);
			}
		}
		return target;
	}
	mkdirSync(path.dirname(target), { recursive: true });
	const items: LegacyContextItem[] = entries.map((entry) => ({ org: entry.org, project: entry.project }));
	writeFileSync(target, yaml.dump(items));
	return target;
}

/** The 5.1 format, which Devant's editors and teammates still on 5.1 read and write. */
export const legacyContextFiles: CloudContextFiles = {
	find: findLegacyContextFile,
	read: readLegacyContextFile,
	link: (gitRoot, entry) => {
		const file = findLegacyContextFile(gitRoot);
		const entries = file ? readLegacyContextFile(file) : [];
		const others = entries.filter((item) => !(item.org === entry.org && item.project === entry.project));
		return writeLegacyContextFile(gitRoot, [...others, { org: entry.org, project: entry.project }]);
	},
	unlink: (gitRoots, entry) => {
		for (const gitRoot of gitRoots) {
			const file = findLegacyContextFile(gitRoot);
			if (file) {
				writeLegacyContextFile(
					gitRoot,
					readLegacyContextFile(file).filter((item) => !(item.org === entry.org && item.project === entry.project)),
				);
			}
		}
	},
};
