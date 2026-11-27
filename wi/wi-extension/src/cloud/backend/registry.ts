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

import type { WIPlatform } from "../platform/platform-client";
import type { CloudBackend } from "./port";

/** Builds the backend of one platform, for the clients in use. */
export type CloudBackendFactory = (platform: WIPlatform) => CloudBackend;

/**
 * The backends the editor offers, by the platform name the package's switch uses. The first is the one used when the
 * clients report a platform no backend is registered for.
 */
export class CloudBackends {
	private readonly built = new Map<string, CloudBackend>();

	constructor(private readonly factories: ReadonlyMap<string, CloudBackendFactory>) {
		if (factories.size === 0) {
			throw new Error("No cloud backend is registered.");
		}
	}

	/** The backend of the platform the clients are on; built once and kept. */
	for(platform: WIPlatform): CloudBackend {
		const name = this.factories.has(platform.platform) ? platform.platform : [...this.factories.keys()][0];
		let backend = this.built.get(name);
		if (!backend) {
			backend = (this.factories.get(name) as CloudBackendFactory)(platform);
			this.built.set(name, backend);
		}
		return backend;
	}
}
