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

import { commands, debug, env, Progress, ProgressLocation, RelativePattern, Uri, window, workspace } from "vscode";
import * as os from 'os';
import path from "path";
import * as fs from 'fs';
import * as unzipper from 'unzipper';
import axios from "axios";
import { DownloadProgress, Platform, SemanticVersion, ValidateProjectFormErrorField } from "@wso2/wi-core";
import { BridgeLayer } from "../../BridgeLayer";

interface ProgressMessage {
    message: string;
    increment?: number;
}

interface RepositoryArchiveSource {
    repositoryUrl: string;
    branch: string;
    subDirectory: string;
    componentPath: string;
    displayName: string;
    sourceLabel: string;
    missingSourceError: string;
    preparationErrorLabel: string;
}

export enum VERSION {
    BETA = 'beta',
    ALPHA = 'alpha',
    PREVIEW = 'preview'
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

export async function askProjectPath(startPath?: string) {
    return await window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: Uri.file(startPath || os.homedir()),
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

export async function handleOpenSamples(
    projectUri: string,
    repositorySource: RepositoryArchiveSource,
) {
    const selectedPath = await selectFileDownloadPath();
    if (selectedPath === "") {
        return;
    }

    const trimSlashes = (value: string) => value.replace(/^[\\/]+|[\\/]+$/g, '');
    const componentPath = trimSlashes(repositorySource.componentPath);
    const componentName = componentPath.split(/[\\/]/).pop();
    const integrationFolderName = componentName && componentName.length > 0
        ? componentName
        : sanitizeName(repositorySource.displayName);
    const extractedProjectPath = path.join(selectedPath, integrationFolderName);

    if (fs.existsSync(extractedProjectPath)) {
        await openDownloadedProject(extractedProjectPath, true);
        return;
    }

    const archiveFilePath = path.join(os.tmpdir(), `${integrationFolderName}-${Date.now()}.zip`);
    const archiveExtractPath = path.join(os.tmpdir(), `${integrationFolderName}-extract-${Date.now()}`);
    const archiveUrl = `${repositorySource.repositoryUrl.replace(/\/+$/, '')}/archive/refs/heads/${repositorySource.branch}.zip`;

    try {
        await window.withProgress({
            location: ProgressLocation.Notification,
            title: 'Downloading file',
            cancellable: true
        }, async (progress) => {
            await handleDownloadFile(projectUri, archiveUrl, archiveFilePath, progress);
        });
    } catch (error) {
        window.showErrorMessage(`Error while downloading the file: ${error}`);
        return;
    }

    try {
        await fs.promises.mkdir(archiveExtractPath, { recursive: true });

        await new Promise<void>((resolve, reject) => {
            fs.createReadStream(archiveFilePath)
                .on('error', reject)
                .pipe(unzipper.Extract({ path: archiveExtractPath }))
                .on('close', resolve)
                .on('error', reject);
        });

        const archiveRootDir = fs.readdirSync(archiveExtractPath)[0];
        if (!archiveRootDir) {
            throw new Error('Failed to extract the pre-built integration archive.');
        }

        const normalizedSubDirectory = trimSlashes(repositorySource.subDirectory);
        const sourcePath = path.join(
            archiveExtractPath,
            archiveRootDir,
            componentPath.startsWith(normalizedSubDirectory)
                ? componentPath
                : path.join(normalizedSubDirectory, componentPath),
        );

        if (!fs.existsSync(sourcePath)) {
            throw new Error(repositorySource.missingSourceError);
        }

        fs.cpSync(sourcePath, extractedProjectPath, { recursive: true });
        window.showInformationMessage(
            `The ${repositorySource.sourceLabel} has been downloaded successfully to the following directory: ${extractedProjectPath}.`,
        );
        await openDownloadedProject(extractedProjectPath);
    } catch (error) {
        window.showErrorMessage(`Failed to prepare the ${repositorySource.preparationErrorLabel}: ${error}`);
    } finally {
        await Promise.allSettled([
            fs.promises.unlink(archiveFilePath),
            fs.promises.rm(archiveExtractPath, { recursive: true, force: true }),
        ]);
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

async function handleDownloadFile(projectUri: string, rawFileLink: string, defaultDownloadsPath: string, progress: Progress<ProgressMessage>) {
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

async function openDownloadedProject(projectPath: string, openInNewWindowDirectly = false): Promise<void> {
    if (openInNewWindowDirectly) {
        await commands.executeCommand('vscode.openFolder', Uri.file(projectPath), true);
        return;
    }

    const selection = await window.showInformationMessage(
        'Where would you like to open the project?',
        { modal: true },
        'Current Window',
        'New Window'
    );

    if (selection === "Current Window") {
        const folderUri = Uri.file(projectPath);
        const workspaceFolders = workspace.workspaceFolders || [];
        if (!workspaceFolders.some(folder => folder.uri.fsPath === folderUri.fsPath)) {
            workspace.updateWorkspaceFolders(workspaceFolders.length, 0, { uri: folderUri });
        }
        return;
    }

    if (selection === "New Window") {
        await commands.executeCommand('vscode.openFolder', Uri.file(projectPath));
    }
}

async function downloadFile(projectUri: string, url: string, filePath: string, progressCallback?: (downloadProgress: DownloadProgress) => void) {
    const writer = fs.createWriteStream(filePath);
    let totalBytes = 0;
    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            maxRedirects: 5,
            timeout: 30000,
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
                BridgeLayer.notifyDownloadProgress(projectUri, progress);
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

export function getPlatform(): any {
    if (os.platform() === 'linux' || env.remoteName === 'wsl') {
        return Platform.LINUX;
    }
    if (os.platform()?.startsWith('win')) {
        return Platform.WINDOWS;
    }
    if (os.platform() === 'darwin') {
        return Platform.MAC;
    }
    return Platform.LINUX; // fallback
}

export function openInVSCode(projectRoot: string) {
    commands.executeCommand('vscode.openFolder', Uri.file(path.resolve(projectRoot)));
}

/**
 * Compares the current Ballerina version against a minimum required version.
 * Only returns true for GA (non-preview/alpha/beta) versions that meet or exceed the minimum.
 * 
 * @param ballerinaExtInstance The Ballerina extension instance
 * @param minSupportedVersion Minimum version (use createVersionNumber helper to generate)
 * @returns true if current version is GA and meets minimum requirement
 * 
 * @example
 * // Check if version is at least 2201.1.30
 * isSupportedSLVersion(ext, createVersionNumber(2201, 1, 30))
 */
export function isSupportedSLVersionUtil(
    ballerinaExtInstance: any,
    minSupportedVersion: SemanticVersion
) {
    const ballerinaVersion: string = ballerinaExtInstance.ballerinaVersion.toLocaleLowerCase();
    console.log(`Current Ballerina version: ${ballerinaVersion}`);
    const isGA: boolean = !ballerinaVersion.includes(VERSION.ALPHA) && !ballerinaVersion.includes(VERSION.BETA) && !ballerinaVersion.includes(VERSION.PREVIEW);

    if (!isGA) {
        return false;
    }

    // Parse current version
    const regex = /(\d+)\.(\d+)\.(\d+)/;
    const match = ballerinaVersion.match(regex);
    if (!match) {
        return false;
    }

    const currentVersion = {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3])
    };

    // Compare versions component by component
    return compareVersions(currentVersion, minSupportedVersion);
}

/**
 * Compares two versions using semantic versioning rules.
 * Returns true if current version >= minimum version.
 * 
 * @param current Current version components
 * @param minimum Minimum required version components
 * @returns true if current >= minimum
 */
function compareVersions(
    current: SemanticVersion,
    minimum: SemanticVersion
): boolean {
    // Compare major version first
    if (current.major !== minimum.major) {
        return current.major > minimum.major;
    }

    // Major versions are equal, compare minor
    if (current.minor !== minimum.minor) {
        return current.minor > minimum.minor;
    }

    // Major and minor are equal, compare patch
    return current.patch >= minimum.patch;
}

/**
 * Validates the project path before creating a new project
 * @param projectPath - The directory path where the project will be created
 * @param projectName - The name of the package (used if createDirectory is true). For workspace projects, this contains the workspace name.
 * @param createDirectory - Whether a new directory will be created
 * @param createAsWorkspace - Whether this is a workspace project creation
 * @returns Validation result with error message and field information if invalid
 */
export function validateProjectPath(projectPath: string, projectName: string, createDirectory: boolean, createAsWorkspace?: boolean): { isValid: boolean; errorMessage?: string; errorField?: ValidateProjectFormErrorField } {
    try {
        // Check if projectPath is provided and not empty
        if (!projectPath || projectPath.trim() === '') {
            return { isValid: false, errorMessage: 'Path is required', errorField: ValidateProjectFormErrorField.PATH };
        }

        // For workspace projects, validate workspace name specifically
        if (createAsWorkspace && createDirectory && (!projectName || projectName.trim() === '')) {
            return { isValid: false, errorMessage: 'Project name is required', errorField: ValidateProjectFormErrorField.NAME };
        }

        // Check if the base directory exists
        if (!fs.existsSync(projectPath)) {
            // Check if parent directory exists and we can create the path
            const parentDir = path.dirname(projectPath);
            if (!fs.existsSync(parentDir)) {
                return { isValid: false, errorMessage: 'Directory path does not exist', errorField: ValidateProjectFormErrorField.PATH };
            }
        }

        // Determine the final project path
        const finalPath = createDirectory ? path.join(projectPath, sanitizeName(projectName)) : projectPath;

        // If not creating a new directory, check if the target directory already has a Ballerina project
        if (!createDirectory) {
            const ballerinaTomlPath = path.join(finalPath, 'Ballerina.toml');
            if (fs.existsSync(ballerinaTomlPath)) {
                return { isValid: false, errorMessage: 'Existing Ballerina project detected in the selected directory', errorField: ValidateProjectFormErrorField.PATH };
            }
        } else {
            // If creating a new directory, check if it already exists
            if (fs.existsSync(finalPath)) {
                return { isValid: false, errorMessage: `A directory with this name already exists at the selected location`, errorField: ValidateProjectFormErrorField.NAME};
            }
        }

        // Validate if we have write permissions
        try {
            // Try to access the directory with write permissions
            fs.accessSync(projectPath, fs.constants.W_OK);
        } catch (error) {
            return { isValid: false, errorMessage: 'No write permission for the selected directory', errorField: ValidateProjectFormErrorField.PATH };
        }

        return { isValid: true };
    } catch (error) {
        return { isValid: false, errorMessage: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`, errorField: ValidateProjectFormErrorField.PATH };
    }
}
