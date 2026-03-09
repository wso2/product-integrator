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

import { Messenger } from "vscode-messenger";
import {
	WICloudFormContext,
	WICloudSubmitComponentsReq,
	WICloudSubmitComponentsResp,
	closeCloudFormWebview,
	getCloudFormContext,
	submitComponents,
} from "@wso2/wi-core";
import { StateMachine } from "../../stateMachine";
import { ViewType } from "@wso2/wi-core";

/**
 * Pending cloud form context — set by create-component-cmd before opening the webview,
 * consumed by the rpc-handler when the webview requests it.
 */
let _pendingContext: WICloudFormContext | null = null;

/**
 * Pending submit handler — set by create-component-cmd so the webview result
 * gets routed back to the command that opened the form.
 */
let _pendingSubmitHandler:
	| ((req: WICloudSubmitComponentsReq) => Promise<WICloudSubmitComponentsResp>)
	| null = null;

/**
 * Store context and handler, then open the CREATE_COMPONENT webview.
 */
export function openCloudFormWebview(
	context: WICloudFormContext,
	submitHandler: (req: WICloudSubmitComponentsReq) => Promise<WICloudSubmitComponentsResp>,
): void {
	_pendingContext = context;
	_pendingSubmitHandler = submitHandler;
	StateMachine.openWebview(ViewType.CREATE_COMPONENT);
}

export function registerCloudRpcHandlers(messenger: Messenger): void {
	messenger.onRequest(getCloudFormContext, () => {
		const ctx = _pendingContext;
		if (!ctx) {
			throw new Error("No cloud form context available");
		}
		return ctx;
	});

	messenger.onRequest(submitComponents, async (req: WICloudSubmitComponentsReq) => {
		const handler = _pendingSubmitHandler;
		if (!handler) {
			throw new Error("No submit handler registered");
		}
		const resp = await handler(req);
		// Clear state after submission
		_pendingContext = null;
		_pendingSubmitHandler = null;
		return resp;
	});

	messenger.onNotification(closeCloudFormWebview, () => {
		_pendingContext = null;
		_pendingSubmitHandler = null;
		StateMachine.openWebview(ViewType.WELCOME);
	});
}
