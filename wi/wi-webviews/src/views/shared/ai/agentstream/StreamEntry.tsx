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

import React, { useEffect, useRef, useState } from "react";
import MarkdownRenderer from "../MarkdownRenderer";
import CommandOutputCard from "./CommandOutputCard";
import {
    DoneCircle,
    DotWrapper,
    EntryBlock,
    EntryContent,
    EntryHeader,
    EntryRail,
    ExpandIcon,
    ItemDetail,
    ItemLabel,
    ItemMarkdownWrapper,
    ItemRow,
    ItemsArea,
    ItemsInner,
    NodeLabel,
    SonarCenter,
    SonarRing,
    SonarWrapper,
    ToolGroupBody,
    ToolGroupChevron,
    ToolGroupContainer,
    ToolGroupHeader,
    ToolIcon,
} from "./styles";
import { StreamEntry, StreamItem } from "./types";

const COMMAND_OUTPUT_TOOLS = new Set(["runBallerinaPackage", "runTests", "getServiceLogs", "stopBallerinaService"]);

// ── Tool icon mapping ─────────────────────────────────────────────────────────

interface ToolIconEntry { loading: string; done?: string; }

const TOOL_ICON_MAP: Record<string, ToolIconEntry> = {
    file_read:                     { loading: "codicon-go-to-file" },
    file_write:                    { loading: "codicon-edit" },
    file_edit:                     { loading: "codicon-edit" },
    file_batch_edit:               { loading: "codicon-edit" },
    LibrarySearchTool:             { loading: "codicon-package" },
    LibraryGetTool:                { loading: "codicon-package" },
    HealthcareLibraryProviderTool: { loading: "codicon-package" },
    web_search:                    { loading: "codicon-search" },
    web_fetch:                     { loading: "codicon-globe" },
    runTests:                      { loading: "codicon-beaker" },
    runBallerinaPackage:           { loading: "codicon-play" },
    getServiceLogs:                { loading: "codicon-output" },
    stopBallerinaService:          { loading: "codicon-debug-stop" },
    getCompilationErrors:          { loading: "codicon-pulse", done: "codicon-pass-filled" },
    TaskWrite:                     { loading: "codicon-checklist" },
    ConfigCollector:               { loading: "codicon-settings-gear" },
    ConnectorGeneratorTool:        { loading: "codicon-plug" },
    migration_source_list:         { loading: "codicon-list-tree" },
    migration_source_read:         { loading: "codicon-go-to-file" },
};
const DEFAULT_TOOL_ICON = "codicon-symbol-property";

function getToolIcon(toolName: string | undefined, state: "loading" | "done" = "loading"): string {
    const entry = toolName ? TOOL_ICON_MAP[toolName] : undefined;
    if (!entry) return DEFAULT_TOOL_ICON;
    return state === "done" ? (entry.done ?? entry.loading) : entry.loading;
}

function getToolResultIcon(toolName: string | undefined, toolOutput: any): string {
    if (toolName === "getCompilationErrors") {
        const count = toolOutput?.diagnostics?.length ?? 0;
        return count > 0 ? "codicon-warning" : "codicon-pass-filled";
    }
    return getToolIcon(toolName, "done");
}

// ── Tool display helpers ───────────────────────────────────────────────────────

function getFileName(filePath: string | undefined): string {
    if (!filePath) return "file";
    const normalized = filePath.replace(/\\/g, "/");
    const i = normalized.lastIndexOf("/");
    return i !== -1 ? normalized.substring(i + 1) : normalized;
}

