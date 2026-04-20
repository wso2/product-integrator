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

// Ported from ballerina-visualizer/src/views/AIPanel/components/ToolCallGroupSegment.tsx

import styled from "@emotion/styled";
import React, { useState, useEffect, useRef } from "react";
import ToolCallSegment, { Spinner } from "./ToolCallSegment";

const GroupContainer = styled.div`
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    margin: 8px 0;
    font-size: 12px;
    color: var(--vscode-editor-foreground);
    background-color: var(--vscode-textCodeBlock-background);
    overflow: hidden;
`;

const GroupHeader = styled.div<{ interactive: boolean }>`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    cursor: ${(props: { interactive: boolean }) => props.interactive ? "pointer" : "default"};
    user-select: none;
    font-family: var(--vscode-editor-font-family);

    &:hover {
        background-color: ${(props: { interactive: boolean }) =>
        props.interactive ? "var(--vscode-list-hoverBackground)" : "transparent"};
    }

    & .codicon-loading,
    & .codicon-check {
        margin-right: 0;
    }
`;

const ChevronIcon = styled.span<{ expanded: boolean }>`
    transition: transform 0.2s ease;
    transform: ${(props: { expanded: boolean }) => props.expanded ? "rotate(90deg)" : "rotate(0deg)"};
    display: flex;
    align-items: center;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
`;

const StatusIcon = styled.span`
    display: inline-flex;
    align-items: center;
    font-size: 13px;
    flex-shrink: 0;
`;

const HeaderLabel = styled.span`
    flex: 1;
    font-size: 12px;
    min-width: 0;
`;

const LastToolHint = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
    flex-shrink: 1;
    margin-left: 2px;
`;

const GroupBodyOuter = styled.div<{ expanded: boolean }>`
    display: grid;
    grid-template-rows: ${(props: { expanded: boolean }) => props.expanded ? "1fr" : "0fr"};
    transition: grid-template-rows 0.25s ease-in-out;
    border-top: ${(props: { expanded: boolean }) => props.expanded ? "1px solid var(--vscode-panel-border)" : "none"};
`;

const GroupBody = styled.div`
    overflow: hidden;
    min-height: 0;
`;

const ToolCallItemWrapper = styled.div`
    padding-left: 16px;
    border-left: 2px solid var(--vscode-panel-border);
    margin-left: 10px;

    & > pre {
        margin: 0;
        border: none;
        border-bottom: 1px solid var(--vscode-widget-border);
        border-radius: 0;
        padding: 6px 10px;
    }

    &:last-of-type > pre {
        border-bottom: none;
    }
