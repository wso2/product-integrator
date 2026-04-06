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
type SelectedProfileValue = "WSO2 Integrator: Default" | "WSO2 Integrator: MI" | "WSO2 Integrator: SI";
type LegacyProfileValue = "bi" | "mi" | "si";

export const RUNTIME_PRIORITY: WIRuntime[] = [
	"WSO2: BI",
	"WSO2: MI",
	"WSO2: SI",
];

export const RUNTIME_DISPLAY_LABEL: Record<WIRuntime, string> = {
	"WSO2: BI": "WSO2 Integrator: Default",
	"WSO2: MI": "WSO2 Integrator: MI",
	"WSO2: SI": "WSO2 Integrator: SI",
};

export const CREATION_RUNTIME_HELP: Record<WIRuntime, string> = {
	"WSO2: BI":
		"Create an integration with package and workspace options.",
	"WSO2: MI":
		"Create a WSO2 Integrator: MI project.",
	"WSO2: SI":
		"Create a WSO2 Integrator: SI project.",
};

const RUNTIME_CONFIG_SECTIONS: Record<WIRuntime, string> = {
	"WSO2: BI": "integrator.enabledRuntimes.bi",
	"WSO2: MI": "integrator.enabledRuntimes.mi",
	"WSO2: SI": "integrator.enabledRuntimes.si",
};

const PROFILE_CONFIG_SECTION = "integrator.selectedProfile";

const PROFILE_RUNTIME_MAP: Record<SelectedProfileValue, WIRuntime> = {
	"WSO2 Integrator: Default": "WSO2: BI",
	"WSO2 Integrator: MI": "WSO2: MI",
	"WSO2 Integrator: SI": "WSO2: SI",
};

function isSelectedProfileValue(value: unknown): value is SelectedProfileValue {
	return value === "WSO2 Integrator: Default"
		|| value === "WSO2 Integrator: MI"
		|| value === "WSO2 Integrator: SI";
}

function isLegacyProfileValue(value: unknown): value is LegacyProfileValue {
	return value === "bi" || value === "mi" || value === "si";
}

function normalizeProfileValue(value: unknown): SelectedProfileValue | undefined {
	if (isSelectedProfileValue(value)) {
		return value;
	}

	if (!isLegacyProfileValue(value)) {
		return undefined;
	}

	switch (value) {
		case "bi":
			return "WSO2 Integrator: Default";
		case "mi":
			return "WSO2 Integrator: MI";
		case "si":
			return "WSO2 Integrator: SI";
	}
}

export async function loadEnabledRuntimes(
	wsClient: WsClient,
): Promise<WIRuntime[]> {
	const selectedProfileResponse = await wsClient.getConfiguration({
		section: PROFILE_CONFIG_SECTION,
	});

	const normalizedProfile = normalizeProfileValue(selectedProfileResponse?.value);
	if (normalizedProfile) {
		return [PROFILE_RUNTIME_MAP[normalizedProfile]];
	}

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