function getToolCallDisplay(toolName: string | undefined, toolInput: any): { label: string; detail?: string } {
    switch (toolName) {
        case "file_read":    return { label: "Reading",   detail: getFileName(toolInput?.fileName) + "..." };
        case "file_write":   return { label: "Creating",  detail: getFileName(toolInput?.fileName) + "..." };
        case "file_edit":
        case "file_batch_edit": return { label: "Updating", detail: getFileName(toolInput?.fileName) + "..." };
        case "TaskWrite":    return { label: "Planning..." };
        case "LibrarySearchTool": {
            const desc = toolInput?.searchDescription;
            return { label: desc ? `Searching for ${desc}...` : "Searching libraries..." };
        }
        case "LibraryGetTool": return { label: "Fetching library details..." };
        case "HealthcareLibraryProviderTool": return { label: "Analyzing healthcare libraries..." };
        case "getCompilationErrors": return { label: "Checking for errors..." };
        case "runTests": return { label: "Running tests..." };
        case "runBallerinaPackage": return { label: `Running ${toolInput?.runType === "service" ? "service" : "program"}...` };
        case "getServiceLogs": return { label: "Fetching logs..." };
        case "stopBallerinaService": return { label: "Stopping service..." };
        case "web_search": return { label: toolInput?.query ? "Searching the web:" : "Searching the web...", detail: toolInput?.query };
        case "web_fetch":  return { label: toolInput?.url ? "Fetching from web:" : "Fetching from web...", detail: toolInput?.url };
        case "ConfigCollector":        return { label: "Reading config…" };
        case "ConnectorGeneratorTool": return { label: "Generating connector…" };
        case "migration_source_list":  return { label: "Listing", detail: toolInput?.directory_path ?? "." };
        case "migration_source_read":  return { label: "Reading", detail: getFileName(toolInput?.file_path) + "…" };
        default: return { label: "Working..." };
    }
}

function getToolResultDisplay(toolName: string | undefined, toolOutput: any, hint?: string): { label: string; detail?: string } {
    switch (toolName) {
        case "file_read":    return { label: "Read",    detail: getFileName(toolOutput?.fileName) };
        case "file_write":   return { label: toolOutput?.action === "updated" ? "Updated" : "Created", detail: getFileName(toolOutput?.fileName) };
        case "file_edit":
        case "file_batch_edit": return { label: "Updated", detail: getFileName(toolOutput?.fileName) };
        case "TaskWrite":    return { label: "Plan ready" };
        case "LibrarySearchTool": {
            const desc = toolOutput?.searchDescription;
            return { label: desc ? `${desc.charAt(0).toUpperCase() + desc.slice(1)} search completed` : "Library search completed" };
        }
        case "LibraryGetTool": {
            const names: string[] = toolOutput || [];
            return { label: names.length > 0 ? `Fetched: [${names.join(", ")}]` : "No relevant libraries found" };
        }
        case "HealthcareLibraryProviderTool": {
            const names: string[] = toolOutput || [];
            return { label: names.length > 0 ? `Fetched: [${names.join(", ")}]` : "No relevant healthcare libraries found" };
        }
        case "getCompilationErrors": {
            const count = toolOutput?.diagnostics?.length ?? 0;
            return { label: count > 0 ? `Found ${count} error(s)` : "No issues found" };
        }
        case "runTests": return { label: toolOutput?.summary ?? "Tests completed" };
        case "runBallerinaPackage": {
            const status = toolOutput?.status ?? "completed";
            return { label: status === "started" ? "Service started" : status === "completed" ? "Program completed" : status === "timeout" ? "Program timed out" : "Run failed" };
        }
        case "getServiceLogs": {
            const status = toolOutput?.status ?? "running";
            return { label: status === "exited" ? "Service exited" : status === "not_found" ? "Service not found" : "Logs retrieved" };
        }
        case "stopBallerinaService": {
            const status = toolOutput?.status ?? "stopped";
            return { label: status === "stopped" ? "Service stopped" : status === "already_exited" ? "Service already exited" : "Service not found" };
        }
        case "web_search": return { label: hint ? "Web search:" : "Web search completed", detail: hint };
        case "web_fetch":  return { label: hint ? "Web fetch:" : "Web fetch completed",  detail: hint };
        case "ConfigCollector":        return { label: "Config loaded" };
        case "ConnectorGeneratorTool": return { label: "Connector ready" };
        case "migration_source_list":  return { label: "Listed", detail: toolOutput?.directory_path ?? (toolOutput?.success === false ? "failed" : undefined) };
        case "migration_source_read":  return { label: "Read", detail: toolOutput?.file_path };
        default: return { label: "Done" };
    }
}

// ── Tool category grouping ────────────────────────────────────────────────────

type ToolCategory = "editing" | "file_read" | "diagnostics" | "library_search" | "library_get" | "source_list";

const TOOL_CATEGORY_MAP: Partial<Record<string, ToolCategory>> = {
    file_read:                     "file_read",
    migration_source_read:         "file_read",
    file_write:                    "editing",
    file_edit:                     "editing",
    file_batch_edit:               "editing",
    getCompilationErrors:          "diagnostics",
    LibrarySearchTool:             "library_search",
    LibraryGetTool:                "library_get",
    HealthcareLibraryProviderTool: "library_get",
    migration_source_list:         "source_list",
};

