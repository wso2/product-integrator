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
 * Integration type enumeration
 */
export enum IntegrationType {
	BI = "BI",
	MI = "MI",
}

/**
 * View types for webviews
 */
export enum ViewType {
	WELCOME = "welcome",
    CREATE_PROJECT = "create_project",
    SAMPLES = "samples",
    IMPORT_EXTERNAL = "import_external"
}

/**
 * Extension status enumeration
 */
export enum ExtensionStatus {
	UNKNOWN_PROJECT = "unknownProject",
	LOADING = "loading",
	READY = "ready",
	NO_LS = "noLS",
	UPDATE_NEEDED = "updateNeed",
}
