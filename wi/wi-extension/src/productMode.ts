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

import { ProductMode, PRODUCT_NAMES } from "@wso2/wi-core";

/**
 * Resolves the product flavor this extension is running inside.
 *
 * In the built product the value arrives through the extension host's
 * environment (product.json runtimeEnv → WSO2_PRODUCT_MODE). For local
 * extension development it can be forced via `.env` (webpack DefinePlugin
 * inlines the value at build time). Anything other than "agent-builder"
 * resolves to the Integrator flavor.
 */
export function getProductMode(): ProductMode {
	return process.env.WSO2_PRODUCT_MODE === ProductMode.AGENT_BUILDER
		? ProductMode.AGENT_BUILDER
		: ProductMode.INTEGRATOR;
}

export function isAgentBuilderMode(): boolean {
	return getProductMode() === ProductMode.AGENT_BUILDER;
}

/**
 * User-visible product name ("WSO2 Integrator" / "WSO2 Agent Builder").
 * The built product may override it via the WSO2_PRODUCT_NAME env var.
 */
export function getProductName(): string {
	return process.env.WSO2_PRODUCT_NAME || PRODUCT_NAMES[getProductMode()];
}
