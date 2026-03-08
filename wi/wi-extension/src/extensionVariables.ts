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

import type { AuthState, IChoreoRPCClient } from "@wso2/wso2-platform-core";
import * as vscode from "vscode";

/**
 * Minimal interface for the WSO2 auth provider.
 * The full implementation (WSO2AuthenticationProvider) is wired in during extension activation.
 */
export interface IAuthProvider {
	getState(): {
		state: AuthState;
		logout: (silent?: boolean, skipClearSessions?: boolean) => Promise<void>;
		initAuth: () => Promise<void>;
	};
	subscribe(callback: (store: { state: AuthState }) => void): () => void;
}

/**
 * Extension context wrapper
 */
class ExtensionVariables {
	private _context: vscode.ExtensionContext | undefined;
	private _outputChannel: vscode.OutputChannel | undefined;

	// --- Platform feature properties ---

	/** WSO2 auth provider — set during activation (Stage 5). */
	public authProvider?: IAuthProvider;

	/** Choreo RPC client — set during activation (Stage 4). */
	public clients!: { rpcClient: IChoreoRPCClient };

	/** Active Cloud environment name (e.g. "prod", "stage", "dev"). */
	public cloudEnv: "prod" | "stage" | "dev" = "prod";

	/** True when running inside the Devant cloud editor (CLOUD_STS_TOKEN is set). */
	public isDevantCloudEditor: boolean = !!process.env.CLOUD_STS_TOKEN;

	get context(): vscode.ExtensionContext {
		if (!this._context) {
			throw new Error("Extension context not initialized");
		}
		return this._context;
	}

	set context(value: vscode.ExtensionContext) {
		this._context = value;
	}

	get outputChannel(): vscode.OutputChannel {
		if (!this._outputChannel) {
			this._outputChannel = vscode.window.createOutputChannel("WSO2 Integrator");
		}
		return this._outputChannel;
	}

	public log(message: string): void {
		this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
	}

	public logError(message: string, error?: Error): void {
		const errorMsg = error ? `${message}: ${error.message}` : message;
		this.outputChannel.appendLine(`[${new Date().toISOString()}] ERROR: ${errorMsg}`);
		if (error?.stack) {
			this.outputChannel.appendLine(error.stack);
		}
	}
}

export const ext = new ExtensionVariables();
