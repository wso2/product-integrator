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

import { RESOURCE_NAME, buildConsoleUrl } from "@wso2/wso2-cloud-client";
import type { CloudClient } from "@wso2/wso2-cloud-client";
import { toProjectName } from "../cmds/cmd-utils";
import type { CloudBackend } from "./port";

/** Choreo Cloud's name in the platform switch. */
export const CHOREO_CLOUD_PLATFORM = "choreo-cloud";

/** The product name messages and pages use for Choreo Cloud. */
export const CHOREO_CLOUD_LABEL = "WSO2 Cloud";

export interface ChoreoCloudBackendDeps {
	/** The API client of the region in use; read on every call, since the region can change. */
	cloud(): CloudClient;
	/** The console of the region in use. */
	consoleUrl(): string;
	/** The organization signed in to. */
	orgHandle(): string | undefined;
}

/** Choreo Cloud behind the port: each call is the API client's own. */
export function choreoCloudBackend(deps: ChoreoCloudBackendDeps): CloudBackend {
	return {
		platform: CHOREO_CLOUD_PLATFORM,
		label: CHOREO_CLOUD_LABEL,
		projects: {
			list: () => deps.cloud().projects.list(),
			create: async (displayName) => {
				const cloud = deps.cloud();
				let name = toProjectName(displayName);
				try {
					const availability = await cloud.projects.checkHandler(name);
					if (!availability.handlerUnique && availability.alternateHandlerCandidate) {
						name = availability.alternateHandlerCandidate;
					}
				} catch {
					// The check is advisory; the create answers 409 when the name is taken.
				}
				if (!RESOURCE_NAME.test(name)) {
					throw new Error(`${name} is not a name the platform accepts.`);
				}
				return cloud.projects.create({ name, displayName });
			},
		},
		integrations: {
			list: (projectId) => deps.cloud().components.list(projectId),
			find: (ref, projectId) => deps.cloud().components.find(ref, projectId),
			repository: (integrationId, projectId) => deps.cloud().components.repository(integrationId, projectId),
			delete: (integrationId, projectId) => deps.cloud().components.delete(integrationId, projectId),
		},
		links: {
			console: (link) => buildConsoleUrl(deps.consoleUrl(), { orgHandle: deps.orgHandle(), ...link }),
		},
	};
}
