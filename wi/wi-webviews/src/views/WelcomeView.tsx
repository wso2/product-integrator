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

import React, { useEffect, useRef, useState } from "react";
import "./WelcomeView.css";
import styled from "@emotion/styled";
import { Codicon, ProgressIndicator } from "@wso2/ui-toolkit";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { useVisualizerContext } from "../contexts";
import { useCloudContext } from "../providers";
import { ImportIntegration } from "./ImportIntegration";
import { UserAccountPopover } from "./UserAccountPopover";
import { CreationView } from "./creationView";
import { LibraryCreationView } from "./creationView/biForm/LibraryCreationView";
import { ProjectCreationView } from "./creationView/biForm/ProjectCreationView";
import { SamplesView } from "./samplesView";
import { SettingsView } from "./settingsView";
import {
	RUNTIME_DISPLAY_LABEL,
	type WIRuntime,
	getDefaultRuntime,
	loadEnabledRuntimes,
} from "./shared/runtime";
import { OpenProjectView } from "./OpenProjectView";

enum ViewState {
    WELCOME = "welcome",
    CREATE_INTEGRATION = "create_integration",
    SAMPLES = "samples",
    IMPORT_EXTERNAL = "import_external",
    CREATE_LIBRARY = "create_library",
    CREATE_PROJECT = "create_project",
    SETTINGS = "settings",
    OPEN_PROJECT = "open_project",
}

const Wrapper = styled.div`
    max-width: 100%;
    margin: 0;
    padding: 0;
    height: 100vh;
    overflow-y: auto;
    font-family: var(--vscode-font-family);
    background: var(--vscode-sideBar-background);
`;

const TopSection = styled.div`
    --welcome-hero-foreground: var(--wso2-brand-white);
    --welcome-hero-muted: color-mix(in srgb, var(--wso2-brand-white) 78%, transparent);
    --welcome-hero-surface: color-mix(in srgb, var(--wso2-brand-white) 16%, transparent);
    --welcome-hero-surface-border: color-mix(in srgb, var(--wso2-brand-white) 36%, transparent);
    --welcome-hero-badge-bg: color-mix(in srgb, var(--wso2-brand-accent-soft) 18%, transparent);
    --welcome-hero-badge-border: color-mix(in srgb, var(--wso2-brand-accent-soft) 52%, transparent);
    background:
        radial-gradient(circle at 82% 14%, color-mix(in srgb, var(--wso2-brand-accent-soft) 18%, transparent) 0%, transparent 34%),
        radial-gradient(circle at 12% 100%, color-mix(in srgb, var(--wso2-brand-neutral-900) 46%, transparent) 0%, transparent 52%),
        linear-gradient(115deg, #050a14 0%, var(--wso2-brand-ink) 42%, var(--wso2-brand-ink-alt) 100%);
    padding: 40px 60px 80px;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    body.vscode-light & {
        --welcome-hero-foreground: var(--wso2-brand-ink);
        --welcome-hero-muted: color-mix(in srgb, var(--wso2-brand-ink) 76%, var(--wso2-brand-white));
        --welcome-hero-surface: color-mix(in srgb, var(--wso2-brand-white) 70%, transparent);
        --welcome-hero-surface-border: color-mix(in srgb, var(--wso2-brand-ink-alt) 16%, transparent);
        --welcome-hero-badge-bg: color-mix(in srgb, var(--wso2-brand-white) 72%, transparent);
        --welcome-hero-badge-border: color-mix(in srgb, var(--wso2-brand-accent) 34%, transparent);
        background:
            radial-gradient(circle at 10% 100%, color-mix(in srgb, var(--wso2-brand-accent) 40%, transparent) 0%, transparent 42%),
            radial-gradient(circle at 72% 18%, color-mix(in srgb, var(--wso2-brand-white) 94%, transparent) 0%, transparent 34%),
            linear-gradient(110deg, var(--wso2-brand-accent) 0%, var(--wso2-brand-accent-soft) 28%, var(--wso2-brand-white) 100%);
    }
`;

const TopControlsSection = styled.div`
    position: absolute;
    top: 40px;
    right: 60px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
    width: fit-content;
`;

