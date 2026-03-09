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
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
`;

export const TitleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
`;

export const SubtitleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
`;

export const Subtitle = styled(Typography)`
    color: var(--vscode-descriptionForeground);
    display: inline-flex;
    align-items: center;
    gap: 4px;
`;

export const SubtitleSeparator = styled.span`
    color: var(--vscode-descriptionForeground);
    opacity: 0.4;
`;

/* ── Component list ─────────────────────────────────────────────────────── */

export const ComponentListSection = styled.div`
    margin-bottom: 20px;
`;

export const ComponentListHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
`;

export const ComponentListLabel = styled.span`
    font-size: 13px;
    color: var(--vscode-foreground);
    opacity: 0.8;
`;

export const SelectionCount = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
`;

export const ComponentListContainer = styled.div`
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
    border-radius: 6px;
    overflow: hidden;
    background: var(--vscode-editor-background);
`;

type ComponentListRowProps = { isSelected?: boolean; isLast?: boolean };

export const ComponentListRow = styled.div<ComponentListRowProps>`
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 12px 14px;
    border-bottom: ${({ isLast }: ComponentListRowProps) => (isLast ? "none" : "1px solid var(--vscode-input-border, var(--vscode-widget-border))")};
    background: ${({ isSelected }: ComponentListRowProps) =>
        isSelected ? "color-mix(in srgb, var(--vscode-list-hoverBackground) 50%, transparent)" : "transparent"};
    transition: background 0.1s ease;

    &:hover {
        background: ${({ isSelected }: ComponentListRowProps) =>
            isSelected
                ? "color-mix(in srgb, var(--vscode-list-hoverBackground) 60%, transparent)"
                : "color-mix(in srgb, var(--vscode-list-hoverBackground) 25%, transparent)"};
    }
`;

export const CheckboxCell = styled.div`
    padding-top: 2px;
    flex-shrink: 0;
`;

export const ComponentInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;
`;

export const NameButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    padding: 2px 4px;
    border-radius: 3px;
    cursor: pointer;
    color: var(--vscode-foreground);
    font-size: 13px;
    font-weight: 600;
    font-family: var(--vscode-font-family);
    text-align: left;
    transition: background 0.1s ease;

    &:hover {
        background: var(--vscode-button-secondaryBackground);
    }

    .edit-icon {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        opacity: 0;
        transition: opacity 0.1s ease;
    }

    &:hover .edit-icon {
        opacity: 1;
    }
`;

export const NameStatic = styled.span`
    padding: 2px 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
`;

export const NameInputWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

type NameInputProps = { hasError?: boolean };

export const NameInput = styled.input<NameInputProps>`
    background: var(--vscode-input-background);
    border: 1px solid ${({ hasError }: NameInputProps) => (hasError ? "var(--vscode-inputValidation-errorBorder)" : "var(--vscode-input-border)")};
    border-radius: 3px;
    color: var(--vscode-input-foreground);
    font-size: 13px;
    font-weight: 600;
    font-family: var(--vscode-font-family);
    padding: 3px 6px;
    outline: none;
    transition: border-color 0.1s ease;

    &:focus {
        border-color: ${({ hasError }: NameInputProps) => (hasError ? "var(--vscode-inputValidation-errorBorder)" : "var(--vscode-focusBorder)")};
    }
`;

export const NameError = styled.span`
    font-size: 11px;
    color: var(--vscode-errorForeground);
`;

export const DirPath = styled.div`
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 4px;
    opacity: 0.8;
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

type TypeBadgeProps = { isSelected?: boolean };

export const TypeBadge = styled.div<TypeBadgeProps>`
    flex-shrink: 0;
    align-self: center;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid ${({ isSelected }: TypeBadgeProps) =>
        isSelected ? "var(--vscode-button-border, var(--vscode-focusBorder))" : "var(--vscode-input-border, var(--vscode-widget-border))"};
    background: ${({ isSelected }: TypeBadgeProps) =>
        isSelected ? "var(--vscode-button-secondaryBackground)" : "var(--vscode-input-background)"};
    color: ${({ isSelected }: TypeBadgeProps) =>
        isSelected ? "var(--vscode-button-secondaryForeground)" : "var(--vscode-descriptionForeground)"};
`;

/* ── Banners ─────────────────────────────────────────────────────────────── */

export const WarningBanner = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    background: var(--vscode-inputValidation-warningBackground);
    color: var(--vscode-list-warningForeground, var(--vscode-foreground));
    font-size: 12px;
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

/* ── Footer ──────────────────────────────────────────────────────────────── */

export const FooterRow = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
`;

export const CancelButton = styled(Button)``;

export const SubmitButton = styled(Button)``;
