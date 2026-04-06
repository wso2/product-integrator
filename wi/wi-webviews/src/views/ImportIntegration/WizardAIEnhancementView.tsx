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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { WIChatNotify } from "@wso2/wi-core";
import { WsClient } from "../../network-bridge/WsClient";
import MarkdownRenderer from "../shared/ai/MarkdownRenderer";
import { splitContent, SegmentType } from "../shared/ai/segment";
import ToolCallSegment from "../shared/ai/ToolCallSegment";
import ToolCallGroupSegment, { ToolCallItem } from "../shared/ai/ToolCallGroupSegment";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type EnhancementStatus = "running" | "completed" | "error" | "aborted";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatFileNameForDisplay(filePath: string): string {
    // Normalize Windows backslashes to forward slashes
    const normalized = filePath.replace(/\\/g, "/");
    let displayName = normalized.replace(/\.bal$/, "");
    const lastSlashIndex = displayName.lastIndexOf("/");
    if (lastSlashIndex !== -1) {
        const directory = displayName.substring(0, lastSlashIndex + 1);
        const fileName = displayName.substring(lastSlashIndex + 1);
        displayName = directory + fileName.replace(/[_-]/g, " ");
    } else {
        displayName = displayName.replace(/[_-]/g, " ");
    }
    return displayName;
}

// ──────────────────────────────────────────────────────────────────────────────
// Styled Components
// ──────────────────────────────────────────────────────────────────────────────

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
`;

const HeaderRow = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
`;

const StatusText = styled.span<{ variant?: "success" | "error" | "running" }>`
    font-size: 12px;
    font-weight: 500;
    color: ${(props: { variant?: string }) => {
        switch (props.variant) {
            case "success":
                return "var(--vscode-testing-iconPassed)";
            case "error":
                return "var(--vscode-errorForeground)";
            default:
                return "var(--vscode-descriptionForeground)";
        }
    }};
`;

const StreamArea = styled.div`
    flex: 1;
    max-height: 60vh;
    overflow-y: auto;
    padding: 12px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background-color: var(--vscode-editor-background);
    font-size: 13px;
    line-height: 1.6;
`;

const ButtonRow = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
`;

const ActionButton = styled.button<{ variant?: "primary" | "secondary" }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid
        ${(props: { variant?: string }) =>
        props.variant === "secondary"
            ? "var(--vscode-button-secondaryBackground)"
            : "var(--vscode-button-background)"};
    background-color: ${(props: { variant?: string }) =>
        props.variant === "secondary"
            ? "var(--vscode-button-secondaryBackground)"
            : "var(--vscode-button-background)"};
    color: ${(props: { variant?: string }) =>
        props.variant === "secondary"
            ? "var(--vscode-button-secondaryForeground)"
            : "var(--vscode-button-foreground)"};

    &:hover {
        opacity: 0.85;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const SpinnerIcon = styled.span`
    display: inline-block;
    animation: spin 1s linear infinite;
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const SubText = styled.span`
    font-size: 11px;
    font-weight: 400;
    color: var(--vscode-descriptionForeground);
    margin-top: 1px;
`;

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

interface WizardAIEnhancementViewProps {
    wsClient: WsClient;
}

