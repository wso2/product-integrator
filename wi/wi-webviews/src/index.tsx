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

import React from "react";
import ReactDOM from "react-dom/client";
import IntegratorWebview from "./IntegratorWebview";
import { WebviewContextProvider } from "./contexts/WsContext";
import { CloudContextProvider, WIWebviewQueryClientProvider } from "./providers";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { injectVSCodeCssVariables } from "vscode-webview-network-bridge/webview";
import type { VSCodeCssTheme, VSCodeCssVariables } from "vscode-webview-network-bridge/webview";
import { resolveBridgeBootstrap } from "./network-bridge/WsClient";
import "./style.css";

const DARK_BROWSER_VSCODE_OVERRIDES: VSCodeCssVariables = {
	"--vscode-button-border": "#454545",
	"--vscode-button-hoverBackground": "#1177bb",
	"--vscode-button-secondaryBackground": "#3a3d41",
	"--vscode-button-secondaryForeground": "#cccccc",
	"--vscode-charts-orange": "#d18616",
	"--vscode-charts-red": "#f14c4c",
	"--vscode-checkbox-background": "#3c3c3c",
	"--vscode-descriptionForeground": "#9d9d9d",
	"--vscode-dropdown-border": "#3c3c3c",
	"--vscode-input-border": "#3c3c3c",
	"--vscode-input-foreground": "#cccccc",
	"--vscode-inputValidation-warningForeground": "#cca700",
	"--vscode-terminal-ansiRed": "#cd3131",
	"--vscode-terminal-ansiYellow": "#e5e510",
};

const LIGHT_BROWSER_VSCODE_OVERRIDES: VSCodeCssVariables = {
	"--vscode-button-border": "#cecece",
	"--vscode-button-hoverBackground": "#0062a3",
	"--vscode-button-secondaryBackground": "#e8e8e8",
	"--vscode-button-secondaryForeground": "#424242",
	"--vscode-charts-orange": "#b05f00",
	"--vscode-charts-red": "#d13438",
	"--vscode-checkbox-background": "#ffffff",
	"--vscode-descriptionForeground": "#717171",
	"--vscode-dropdown-border": "#cecece",
	"--vscode-dropdown-foreground": "#3c3c3c",
	"--vscode-input-border": "#cecece",
	"--vscode-input-foreground": "#3c3c3c",
	"--vscode-inputValidation-warningForeground": "#855f00",
	"--vscode-terminal-ansiRed": "#cd3131",
	"--vscode-terminal-ansiYellow": "#949800",
};

function resolveBrowserTheme(): VSCodeCssTheme {
	const bodyClassList = document.body?.classList;
	if (bodyClassList?.contains("vscode-light")) {
		return "light";
	}
	if (bodyClassList?.contains("vscode-dark") || bodyClassList?.contains("vscode-high-contrast")) {
		return "dark";
	}

	return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function renderWebview(target: HTMLElement) {
	const mode = resolveBridgeBootstrap();

	if (mode.mode === 'websocket') {
		const theme = resolveBrowserTheme();
		const overrides = theme === "light" ? LIGHT_BROWSER_VSCODE_OVERRIDES : DARK_BROWSER_VSCODE_OVERRIDES;
		injectVSCodeCssVariables(overrides, undefined, theme);
	}

	const reactRoot = ReactDOM.createRoot(target);
	reactRoot.render(
		<React.StrictMode>
			<WebviewContextProvider>
				<WIWebviewQueryClientProvider>
					<CloudContextProvider>
						<ErrorBoundary>
							<IntegratorWebview />
						</ErrorBoundary>
					</CloudContextProvider>
				</WIWebviewQueryClientProvider>
			</WebviewContextProvider>
		</React.StrictMode>,
	);
}