const TopBtnSection = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const ConfigureBtn = styled.button`
    height: 33px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 10px;
    padding: 0 24px;
    border: 1.5px solid color-mix(in srgb, var(--wso2-brand-white) 28%, transparent);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;

    &:hover:not(:disabled) {
        filter: brightness(1.2);
        transform: translateY(-1px);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
    background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--wso2-brand-primary) 94%, var(--wso2-brand-white)) 0%,
        var(--wso2-brand-primary-alt) 100%
    );
    color: white;
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--wso2-brand-white) 10%, transparent),
        0 0 0 1px color-mix(in srgb, var(--wso2-brand-white) 6%, transparent),
        0 8px 18px color-mix(in srgb, var(--wso2-brand-neutral-900) 18%, transparent);

    body.vscode-light & {
        border-color: color-mix(in srgb, var(--wso2-brand-ink-alt) 28%, transparent);
        background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--wso2-brand-ink) 94%, var(--wso2-brand-accent-soft)) 0%,
            color-mix(in srgb, var(--wso2-brand-ink-alt) 96%, var(--wso2-brand-accent)) 100%
        );
        color: var(--wso2-brand-white);
        box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--wso2-brand-white) 10%, transparent),
            0 0 0 1px color-mix(in srgb, var(--wso2-brand-white) 24%, transparent),
            0 8px 18px color-mix(in srgb, var(--wso2-brand-ink-alt) 16%, transparent);
    }
`;

const SigninBtn = styled(ConfigureBtn)`
    && {
        height: 33px;
        padding: 0 18px;
        border-radius: 10px;
        background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--wso2-brand-white) 18%, transparent) 0%,
            color-mix(in srgb, var(--wso2-brand-white) 10%, transparent) 100%
        );
        border: 2px solid color-mix(in srgb, var(--wso2-brand-white) 72%, transparent);
        color: var(--wso2-brand-white);
        box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--wso2-brand-white) 24%, transparent),
            0 0 0 1px color-mix(in srgb, var(--wso2-brand-white) 10%, transparent),
            0 8px 18px color-mix(in srgb, var(--wso2-brand-neutral-900) 16%, transparent);
    }

    body.vscode-light && {
        background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
        border: 2px solid color-mix(in srgb, var(--wso2-brand-accent) 58%, var(--wso2-brand-primary-alt) 18%);
        color: var(--wso2-brand-ink);
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.92),
            0 0 0 1px color-mix(in srgb, var(--wso2-brand-accent-soft) 50%, transparent),
            0 8px 18px color-mix(in srgb, var(--wso2-brand-accent) 20%, transparent);
    }

    &&:hover {
        filter: none;
        transform: translateY(-1px);
        background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--wso2-brand-white) 24%, transparent) 0%,
            color-mix(in srgb, var(--wso2-brand-white) 14%, transparent) 100%
        );
    }

    body.vscode-light &&:hover {
        background: linear-gradient(180deg, #ffffff 0%, #f5f9ff 100%);
    }
`;

export const UserAvatar = styled.button`
    width: 34px;
    height: 34px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--welcome-hero-surface);
    border: 1.5px solid var(--welcome-hero-surface-border);
    cursor: pointer;
    user-select: none;
    transition: all 0.2s ease;
    appearance: none;
    padding: 0;

    &:hover {
        filter: brightness(1.2);
        transform: translateY(-1px);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

export const UserAvatarImg = styled.img`
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
`;

export const UserInitial = styled.span`
    font-size: 14px;
    font-weight: 700;
    color: var(--welcome-hero-foreground);
    line-height: 1;
    text-transform: uppercase;
`;

const GetStartedBadge = styled.div`
    display: inline-block;
    backdrop-filter: blur(10px);
    background: var(--welcome-hero-badge-bg);
    border-radius: 20px;
    padding: 8px 16px;
    margin-bottom: 24px;
    font-size: 13px;
    color: var(--welcome-hero-foreground);
    font-weight: 500;
    width: 106px;
`;

const Headline = styled.h1`
    font-size: 48px;
    font-weight: 700;
    margin: 0;
    color: var(--welcome-hero-foreground);
    line-height: 1.2;
`;

const Caption = styled.p`
    font-size: 16px;
    line-height: 1.6;
    font-weight: 400;
    color: var(--welcome-hero-muted);
    margin: 16px 0 0 0;
    max-width: 800px;
`;

const RuntimeSelectorWrap = styled.div`
    --welcome-runtime-foreground: var(--wso2-brand-white);
    --welcome-runtime-muted: color-mix(in srgb, var(--wso2-brand-white) 82%, transparent);
    width: 222px;
    padding: 8px;
    border-radius: 12px;
    border: 1.5px solid color-mix(in srgb, var(--wso2-brand-white) 24%, transparent);
    background: color-mix(in srgb, var(--wso2-brand-white) 10%, transparent);
    box-shadow: 0 10px 24px color-mix(in srgb, var(--wso2-brand-ink) 24%, transparent);
    backdrop-filter: blur(14px);

    body.vscode-light & {
        --welcome-runtime-foreground: var(--wso2-brand-ink-alt);
        --welcome-runtime-muted: color-mix(in srgb, var(--wso2-brand-ink-alt) 70%, transparent);
        border-color: color-mix(in srgb, var(--wso2-brand-ink-alt) 16%, transparent);
        background: color-mix(in srgb, var(--wso2-brand-white) 34%, transparent);
        box-shadow: none;
    }
