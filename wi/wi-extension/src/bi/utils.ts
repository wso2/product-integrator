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

import { Uri, Webview, workspace } from "vscode";
import * as fs from 'fs';
import * as path from 'path';

export interface ProjectInfo {
    isBI: boolean;
    isBallerina: boolean;
    isMultiRoot: boolean;
};

/**
 * Extended project info used when activating the BI project explorer directly in WI.
 * Distinguishes between a Ballerina package and a Ballerina workspace.
 */
export interface ExtendedProjectInfo extends ProjectInfo {
    isBallerinaPackage: boolean;
    isBallerinaWorkspace: boolean;
    isEmptyWorkspace: boolean;
}

export function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
    if (process.env.WEB_VIEW_DEV_MODE === "true") {
        return new URL(pathList[pathList.length - 1], process.env.WEB_VIEW_DEV_HOST as string).href;
    }
    return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}

export function fetchProjectInfo(): ProjectInfo {
    const workspaceUris = workspace.workspaceFolders ? workspace.workspaceFolders.map(folder => folder.uri) : [];
    let isBICount = 0; // Counter for workspaces with isBI set to true
    let isBalCount = 0; // Counter for workspaces with Ballerina project

    // Check each workspace folder's configuration for 'isBI'
    for (const uri of workspaceUris) {
        const isBallerina = checkIsBallerina(uri);
        if (isBallerina) {
            isBalCount++;
            if (checkIsBI(uri)) {
                isBICount++;
            }
        }
    }

    return {
        isBI: isBICount > 0,
        isBallerina: isBalCount > 0,
        isMultiRoot: isBalCount > 1 // Set to true only if more than one workspace has a Ballerina project
    };
}

/**
 * Fetches extended project info needed for the BI project explorer.
 * Uses simple TOML section detection (no external parser dependency).
 */
export async function fetchExtendedProjectInfo(): Promise<ExtendedProjectInfo> {
    const workspaceFolders = workspace.workspaceFolders;
    const base = fetchProjectInfo();

    if (!workspaceFolders || workspaceFolders.length > 1) {
        return { ...base, isBallerinaPackage: false, isBallerinaWorkspace: false, isEmptyWorkspace: false };
    }

    const workspaceUri = workspaceFolders[0].uri;
    const tomlPath = path.join(workspaceUri.fsPath, 'Ballerina.toml');

    if (!fs.existsSync(tomlPath)) {
        return { ...base, isBallerinaPackage: false, isBallerinaWorkspace: false, isEmptyWorkspace: false };
    }

    const tomlContent = await fs.promises.readFile(tomlPath, 'utf-8');
    const isBallerinaWorkspace = hasTOMLSection(tomlContent, 'workspace');
    const isBallerinaPackage = !isBallerinaWorkspace && hasTOMLSection(tomlContent, 'package');
    const isEmptyWorkspace = isBallerinaWorkspace && isWorkspaceTomlEmpty(tomlContent);

    return {
        ...base,
        isBallerinaPackage,
        isBallerinaWorkspace,
        isEmptyWorkspace,
    };
}

/**
 * Returns true if the TOML content contains a section header like `[section]`.
 * Uses a simple line-start regex; does not require a full TOML parser.
 */
function hasTOMLSection(content: string, section: string): boolean {
    return new RegExp(`^\\[${section}\\]`, 'm').test(content);
}

/**
 * Returns true if the [workspace] section has an empty `packages` array.
 */
function isWorkspaceTomlEmpty(content: string): boolean {
    // Match `packages = []` or `packages=[]` with optional whitespace
    return /packages\s*=\s*\[\s*\]/.test(content);
}

export function checkIsBI(uri: Uri): boolean {
    const config = workspace.getConfiguration('ballerina', uri);
    const inspected = config.inspect<boolean>('isBI');
    // For now, assume BI is supported. This could be made configurable later.
    const isBISupported = true;

    if (inspected && isBISupported) { // Added a check to see if the current version of ballerina supports bi
        const valuesToCheck = [
            inspected.workspaceFolderValue,
            inspected.workspaceValue,
            inspected.globalValue
        ];
        return valuesToCheck.find(value => value === true) !== undefined; // Return true if isBI is set to true
    }
    return false; // Return false if isBI is not set
}

export function checkIsBallerina(uri: Uri): boolean {
    const ballerinaTomlPath = path.join(uri.fsPath, 'Ballerina.toml');
    return fs.existsSync(ballerinaTomlPath);
}
