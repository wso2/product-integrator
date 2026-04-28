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

import styled from "@emotion/styled";
import React from "react";

const ErrorContainer = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 12px;
    margin: 8px 0;
    border-left: 3px solid var(--vscode-errorForeground);
    background-color: var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.08));
    border-radius: 0 4px 4px 0;
    font-size: 12px;
    color: var(--vscode-errorForeground);
`;

const ErrorIcon = styled.span`
    flex-shrink: 0;
    font-size: 14px;
    margin-top: 1px;
`;

const ErrorText = styled.span`
    word-break: break-word;
    white-space: pre-wrap;
`;

interface ErrorSegmentProps {
    text: string;
}

const ErrorSegment: React.FC<ErrorSegmentProps> = ({ text }) => {
    return (
        <ErrorContainer>
            <ErrorIcon className="codicon codicon-error" role="img" aria-label="Error" />
            <ErrorText>{text}</ErrorText>
        </ErrorContainer>
    );
};

export default ErrorSegment;