export function WizardAIEnhancementView({ wsClient }: WizardAIEnhancementViewProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const enhancementTriggered = useRef(false);

    const [status, setStatus] = useState<EnhancementStatus>("running");
    const [content, setContent] = useState("");
    const [elapsed, setElapsed] = useState(0);

    const terminalRef = useRef(false);

    // ── Uptime counter ──────────────────────────────────────────────────────
    useEffect(() => {
        if (status !== "running") {
            return;
        }
        setElapsed(0);
        const id = setInterval(() => setElapsed((s) => s + 1), 1000);
        return () => clearInterval(id);
    }, [status]);

    function formatElapsed(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        }
        return `${m}:${String(s).padStart(2, "0")}`;
    }

    const updateContent = useCallback(
        (updater: (prev: string) => string) => setContent(updater),
        []
    );

    // ── Chat event handler ──────────────────────────────────────────────────
    const handleChatEvent = useCallback(
        (event: WIChatNotify) => {
            if (event.type === "start") {
                terminalRef.current = false;
                setStatus("running");
                setContent("");
                return;
            }

            if (terminalRef.current) {
                return;
            }

            switch (event.type) {

                case "content_block":
                    updateContent((prev) => prev + event.content);
                    break;

                case "content_replace":
                    setContent(event.content);
                    break;

                case "tool_call": {
                    const toolName = event.toolName;
                    const toolCallId = event.toolCallId;
                    const toolInput = event.toolInput;

                    if (toolName === "LibrarySearchTool") {
                        const desc = toolInput?.searchDescription;
                        const msg = desc ? `Searching for ${desc}...` : "Searching for libraries...";
                        updateContent((prev) => prev + `\n\n<toolcall id="${toolCallId}" tool="${toolName}">${msg}</toolcall>`);
                    } else if (toolName === "LibraryGetTool") {
                        updateContent((prev) => prev + `\n\n<toolcall id="${toolCallId}" tool="${toolName}">Fetching library details...</toolcall>`);
                    } else if (toolName === "HealthcareLibraryProviderTool") {
                        updateContent((prev) => prev + `\n\n<toolcall id="${toolCallId}" tool="${toolName}">Analyzing request & selecting healthcare libraries...</toolcall>`);
                    } else if (["file_write", "file_edit", "file_batch_edit"].includes(toolName)) {
                        const fileName = toolInput?.fileName || "file";
                        const displayName = formatFileNameForDisplay(fileName);
                        const msg = toolName === "file_write" ? `Creating ${displayName}...` : `Updating ${displayName}...`;
                        updateContent((prev) => prev + `\n\n<toolcall id="${toolCallId}" tool="${toolName}">${msg}</toolcall>`);
                    } else if (toolName === "getCompilationErrors") {
                        updateContent((prev) => prev + `\n\n<toolcall tool="${toolName}">Checking for errors...</toolcall>`);
                    } else if (toolName === "runTests") {
                        updateContent((prev) => prev + `\n\n<toolcall id="${toolCallId}" tool="${toolName}">Running tests...</toolcall>`);
                    }
                    break;
                }

                case "tool_result": {
                    const toolName = event.toolName;
                    const toolCallId = event.toolCallId;
                    const toolOutput = event.toolOutput;

                    if (toolName === "LibrarySearchTool") {
                        const desc = toolOutput?.searchDescription;
                        const origMsg = desc ? `Searching for ${desc}...` : "Searching for libraries...";
                        const doneMsg = desc
                            ? `${desc.charAt(0).toUpperCase() + desc.slice(1)} search completed`
                            : "Library search completed";
                        const failedAttrLS = event.failed ? ` failed="true"` : "";
                        updateContent((prev) =>
                            prev.replace(
                                `<toolcall id="${toolCallId}" tool="${toolName}">${origMsg}</toolcall>`,
                                `<toolresult id="${toolCallId}" tool="${toolName}"${failedAttrLS}>${doneMsg}</toolresult>`
                            )
                        );
                    } else if (toolName === "LibraryGetTool") {
                        const libs = toolOutput || [];
                        const resultMsg = libs.length === 0 ? "No relevant libraries found" : `Fetched libraries: [${libs.join(", ")}]`;
                        const failedAttrLG = event.failed ? ` failed="true"` : "";
                        updateContent((prev) =>
                            prev.replace(
                                `<toolcall id="${toolCallId}" tool="${toolName}">Fetching library details...</toolcall>`,
                                `<toolresult id="${toolCallId}" tool="${toolName}"${failedAttrLG}>${resultMsg}</toolresult>`
                            )
                        );
                    } else if (toolName === "HealthcareLibraryProviderTool") {
                        const libs = toolOutput || [];
                        const resultMsg = libs.length === 0
                            ? "No relevant healthcare libraries found."
                            : `Fetched healthcare libraries: [${libs.join(", ")}]`;
                        const failedAttrHL = event.failed ? ` failed="true"` : "";
                        if (toolCallId) {
                            updateContent((prev) =>
                                prev.replace(
                                    `<toolcall id="${toolCallId}" tool="${toolName}">Analyzing request & selecting healthcare libraries...</toolcall>`,
                                    `<toolresult id="${toolCallId}" tool="${toolName}"${failedAttrHL}>${resultMsg}</toolresult>`
                                )
                            );
                        }
                    } else if (["file_write", "file_edit", "file_batch_edit"].includes(toolName)) {
                        const failedAttrF = event.failed ? ` failed="true"` : "";
                        updateContent((prev) => {
                            if (!toolCallId) {
                                return prev;
                            }
                            const toolCallPattern = new RegExp(
                                `<toolcall id="${toolCallId}" tool="${toolName}">(Creating|Updating) (.+?)\\.\\.\\.<\\/toolcall>`
                            );
                            return prev.replace(toolCallPattern, (_m, actionLabel, fileName) => {
                                const resultText = actionLabel === "Updating" || toolOutput?.action === "updated" ? "Updated" : "Created";
                                return `<toolresult id="${toolCallId}" tool="${toolName}"${failedAttrF}>${resultText} ${fileName}</toolresult>`;
                            });
                        });
                    } else if (toolName === "getCompilationErrors") {
                        const errors = toolOutput?.diagnostics || [];
                        const errorCount = errors.length;
                        const msg = errorCount === 0 ? "No errors found" : `Found ${errorCount} error${errorCount > 1 ? "s" : ""}`;
                        const failedAttrCE = event.failed ? ` failed="true"` : "";
                        const pattern = new RegExp(`<toolcall tool="${toolName}">Checking for errors\\.\\.\\.<\\/toolcall>`);
                        updateContent((prev) => prev.replace(pattern, `<toolresult tool="${toolName}"${failedAttrCE}>${msg}</toolresult>`));
                    } else if (toolName === "runTests") {
                        if (toolCallId) {
                            const resultMsg = toolOutput?.summary ?? "Tests completed";
                            const failedAttrRT = event.failed ? ` failed="true"` : "";
                            updateContent((prev) =>
                                prev.replace(
                                    `<toolcall id="${toolCallId}" tool="${toolName}">Running tests...</toolcall>`,
                                    `<toolresult id="${toolCallId}" tool="${toolName}"${failedAttrRT}>${resultMsg}</toolresult>`
                                )
                            );
                        }
                    }
                    break;
                }

                case "stop":
                    terminalRef.current = true;
                    setStatus("completed");
                    break;

                case "error":
                    updateContent((prev) => prev + `\n\n**Error:** ${event.content ?? "An unexpected error occurred."}`);
                    terminalRef.current = true;
                    setStatus("error");
                    break;

                case "abort":
                    terminalRef.current = true;
                    setStatus("aborted");
                    break;

                default:
                    break;
            }
        },
        [updateContent]
    );

    // ── Subscribe to streaming events ───────────────────────────────────────
    useEffect(() => {
        const cleanup = wsClient.onChatNotify((event: WIChatNotify) => {
            handleChatEvent(event);
        });
        return cleanup;
    }, [wsClient, handleChatEvent]);

    // ── Trigger the agent ───────────────────────────────────────────────────
    useEffect(() => {
        if (enhancementTriggered.current) {
            return;
        }
        enhancementTriggered.current = true;

        wsClient.wizardEnhancementReady().catch((err: unknown) => {
            console.error("[WizardAIEnhancementView] wizardEnhancementReady failed:", err);
            setStatus("error");
        });
    }, [wsClient]);

    // ── Auto-scroll ─────────────────────────────────────────────────────────
    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
        });
    }, [content]);

    // ── Parse content into segments ─────────────────────────────────────────
    const segments = useMemo(() => splitContent(content), [content]);

    // ── Actions ─────────────────────────────────────────────────────────────
    const handleOpenProject = useCallback(() => {
        wsClient.openMigratedProject().catch((err: unknown) => {
            console.error("[WizardAIEnhancementView] openMigratedProject failed:", err);
        });
    }, [wsClient]);

    const handleSkipAndOpen = useCallback(() => {
        wsClient.abortMigrationAgent().catch(() => { /* best effort */ });
        wsClient.openMigratedProject().catch((err: unknown) => {
            console.error("[WizardAIEnhancementView] openMigratedProject (skip) failed:", err);
        });
    }, [wsClient]);

    // ── Render ───────────────────────────────────────────────────────────────
    const isRunning = status === "running";
    const isDone = status === "completed" || status === "error" || status === "aborted";

    return (
        <Container>
            <HeaderRow>
                {isRunning && (
                    <>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <SpinnerIcon className="codicon codicon-sync" />
                            <StatusText variant="running">AI Enhancement in progress…</StatusText>
                            <span style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)", fontVariantNumeric: "tabular-nums" }}>
                                [{formatElapsed(elapsed)}]
                            </span>
                        </div>
                        <SubText>This may take a while.</SubText>
                    </>
                )}
                {status === "completed" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="codicon codicon-check" style={{ color: "var(--vscode-testing-iconPassed)" }} />
                        <StatusText variant="success">AI Enhancement completed</StatusText>
                    </div>
                )}
                {status === "error" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="codicon codicon-error" style={{ color: "var(--vscode-errorForeground)" }} />
                        <StatusText variant="error">AI Enhancement encountered an error</StatusText>
                    </div>
                )}
                {status === "aborted" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="codicon codicon-circle-slash" />
                        <StatusText>AI Enhancement was skipped</StatusText>
                    </div>
                )}
            </HeaderRow>

            <StreamArea ref={scrollRef}>
                {segments.map((segment, i) => {
                    if (segment.type === SegmentType.Text) {
                        if (!segment.text.trim()) {
                            return null;
                        }
                        return <MarkdownRenderer key={`text-${i}`} markdownContent={segment.text} />;
                    }

                    if (segment.type === SegmentType.ToolCall) {
                        const currentToolName = segment.toolName;

                        let nextIdx = i + 1;
                        while (
                            nextIdx < segments.length &&
                            segments[nextIdx].type === SegmentType.Text &&
                            segments[nextIdx].text.trim() === ""
                        ) {
                            nextIdx++;
                        }
                        const nextSeg = segments[nextIdx];
                        if (nextSeg && nextSeg.type === SegmentType.ToolCall && nextSeg.toolName === currentToolName) {
                            return null;
                        }

                        const groupItems: ToolCallItem[] = [];
                        let j = i;
                        while (j >= 0) {
                            const seg = segments[j];
                            if (seg.type === SegmentType.ToolCall && seg.toolName === currentToolName) {
                                groupItems.unshift({
                                    text: seg.text,
                                    loading: seg.loading,
                                    failed: seg.failed,
                                    toolName: seg.toolName,
                                });
                            } else if (seg.type === SegmentType.Text && seg.text.trim() === "") {
                                j--;
                                continue;
                            } else {
                                break;
                            }
                            j--;
                        }

                        if (groupItems.length === 1) {
                            return (
                                <ToolCallSegment
                                    key={`tool-${i}`}
                                    text={segment.text}
                                    loading={segment.loading}
                                    failed={segment.failed}
                                />
                            );
                        }

                        return <ToolCallGroupSegment key={`tool-group-${i}`} segments={groupItems} />;
                    }

                    if (segment.text.trim()) {
                        return <MarkdownRenderer key={`fallback-${i}`} markdownContent={segment.text} />;
                    }
                    return null;
                })}

                {isRunning && segments.length === 0 && (
                    <StatusText variant="running">Starting AI enhancement agent…</StatusText>
                )}
            </StreamArea>

            <ButtonRow>
                {isDone && (
                    <ActionButton variant="primary" onClick={handleOpenProject}>
                        <span className="codicon codicon-folder-opened" />
                        Open Project
                    </ActionButton>
                )}
                {isRunning && (
                    <ActionButton
                        variant="secondary"
                        onClick={handleSkipAndOpen}
                        title="Pause AI enhancement and open the integration project. Your current progress is saved and can be resumed later from the BI Chat."
                    >
                        <span className="codicon codicon-debug-pause" />
                        Pause and Open Integration
                    </ActionButton>
                )}
            </ButtonRow>
        </Container>
    );
}
