// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
// Ported from ballerina-visualizer/src/views/AIPanel/components/ToolCallSegment.tsx

import styled from "@emotion/styled";
import React from "react";

export const Spinner = styled.span`
    display: inline-block;
    margin-right: 8px;
    font-size: 14px;
    animation: spin 1s linear infinite;
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const CheckIcon = styled.span`
    display: inline-block;
    margin-right: 8px;
    font-size: 14px;
`;

const ToolCallContainer = styled.pre`
    background-color: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 8px 12px;
    margin: 8px 0;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    color: var(--vscode-editor-foreground);
    white-space: pre-wrap;
    overflow-x: auto;
`;

const ToolCallLine = styled.div`
    display: flex;
    align-items: center;
`;

interface ToolCallSegmentProps {
    text: string;
    loading: boolean;
    failed?: boolean;
}

const ToolCallSegment: React.FC<ToolCallSegmentProps> = ({ text, loading, failed }) => {
    return (
        <ToolCallContainer>
            <ToolCallLine>
                {loading ? (
                    <Spinner className="codicon codicon-loading spin" role="img" />
                ) : (
                    <CheckIcon
                        className={`codicon ${failed ? "codicon-chrome-close" : "codicon-check"}`}
                        role="img"
                    />
                )}
                <span>{text}</span>
            </ToolCallLine>
        </ToolCallContainer>
    );
};

export default ToolCallSegment;
