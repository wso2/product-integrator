/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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

// Simplified Markdown renderer for the WI migration wizard AI enhancement view.
// Uses react-markdown + remark-gfm without highlight.js or BI-specific dependencies.

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
    markdownContent: string;
}

const markdownWrapperStyle: React.CSSProperties = {
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
};

const tableStyle: React.CSSProperties = {
    borderCollapse: "collapse",
    width: "100%",
    marginBottom: "8px",
    fontSize: "13px",
};

const thStyle: React.CSSProperties = {
    border: "1px solid var(--vscode-panel-border)",
    padding: "6px 10px",
    textAlign: "left",
    fontWeight: 600,
    backgroundColor: "var(--vscode-editor-inactiveSelectionBackground)",
    color: "var(--vscode-editor-foreground)",
};

const tdStyle: React.CSSProperties = {
    border: "1px solid var(--vscode-panel-border)",
    padding: "5px 10px",
    color: "var(--vscode-editor-foreground)",
};

const headingStyles: Record<"h1" | "h2" | "h3", React.CSSProperties> = {
    h1: { fontSize: "18px", lineHeight: "26px", margin: "14px 0 8px", fontWeight: 700 },
    h2: { fontSize: "16px", lineHeight: "24px", margin: "12px 0 8px", fontWeight: 700 },
    h3: { fontSize: "14px", lineHeight: "22px", margin: "10px 0 6px", fontWeight: 650 },
};

const paragraphStyle: React.CSSProperties = { margin: "8px 0" };
const listStyle: React.CSSProperties = { margin: "8px 0" };

const codeStyle: React.CSSProperties = {
    fontFamily: "var(--vscode-editor-font-family)",
    fontSize: "12px",
    backgroundColor: "var(--vscode-textCodeBlock-background)",
    padding: "1px 4px",
    borderRadius: "3px",
};

const preStyle: React.CSSProperties = {
    backgroundColor: "var(--vscode-textCodeBlock-background)",
    border: "1px solid var(--vscode-panel-border)",
    borderRadius: "4px",
    padding: "10px 14px",
    margin: "8px 0",
    overflowX: "auto",
    fontFamily: "var(--vscode-editor-font-family)",
    fontSize: "12px",
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ markdownContent }) => {
    return (
        <div style={markdownWrapperStyle}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => <p style={paragraphStyle}>{children}</p>,
                    h1: ({ children }) => <h1 style={headingStyles.h1}>{children}</h1>,
                    h2: ({ children }) => <h2 style={headingStyles.h2}>{children}</h2>,
                    h3: ({ children }) => <h3 style={headingStyles.h3}>{children}</h3>,
                    ul: ({ children }) => <ul style={listStyle}>{children}</ul>,
                    ol: ({ children }) => <ol style={listStyle}>{children}</ol>,
                    table: ({ children }) => <table style={tableStyle}>{children}</table>,
                    th: ({ children }) => <th style={thStyle}>{children}</th>,
                    td: ({ children }) => <td style={tdStyle}>{children}</td>,
                    code: ({ children, className }) => {
                        const isBlock = className?.startsWith("language-");
                        if (isBlock) {
                            return <code style={{ ...codeStyle, padding: 0 }}>{children}</code>;
                        }
                        return <code style={codeStyle}>{children}</code>;
                    },
                    pre: ({ children }) => <pre style={preStyle}>{children}</pre>,
                }}
            >
                {markdownContent}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownRenderer;
