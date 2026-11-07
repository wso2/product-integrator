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

import type { CloudClient, CloudEnvironment, Logger, PlatformEnvConfig, UnauthenticatedError } from "@wso2/wso2-cloud-client";
import { type PlatformClients, createPlatformClients, readCloudEnvironment } from "@wso2/wso2-cloud-client/vscode";
import type { ExtensionContext } from "vscode";

/** `publisher.name` of this extension; the sign-in URI's authority. */
export const WI_EXTENSION_ID = "wso2.wso2-integrator";

/**
 * Everything the cloud layer holds for the platform: the environment, the
 * sessions and token source, the API client and the `wso2-cloud`
 * authentication provider, all from `@wso2/wso2-cloud-client`.
 */
export type WIPlatform = PlatformClients;

export interface WIPlatformOptions {
	context: ExtensionContext;
	logger: Logger;
	extensionVersion: string;
	onUnauthenticated: (error: UnauthenticatedError) => void;
}

export function createWIPlatform(options: WIPlatformOptions): WIPlatform {
	const environment: CloudEnvironment = readCloudEnvironment();
	return createPlatformClients({
		extensionId: WI_EXTENSION_ID,
		context: options.context,
		environment,
		userAgent: `wso2-integrator-vscode/${options.extensionVersion}`,
		logger: options.logger,
		onUnauthenticated: options.onUnauthenticated,
	});
}