`;

const RuntimeSelectorLabel = styled.div`
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--welcome-runtime-muted);
    margin-bottom: 6px;
`;

const RuntimeSelectField = styled.div`
    position: relative;
`;

const RuntimeSelect = styled.select`
    width: 100%;
    height: 30px;
    border: 1.5px solid color-mix(in srgb, var(--wso2-brand-white) 24%, transparent);
    border-radius: 7px;
    padding: 0 34px 0 10px;
    appearance: none;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    font-weight: 500;
    color: var(--welcome-runtime-foreground);
    background:
        linear-gradient(
            135deg,
            color-mix(in srgb, var(--wso2-brand-white) 16%, transparent) 0%,
            color-mix(in srgb, var(--wso2-brand-white) 8%, transparent) 100%
        );
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--wso2-brand-white) 16%, transparent),
        0 8px 20px color-mix(in srgb, var(--wso2-brand-ink) 16%, transparent);
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;

    &:hover {
        border-color: color-mix(in srgb, var(--wso2-brand-white) 38%, transparent);
        background:
            linear-gradient(
                135deg,
                color-mix(in srgb, var(--wso2-brand-white) 20%, transparent) 0%,
                color-mix(in srgb, var(--wso2-brand-white) 10%, transparent) 100%
            );
    }

    &:focus-visible {
        outline: 1px solid color-mix(in srgb, var(--welcome-runtime-foreground) 68%, transparent);
        outline-offset: 2px;
    }

    option {
        color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
        background: var(--vscode-dropdown-background, var(--vscode-editor-background));
    }

    body.vscode-light & {
        border-color: color-mix(in srgb, var(--wso2-brand-ink-alt) 16%, transparent);
        background:
            linear-gradient(
                135deg,
                color-mix(in srgb, var(--wso2-brand-white) 78%, transparent) 0%,
                color-mix(in srgb, var(--wso2-brand-white) 60%, transparent) 100%
            );
        box-shadow: none;

        &:hover {
            border-color: color-mix(in srgb, var(--wso2-brand-ink-alt) 22%, transparent);
            background:
                linear-gradient(
                    135deg,
                    color-mix(in srgb, var(--wso2-brand-white) 86%, transparent) 0%,
                    color-mix(in srgb, var(--wso2-brand-white) 68%, transparent) 100%
                );
        }
    }
`;

const RuntimeSelectIcon = styled.div`
    position: absolute;
    top: 50%;
    right: 10px;
    transform: translateY(-50%);
    pointer-events: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--welcome-runtime-muted);
`;

const CardsContainer = styled.div`
    padding: 0 60px 60px;
    margin-top: -40px;
    position: relative;
    z-index: 1;
`;

const CardsLoadingState = styled.div`
    min-height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const CardsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;

    @media (max-width: 1200px) {
        grid-template-columns: repeat(2, 1fr);
    }

    @media (max-width: 768px) {
        grid-template-columns: 1fr;
    }
`;

interface ActionCardProps {
	isPrimary?: boolean;
	disabled?: boolean;
}

interface RecentProject {
	path: string;
	label: string;
	description?: string;
	isWorkspace?: boolean;
}

const ActionCard = styled.div<ActionCardProps>`
    background: var(--vscode-editor-background, white);
    border-radius: 12px;
    padding: 32px 24px;
    display: flex;
    flex-direction: column;
    transition: all 0.3s ease;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    min-height: 280px;
    cursor: pointer;

    &:hover {
        ${(props: ActionCardProps) =>
					!props.disabled &&
					`
            transform: translateY(-4px);
            box-shadow: 0 8px 16px rgba(0,0,0,0.25);
        `}
    }
`;

interface CardIconProps {
	bgColor?: string;
}

const CardIconContainer = styled.div`
    display: flex;
    justify-content: flex-start;
    margin-bottom: 20px;
