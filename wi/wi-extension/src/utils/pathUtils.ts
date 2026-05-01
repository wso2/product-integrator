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

import { existsSync, mkdirSync } from "fs";
import * as os from "os";
import * as path from "path";
import { Uri, commands, window, workspace } from "vscode";
import { relativePath } from "../cloud/git/util";


export const getNormalizedPath = (filePath: string): string => {
    if (os.platform() === "win32") {
        return filePath.replace(/^\//, "").replace(/\//g, "\\");
    }
    return path.normalize(filePath);
};

export const isSamePath = (parent: string, sub: string): boolean => {
    let normalizedParent = getNormalizedPath(parent).toLowerCase();
    if (normalizedParent.endsWith("/")) {
        normalizedParent = normalizedParent.slice(0, -1);
    }

    let normalizedSub = getNormalizedPath(sub).toLowerCase();
    if (normalizedSub.endsWith("/")) {
        normalizedSub = normalizedSub.slice(0, -1);
    }

    return normalizedParent === normalizedSub;
};

export const isSubpath = (parent: string, sub: string): boolean => {
    let normalizedParent = getNormalizedPath(parent).toLowerCase();
    if (normalizedParent.endsWith("/")) {
        normalizedParent = normalizedParent.slice(0, -1);
    }

    let normalizedSub = getNormalizedPath(sub).toLowerCase();
    if (normalizedSub.endsWith("/")) {
        normalizedSub = normalizedSub.slice(0, -1);
    }

    if (normalizedParent === normalizedSub) {
        return true;
    }

    const relative = relativePath(normalizedParent, normalizedSub);
    return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};


export const convertFsPathToUriPath = (fsPath: string): string => {
    if (os.platform() === "win32") {
        let uriPath = fsPath.replace(/\\/g, "/");
        if (/^[a-zA-Z]:/.test(uriPath)) {
            uriPath = `/${uriPath}`;
        }
        return uriPath;
    }
    return fsPath;
};

export const createDirectory = (basePath: string, dirName: string): { dirName: string; dirPath: string } => {
    let newDirName = dirName;
    let counter = 1;
    let dirPath = path.join(basePath, newDirName);
    while (existsSync(dirPath)) {
        newDirName = `${dirName}-${counter}`;
        dirPath = path.join(basePath, newDirName);
        counter++;
    }
    mkdirSync(dirPath);
    return { dirName: newDirName, dirPath };
};

export const getDefaultCreationPath = (): string => {
    const defaultPath = path.join(os.homedir(), "WSO2Integrator");
    if (!existsSync(defaultPath)) {
        mkdirSync(defaultPath, { recursive: true });
    }
    return defaultPath;
};

export async function openDirectory(openingPath: string, message: string, onSelect?: () => void): Promise<void> {
    const openInCurrentWorkspace = await window.showInformationMessage(message, { modal: true }, "Current Window", "New Window");
    if (openInCurrentWorkspace && onSelect) {
        onSelect();
    }
    if (openInCurrentWorkspace === "Current Window") {
        const currentFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (currentFolder && isSamePath(currentFolder, openingPath)) {
            await commands.executeCommand("workbench.action.reloadWindow");
        } else {
            await commands.executeCommand("vscode.openFolder", Uri.file(openingPath), { forceNewWindow: false });
        }
        await commands.executeCommand("workbench.explorer.fileView.focus");
    } else if (openInCurrentWorkspace === "New Window") {
        await commands.executeCommand("vscode.openFolder", Uri.file(openingPath), { forceNewWindow: true });
    }
}
