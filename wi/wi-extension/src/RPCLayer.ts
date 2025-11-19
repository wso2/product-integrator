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

import { WebviewPanel } from 'vscode';
import { Messenger } from 'vscode-messenger';
import { registerMainRpcHandlers } from './rpc-managers/main/rpc-handler';

export class RPCLayer {
    static _messengers: Map<string, Messenger> = new Map();

    static create(webViewPanel: WebviewPanel, projectUri: string): void {
        if (this._messengers.has(projectUri)) {
            this._messengers.get(projectUri)!.registerWebviewPanel(webViewPanel as WebviewPanel);
            return;
        }
        const messenger = new Messenger();
        this._messengers.set(projectUri, messenger);
        messenger.registerWebviewPanel(webViewPanel as WebviewPanel);

        // Register RPC handlers
        registerMainRpcHandlers(messenger);
    }

    static dispose(projectUri: string): void {
        this._messengers.delete(projectUri);
    }
}