const CATEGORY_META: Record<ToolCategory, { loadingLabel: string; doneLabel: string; icon: string }> = {
    file_read:      { loadingLabel: "Reading files…",        doneLabel: "Files read",        icon: "codicon-go-to-file" },
    editing:        { loadingLabel: "Editing code…",         doneLabel: "Code updated",      icon: "codicon-edit" },
    diagnostics:    { loadingLabel: "Checking for errors…",  doneLabel: "Check complete",    icon: "codicon-pulse" },
    library_search: { loadingLabel: "Searching libraries…",  doneLabel: "Libraries found",   icon: "codicon-package" },
    library_get:    { loadingLabel: "Fetching libraries…",   doneLabel: "Libraries fetched", icon: "codicon-package" },
    source_list:    { loadingLabel: "Listing source files…", doneLabel: "Source files listed", icon: "codicon-list-tree" },
};

type ToolGroupSlot = { kind: "tool_group"; category: ToolCategory; items: StreamItem[] };
type RenderSlot = StreamItem | ToolGroupSlot;

function getItemToolName(item: StreamItem): string | undefined {
    if (item.kind === "tool_call" || item.kind === "tool_result") return item.toolName;
    return undefined;
}

function groupToolItems(items: StreamItem[]): RenderSlot[] {
    const slots: RenderSlot[] = [];
    let i = 0;
    while (i < items.length) {
        const item = items[i];
        const toolName = getItemToolName(item);
        const cat = toolName ? TOOL_CATEGORY_MAP[toolName] : undefined;

        // Groupable: tool_call or tool_result with a known category, not a command-output tool
        if (cat && (item.kind === "tool_call" || item.kind === "tool_result") && !COMMAND_OUTPUT_TOOLS.has(toolName!)) {
            const groupItems: StreamItem[] = [];
            while (i < items.length) {
                const cur = items[i];
                const curName = getItemToolName(cur);
                const curCat = curName ? TOOL_CATEGORY_MAP[curName] : undefined;
                if ((cur.kind === "tool_call" || cur.kind === "tool_result") && curCat === cat && !COMMAND_OUTPUT_TOOLS.has(curName!)) {
                    groupItems.push(cur);
                    i++;
                } else {
                    break;
                }
            }
            slots.push({ kind: "tool_group", category: cat, items: groupItems });
        } else {
            slots.push(item);
            i++;
        }
    }
    return slots;
}

// ── Item renderer — renders a single StreamItem ───────────────────────────────

function renderItem(item: StreamItem, idx: number, streamActive: boolean): React.ReactNode {
    switch (item.kind) {
        case "text": {
            const trimmed = item.text.trim();
            if (!trimmed) return null;
            return (
                <ItemMarkdownWrapper key={idx}>
                    <MarkdownRenderer markdownContent={trimmed} />
                </ItemMarkdownWrapper>
            );
        }
        case "tool_call": {
            if (COMMAND_OUTPUT_TOOLS.has(item.toolName ?? "")) {
                return <CommandOutputCard key={idx} toolName={item.toolName} toolInput={item.toolInput} />;
            }
            const { label, detail } = getToolCallDisplay(item.toolName, item.toolInput);
            return (
                <ItemRow key={idx}>
                    <ToolIcon loading={streamActive}>
                        <span className={`codicon ${getToolIcon(item.toolName, "loading")}`} />
                    </ToolIcon>
                    <ItemLabel loading={streamActive}>
                        {label}{detail && <ItemDetail title={detail}>{detail}</ItemDetail>}
                    </ItemLabel>
                </ItemRow>
            );
        }
        case "tool_result": {
            if (COMMAND_OUTPUT_TOOLS.has(item.toolName ?? "")) {
                return <CommandOutputCard key={idx} toolName={item.toolName} toolOutput={item.toolOutput} isResult={true} />;
            }
            const hint = item.toolOutput?.query ?? item.toolOutput?.url;
            const { label, detail } = getToolResultDisplay(item.toolName, item.toolOutput, hint);
            return (
                <ItemRow key={idx}>
                    <ToolIcon loading={false} failed={item.failed}>
                        <span className={`codicon ${getToolResultIcon(item.toolName, item.toolOutput)}`} />
                    </ToolIcon>
                    <ItemLabel loading={false} failed={item.failed}>
                        {label}{detail && <ItemDetail title={detail}>{detail}</ItemDetail>}
                    </ItemLabel>
                </ItemRow>
            );
        }
        case "component":
            if (item.componentType === "progress") {
                const isDone = item.data.status === "end";
                const isSpinning = !isDone && streamActive;
                return (
                    <ItemRow key={idx}>
                        <SonarWrapper>
                            {isSpinning ? (
                                <>
                                    <SonarRing />
                                    <SonarCenter />
                                </>
                            ) : (
                                <DoneCircle />
                            )}
                        </SonarWrapper>
                        <ItemLabel loading={isSpinning}>{item.data.text}</ItemLabel>
                    </ItemRow>
                );
            }
            return null;
        // Wizard is fully autonomous — plan/ask/config/connector/try_it items are not rendered
        default:
            return null;
    }
}

