/* eslint-disable @typescript-eslint/no-explicit-any */
 
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

import { Messenger } from "vscode-messenger-webview";
import { vscode } from "./vscode";
import { MainRpcClient } from "./rpc-clients/main/rpc-client";
import { onDownloadProgress, onMigrationToolStateChanged, onMigrationToolLogs, onStateChanged, DownloadProgress, MigrationToolStateData, MigrationToolLogData, WebviewContext } from "@wso2/wi-core";

export class RpcClient {

    private messenger: Messenger;
    private mainRpcClient: MainRpcClient;

    constructor() {
        this.messenger = new Messenger(vscode);
        this.messenger.start();
        this.mainRpcClient = new MainRpcClient(this.messenger);
    }

    public getMainRpcClient(): MainRpcClient {
        return this.mainRpcClient;
    }

    public onStateChanged(callback: (context: WebviewContext) => void) {
        this.messenger.onNotification(onStateChanged, callback);
    }

    public onDownloadProgress(callback: (progress: DownloadProgress) => void) {
        this.messenger.onNotification(onDownloadProgress, callback);
    }

    public onMigrationToolStateChanged(callback: (state: string) => void) {
        this.messenger.onNotification(onMigrationToolStateChanged, (data: MigrationToolStateData) => {
            callback(data.state);
        });
    }

    public onMigrationToolLogs(callback: (log: string) => void) {
        this.messenger.onNotification(onMigrationToolLogs, (data: MigrationToolLogData) => {
            callback(data.log);
        });
    }

}