`;

export interface ToolCallItem {
    text: string;
    loading: boolean;
    failed?: boolean;
    toolName?: string;
}

const FILE_TOOLS = ["file_write", "file_edit", "file_batch_edit"];
const LIBRARY_SEARCH_TOOLS = ["LibrarySearchTool"];
const LIBRARY_FETCH_TOOLS = ["LibraryGetTool", "HealthcareLibraryProviderTool"];
const RUN_TOOLS = ["runBallerinaPackage", "getServiceLogs", "stopBallerinaService"];
const CURL_TOOLS = ["curlRequest"];

interface ToolCategory {
    running: string;
    done: string;
}

function getGroupCategory(toolNames: (string | undefined)[]): ToolCategory {
    const names = toolNames.filter(Boolean) as string[];
    const hasFile = names.some((n) => FILE_TOOLS.includes(n));
    const hasLibrarySearch = names.some((n) => LIBRARY_SEARCH_TOOLS.includes(n));
    const hasLibraryFetch = names.some((n) => LIBRARY_FETCH_TOOLS.includes(n));
    const hasLibrary = hasLibrarySearch || hasLibraryFetch;
    const hasDiagnostics = names.includes("getCompilationErrors");
    const hasTestRunner = names.includes("runTests");
    const hasRunTool = names.some((n) => RUN_TOOLS.includes(n));
    const hasCurl = names.some((n) => CURL_TOOLS.includes(n));

    if (hasFile && !hasLibrary && !hasDiagnostics) {
        return { running: "Editing code...", done: "Code updated" };
    }
    if (hasDiagnostics && !hasFile && !hasLibrary) {
        return { running: "Checking for errors...", done: "No issues found" };
    }
    if (hasLibrarySearch && !hasLibraryFetch && !hasFile && !hasDiagnostics) {
        return { running: "Searching libraries...", done: "Libraries found" };
    }
    if (hasLibraryFetch && !hasFile && !hasDiagnostics) {
        return { running: "Fetching libraries...", done: "Libraries fetched" };
    }
    if (hasTestRunner) {
        return { running: "Running tests...", done: "Tests completed" };
    }
    if (hasRunTool) {
        return { running: "Running program...", done: "Run complete" };
    }
    if (hasCurl) {
        return { running: "Running curl...", done: "Curl complete" };
    }
    return { running: "Thinking...", done: "Done" };
}

interface ToolCallGroupSegmentProps {
    segments: ToolCallItem[];
}

const ToolCallGroupSegment: React.FC<ToolCallGroupSegmentProps> = ({ segments }) => {
    const isAnyLoading = segments.some((s) => s.loading);
    const isAnyFailed = !isAnyLoading && segments.some((s) => s.failed);
    const [isExpanded, setIsExpanded] = useState<boolean>(isAnyLoading);
    const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bodyId = useRef(`tool-group-body-${Math.random().toString(36).slice(2)}`);

    useEffect(() => {
        if (isAnyLoading) {
            if (collapseTimerRef.current) {
                clearTimeout(collapseTimerRef.current);
                collapseTimerRef.current = null;
            }
            setIsExpanded(true);
        } else {
            collapseTimerRef.current = setTimeout(() => {
                setIsExpanded(false);
                collapseTimerRef.current = null;
            }, 1500);
        }
        return () => {
            if (collapseTimerRef.current) {
                clearTimeout(collapseTimerRef.current);
            }
        };
    }, [isAnyLoading]);

    const toggleExpanded = () => {
        if (!isAnyLoading) {
            setIsExpanded((prev) => !prev);
        }
    };

    const activeItem = segments.find((s) => s.loading);
    const category = getGroupCategory(segments.map((s) => s.toolName));

    const isInteractive = !isAnyLoading;

    return (
        <GroupContainer>
            <GroupHeader
                interactive={isInteractive}
                onClick={isInteractive ? toggleExpanded : undefined}
                role={isInteractive ? "button" : undefined}
                tabIndex={isInteractive ? 0 : -1}
                onKeyDown={
                    isInteractive
                        ? (e: React.KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleExpanded();
                            }
                        }
                        : undefined
                }
                aria-expanded={isInteractive ? isExpanded : undefined}
                aria-controls={isInteractive ? bodyId.current : undefined}
                aria-disabled={!isInteractive}
            >
                <ChevronIcon expanded={isExpanded}>
                    <span className="codicon codicon-chevron-right" />
                </ChevronIcon>
                {isAnyLoading ? (
                    <Spinner className="codicon codicon-loading spin" role="img" aria-label="Running" />
                ) : (
                    <StatusIcon
                        className={`codicon ${isAnyFailed ? "codicon-error" : "codicon-check"}`}
                        style={isAnyFailed ? { color: "var(--vscode-errorForeground)" } : undefined}
                        role="img"
                        aria-label={isAnyFailed ? "Failed" : "Completed"}
                    />
                )}
                <HeaderLabel>
                    {isAnyLoading ? category.running : category.done}
                </HeaderLabel>
                {!isExpanded && isAnyLoading && activeItem && (
                    <LastToolHint>&gt; {activeItem.text}</LastToolHint>
                )}
            </GroupHeader>
            <GroupBodyOuter expanded={isExpanded} id={bodyId.current}>
                <GroupBody>
                    {segments.map((item) => (
                        <ToolCallItemWrapper key={`${item.toolName ?? "unknown"}_${item.text}`}>
                            <ToolCallSegment
                                text={item.text}
                                loading={item.loading}
                                failed={item.failed}
                            />
                        </ToolCallItemWrapper>
                    ))}
                </GroupBody>
            </GroupBodyOuter>
        </GroupContainer>
    );
};

export default ToolCallGroupSegment;