`;

const CardIcon = styled.div<CardIconProps>`
    width: 56px;
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${(props: CardIconProps) =>
			props.bgColor ||
			"linear-gradient(135deg, var(--wso2-brand-primary) 0%, var(--wso2-brand-primary-alt) 100%)"};
    color: white;
    flex-shrink: 0;
    pointer-events: none;
    position: relative;
    z-index: 1;
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--wso2-brand-white) 18%, transparent),
        0 10px 18px color-mix(in srgb, var(--wso2-brand-neutral-900) 20%, transparent);

    i {
        font-size: 24px;
        color: var(--wso2-brand-white);
        line-height: 1;
    }
`;

const CardContent = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
`;

const CardTitle = styled.h3`
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: var(--vscode-foreground);
`;

const CardDescription = styled.p`
    font-size: 14px;
    line-height: 1.6;
    margin: 0 0 24px 0;
    color: var(--vscode-descriptionForeground);
    flex: 1;
`;

// Use a native button element. Filter custom props so they are not forwarded to the DOM.
const StyledButton = styled("button", {
	shouldForwardProp: (prop) => prop !== "isPrimary",
})<{ isPrimary?: boolean }>`
    height: 44px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 8px;
    align-self: flex-start;
    padding: 0 24px;
    background: ${(props: { isPrimary?: boolean }) =>
			props.isPrimary
				? "var(--button-primary-background)"
				: "var(--button-secondary-background)"};
    color: ${(props: { isPrimary?: boolean }) =>
			props.isPrimary
				? "var(--vscode-button-foreground)"
				: "var(--vscode-button-secondaryForeground)"};
    border: ${(props: { isPrimary?: boolean }) =>
        props.isPrimary ? 'none' : '1px solid var(--button-primary-background)'};
    box-shadow: ${(props: { isPrimary?: boolean }) =>
        props.isPrimary ? 'none' : 'var(--button-secondary-shadow)'};
    transition: all 0.2s ease;
    cursor: pointer;

    &:hover:not(:disabled) {
        background: ${(props: { isPrimary?: boolean }) =>
					props.isPrimary
						? "var(--button-primary-hover-background)"
						: "var(--button-secondary-hover-background)"};
        transform: translateY(-1px);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

const ButtonContent = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
`;

const BottomSection = styled.div`
    padding: 0 60px 56px;
`;

const RecentProjectsSection = styled.section`
    max-width: 1100px;
    margin: 0 auto;
    border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 82%, transparent);
    border-radius: 12px;
    background: var(--vscode-editor-background);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--wso2-brand-ink) 12%, transparent);
    overflow: hidden;
`;

const RecentProjectsHeader = styled.div`
    display: flex;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 74%, transparent);
    background: color-mix(in srgb, var(--vscode-sideBar-background) 45%, transparent);
`;

const RecentProjectsTitle = styled.h3`
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--vscode-foreground);
    opacity: 0.86;
    margin: 0;
`;

const ViewAllButton = styled.button`
    font-size: 13px;
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
    cursor: pointer;
    font-weight: 500;
    padding: 0;
    margin-left: auto;
    
    &:hover {
        color: var(--vscode-textLink-activeForeground);
        text-decoration: underline;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
        border-radius: 4px;
    }
`;

const ProjectsList = styled.div`
    display: flex;
    flex-direction: column;
`;

const ProjectItem = styled.button`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
    padding: 12px 18px;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;

    &:hover {
        background: var(--vscode-list-hoverBackground);
        color: var(--vscode-foreground);
        border-color: var(--vscode-focusBorder, rgba(128, 128, 128, 0.5));
    }
`;

const MoreChevron = styled.span`
    display: inline-block;
    transition: transform 0.25s ease;
    font-size: 11px;
    line-height: 1;
`;

const SecondaryCardsSection = styled.div`
    overflow: hidden;
    transition: max-height 0.4s ease, opacity 0.3s ease;
`;

const SecondaryActionRow = styled.div`
    background: transparent;
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 14px;
    transition: background 0.15s ease, border-color 0.15s ease;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    cursor: pointer;

    &:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: color-mix(in srgb, var(--vscode-focusBorder) 55%, transparent);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }
`;

const SecondaryRowIcon = styled.div<CardIconProps>`
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${(props: CardIconProps) =>
			props.bgColor || "var(--vscode-sideBar-background)"};
    flex-shrink: 0;

    i {
        font-size: 16px;
        color: var(--wso2-brand-white);
        line-height: 1;
    }
`;

const SecondaryRowContent = styled.div`
    flex: 1;
    min-width: 0;
`;

const SecondaryRowTitle = styled.span`
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin-bottom: 2px;
`;

