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

import { ext } from "../../extensionVariables";
import { normalizeBaseUrl } from "./config";
import { buildConsoleLink } from "./console-link";

/**
 * Console base for the active backend.
 *
 * The Integration Platform's console and its API are separate deployments
 * behind the gateway on unrelated hosts, so this is supplied on its own rather
 * than derived from the API base URL — or from the editor's, which is a
 * per-component subdomain that identifies neither.
 */
export function consoleBaseUrl(): string {
	if (ext.cloudBackend === "ipaas") {
		return ext.ipaasConsoleUrl;
	}
	return normalizeBaseUrl(ext.config?.devantConsoleUrl);
}

/** Link to a project, or to one integration's overview within it. "" when no console URL is known. */
export function consoleLink(
	orgHandle: string,
	projectHandler: string,
	componentHandler?: string,
): string {
	return buildConsoleLink(
		consoleBaseUrl(),
		orgHandle,
		projectHandler,
		componentHandler,
	);
}
