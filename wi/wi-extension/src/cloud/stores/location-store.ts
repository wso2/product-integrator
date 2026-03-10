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

import { existsSync } from "fs";
import type { ContextItemEnriched, ContextStoreComponentState, LocationStoreState } from "@wso2/wso2-platform-core";
import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { getGlobalStateStore } from "./store-utils";

interface LocationStore {
	state: LocationStoreState;
	setLocation: (selectedContextItem: ContextItemEnriched, componentItems: ContextStoreComponentState[]) => void;
	getLocations: (
		projectHandle: string,
		orgHandle: string,
	) => {
		fsPath: string;
		componentItems: ContextStoreComponentState[];
		context?: ContextItemEnriched;
	}[];
}

const initialState: LocationStoreState = { projectLocations: {} };

/** To keep track of the file system paths of opened cloud projects */
export const locationStore = createStore(
	persist<LocationStore>(
		(set, get) => ({
			state: initialState,
			setLocation: (selectedContextItem, componentItems) => {
				const projectKey = `${selectedContextItem.org?.handle}-${selectedContextItem.project?.handler}`;
				for (const contextDirItem of selectedContextItem.contextDirs) {
					set(({ state }) => ({
						state: {
							...state,
							projectLocations: {
								...state.projectLocations,
								[projectKey]: {
									...state.projectLocations?.[projectKey],
									[contextDirItem.projectRootFsPath]: {
										components: componentItems || [],
										contextItem: selectedContextItem,
									},
								},
							},
						},
					}));
				}
			},
			getLocations: (projectHandle, orgHandle) => {
				const projectKey = `${orgHandle}-${projectHandle}`;
				return Object.keys(get().state.projectLocations?.[projectKey] ?? {})
					.map((fsPath) => ({
						fsPath,
						componentItems: get().state.projectLocations?.[projectKey]?.[fsPath]?.components ?? [],
						context: get().state.projectLocations?.[projectKey]?.[fsPath]?.contextItem,
					}))
					.filter((item) => existsSync(item.fsPath));
			},
		}),
		getGlobalStateStore("location-zustand-storage"),
	),
);
