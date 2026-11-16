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

/** The slice of the `vscode` API the unit-tested modules touch at load time. */

export class EventEmitter<T> {
	private listeners: Array<(value: T) => void> = [];
	public event = (listener: (value: T) => void) => {
		// Each registration is its own entry, removed once: disposing twice leaves the others alone.
		const registration = (value: T) => listener(value);
		this.listeners.push(registration);
		return {
			dispose: () => {
				const index = this.listeners.indexOf(registration);
				if (index >= 0) {
					this.listeners.splice(index, 1);
				}
			},
		};
	};
	public fire(value: T) {
		for (const listener of this.listeners) {
			listener(value);
		}
	}
	public dispose() {
		this.listeners = [];
	}
}

export class Uri {
	private constructor(
		public readonly scheme: string,
		public readonly authority: string,
		public readonly path: string,
		public readonly query: string,
		public readonly fsPath: string,
	) {}
	static file(fsPath: string) {
		return new Uri("file", "", fsPath, "", fsPath);
	}
	static parse(value: string) {
		const url = new URL(value);
		return new Uri(url.protocol.replace(/:$/, ""), url.host, url.pathname, url.search.replace(/^\?/, ""), url.pathname);
	}
	toString() {
		return `${this.scheme}://${this.authority}${this.path}${this.query ? `?${this.query}` : ""}`;
	}
}

export const workspace = {
	workspaceFolders: undefined as undefined | { uri: Uri }[],
	workspaceFile: undefined as undefined | Uri,
	getConfiguration: () => ({ get: (): undefined => undefined, inspect: (): undefined => undefined, update: async (): Promise<undefined> => undefined }),
	onDidChangeConfiguration: () => ({ dispose: (): undefined => undefined }),
};

export const window = {
	createOutputChannel: () => ({ appendLine: (): undefined => undefined, show: (): undefined => undefined, dispose: (): undefined => undefined }),
	showInformationMessage: async (): Promise<undefined> => undefined,
	showWarningMessage: async (): Promise<undefined> => undefined,
	showErrorMessage: async (): Promise<undefined> => undefined,
	showQuickPick: async (): Promise<undefined> => undefined,
	showInputBox: async (): Promise<undefined> => undefined,
	withProgress: async <T>(_options: unknown, task: () => Promise<T>) => task(),
	registerUriHandler: () => ({ dispose: (): undefined => undefined }),
};

export const commands = {
	registerCommand: () => ({ dispose: (): undefined => undefined }),
	executeCommand: async (): Promise<undefined> => undefined,
};

export const env = {
	uriScheme: "vscode",
	appName: "Visual Studio Code",
	uiKind: 1,
	openExternal: async () => true,
};

export const authentication = {
	registerAuthenticationProvider: () => ({ dispose: (): undefined => undefined }),
	getSession: async (): Promise<undefined> => undefined,
	onDidChangeSessions: () => ({ dispose: (): undefined => undefined }),
};

export const extensions = { getExtension: (): undefined => undefined };

export enum ProgressLocation {
	SourceControl = 1,
	Window = 10,
	Notification = 15,
}

export enum QuickPickItemKind {
	Separator = -1,
	Default = 0,
}

export enum UIKind {
	Desktop = 1,
	Web = 2,
}

export enum ConfigurationTarget {
	Global = 1,
	Workspace = 2,
	WorkspaceFolder = 3,
}
