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

import { type CloudEnvName, type CloudEnvironment, trimBaseUrl } from "@wso2/wso2-cloud-client";

/** The variable `@wso2/wso2-cloud-client` already reads to override the console URL of any environment. */
export const CONSOLE_URL_VAR = "WSO2_CLOUD_CONSOLE_URL";

/**
 * The WSO2 Cloud console the links after a deploy (and every other "open in
 * console" link) go to, where WSO2 Integrator knows a different one from the
 * client library's default.
 *
 * Prod uses the library's own console (`https://console.cloud.wso2.com`).
 * Stage's console is on the Choreo Labs domain, not the library's
 * `console.stg.cloud.wso2.com`.
 */
const CONSOLE_URLS: Partial<Record<CloudEnvName, string>> = {
	stage: "https://console.stg.cloud.choreolabs.com",
};

/**
 * The environment with WSO2 Integrator's console URL for it. A
 * `WSO2_CLOUD_CONSOLE_URL` override has already been applied by the client
 * library and still wins.
 */
export function withConsoleUrl(
	environment: CloudEnvironment,
	vars: NodeJS.ProcessEnv = process.env,
	consoleUrls: Partial<Record<CloudEnvName, string>> = CONSOLE_URLS,
): CloudEnvironment {
	const consoleUrl = consoleUrls[environment.name];
	if (vars[CONSOLE_URL_VAR]?.trim() || !consoleUrl) {
		return environment;
	}
	return { ...environment, consoleUrl: trimBaseUrl(consoleUrl) };
}