const SecondaryRowDescription = styled.span`
    display: block;
    font-size: 12px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const ProjectName = styled.span`
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground);
`;

const ProjectPath = styled.span`
    display: block;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const RecentProjectsEmptyState = styled.div`
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    padding: 18px;
`;

const SecondaryCardsGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 6px;
`;

// ── More / secondary section ──────────────────────────────────────────────────

const MoreToggleWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 28px 0 20px;
`;

const MoreDivider = styled.div`
    flex: 1;
    height: 1px;
    background: var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
`;

const MoreToggleButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 18px;
    background: transparent;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    border-radius: 20px;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;

    &:hover {
        background: var(--vscode-list-hoverBackground);
        color: var(--vscode-foreground);
        border-color: var(--vscode-focusBorder, rgba(128, 128, 128, 0.5));
    }
`;

// ─────────────────────────────────────────────────────────────────────────────

export const WelcomeView: React.FC = () => {
	const { wsClient } = useVisualizerContext();
	const [currentView, setCurrentView] = useState<ViewState>(ViewState.WELCOME);
	const { authState } = useCloudContext();
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [enabledRuntimes, setEnabledRuntimes] = useState<WIRuntime[]>([]);
	const [selectedRuntime, setSelectedRuntime] = useState<WIRuntime | null>(null);
	const [isRuntimeLoading, setIsRuntimeLoading] = useState(true);
	const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [isRecentProjectsLoaded, setIsRecentProjectsLoaded] = useState(false);
    const [showSecondary, setShowSecondary] = useState(false);
    const [isSigningIn, setIsSigningIn] = useState(false);
	const avatarRef = useRef<HTMLButtonElement>(null);
    const signingInTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (currentView !== ViewState.WELCOME) {
            return;
        }

        const fetchEnabledRuntimes = async () => {
            setIsRuntimeLoading(true);
            try {
                const runtimes = await loadEnabledRuntimes(wsClient);
                setEnabledRuntimes(runtimes);
                setSelectedRuntime((previousRuntime) => {
                    if (previousRuntime && runtimes.includes(previousRuntime)) {
                        return previousRuntime;
                    }
                    return getDefaultRuntime(runtimes);
                });
            } catch (error) {
                console.warn("Failed to load enabled runtimes, using fallback:", error);
                setEnabledRuntimes(["WSO2: BI"]);
                setSelectedRuntime("WSO2: BI");
            } finally {
                setIsRuntimeLoading(false);
            }
        };

        fetchEnabledRuntimes();
    }, [currentView, wsClient]);

    useEffect(() => {
        if (currentView !== ViewState.WELCOME) {
            return;
        }

		let isDisposed = false;

		const fetchRecentProjects = async () => {
			try {
				const response = await wsClient.getRecentProjects();
				if (isDisposed) {
					return;
				}

				const projects = Array.isArray(response?.projects)
					? response.projects.filter(
							(project: RecentProject) =>
								typeof project?.path === "string" &&
								project.path.trim().length > 0,
						)
					: [];
				setRecentProjects(projects);
				setIsRecentProjectsLoaded(true);
			} catch {
				if (!isDisposed) {
					setRecentProjects([]);
					setIsRecentProjectsLoaded(false);
				}
			}
		};

		fetchRecentProjects();

		return () => {
			isDisposed = true;
		};
	}, [currentView, wsClient]);

	useEffect(() => {
		if (selectedRuntime !== "WSO2: BI") {
			setShowSecondary(false);
		}
	}, [selectedRuntime]);

	const goToCreateIntegration = () =>
		setCurrentView(ViewState.CREATE_INTEGRATION);
	const goToSamples = () => setCurrentView(ViewState.SAMPLES);
	const goToImportExternal = () => setCurrentView(ViewState.IMPORT_EXTERNAL);
	const goToSettings = () => setCurrentView(ViewState.SETTINGS);
	const goBackToWelcome = () => setCurrentView(ViewState.WELCOME);
	const goToCreateLibrary = () => setCurrentView(ViewState.CREATE_LIBRARY);
	const goToCreateProject = () => setCurrentView(ViewState.CREATE_PROJECT);

    const handleProjectDirSelection = () => {
        setCurrentView(ViewState.OPEN_PROJECT);
    };

    const openIntegrationFileBrowser = async () => {
        try {
            const { path: startPath } = await wsClient.getDefaultCreationPath();
            const response = await wsClient.selectFileOrDirPath({ startPath });
            if (response?.path) {
                wsClient.openFolder(response.path);
            }
        } catch (err) {
            console.error("Failed to open local folder:", err);
        }
    };

	const openRecentProjectsPicker = () => {
		wsClient
			.runCommand({ command: "workbench.action.openRecent" })
			.catch((): void => undefined);
	};

	const openRecentProject = (projectPath: string) => {
		if (!projectPath) return;
		wsClient.openFolder(projectPath);
	};

	// Show loader when the extension's URI handler fires (i.e. user confirmed
	// the "Allow WSO2 Integrator to open this URI?" VS Code dialog).
	// Clear it once auth completes or after a short timeout (user cancelled).
	useEffect(() => {
		const unsubscribe = wsClient.onSignInInitiated(() => {
			setIsSigningIn(true);
			signingInTimeoutRef.current = setTimeout(() => {
				setIsSigningIn(false);
				signingInTimeoutRef.current = null;
			}, 15000);
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		if (authState?.userInfo && isSigningIn) {
			setIsSigningIn(false);
			if (signingInTimeoutRef.current) {
				clearTimeout(signingInTimeoutRef.current);
				signingInTimeoutRef.current = null;
			}
		}
	}, [authState?.userInfo]);

	useEffect(() => {
		return () => {
			if (signingInTimeoutRef.current) clearTimeout(signingInTimeoutRef.current);
		};
	}, []);

	const handleSignIn = () => {
		wsClient.runCommand({ command: WICommandIds.SignIn, args: [] });
	};

	const handleRuntimeChange = (value: string) => {
		if (enabledRuntimes.includes(value as WIRuntime)) {
			setSelectedRuntime(value as WIRuntime);
		}
	};

	const renderCurrentView = () => {
		switch (currentView) {
			case ViewState.CREATE_INTEGRATION:
				return (
					<CreationView
						onBack={goBackToWelcome}
						runtime={selectedRuntime ?? undefined}
					/>
				);
			case ViewState.SAMPLES:
				return (
					<SamplesView
						onBack={goBackToWelcome}
						runtime={selectedRuntime ?? undefined}
					/>
				);
			case ViewState.IMPORT_EXTERNAL:
				return <ImportIntegration onBack={goBackToWelcome} />;
			case ViewState.CREATE_LIBRARY:
				return <LibraryCreationView onBack={goBackToWelcome} />;
			case ViewState.CREATE_PROJECT:
				return <ProjectCreationView onBack={goBackToWelcome} />;
			case ViewState.SETTINGS:
				return <SettingsView onBack={goBackToWelcome} />;
            case ViewState.OPEN_PROJECT:
                return <OpenProjectView onBack={goBackToWelcome} />;
			case ViewState.WELCOME:
			default:
				return renderWelcomeContent();
		}
	};

	const renderWelcomeContent = () => (
		<>
			<TopSection>
				<TopControlsSection>
					<TopBtnSection>
						{authState?.userInfo ? (
							<UserAvatar
								ref={avatarRef}
								title={authState.userInfo.displayName}
								onClick={() => setPopoverOpen(true)}
							>
								{authState.userInfo.userProfilePictureUrl ? (
									<UserAvatarImg
										src={authState.userInfo.userProfilePictureUrl}
										alt={authState.userInfo.displayName}
									/>
								) : (
									<UserInitial>
										{authState.userInfo.displayName.charAt(0)}
									</UserInitial>
								)}
							</UserAvatar>
						) : (
							<SigninBtn type="button" onClick={handleSignIn} disabled={isSigningIn}>
								{isSigningIn ? (
									<>
										<Codicon
											name="loading"
											iconSx={{ fontSize: 13, color: "var(--wso2-brand-white)", animation: "codicon-spin 1.5s steps(30) infinite" }}
										/>
										Signing in...
									</>
								) : (
									"Sign In"
								)}
							</SigninBtn>
						)}
						<ConfigureBtn type="button" onClick={goToSettings}>
							<Codicon
								name="settings-gear"
								iconSx={{ fontSize: 16, color: "var(--wso2-brand-white)" }}
							/>
							<span>Settings</span>
						</ConfigureBtn>
					</TopBtnSection>
					{!isRuntimeLoading &&
						enabledRuntimes.length > 1 &&
						selectedRuntime && (
							<RuntimeSelectorWrap>
								<RuntimeSelectorLabel>Runtime</RuntimeSelectorLabel>
								<RuntimeSelectField>
									<RuntimeSelect
										id="welcome-runtime-selector"
										value={selectedRuntime}
										onChange={(event) =>
											handleRuntimeChange(event.target.value)
										}
									>
										{enabledRuntimes.map((runtime) => (
											<option key={runtime} value={runtime}>
												{RUNTIME_DISPLAY_LABEL[runtime]}
											</option>
										))}
									</RuntimeSelect>
									<RuntimeSelectIcon>
										<Codicon
											name="chevron-down"
											iconSx={{ fontSize: 18, color: "inherit" }}
										/>
									</RuntimeSelectIcon>
								</RuntimeSelectField>
							</RuntimeSelectorWrap>
						)}
				</TopControlsSection>
				<GetStartedBadge>Get Started</GetStartedBadge>
				<Headline>WSO2 Integrator</Headline>
				<Caption>
                    Connect AI agents, APIs, data, and events across cloud, on-prem,
                    and hybrid environments. Build any type of integration and AI agent
                    with the 100% open source WSO2 Integrator.
				</Caption>
			</TopSection>

			<CardsContainer>
				{isRuntimeLoading || !selectedRuntime ? (
					<CardsLoadingState>
						<ProgressIndicator />
					</CardsLoadingState>
				) : (
					<>
						<CardsGrid>
							<ActionCard onClick={goToCreateIntegration}>
								<CardIconContainer>
									<CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-primary-alt) 0%, var(--wso2-brand-primary-deep) 100%)">
										<Codicon
											name="circuit-board"
											iconSx={{ fontSize: "25px" }}
											sx={{ width: "23px", height: "25px" }}
										/>
									</CardIcon>
								</CardIconContainer>
								<CardContent>
									<CardTitle>Create New Integration</CardTitle>
									<CardDescription>
                                        Start building a new integration.
									</CardDescription>
									<StyledButton
										isPrimary={true}
										onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
											e.stopPropagation();
											goToCreateIntegration();
										}}
									>
										<ButtonContent>Create</ButtonContent>
									</StyledButton>
								</CardContent>
							</ActionCard>

							<ActionCard onClick={openIntegrationFileBrowser}>
								<CardIconContainer>
									<CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-ink-deep) 0%, var(--wso2-brand-ink-alt) 100%)">
										<Codicon
											name="folder-opened"
											iconSx={{ fontSize: "25px" }}
											sx={{ width: "23px", height: "25px" }}
										/>
									</CardIcon>
								</CardIconContainer>
								<CardContent>
									<CardTitle>Open Integration</CardTitle>
									<CardDescription>
                                        Open an existing integration and continue building your solution.
									</CardDescription>
									<StyledButton
										onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
											e.stopPropagation();
											openIntegrationFileBrowser();
										}}
									>
										<ButtonContent>Open</ButtonContent>
									</StyledButton>
								</CardContent>
							</ActionCard>

							{selectedRuntime !== "WSO2: SI" && (
								<ActionCard onClick={goToSamples}>
									<CardIconContainer>
										<CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-accent) 0%, var(--wso2-brand-accent-alt) 100%)">
											<Codicon
												name="lightbulb"
												iconSx={{ fontSize: "25px" }}
												sx={{ width: "23px", height: "25px" }}
											/>
										</CardIcon>
									</CardIconContainer>
									<CardContent>
										<CardTitle>Explore Pre-built Integrations and Samples</CardTitle>
										<CardDescription>
                                            Explore ready-to-use pre-built integrations and samples to accelerate your development.
										</CardDescription>
										<StyledButton
											onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
												e.stopPropagation();
												goToSamples();
											}}
										>
											<ButtonContent>Explore</ButtonContent>
										</StyledButton>
									</CardContent>
								</ActionCard>
							)}
						</CardsGrid>

						{selectedRuntime === "WSO2: BI" && (
							<>
								<MoreToggleWrapper>
									<MoreDivider />
									<MoreToggleButton
										type="button"
										onClick={() => setShowSecondary(!showSecondary)}
									>
										<span>{showSecondary ? "Show less" : "More Actions"}</span>
										<MoreChevron>
											<span
												className={`codicon ${showSecondary ? "codicon-triangle-up" : "codicon-triangle-down"}`}
											/>
										</MoreChevron>
									</MoreToggleButton>
									<MoreDivider />
								</MoreToggleWrapper>

								<SecondaryCardsSection
									style={{
										maxHeight: showSecondary ? "300px" : "0",
										opacity: showSecondary ? 1 : 0,
									}}
								>
									<SecondaryCardsGrid>
										<SecondaryActionRow onClick={goToCreateLibrary}>
											<SecondaryRowIcon bgColor="var(--welcome-library-accent)">
												<Codicon
													name="book"
													iconSx={{ fontSize: "16px" }}
													sx={{ width: "16px", height: "16px" }}
												/>
											</SecondaryRowIcon>
											<SecondaryRowContent>
												<SecondaryRowTitle>Create Library</SecondaryRowTitle>
												<SecondaryRowDescription>
                                                    Create reusable components and utilities to share across integrations and projects.
												</SecondaryRowDescription>
											</SecondaryRowContent>
											<Codicon
												name="chevron-right"
												iconSx={{
													fontSize: "14px",
													color: "var(--vscode-descriptionForeground)",
													opacity: 0.6,
												}}
											/>
										</SecondaryActionRow>

										<SecondaryActionRow onClick={goToCreateProject}>
											<SecondaryRowIcon bgColor="var(--welcome-project-accent)">
												<Codicon
													name="new-folder"
													iconSx={{ fontSize: "16px" }}
													sx={{ width: "16px", height: "16px" }}
												/>
											</SecondaryRowIcon>
											<SecondaryRowContent>
												<SecondaryRowTitle>Create Project</SecondaryRowTitle>
												<SecondaryRowDescription>
													Create a project to organize and manage multiple integrations.
												</SecondaryRowDescription>
											</SecondaryRowContent>
											<Codicon
												name="chevron-right"
												iconSx={{
													fontSize: "14px",
													color: "var(--vscode-descriptionForeground)",
													opacity: 0.6,
												}}
											/>
										</SecondaryActionRow>

										<SecondaryActionRow onClick={handleProjectDirSelection}>
											<SecondaryRowIcon bgColor="var(--welcome-open-project-accent)">
												<Codicon
													name="root-folder-opened"
													iconSx={{ fontSize: "16px" }}
													sx={{ width: "16px", height: "16px" }}
												/>
											</SecondaryRowIcon>
											<SecondaryRowContent>
												<SecondaryRowTitle>Open Project</SecondaryRowTitle>
												<SecondaryRowDescription>
													Open an existing project to view and manage its integrations.
												</SecondaryRowDescription>
											</SecondaryRowContent>
											<Codicon
												name="chevron-right"
												iconSx={{
													fontSize: "14px",
													color: "var(--vscode-descriptionForeground)",
													opacity: 0.6,
												}}
											/>
										</SecondaryActionRow>

										<SecondaryActionRow onClick={goToImportExternal}>
											<SecondaryRowIcon bgColor="var(--welcome-import-accent)">
												<Codicon
													name="cloud-download"
													iconSx={{ fontSize: "16px" }}
													sx={{ width: "16px", height: "16px" }}
												/>
											</SecondaryRowIcon>
											<SecondaryRowContent>
												<SecondaryRowTitle>
                                                    Migrate Integrations from Other Vendors
												</SecondaryRowTitle>
												<SecondaryRowDescription>
                                                    Import integrations from other vendors and convert them to WSO2 Integrator format.
												</SecondaryRowDescription>
											</SecondaryRowContent>
											<Codicon
												name="chevron-right"
												iconSx={{
													fontSize: "14px",
													color: "var(--vscode-descriptionForeground)",
													opacity: 0.6,
												}}
											/>
										</SecondaryActionRow>
									</SecondaryCardsGrid>
								</SecondaryCardsSection>
							</>
						)}
					</>
				)}
			</CardsContainer>

			{isRecentProjectsLoaded && (
				<BottomSection>
					<RecentProjectsSection>
						<RecentProjectsHeader>
							<RecentProjectsTitle>Recent Integrations and Projects</RecentProjectsTitle>
							<ViewAllButton type="button" onClick={openRecentProjectsPicker}>
								See more
							</ViewAllButton>
						</RecentProjectsHeader>
						{recentProjects.length > 0 ? (
							<ProjectsList>
								{recentProjects.map((project) => (
									<ProjectItem
										key={project.path}
										type="button"
										onClick={() => openRecentProject(project.path)}
										title={project.description || project.path}
									>
										<ProjectName>{project.label}</ProjectName>
										<ProjectPath>
											{project.description || project.path}
										</ProjectPath>
									</ProjectItem>
								))}
							</ProjectsList>
						) : (
							<RecentProjectsEmptyState>
								No recent projects found in your current history.
							</RecentProjectsEmptyState>
						)}
					</RecentProjectsSection>
				</BottomSection>
			)}

            <UserAccountPopover
                isOpen={popoverOpen}
                anchorEl={avatarRef.current}
                onClose={() => setPopoverOpen(false)}
            />
        </>
    );

	return <Wrapper>{renderCurrentView()}</Wrapper>;
};
