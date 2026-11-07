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
import type { ContextItemEnriched, DirectoryIntegration } from "@wso2/wso2-cloud-client";
import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { getGlobalStateStore } from "./store-utils";

export interface LocationStoreState {
	projectLocations: {
		[projectKey: string]: {
			[fsPath: string]: {
				contextItem?: ContextItemEnriched;
				integrations?: DirectoryIntegration[];
			};
		};
	};
}

export interface ProjectLocation {
	fsPath: string;
	integrations: DirectoryIntegration[];
	context?: ContextItemEnriched;
}

interface LocationStore {
	state: LocationStoreState;
	setLocation: (selected: ContextItemEnriched, integrations: DirectoryIntegration[]) => void;
	getLocations: (projectName: string, orgHandle: string) => ProjectLocation[];
}

const initialState: LocationStoreState = { projectLocations: {} };

export const projectLocationKey = (orgHandle: string, projectName: string) => `${orgHandle}-${projectName}`;

/** Where on this machine each cloud project has been opened, so a link from the console can find it again. */
export const locationStore = createStore(
	persist<LocationStore>(
		(set, get) => ({
			state: initialState,
			setLocation: (selected, integrations) => {
				const projectKey = projectLocationKey(selected.orgHandle, selected.projectName);
				for (const contextDir of selected.contextDirs) {
					set(({ state }) => ({
						state: {
							...state,
							projectLocations: {
								...state.projectLocations,
								[projectKey]: {
									...state.projectLocations?.[projectKey],
									[contextDir.projectRootFsPath]: { integrations: integrations || [], contextItem: selected },
								},
							},
						},
					}));
				}
			},
			getLocations: (projectName, orgHandle) => {
				const projectKey = projectLocationKey(orgHandle, projectName);
				const locations = get().state.projectLocations?.[projectKey] ?? {};
				return Object.keys(locations)
					.map((fsPath) => ({ fsPath, integrations: locations[fsPath]?.integrations ?? [], context: locations[fsPath]?.contextItem }))
					.filter((item) => existsSync(item.fsPath));
			},
		}),
		getGlobalStateStore("location-zustand-storage"),
	),
);
