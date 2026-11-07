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
import { type PersistOptions, createJSONStorage } from "zustand/middleware";
import { ext } from "../../extensionVariables";

/**
 * Bumped from 5 to 6 with the move from the Choreo CLI to the platform API:
 * every cached shape (projects, integrations, the auth state) changed, and
 * the old keys embedded a region that no longer exists.
 */
export const storeVersionInt = 6;
const version = `v${storeVersionInt}`;

export const STORE_NAMES = ["data-cache-zustand-storage", "location-zustand-storage", "dir-context-zustand-storage"] as const;

export const storeKey = (storeName: string, versionInt = storeVersionInt): string => `${storeName}-v${versionInt}`;

export const getGlobalStateStore = (storeName: string): PersistOptions<any, any> => {
	return {
		name: `${storeName}-${version}`,
		storage: createJSONStorage(() => ({
			getItem: async (name) => {
				const value = await ext.context.globalState.get(name);
				return value ? (value as string) : "";
			},
			removeItem: (name) => ext.context.globalState.update(name, undefined),
			setItem: (name, value) => ext.context.globalState.update(name, value),
		})),
		version: storeVersionInt,
		skipHydration: true,
	};
};

export const getWorkspaceStateStore = (storeName: string): PersistOptions<any, any> => {
	return {
		name: `${storeName}-${version}`,
		storage: createJSONStorage(() => ({
			getItem: async (name) => {
				const value = await ext.context.workspaceState.get(name);
				return value ? (value as string) : "";
			},
			removeItem: (name) => ext.context.workspaceState.update(name, undefined),
			setItem: (name, value) => ext.context.workspaceState.update(name, value),
		})),
		version: storeVersionInt,
		skipHydration: true,
	};
};

/** Forgets what the previous store version kept; zustand's persist has no migration, and the shapes changed. */
export async function clearPreviousStoreVersions(context: ExtensionContext): Promise<void> {
	for (const name of STORE_NAMES) {
		for (let previous = 1; previous < storeVersionInt; previous++) {
			await context.globalState.update(storeKey(name, previous), undefined);
			await context.workspaceState.update(storeKey(name, previous), undefined);
		}
	}
}
