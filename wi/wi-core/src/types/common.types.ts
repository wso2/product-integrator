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

import type { IntegrationType } from "../enums";

/**
 * Tree item data interface
 */
export interface TreeItemData {
	id: string;
	label: string;
	description?: string;
	tooltip?: string;
	contextValue?: string;
	iconPath?: string;
	collapsibleState?: number;
	command?: {
		command: string;
		title: string;
		arguments?: unknown[];
	};
}

/**
 * Integration item interface
 */
export interface IntegrationItem {
	type: IntegrationType;
	label: string;
	description: string;
	items: TreeItemData[];
}

/**
 * Extension API interface for BI extension
 */
export interface BIExtensionAPI {
	getProjectExplorerItems(): Promise<TreeItemData[]>;
	getStatus(): string;
}

/**
 * Extension API interface for MI extension
 */
export interface MIExtensionAPI {
	getProjectExplorerItems(): Promise<TreeItemData[]>;
	getStatus(): string;
}
