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

import styled from "@emotion/styled";
import { Button, Typography } from "@wso2/ui-toolkit";

export const PageContainer = styled.div`
    min-height: 100vh;
    max-width: 600px;
    margin: 0 auto;
    margin-top: calc(20vh - 60px);
    padding: 0 16px 40px;
`;

export const TitleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
`;

export const Subtitle = styled(Typography)`
    color: var(--vscode-descriptionForeground);
    margin-bottom: 28px;
    display: block;
`;

export const ComponentRow = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    background: var(--vscode-editor-background);
    margin-bottom: 12px;
`;

export const ComponentRowHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
`;

export const DirLabel = styled.span`
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 2px 8px;
    border-radius: 3px;
`;

export const BuildpackLabel = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.8;
`;

export const ToggleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
`;

export const ToggleLabel = styled.label`
    font-size: 13px;
    color: var(--vscode-foreground);
    cursor: pointer;
`;

export const FooterRow = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
`;

export const ErrorBanner = styled.div`
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    color: var(--vscode-errorForeground);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 13px;
    margin-bottom: 16px;
`;

export const CancelButton = styled(Button)``;

export const SubmitButton = styled(Button)``;