// ── Dynamic label helpers for "file_read" category ────────────────────────────

function extractReadFileName(items: StreamItem[]): string | null {
    const names = items
        .map(i => {
            const raw = (i as any).toolInput?.file_path
                     ?? (i as any).toolInput?.fileName
                     ?? (i as any).toolOutput?.fileName;
            return raw ? getFileName(raw) : null;
        })
        .filter((n): n is string => !!n);
    const unique = [...new Set(names)];
    return unique.length === 1 ? unique[0] : null;
}

// ── ToolCallGroup — collapsible group for same-category tool calls ─────────────

const ToolCallGroup: React.FC<{ slot: ToolGroupSlot; streamActive: boolean }> = ({ slot, streamActive }) => {
    const isAnyLoading = slot.items.some(i => i.kind === "tool_call");
    const hasFailed = slot.items.some(i => i.kind === "tool_result" && i.failed);
    const meta = CATEGORY_META[slot.category];

    const loadingLabel = (() => {
        if (slot.category !== "file_read") return meta.loadingLabel;
        const activeItem = slot.items.find(i => i.kind === "tool_call");
        const path = (activeItem as any)?.toolInput?.file_path ?? (activeItem as any)?.toolInput?.fileName;
        return path ? `Reading ${getFileName(path)}…` : meta.loadingLabel;
    })();

    const doneLabel = (() => {
        if (slot.category !== "file_read") return meta.doneLabel;
        const single = extractReadFileName(slot.items);
        if (single) return `Read ${single}`;
        const count = slot.items.length;
        return `Read ${count} file${count !== 1 ? "s" : ""}`;
    })();

    const [expanded, setExpanded] = useState(isAnyLoading);
    const autoCollapsedRef = useRef(false);

    useEffect(() => {
        if (isAnyLoading) {
            setExpanded(true);
            autoCollapsedRef.current = false;
        } else if (!autoCollapsedRef.current) {
            const t = setTimeout(() => {
                setExpanded(false);
                autoCollapsedRef.current = true;
            }, 1500);
            return () => clearTimeout(t);
        }
    }, [isAnyLoading]);

    // Single item: bordered box matching group style, no chevron, no interaction
    if (slot.items.length === 1) {
        const item = slot.items[0];
        const active = item.kind === "tool_call" && streamActive;
        const failed = !!(item as any).failed;
        const icon = item.kind === "tool_call"
            ? getToolIcon(item.toolName, "loading")
            : getToolResultIcon((item as any).toolName, (item as any).toolOutput);
        const { label, detail } = item.kind === "tool_call"
            ? getToolCallDisplay(item.toolName, (item as any).toolInput)
            : getToolResultDisplay((item as any).toolName, (item as any).toolOutput);
        return (
            <ToolGroupContainer>
                <ToolGroupHeader style={{ cursor: "default", pointerEvents: "none" }}>
                    <ToolIcon loading={active} failed={failed}>
                        {active ? (
                            <span className="codicon codicon-loading codicon-modifier-spin" />
                        ) : (
                            <span className={`codicon ${icon}`} />
                        )}
                    </ToolIcon>
                    <ItemLabel loading={active} failed={failed}>
                        {label}{detail && <ItemDetail title={detail}>{detail}</ItemDetail>}
                    </ItemLabel>
                </ToolGroupHeader>
            </ToolGroupContainer>
        );
    }

    const count = slot.items.length;

    return (
        <ToolGroupContainer>
            <ToolGroupHeader onClick={() => setExpanded(e => !e)}>
                <ToolIcon loading={isAnyLoading} failed={hasFailed}>
                    {isAnyLoading ? (
                        <span className="codicon codicon-loading codicon-modifier-spin" />
                    ) : hasFailed ? (
                        <span className="codicon codicon-error" />
                    ) : (
                        <span className={`codicon ${meta.icon}`} />
                    )}
                </ToolIcon>
                <ItemLabel loading={isAnyLoading} failed={hasFailed} style={{ flex: 1 }}>
                    {isAnyLoading ? loadingLabel : doneLabel}
                    {count > 1 && (
                        <span style={{ marginLeft: "5px", fontSize: "11px", opacity: 0.7 }}>({count})</span>
                    )}
                </ItemLabel>
                <ToolGroupChevron expanded={expanded}>
                    <span className="codicon codicon-chevron-down" />
                </ToolGroupChevron>
            </ToolGroupHeader>
            {expanded && (
                <ToolGroupBody>
                    {slot.items.map((item, idx) =>
                        renderItem(item, idx, streamActive && item.kind === "tool_call")
                    )}
                </ToolGroupBody>
            )}
        </ToolGroupContainer>
    );
};

