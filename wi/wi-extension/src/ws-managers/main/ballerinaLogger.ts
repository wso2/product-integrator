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

import * as vscode from 'vscode';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { workspace } from 'vscode';
import { getActiveBallerinaExtension } from '../../utils/ballerinaExtension';

interface BallerinaPluginConfig extends vscode.WorkspaceConfiguration {
    home?: string;
    debugLog?: boolean;
    classpath?: string;
}

const logLevelDebug: boolean = getPluginConfig().get('debugLog') === true;

let cachedOutputChannel: vscode.OutputChannel | undefined;
let pendingChannelPromise: Promise<vscode.OutputChannel | undefined> | undefined;

async function getSharedOutputChannel(): Promise<vscode.OutputChannel | undefined> {
    if (cachedOutputChannel) {
        return cachedOutputChannel;
    }
    if (pendingChannelPromise) {
        return pendingChannelPromise;
    }
    pendingChannelPromise = (async () => {
        try {
            const ballerinaExt = await getActiveBallerinaExtension();
            cachedOutputChannel = ballerinaExt.exports.getOutPutChannel();
            return cachedOutputChannel;
        } catch (err) {
            console.error('Failed to acquire shared Ballerina output channel', err);
            return undefined;
        } finally {
            pendingChannelPromise = undefined;
        }
    })();
    return pendingChannelPromise;
}

function getPluginConfig(): BallerinaPluginConfig {
    return workspace.getConfiguration('ballerina');
}

function formatLogMessage(level: string, message: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const millis = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis} [${level}] ${message}\n`;
}

export function info(message: string): void {
    console.log(message);
    getSharedOutputChannel().then(channel => {
        channel?.append(formatLogMessage('info', message));
    });
    persistDebugLogs(`[info] ${message}`);
}

export function warn(message: string): void {
    console.warn(message);
    getSharedOutputChannel().then(channel => {
        channel?.append(formatLogMessage('warn', message));
    });
    persistDebugLogs(`[warn] ${message}`);
}

export function error(message: string): void {
    console.error(message);
    getSharedOutputChannel().then(channel => {
        channel?.append(formatLogMessage('error', message));
    });
    persistDebugLogs(`[error] ${message}`);
}

export function debug(value: string): void {
    console.log(value);
    if (logLevelDebug) {
        getSharedOutputChannel().then(channel => {
            channel?.append(formatLogMessage('debug', value));
        });
    }
    persistDebugLogs(`[debug] ${value}`);
}

export function log(value: string): void {
    console.log(value);
    getSharedOutputChannel().then(channel => {
        channel?.append(formatLogMessage('info', value));
    });
    persistDebugLogs(`[info] ${value}`);
}

export function getOutputChannel() {
    if (logLevelDebug) {
        return getSharedOutputChannel();
    }
}

/**
 * Persist debug logs to a file, keeping logs for up to 10 days.
 * Each day's logs are stored in a file named with the current date (YYYY-MM-DD.log).
 * When more than 10 log files exist, delete the oldest one.
 * Each log entry is appended to the corresponding day's file, prefixed with the current date and time.
 */
function persistDebugLogs(value: string): void {
    try {
        const homeDir = os.homedir();
        const logFolder = path.join(homeDir, '.ballerina', 'vscode-extension-logs');
        const date = new Date().toLocaleString();
        const logLine = `${date} ${value}`;
        const output = typeof logLine === 'string' && !logLine.endsWith('\n') ? logLine + '\n' : logLine;
        if (!fs.existsSync(logFolder)) {
            fs.mkdirSync(logFolder, { recursive: true });
        }
        const logFileDate = new Date().toISOString().split('T')[0];
        const fileName = `${logFileDate}.log`;
        if (!fs.existsSync(path.join(logFolder, fileName))) {
            fs.writeFileSync(path.join(logFolder, fileName), '');
        }
        const logFilePath = path.join(logFolder, fileName);
        fs.appendFileSync(logFilePath, output);

        const logFiles = fs.readdirSync(logFolder);
        if (logFiles.length > 10) {
            const sortedFiles = logFiles.sort();
            fs.unlinkSync(path.join(logFolder, sortedFiles[0]));
        }
    } catch (error) {
        console.error('Failed to persist debug logs:', error);
    }
}
