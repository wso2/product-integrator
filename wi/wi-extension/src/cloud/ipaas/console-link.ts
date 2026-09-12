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

import { normalizeBaseUrl } from "./config";

/**
 * Deep link into a cloud console.
 *
 * The route shape is the same on both backends:
 * `/organizations/{org}/projects/{project}[/components/{component}/overview]`.
 *
 * Returns "" when the base or either required handle is missing, so a caller
 * with no console URL skips the action instead of opening a link that starts
 * "undefined/organizations/…".
 */
export function buildConsoleLink(
	base: string,
	orgHandle: string,
	projectHandler: string,
	componentHandler?: string,
): string {
	const root = normalizeBaseUrl(base);
	if (!root || !orgHandle || !projectHandler) {
		return "";
	}
	const project = `${root}/organizations/${encodeURIComponent(orgHandle)}/projects/${encodeURIComponent(projectHandler)}`;
	return componentHandler
		? `${project}/components/${encodeURIComponent(componentHandler)}/overview`
		: project;
}
