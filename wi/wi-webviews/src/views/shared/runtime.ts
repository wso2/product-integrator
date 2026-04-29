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

import {
	DEFAULT_PROFILE,
	MI_PROFILE,
	SELECTED_PROFILE_VALUES,
	SELECTED_PROFILE_CONFIG_SECTION,
	SI_PROFILE,
	type SelectedProfileValue,
} from "@wso2/wi-core";
import type { WsClient } from "../../network-bridge/WsClient";

export type WIRuntime = "WSO2: BI" | "WSO2: MI" | "WSO2: SI";
export type SampleSupportedRuntime = Exclude<WIRuntime, "WSO2: SI">;

export const RUNTIME_DISPLAY_LABEL: Record<WIRuntime, string> = {
	"WSO2: BI": DEFAULT_PROFILE,
	"WSO2: MI": MI_PROFILE,
	"WSO2: SI": SI_PROFILE,
};

export const CREATION_RUNTIME_HELP: Record<WIRuntime, string> = {
	"WSO2: BI":
		"Create an integration with package and workspace options.",
	"WSO2: MI":
		"Create a WSO2 Integrator: MI project.",
	"WSO2: SI":
		"Create a WSO2 Integrator: SI project.",
};

const PROFILE_RUNTIME_MAP: Record<SelectedProfileValue, WIRuntime> = {
	[DEFAULT_PROFILE]: "WSO2: BI",
	[MI_PROFILE]: "WSO2: MI",
	[SI_PROFILE]: "WSO2: SI",
};

function isSelectedProfileValue(value: unknown): value is SelectedProfileValue {
	return typeof value === "string"
		&& (SELECTED_PROFILE_VALUES as readonly string[]).includes(value);
}

export async function loadSelectedRuntime(
	wsClient: WsClient,
): Promise<WIRuntime> {
	const selectedProfileResponse = await wsClient.getConfiguration({
		section: SELECTED_PROFILE_CONFIG_SECTION,
	});

	if (isSelectedProfileValue(selectedProfileResponse?.value)) {
		return PROFILE_RUNTIME_MAP[selectedProfileResponse.value];
	}

	return "WSO2: BI";
}

export function supportsSamples(
	runtime: WIRuntime,
): runtime is SampleSupportedRuntime {
	return runtime !== "WSO2: SI";
}
