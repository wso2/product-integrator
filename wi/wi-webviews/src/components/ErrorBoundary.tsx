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

import React from "react";

interface Props {
	children: React.ReactNode;
}

interface State {
	error: Error | null;
	componentStack: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
	state: State = { error: null, componentStack: null };

	static getDerivedStateFromError(error: Error): Partial<State> {
		return { error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		this.setState({ componentStack: info.componentStack ?? null });
		console.error("[ErrorBoundary] Render error:", error, info.componentStack);
	}

	render() {
		const { error, componentStack } = this.state;
		if (!error) {
			return this.props.children;
		}

		return (
			<div style={{
				padding: "1.5rem",
				fontFamily: "var(--vscode-editor-font-family, monospace)",
				fontSize: 12,
				color: "var(--vscode-errorForeground)",
				background: "var(--vscode-inputValidation-errorBackground, #5a1d1d)",
				border: "1px solid var(--vscode-inputValidation-errorBorder, #be1100)",
				borderRadius: 4,
				overflow: "auto",
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
			}}>
				<strong style={{ fontSize: 13 }}>Render Error: {error.message}</strong>
				{error.stack && (
					<>
						{"\n\n"}
						<span style={{ opacity: 0.8 }}>{error.stack}</span>
					</>
				)}
				{componentStack && (
					<>
						{"\n\n"}
						<strong>Component Stack:</strong>
						{"\n"}
						<span style={{ opacity: 0.8 }}>{componentStack}</span>
					</>
				)}
			</div>
		);
	}
}
