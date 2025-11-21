/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

/**
 * Extension constants
 */
export const EXTENSION_ID = "wso2-integrator";
export const EXTENSION_NAME = "WSO2 Integrator";
export const EXTENSION_PUBLISHER = "wso2";

/**
 * Command constants
 */
export const COMMANDS = {
	OPEN_WELCOME: "wso2.integrator.openWelcome",
	REFRESH_VIEW: "wso2.integrator.refreshView",
	OPEN_BI_INTEGRATION: "wso2.integrator.openBIIntegration",
	OPEN_MI_INTEGRATION: "wso2.integrator.openMIIntegration",
	CREATE_PROJECT: "wso2.integrator.createProject",
	EXPLORE_SAMPLES: "wso2.integrator.exploreSamples",
	IMPORT_PROJECT: "wso2.integrator.importProject",
	CLOSE_WEBVIEW: "wso2.integrator.closeWebview",
};

/**
 * View constants
 */
export const VIEWS = {
	INTEGRATOR_EXPLORER: "wso2-integrator.explorer",
};

/**
 * Context keys
 */
export const CONTEXT_KEYS = {
	BI_AVAILABLE: "wso2-integrator.bi.available",
	MI_AVAILABLE: "wso2-integrator.mi.available",
};

/**
 * Extension dependencies
 */
export const EXTENSION_DEPENDENCIES = {
	BI: "wso2.ballerina-integrator",
	MI: "wso2.micro-integrator",
};
