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

import { loadRemoteModule } from "./loadRemote";

/** Federation container name of the Ballerina-owned BI form remote. */
export const BI_FORM_REMOTE_GLOBAL = "ballerinaBiForm";
/** Exposed module key of the creation form within that remote. */
export const BI_FORM_REMOTE_MODULE = "./EmbeddedBIProjectForm";

/**
 * Loads the federated creation form. `loadRemoteModule` memoizes the container and the
 * script tag, so a call made by {@link prefetchBiCreateFlow} and the later call made when
 * the user actually opens Create resolve to the same already-initialized container —
 * provided both go through these shared constants.
 */
export function loadBiFormModule<T = unknown>(remoteUrl: string): Promise<T> {
	return loadRemoteModule<T>(
		remoteUrl,
		BI_FORM_REMOTE_GLOBAL,
		BI_FORM_REMOTE_MODULE,
	);
}

/** The one call the prefetch needs from the host bridge. */
interface BiFormPrefetchClient {
	getBiFormWsBootstrap: () => Promise<unknown>;
}

let prefetchStarted = false;

/**
 * Warms the Create flow while the user is still reading the welcome view.
 *
 * Both halves of the click-time delay are startable ahead of the click: the federated
 * form bundle has to be fetched and its container initialized, and the Ballerina host has
 * to have activated far enough to hand out the bridge coordinates. Neither depends on
 * anything the user is about to type, and the welcome view sits on screen for seconds
 * before the first click — so doing them lazily bought nothing and cost the user a
 * spinner on their very first interaction with the product.
 *
 * Fire-and-forget by design: every outcome here is either a no-op or a failure the real
 * Create flow will re-encounter and report properly. Runs at most once per webview.
 */
export function prefetchBiCreateFlow(wsClient: BiFormPrefetchClient): void {
	if (prefetchStarted) {
		return;
	}
	prefetchStarted = true;

	const remoteUrl = window.__WI_BI_FORM_REMOTE;
	if (remoteUrl) {
		loadBiFormModule(remoteUrl).catch((error) => {
			// Swallowed deliberately — RemoteBIProjectForm renders the real message if the
			// user does open Create. Warning here keeps the cause visible in the console.
			console.warn(
				">>> Failed to prefetch the BI creation form bundle.",
				error,
			);
		});
	}

	wsClient.getBiFormWsBootstrap().catch((error) => {
		console.warn(
			">>> Failed to prefetch the BI form bridge coordinates.",
			error,
		);
	});
}
