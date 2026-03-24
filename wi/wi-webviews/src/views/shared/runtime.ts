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

import type { WsClient } from "../../network-bridge/WsClient";

export type WIRuntime = "WSO2: BI" | "WSO2: MI" | "WSO2: SI";
export type SampleSupportedRuntime = Exclude<WIRuntime, "WSO2: SI">;

export const RUNTIME_PRIORITY: WIRuntime[] = [
	"WSO2: BI",
	"WSO2: MI",
	"WSO2: SI",
];

export const RUNTIME_DISPLAY_LABEL: Record<WIRuntime, string> = {
	"WSO2: BI": "Default",
	"WSO2: MI": "WSO2: MI",
	"WSO2: SI": "WSO2: SI",
};

export const CREATION_RUNTIME_HELP: Record<WIRuntime, string> = {
	"WSO2: BI":
		"Create a Ballerina integration using the selected profile with package and workspace options.",
	"WSO2: MI":
		"Create a Micro Integrator project using the selected profile with version and advanced Maven settings.",
	"WSO2: SI":
		"Create a Stream Integrator project using the selected profile with quick path and name setup.",
};

const RUNTIME_CONFIG_SECTIONS: Record<WIRuntime, string> = {
	"WSO2: BI": "integrator.enabledRuntimes.bi",
	"WSO2: MI": "integrator.enabledRuntimes.mi",
	"WSO2: SI": "integrator.enabledRuntimes.si",
};

export async function loadEnabledRuntimes(
	wsClient: WsClient,
): Promise<WIRuntime[]> {
	const runtimeResponses = await Promise.all(
		RUNTIME_PRIORITY.map((runtime) =>
			wsClient.getConfiguration({ section: RUNTIME_CONFIG_SECTIONS[runtime] }),
		),
	);

	const enabledRuntimes = RUNTIME_PRIORITY.filter(
		(runtime, index) => runtimeResponses[index]?.value === true,
	);
	return enabledRuntimes.length > 0 ? enabledRuntimes : [RUNTIME_PRIORITY[0]];
}

export function getDefaultRuntime(enabledRuntimes: WIRuntime[]): WIRuntime {
	return enabledRuntimes[0] ?? RUNTIME_PRIORITY[0];
}

export function supportsSamples(
	runtime: WIRuntime,
): runtime is SampleSupportedRuntime {
	return runtime !== "WSO2: SI";
}
