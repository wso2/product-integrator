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

import styled from "@emotion/styled";

// ── Pipeline container ────────────────────────────────────────────────────────

export const PipelineContainer = styled.div`
    display: flex;
    flex-direction: column;
    margin: 8px 0 4px 0;
    font-family: var(--vscode-font-family);
`;

// ── Entry block: two-column layout — left rail (dot + line) + right content ──

export const EntryBlock = styled.div`
    display: flex;
    flex-direction: row;
    padding: 0 10px 0 0;
`;

export const EntryRail = styled.div<{ showLine: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 20px;
    flex-shrink: 0;

    &::before {
        content: ${(props: { showLine: boolean }) => props.showLine ? "''" : "none"};
        position: absolute;
        top: 12px;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 1.5px;
        background-color: var(--vscode-panel-border);
        opacity: 0.9;
    }
`;

export const DotWrapper = styled.div`
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 24px;
    flex-shrink: 0;
    background-color: var(--vscode-editor-background);
`;

export const EntryContent = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    padding-left: 6px;
`;

export const EntryHeader = styled.div`
    display: flex;
    align-items: center;
    min-height: 24px;
    cursor: pointer;
    user-select: none;
`;

export const ExpandIcon = styled.span<{ expanded: boolean }>`
    font-size: 10px;
    flex-shrink: 0;
    margin-left: 4px;
    opacity: ${(props: { expanded: boolean }) => props.expanded ? 0 : 0.5};
    transition: opacity 0.2s ease;
`;

export const ItemsArea = styled.div<{ expanded: boolean }>`
    display: grid;
    grid-template-rows: ${(props: { expanded: boolean }) => props.expanded ? '1fr' : '0fr'};
    opacity: ${(props: { expanded: boolean }) => props.expanded ? 1 : 0};
    transition: grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
`;

export const ItemsInner = styled.div`
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding-bottom: 4px;
`;

export const ItemRow = styled.div`
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 0;
    min-height: 18px;
`;

export const ItemMarkdownWrapper = styled.div`
    width: 100%;
    padding: 2px 0;
    p:first-child { margin-top: 0; }
    p:last-child { margin-bottom: 0; }
`;

// ── Task node indicators ──────────────────────────────────────────────────────

export const SonarWrapper = styled.span`
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
`;

export const SonarCenter = styled.span`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--vscode-charts-blue);
    position: relative;
    z-index: 1;
`;

export const SonarRing = styled.span`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid var(--vscode-charts-blue);
    animation: wi-sonar-ring 1.6s ease-out infinite;
    @keyframes wi-sonar-ring {
        0%   { transform: scale(1);   opacity: 0.7; }
        100% { transform: scale(2.4); opacity: 0;   }
    }
`;

export const DoneCircle = styled.span`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background-color: var(--vscode-charts-green, #388a34);
`;

export const NodeLabel = styled.span<{ nodeStatus: "active" | "done" }>`
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-editor-foreground);
    opacity: ${(props: { nodeStatus: string }) => props.nodeStatus === "done" ? 0.75 : 1};
`;

// ── Item indicators ───────────────────────────────────────────────────────────

export const ToolIcon = styled.span<{ loading?: boolean; failed?: boolean }>`
    font-size: 10px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: ${(props: { loading?: boolean; failed?: boolean }) =>
        props.failed
            ? "var(--vscode-errorForeground)"
            : props.loading
            ? "var(--vscode-charts-blue)"
            : "var(--vscode-descriptionForeground)"};
    opacity: ${(props: { loading?: boolean; failed?: boolean }) => props.loading ? 1 : 0.75};
    ${(props: { loading?: boolean; failed?: boolean }) => props.loading ? `
        animation: wi-breathe 1.4s ease-in-out infinite;
        @keyframes wi-breathe {
            0%, 100% { opacity: 0.4; }
            50%       { opacity: 1; }
        }
    ` : ""}
`;

export const ItemLabel = styled.span<{ loading: boolean; failed?: boolean }>`
    font-size: 13px;
    color: ${(props: { loading: boolean; failed?: boolean }) =>
        props.failed
            ? "var(--vscode-errorForeground)"
            : "var(--vscode-editor-foreground)"};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

export const ItemDetail = styled.span`
    margin-left: 3px;
    font-size: 12px;
`;

// ── Tool call group (collapsible category grouping) ───────────────────────────

export const ToolGroupContainer = styled.div`
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    margin: 2px 0 4px 0;
    overflow: hidden;
    background-color: var(--vscode-textCodeBlock-background);
`;

export const ToolGroupHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    min-height: 22px;
    cursor: pointer;
    user-select: none;
    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

export const ToolGroupChevron = styled.span<{ expanded: boolean }>`
    font-size: 10px;
    flex-shrink: 0;
    color: var(--vscode-descriptionForeground);
    margin-left: auto;
    display: flex;
    align-items: center;
    transform: rotate(${(p: { expanded: boolean }) => p.expanded ? "0deg" : "-90deg"});
    transition: transform 0.15s ease;
`;

export const ToolGroupBody = styled.div`
    border-top: 1px solid var(--vscode-panel-border);
    padding: 2px 4px 4px 8px;
    display: flex;
    flex-direction: column;
`;

// ── Inline card (command output) ──────────────────────────────────────────────

export const InlineCard = styled.div`
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 3px 6px;
    margin: 0 0 4px 0;
    font-family: var(--vscode-font-family);
`;

export const InlineCardIcon = styled.span`
    display: flex;
    align-items: center;
    font-size: 12px;
    flex-shrink: 0;
    color: var(--vscode-descriptionForeground);
`;

export const InlineCardTitle = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-editor-foreground);
    flex: 1;
`;