// ── renderSlots — renders grouped + ungrouped items together ──────────────────

function renderSlots(items: StreamItem[], streamActive: boolean): React.ReactNode[] {
    const slots = groupToolItems(items);
    return slots.map((slot, idx) => {
        if (slot.kind === "tool_group") {
            return <ToolCallGroup key={`group-${slot.category}-${idx}`} slot={slot} streamActive={streamActive} />;
        }
        return renderItem(slot, idx, streamActive);
    });
}

// ── NodeStatus helper ─────────────────────────────────────────────────────────

export function getNodeStatus(entry: StreamEntry, isLast: boolean, isLoading: boolean): "active" | "done" {
    if (entry.status === "in_progress") return "active";
    if (entry.status === "completed") return "done";
    const hasActiveItem = entry.items.some(i => i.kind === "tool_call");
    if (hasActiveItem || (isLast && isLoading)) return "active";
    return "done";
}

// ── StreamEntryComponent ──────────────────────────────────────────────────────

interface StreamEntryComponentProps {
    entry: StreamEntry;
    isLast: boolean;
    isLoading: boolean;
    expanded: boolean;
    onToggle: () => void;
    innerRef?: (el: HTMLDivElement | null) => void;
    hasNextNamedEntry?: boolean;
}

const StreamEntryComponent: React.FC<StreamEntryComponentProps> = ({
    entry,
    isLast,
    isLoading,
    expanded,
    onToggle,
    innerRef,
    hasNextNamedEntry = false,
}) => {
    const hasItems = entry.items.length > 0;
    const streamActive = isLast && isLoading;

    // Floating entry — no rail, no dot, items render directly in arrival order
    if (!entry.description) {
        if (!hasItems) return null;
        return (
            <EntryBlock style={{ flexDirection: "column" }}>
                {renderSlots(entry.items, streamActive)}
            </EntryBlock>
        );
    }

    // Named task entry — rail + dot + collapsible items area
    const nodeStatus = getNodeStatus(entry, isLast, isLoading);

    return (
        <EntryBlock style={{ marginLeft: "-7px" }}>
            <EntryRail showLine={expanded || hasNextNamedEntry}>
                <DotWrapper>
                    {nodeStatus === "active" ? (
                        <SonarWrapper>
                            <SonarRing />
                            <SonarCenter />
                        </SonarWrapper>
                    ) : (
                        <DoneCircle />
                    )}
                </DotWrapper>
            </EntryRail>

            <EntryContent>
                <EntryHeader onClick={() => hasItems && onToggle()}>
                    <NodeLabel nodeStatus={nodeStatus}>{entry.description}</NodeLabel>
                    {hasItems && <ExpandIcon expanded={expanded} className="codicon codicon-ellipsis" />}
                </EntryHeader>
                {hasItems && (
                    <ItemsArea expanded={expanded}>
                        <ItemsInner ref={innerRef}>
                            {renderSlots(entry.items, streamActive)}
                        </ItemsInner>
                    </ItemsArea>
                )}
            </EntryContent>
        </EntryBlock>
    );
};

export default StreamEntryComponent;
