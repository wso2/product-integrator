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

import type { Event } from "vscode";
import { extensions } from "vscode";
import { EXTENSION_DEPENDENCIES, DownloadProgress, WIChatNotify } from "@wso2/wi-core";

/** Shape of the migration API exposed by the Ballerina extension's `activate()` return value. */
export interface BallerinaExtMigrationAPI {
    setWizardProjectRoot: (projectRoot: string, sourcePath?: string) => void;
    wizardEnhancementReady: () => Promise<void>;
    abortAgent: () => void;
    openMigratedProject: () => void;
    onChatNotify: Event<WIChatNotify>;
    isAIAuthenticated: () => boolean;
    signInForAI: () => Promise<{ success: boolean; error?: string }>;
    signInWithAnthropicKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
    signInWithAwsBedrock: (creds: { accessKeyId: string; secretAccessKey: string; region: string; sessionToken?: string }) => Promise<{ success: boolean; error?: string }>;
    signInWithVertexAI: (creds: { projectId: string; location: string; clientEmail: string; privateKey: string }) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Stores runtime context obtained from the Ballerina extension.
 * Used by WI's internal BI project explorer when the BI extension is not installed.
 */
export class BallerinaContext {
    public biSupported: boolean = false;
    public isNPSupported: boolean = false;
    public isWorkspaceSupported: boolean = false;
    public migration: BallerinaExtMigrationAPI | undefined;
    public onDownloadProgress: Event<DownloadProgress> | undefined;
    private _initialized: boolean = false;

    public get isInitialized(): boolean {
        return this._initialized;
    }

    /**
     * Populate the context from the Ballerina extension's exports.
     * The Ballerina extension exposes these via `ext.exports.ballerinaExtInstance`.
     */
    public init(ballerinaExtExports: any): void {
        this._initialized = true;
        const instance = ballerinaExtExports?.ballerinaExtInstance;
        if (instance) {
            this.biSupported = instance.biSupported ?? false;
            this.isNPSupported = instance.isNPSupported ?? false;
            this.isWorkspaceSupported = instance.isWorkspaceSupported ?? false;
        }
        if (ballerinaExtExports?.migration) {
            this.migration = ballerinaExtExports.migration as BallerinaExtMigrationAPI;
        }
        if (ballerinaExtExports?.onDownloadProgress) {
            this.onDownloadProgress = ballerinaExtExports.onDownloadProgress as Event<DownloadProgress>;
        }
    }
    /**
     * Ensures the migration API is available by lazily initializing from the
     * Ballerina extension's exports if not already set.  This covers the case
     * where the migration wizard runs before a project is opened (so the
     * normal `init()` path in `extensionAPIs.initialize()` was never reached).
     */
    public async ensureMigrationAPI(): Promise<BallerinaExtMigrationAPI | undefined> {
        if (this.migration) {
            return this.migration;
        }

        const ext = extensions.getExtension(EXTENSION_DEPENDENCIES.BALLERINA);
        if (!ext) {
            return undefined;
        }

        if (!ext.isActive) {
            await ext.activate();
        }

        // Re-init from the (now active) extension's exports
        this.init(ext.exports);
        return this.migration;
    }
}

export const ballerinaContext = new BallerinaContext();
