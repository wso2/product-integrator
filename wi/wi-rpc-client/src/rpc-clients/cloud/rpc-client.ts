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

import {
	WICloudAPI,
	WICloudFormContext,
	WICloudSubmitComponentsReq,
	WICloudSubmitComponentsResp,
	closeCloudFormWebview,
	getCloudFormContext,
	submitComponents,
} from "@wso2/wi-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class CloudRpcClient implements WICloudAPI {
	constructor(private readonly _messenger: Messenger) {}

	getCloudFormContext(): Promise<WICloudFormContext> {
		return this._messenger.sendRequest(getCloudFormContext, HOST_EXTENSION);
	}

	submitComponents(params: WICloudSubmitComponentsReq): Promise<WICloudSubmitComponentsResp> {
		return this._messenger.sendRequest(submitComponents, HOST_EXTENSION, params);
	}

	closeCloudFormWebview(): void {
		this._messenger.sendNotification(closeCloudFormWebview, HOST_EXTENSION);
	}
}
