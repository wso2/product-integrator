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

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { CreateLocalConnectionsConfigReq, DeleteLocalConnectionsConfigReq, MarketplaceItem } from "@wso2/wso2-platform-core";
import * as yaml from "js-yaml";
import { ProgressLocation, window } from "vscode";
import { ext } from "../extensionVariables";
import { dataCacheStore } from "./stores/data-cache-store";

const WSO2_DIR = ".wso2";
const CHOREO_DIR_LEGACY = ".choreo";

/** Returns the config directory path. Prefers .wso2, falls back to .choreo (legacy), defaults to .wso2 for new creation. */
const resolveConfigDir = (baseDir: string): string => {
	const wso2Dir = join(baseDir, WSO2_DIR);
	if (existsSync(wso2Dir)) return wso2Dir;
	const choreoDir = join(baseDir, CHOREO_DIR_LEGACY);
	if (existsSync(choreoDir)) return choreoDir;
	return wso2Dir;
};

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

export const deleteLocalConnectionConfig = (params: DeleteLocalConnectionsConfigReq): void => {
	const componentYamlPath = join(resolveConfigDir(params.componentDir), "component.yaml");
	if (existsSync(componentYamlPath)) {
		const componentYamlFileContent: ComponentYamlContent = yaml.load(readFileSync(componentYamlPath, "utf8")) as ComponentYamlContent;
		if (componentYamlFileContent.dependencies?.connectionReferences) {
			componentYamlFileContent.dependencies.connectionReferences = componentYamlFileContent.dependencies.connectionReferences.filter(
				(item) => item.name !== params.connectionName,
			);
		}
		if (componentYamlFileContent.dependencies?.serviceReferences) {
			componentYamlFileContent.dependencies.serviceReferences = componentYamlFileContent.dependencies.serviceReferences.filter(
				(item) => item.name !== params.connectionName,
			);
		}
		writeFileSync(componentYamlPath, yaml.dump(componentYamlFileContent));
	}
};

export const createConnectionConfig = async (params: CreateLocalConnectionsConfigReq): Promise<string> => {
	const userInfo = ext.authProvider?.getUserInfo();
	const org = userInfo?.organizations?.find((item) => item.uuid === params.marketplaceItem?.organizationId);
	if (!org) {
		return "";
	}

	for (const dir of [WSO2_DIR, CHOREO_DIR_LEGACY]) {
		if (existsSync(join(params.componentDir, dir, "endpoints.yaml"))) {
			rmSync(join(params.componentDir, dir, "endpoints.yaml"));
		}
		if (existsSync(join(params.componentDir, dir, "component-config.yaml"))) {
			rmSync(join(params.componentDir, dir, "component-config.yaml"));
		}
	}
	const componentYamlPath = join(resolveConfigDir(params.componentDir), "component.yaml");

	let resourceRef = ``;
	const marketplaceItem = params.marketplaceItem as MarketplaceItem;

	if (marketplaceItem?.resourceType === "DATABASE") {
		resourceRef = `database:${marketplaceItem?.name}/${marketplaceItem?.name}`;
	} else if (marketplaceItem?.isThirdParty) {
		resourceRef = `thirdparty:${marketplaceItem?.name}/${marketplaceItem?.version}`;
	} else {
		let project = dataCacheStore
			.getState()
			.getProjects(org.handle)
			?.find((item) => item.id === marketplaceItem?.projectId);
		if (!project) {
			const projects = await window.withProgress(
				{ title: `Fetching projects of organization ${org.name}...`, location: ProgressLocation.Notification },
				() => ext.clients.rpcClient.getProjects(org.id.toString()),
			);
			project = projects?.find((item) => item.id === marketplaceItem?.projectId);
			if (!project) {
				return "";
			}
		}

		let component = dataCacheStore
			.getState()
			.getComponents(org.handle, project.handler)
			?.find((item) => item.metadata?.id === marketplaceItem?.component?.componentId);
		if (!component) {
			const components = await window.withProgress(
				{
					title: `Fetching ${ext.terminologies?.componentTermCapitalized} of project ${project.name}...`,
					location: ProgressLocation.Notification,
				},
				() =>
					ext.clients.rpcClient.getComponentList({
						orgHandle: org!.handle,
						orgId: org!.id.toString(),
						projectHandle: project!.handler,
						projectId: project!.id,
					}),
			);
			component = components?.find((item) => item.metadata?.id === marketplaceItem?.component?.componentId);
			if (!component) {
				return "";
			}
		}
		resourceRef = `service:/${project.handler}/${component?.metadata?.handler}/v1/${marketplaceItem?.component?.endpointId}/${params.visibility}`;
	}

	if (existsSync(componentYamlPath)) {
		const componentYamlFileContent: ComponentYamlContent = yaml.load(readFileSync(componentYamlPath, "utf8")) as ComponentYamlContent;
		const schemaVersion = Number(componentYamlFileContent.schemaVersion);
		if (schemaVersion < 1.2) {
			componentYamlFileContent.schemaVersion = "1.2";
		}
		componentYamlFileContent.dependencies = {
			...componentYamlFileContent.dependencies,
			connectionReferences: [...(componentYamlFileContent.dependencies?.connectionReferences ?? []), { name: params?.name, resourceRef }],
		};
		const originalContent: ComponentYamlContent = yaml.load(readFileSync(componentYamlPath, "utf8")) as ComponentYamlContent;
		if (JSON.stringify(originalContent) !== JSON.stringify(componentYamlFileContent)) {
			writeFileSync(componentYamlPath, yaml.dump(componentYamlFileContent));
		}
	} else {
		const newConfigDir = join(params.componentDir, WSO2_DIR);
		if (!existsSync(newConfigDir)) {
			mkdirSync(newConfigDir);
		}
		const endpointFileContent: ComponentYamlContent = {
			schemaVersion: "1.2",
			dependencies: { connectionReferences: [{ name: params?.name, resourceRef }] },
		};
		writeFileSync(componentYamlPath, yaml.dump(endpointFileContent));
	}
	return componentYamlPath;
};
