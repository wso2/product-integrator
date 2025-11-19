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

import { commands, debug, Progress, ProgressLocation, Uri, window, workspace } from "vscode";
import * as os from 'os';
import path from "path";
import * as fs from 'fs';
import * as unzipper from 'unzipper';
import axios from "axios";
import { DownloadProgress, onDownloadProgress } from "@wso2/wi-core";
import { RPCLayer } from "../../RPCLayer";

interface ProgressMessage {
    message: string;
    increment?: number;
}

export const BALLERINA_INTEGRATOR_ISSUES_URL = "https://github.com/wso2/product-ballerina-integrator/issues";

export async function askFilePath() {
    return await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: Uri.file(os.homedir()),
        filters: {
            'Files': ['yaml', 'json', 'yml', 'graphql']
        },
        title: "Select a file",
    });
}

export async function askProjectPath() {
    return await window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: Uri.file(os.homedir()),
        title: "Select a folder"
    });
}

export async function askFileOrFolderPath() {
    return await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: Uri.file(os.homedir()),
        title: "Select a file or folder"
    });
}

export async function handleOpenFile(projectUri: string, sampleName: string, repoUrl: string) {
    const rawFileLink = repoUrl + sampleName + '/' + sampleName + '.zip';
    const defaultDownloadsPath = path.join(os.homedir(), 'Downloads'); // Construct the default downloads path
    const pathFromDialog = await selectFileDownloadPath();
    if (pathFromDialog === "") {
        return;
    }
    const selectedPath = pathFromDialog === "" ? defaultDownloadsPath : pathFromDialog;
    const filePath = path.join(selectedPath, sampleName + '.zip');
    let isSuccess = false;

    if (fs.existsSync(filePath)) {
        // already downloaded
        isSuccess = true;
    } else {
        await window.withProgress({
            location: ProgressLocation.Notification,
            title: 'Downloading file',
            cancellable: true
        }, async (progress, cancellationToken) => {

            let cancelled: boolean = false;
            cancellationToken.onCancellationRequested(async () => {
                cancelled = true;
            });

            try {
                await handleDownloadFile(projectUri, rawFileLink, filePath, progress, cancelled);
                isSuccess = true;
                return;
            } catch (error) {
                window.showErrorMessage(`Error while downloading the file: ${error}`);
            }
        });
    }

    if (isSuccess) {
        const successMsg = `The Integration sample file has been downloaded successfully to the following directory: ${filePath}.`;
        const zipReadStream = fs.createReadStream(filePath);
        if (fs.existsSync(path.join(selectedPath, sampleName))) {
            // already extracted
            let uri = Uri.file(path.join(selectedPath, sampleName));
            commands.executeCommand("vscode.openFolder", uri, true);
            return;
        }
        zipReadStream.pipe(unzipper.Parse()).on("entry", function (entry) {
            var isDir = entry.type === "Directory";
            var fullpath = path.join(selectedPath, entry.path);
            var directory = isDir ? fullpath : path.dirname(fullpath);
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }
            if (!isDir) {
                entry.pipe(fs.createWriteStream(fullpath));
            }
        }).on("close", () => {
            console.log("Extraction complete!");
            window.showInformationMessage('Where would you like to open the project?',
                { modal: true },
                'Current Window',
                'New Window'
            ).then(selection => {
                if (selection === "Current Window") {
                    const folderUri = Uri.file(path.join(selectedPath, sampleName));
                    const workspaceFolders = workspace.workspaceFolders || [];
                    if (!workspaceFolders.some(folder => folder.uri.fsPath === folderUri.fsPath)) {
                        workspace.updateWorkspaceFolders(workspaceFolders.length, 0, { uri: folderUri });
                    }
                } else if (selection === "New Window") {
                    commands.executeCommand('vscode.openFolder', Uri.file(path.join(selectedPath, sampleName)));
                }
            });
        });
        window.showInformationMessage(
            successMsg,
        );
    }
}

async function selectFileDownloadPath(): Promise<string> {
    const folderPath = await window.showOpenDialog({ title: 'Sample download directory', canSelectFolders: true, canSelectFiles: false, openLabel: 'Select Folder' });
    if (folderPath && folderPath.length > 0) {
        const newlySelectedFolder = folderPath[0].fsPath;
        return newlySelectedFolder;
    }
    return "";
}

async function handleDownloadFile(projectUri: string, rawFileLink: string, defaultDownloadsPath: string, progress: Progress<ProgressMessage>, cancelled: boolean) {
    const handleProgress = (progressPercentage: any) => {
        progress.report({ message: "Downloading file...", increment: progressPercentage });
    };
    try {
        await downloadFile(projectUri, rawFileLink, defaultDownloadsPath, handleProgress);
    } catch (error) {
        window.showErrorMessage(`Failed to download file: ${error}`);
    }
    progress.report({ message: "Download finished" });
}

async function downloadFile(projectUri: string, url: string, filePath: string, progressCallback?: (downloadProgress: DownloadProgress) => void) {
    const writer = fs.createWriteStream(filePath);
    let totalBytes = 0;
    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            headers: {
                "User-Agent": "Mozilla/5.0"
            },
            onDownloadProgress: (progressEvent) => {
                totalBytes = progressEvent.total!;
                const formatSize = (sizeInBytes: number) => {
                    const sizeInKB = sizeInBytes / 1024;
                    if (sizeInKB < 1024) {
                        return `${Math.floor(sizeInKB)} KB`;
                    } else {
                        return `${Math.floor(sizeInKB / 1024)} MB`;
                    }
                };
                const progress: DownloadProgress = {
                    percentage: Math.round((progressEvent.loaded * 100) / totalBytes),
                    downloadedSize: progressEvent.loaded,
                    totalSize: totalBytes,
                    success: false,
                    message: `Downloading... ${Math.round((progressEvent.loaded * 100) / totalBytes)}%`
                };
                if (progressCallback) {
                    progressCallback(progress);
                }
                // Notify the visualizer
                RPCLayer._messengers.get("wi-webview")?.sendNotification(
                    onDownloadProgress,
                    { type: 'webview', webviewType: 'wso2IntegratorWelcome' },
                    progress
                );
            }
        });
        response.data.pipe(writer);
        await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => {
                writer.close();
                resolve();
            });

            writer.on('error', (error) => {
                reject(error);
            });
        });
    } catch (error) {
        window.showErrorMessage(`Error while downloading the file: ${error}`);
        throw error;
    }
}

export function sanitizeName(name: string): string {
    return name.replace(/[^a-z0-9]_./gi, '_').toLowerCase(); // Replace invalid characters with underscores
}

export function getUsername(): string {
    // Get current username from the system across different OS platforms
    let username: string;
    if (process.platform === 'win32') {
        // Windows
        username = process.env.USERNAME || 'myOrg';
    } else {
        // macOS and Linux
        username = process.env.USER || 'myOrg';
    }
    return username;
}
