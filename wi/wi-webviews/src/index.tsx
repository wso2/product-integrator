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
	"--vscode-button-background": "#f14e23",
	"--vscode-button-border": "#b43817",
	"--vscode-button-foreground": "#ffffff",
	"--vscode-button-hoverBackground": "#ff6700",
	"--vscode-button-secondaryBackground": "#3a3d41",
	"--vscode-button-secondaryForeground": "#cccccc",
	"--vscode-charts-green": "#73c991",
	"--vscode-charts-orange": "#d18616",
	"--vscode-charts-red": "#f14c4c",
	"--vscode-checkbox-background": "#3c3c3c",
	"--vscode-checkbox-border": "#666666",
	"--vscode-descriptionForeground": "#9d9d9d",
	"--vscode-disabledForeground": "#8a8a8a",
	"--vscode-dropdown-background": "#3c3c3c",
	"--vscode-dropdown-border": "#3c3c3c",
	"--vscode-dropdown-foreground": "#cccccc",
	"--vscode-editor-background": "#1e1e1e",
	"--vscode-editor-font-family": "'Segoe UI', Ubuntu, 'Droid Sans', sans-serif",
	"--vscode-editor-foreground": "#cccccc",
	"--vscode-editorWidget-border": "#454545",
	"--vscode-errorForeground": "#f48771",
	"--vscode-focusBorder": "#3794ff",
	"--vscode-font-family": "'Segoe UI', Ubuntu, 'Droid Sans', sans-serif",
	"--vscode-font-size": "13px",
	"--vscode-foreground": "#cccccc",
	"--vscode-input-background": "#2d2d2d",
	"--vscode-input-border": "#3c3c3c",
	"--vscode-input-foreground": "#cccccc",
	"--vscode-input-placeholderForeground": "#9d9d9d",
	"--vscode-inputValidation-errorBackground": "#5a1d1d",
	"--vscode-inputValidation-errorBorder": "#be1100",
	"--vscode-inputValidation-infoBackground": "#063b49",
	"--vscode-inputValidation-infoBorder": "#007acc",
	"--vscode-inputValidation-warningBackground": "#4d3b14",
	"--vscode-inputValidation-warningBorder": "#cca700",
	"--vscode-inputValidation-warningForeground": "#cca700",
	"--vscode-keybindingLabel-foreground": "#cccccc",
	"--vscode-list-deemphasizedForeground": "#8c8c8c",
	"--vscode-list-hoverBackground": "#2a2d2e",
	"--vscode-list-warningForeground": "#cca700",
	"--vscode-panel-border": "#454545",
	"--vscode-sideBar-background": "#252526",
	"--vscode-sideBarTitle-foreground": "#bbbbbb",
	"--vscode-terminal-ansiRed": "#cd3131",
	"--vscode-terminal-ansiYellow": "#e5e510",
	"--vscode-textBlockQuote-background": "#1f1f1f",
	"--vscode-textBlockQuote-border": "#007acc",
	"--vscode-textLink-activeForeground": "#4daafc",
	"--vscode-textLink-foreground": "#3794ff",
	"--vscode-toolbar-hoverBackground": "#2a2d2e",
	"--vscode-widget-border": "#454545",
};

const LIGHT_BROWSER_VSCODE_OVERRIDES: VSCodeCssVariables = {
	"--vscode-button-background": "#f14e23",
	"--vscode-button-border": "#cc441f",
	"--vscode-button-foreground": "#ffffff",
	"--vscode-button-hoverBackground": "#ff6700",
	"--vscode-button-secondaryBackground": "#e8e8e8",
	"--vscode-button-secondaryForeground": "#424242",
	"--vscode-charts-green": "#388a34",
	"--vscode-charts-orange": "#b05f00",
	"--vscode-charts-red": "#d13438",
	"--vscode-checkbox-background": "#ffffff",
	"--vscode-checkbox-border": "#8a8a8a",
	"--vscode-descriptionForeground": "#717171",
	"--vscode-disabledForeground": "#9d9d9d",
	"--vscode-dropdown-background": "#ffffff",
	"--vscode-dropdown-border": "#cecece",
	"--vscode-dropdown-foreground": "#3c3c3c",
	"--vscode-editor-background": "#ffffff",
	"--vscode-editor-font-family": "'Segoe UI', Ubuntu, 'Droid Sans', sans-serif",
	"--vscode-editor-foreground": "#3c3c3c",
	"--vscode-editorWidget-border": "#d9d9d9",
	"--vscode-errorForeground": "#c72e0f",
	"--vscode-focusBorder": "#0078d4",
	"--vscode-font-family": "'Segoe UI', Ubuntu, 'Droid Sans', sans-serif",
	"--vscode-font-size": "13px",
	"--vscode-foreground": "#3c3c3c",
	"--vscode-input-background": "#ffffff",
	"--vscode-input-border": "#cecece",
	"--vscode-input-foreground": "#3c3c3c",
	"--vscode-input-placeholderForeground": "#767676",
	"--vscode-inputValidation-errorBackground": "#fff0f0",
	"--vscode-inputValidation-errorBorder": "#be1100",
	"--vscode-inputValidation-infoBackground": "#eef6fd",
	"--vscode-inputValidation-infoBorder": "#75beff",
	"--vscode-inputValidation-warningBackground": "#fff8db",
	"--vscode-inputValidation-warningBorder": "#b89500",
	"--vscode-inputValidation-warningForeground": "#855f00",
	"--vscode-keybindingLabel-foreground": "#3c3c3c",
	"--vscode-list-deemphasizedForeground": "#616161",
	"--vscode-list-hoverBackground": "#f0f5ff",
	"--vscode-list-warningForeground": "#855f00",
	"--vscode-panel-border": "#d9d9d9",
	"--vscode-sideBar-background": "#f3f3f3",
	"--vscode-sideBarTitle-foreground": "#3c3c3c",
	"--vscode-terminal-ansiRed": "#cd3131",
	"--vscode-terminal-ansiYellow": "#949800",
	"--vscode-textBlockQuote-background": "#f7f7f7",
	"--vscode-textBlockQuote-border": "#0078d4",
	"--vscode-textLink-activeForeground": "#005a9e",
	"--vscode-textLink-foreground": "#006ab1",
	"--vscode-toolbar-hoverBackground": "#ececec",
	"--vscode-widget-border": "#d9d9d9",
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
