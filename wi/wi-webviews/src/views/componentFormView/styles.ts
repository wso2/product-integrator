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
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { Button, Typography } from "@wso2/ui-toolkit";

export const PageBackdrop = styled.div`
    min-height: 100vh;
    padding: 28px 30px 24px;
    background:
        radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--wso2-brand-accent) 10%, transparent) 0%, transparent 34%),
        radial-gradient(circle at 10% 100%, color-mix(in srgb, var(--wso2-brand-primary) 8%, transparent) 0%, transparent 40%),
        var(--vscode-editor-background);
`;

export const PageContainer = styled.div`
    max-width: 960px;
    margin: 0 auto;
    min-height: calc(100vh - 52px);
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

export const FormPanel = styled.section`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 16%, var(--vscode-panel-border));
    background: var(--vscode-editor-background);
    box-shadow: 0 10px 24px color-mix(in srgb, var(--wso2-brand-neutral-900) 16%, transparent);
    overflow: hidden;
`;

export const FormBody = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
`;

export const TitleRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 12%, var(--vscode-panel-border));
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

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 1px;
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
    /* padding: 3px 6px; */
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
    min-width: 0;

    span.path-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
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

/* ── Git config ──────────────────────────────────────────────────────────── */

export const GitConfigSection = styled.div`
    margin-bottom: 20px;
`;

export const GitConfigLabel = styled.span`
    display: block;
    font-size: 13px;
    color: var(--vscode-foreground);
    opacity: 0.8;
    margin-bottom: 12px;
`;

export const GitConfigGrid = styled.div`
    display: flex;
    gap: 16px;
    flex-direction: column;
    position: relative;
`;


export const FieldSelect = styled.select`
    width: 100%;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
    border-radius: 3px;
    padding: 5px 8px;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    outline: none;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px;

    &:focus {
        border-color: var(--vscode-focusBorder);
    }

    option {
        background: var(--vscode-dropdown-background, var(--vscode-input-background));
        color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
    }
`;

/* ── Banners ─────────────────────────────────────────────────────────────── */

type RepoBannerVariant = "error" | "warning" | "info" | "neutral";

const BANNER_BG: Record<RepoBannerVariant, string> = {
    error: "var(--vscode-inputValidation-errorBackground)",
    warning: "var(--vscode-inputValidation-warningBackground)",
    info: "var(--vscode-inputValidation-infoBackground)",
    neutral: "transparent",
};
const BANNER_BORDER: Record<RepoBannerVariant, string> = {
    error: "var(--vscode-inputValidation-errorBorder)",
    warning: "var(--vscode-inputValidation-warningBorder)",
    info: "var(--vscode-inputValidation-infoBorder)",
    neutral: "var(--vscode-input-border, var(--vscode-widget-border))",
};
const BANNER_COLOR: Record<RepoBannerVariant, string> = {
    error: "var(--vscode-errorForeground)",
    warning: "var(--vscode-list-warningForeground, var(--vscode-foreground))",
    info: "var(--vscode-foreground)",
    neutral: "var(--vscode-descriptionForeground)",
};

type RepoBannerProps = { variant?: RepoBannerVariant };

export const RepoBanner = styled.div<RepoBannerProps>`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 4px;
    border: 1px solid ${({ variant = "warning" }: RepoBannerProps) => BANNER_BORDER[variant]};
    background: ${({ variant = "warning" }: RepoBannerProps) => BANNER_BG[variant]};
    color: ${({ variant = "warning" }: RepoBannerProps) => BANNER_COLOR[variant]};
    font-size: 12px;
    line-height: 1.4;
    margin-top: 4px;
`;

export const RepoBannerMessage = styled.div`
    flex: 1;
`;

export const RepoBannerActions = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
`;

export const RepoBannerButton = styled.button`
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 3px;
    padding: 3px 10px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: filter 0.1s ease;

    &:hover {
        filter: brightness(1.15);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

export const RepoBannerRefreshButton = styled.button`
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 15px;
    padding: 2px 4px;
    border-radius: 3px;
    opacity: 0.7;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.1s ease, background 0.1s ease;

    &:hover:not(:disabled) {
        opacity: 1;
        background: color-mix(in srgb, currentColor 10%, transparent);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        animation: repo-banner-spin 1s linear infinite;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }

    @keyframes repo-banner-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

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
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 12%, var(--vscode-panel-border));
`;

export const CancelButton = styled(Button)``;

export const SubmitButton = styled(Button)``;

export const AuthSectionWrap = styled.div`
    padding: 18px;
    display: flex;
    gap: 10px;
    flex-direction: column;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 16%, var(--vscode-panel-border));
    background: var(--vscode-editor-background);
    box-shadow: 0 10px 24px color-mix(in srgb, var(--wso2-brand-neutral-900) 16%, transparent);
`;

export const SmVSCodeLink = styled(VSCodeLink)`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.7;
    &:hover {
        opacity: 1;
    }
`

export const SmVSCodeLinks = styled.div`
    display: flex;
    gap: 10px
`

export const VSCodeLinkForeground = styled(VSCodeLink)`
    color: var(--vscode-textLink-foreground);
    font-weight: 500;
    &:hover {
        color: var(--vscode-textLink-activeForeground);
    }
`
