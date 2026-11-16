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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";

const WSO2_DIR = ".wso2";

/** The integration's `.wso2/component.yaml`. */
const componentYamlPathOf = (baseDir: string): string => join(baseDir, WSO2_DIR, "component.yaml");

interface ComponentYamlConnectionRef {
	name: string;
	resourceRef: string;
}

interface ComponentYamlServiceRef {
	name: string;
}

interface ComponentYamlContent {
	schemaVersion?: string;
	dependencies?: {
		connectionReferences?: ComponentYamlConnectionRef[];
		serviceReferences?: ComponentYamlServiceRef[];
	};
}

export interface DeleteLocalConnectionConfigParams {
	componentDir: string;
	connectionName: string;
}

export const deleteLocalConnectionConfig = (params: DeleteLocalConnectionConfigParams): void => {
	const componentYamlPath = componentYamlPathOf(params.componentDir);
	if (existsSync(componentYamlPath)) {
		const content = yaml.load(readFileSync(componentYamlPath, "utf8")) as ComponentYamlContent | undefined;
		if (!content) {
			return; // an empty file has no reference to remove
		}
		if (content.dependencies?.connectionReferences) {
			content.dependencies.connectionReferences = content.dependencies.connectionReferences.filter((item) => item.name !== params.connectionName);
		}
		if (content.dependencies?.serviceReferences) {
			content.dependencies.serviceReferences = content.dependencies.serviceReferences.filter((item) => item.name !== params.connectionName);
		}
		writeFileSync(componentYamlPath, yaml.dump(content));
	}
};

export interface CreateLocalConnectionConfigParams {
	componentDir: string;
	name: string;
	/** What the connection points at, as the platform names it; the caller composes it. */
	resourceRef: string;
}

/** Records a connection reference in `.wso2/component.yaml` (schema 1.2), creating the file when needed. */
export const createConnectionConfig = async (params: CreateLocalConnectionConfigParams): Promise<string> => {
	const componentYamlPath = componentYamlPathOf(params.componentDir);
	const reference: ComponentYamlConnectionRef = { name: params.name, resourceRef: params.resourceRef };

	if (existsSync(componentYamlPath)) {
		const original = readFileSync(componentYamlPath, "utf8");
		const content = (yaml.load(original) as ComponentYamlContent) ?? {};
		if (Number(content.schemaVersion) < 1.2 || !content.schemaVersion) {
			content.schemaVersion = "1.2";
		}
		content.dependencies = {
			...content.dependencies,
			connectionReferences: [...(content.dependencies?.connectionReferences ?? []).filter((item) => item.name !== params.name), reference],
		};
		const updated = yaml.dump(content);
		if (updated !== original) {
			writeFileSync(componentYamlPath, updated);
		}
	} else {
		const newConfigDir = join(params.componentDir, WSO2_DIR);
		if (!existsSync(newConfigDir)) {
			mkdirSync(newConfigDir, { recursive: true });
		}
		const content: ComponentYamlContent = { schemaVersion: "1.2", dependencies: { connectionReferences: [reference] } };
		writeFileSync(componentYamlPath, yaml.dump(content));
	}
	return componentYamlPath;
};
