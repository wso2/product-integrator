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

import { existsSync, readFileSync } from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { readContextDocument } from "@wso2/wso2-cloud-client";
import { WORKSPACE_PLATFORM_KEY } from "../workspace-platform";
import { findLegacyContextFile, isLegacyContext } from "./context-file";

/** Kept once someone is seen to have used Devant, so the signs that told need not stay. */
export const KNOWN_DEVANT_USER_KEY = "wso2-integrator.devant.known";
/** The setting that offers Devant to someone the editor has not seen use it. */
export const ENABLE_DEVANT_SETTING = "integrator.advanced.enableDevant";

/** What WSO2 Integrator 5.1 kept in global state, which only a Devant user has. */
const RELEASE_5_1_STORE_KEYS = ["data-cache-zustand-storage-v5", "location-zustand-storage-v5"];

interface Memento {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): Thenable<void>;
}

export interface PlatformSigns {
	globalState: Memento;
	workspaceState: Memento;
	/** The roots of the workspace's folders. */
	workspaceRoots: readonly string[];
	/** Whether the person turned Devant on in the settings. */
	devantEnabled: boolean;
}

/** `root` and, inside a repository, the folders above it up to the repository's own. */
function upToRepository(root: string): string[] {
	const dirs = [root];
	for (let dir = root; !existsSync(path.join(dir, ".git")); ) {
		const parent = path.dirname(dir);
		if (parent === dir) {
			return [root];
		}
		dirs.push(parent);
		dir = parent;
	}
	return dirs;
}

/**
 * The platform a workspace's context file belongs to: Devant for the 5.1 list, Choreo Cloud for the versioned
 * document. A file that links no project yet says nothing.
 */
export function workspacePlatform(roots: readonly string[]): "devant" | "choreo-cloud" | undefined {
	for (const dir of roots.flatMap(upToRepository)) {
		const file = findLegacyContextFile(dir);
		if (!file) {
			continue;
		}
		try {
			const data = yaml.load(readFileSync(file, "utf8"));
			if (isLegacyContext(data)) {
				return "devant";
			}
			if (readContextDocument(data).some((entry) => !entry.local)) {
				return "choreo-cloud";
			}
		} catch {
			// An unreadable file says nothing.
		}
	}
	return undefined;
}

/** Whether the person is seen to use Devant: an editor of 5.1 ran here, or a workspace of theirs is linked to Devant. */
export function isKnownDevantUser(signs: PlatformSigns): boolean {
	if (signs.globalState.get<boolean>(KNOWN_DEVANT_USER_KEY)) {
		return true;
	}
	const seen = RELEASE_5_1_STORE_KEYS.some((key) => !!signs.globalState.get(key)) || workspacePlatform(signs.workspaceRoots) === "devant";
	if (seen) {
		void signs.globalState.update(KNOWN_DEVANT_USER_KEY, true);
	}
	return seen;
}

/** Whether Devant is offered: to someone seen using it, or who turned it on. */
export function isDevantOffered(signs: PlatformSigns): boolean {
	return signs.devantEnabled || isKnownDevantUser(signs);
}

/**
 * The platform to start on, when nothing fixes it: the one switched to in this workspace, else the one the workspace's
 * context file belongs to, else undefined, which leaves it to the one last used and then to Choreo Cloud.
 */
export function startingPlatform(signs: PlatformSigns): string | undefined {
	if (!isDevantOffered(signs)) {
		return undefined;
	}
	return signs.workspaceState.get<string>(WORKSPACE_PLATFORM_KEY) ?? workspacePlatform(signs.workspaceRoots);
}

/**
 * Whether someone who starts signed out of Choreo Cloud belongs on Devant: seen using it, with nothing else to say
 * where they work, neither the workspace nor a platform used with this version.
 */
export function startsOnDevantWhenSignedOut(signs: PlatformSigns, lastUsed: string | undefined): boolean {
	return !lastUsed && startingPlatform(signs) === undefined && isKnownDevantUser(signs);
}
