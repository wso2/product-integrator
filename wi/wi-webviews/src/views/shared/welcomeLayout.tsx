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

/**
 * Presentational building blocks shared by the welcome pages
 * (`WelcomeView` and `AgentBuilderWelcomeView`): hero section, action cards,
 * recent projects, and the sign-in state hook.
 */

import styled from "@emotion/styled";
import { WICommandIds } from "@wso2/wso2-platform-core";
import React, { useEffect, useRef, useState } from "react";
import type { WsClient } from "../../network-bridge/WsClient";

export const BALLERINA_MISSING_ACTION_TOOLTIP =
	"Ballerina distribution is missing. Use Configure to set it up";
export const BALLERINA_MISSING_CONFIGURE_TOOLTIP =
	"Ballerina distribution is missing. Click to set it up";

export const Wrapper = styled.div`
    max-width: 100%;
    margin: 0;
    padding: 0;
    height: 100vh;
    overflow-y: auto;
    font-family: var(--vscode-font-family);
    background: var(--vscode-sideBar-background);
`;

export const TopSection = styled.div`
    --welcome-hero-foreground: var(--wso2-brand-white);
    --welcome-hero-muted: color-mix(in srgb, var(--wso2-brand-white) 78%, transparent);
    --welcome-hero-surface: color-mix(in srgb, var(--wso2-brand-white) 16%, transparent);
    --welcome-hero-surface-border: color-mix(in srgb, var(--wso2-brand-white) 36%, transparent);
    --welcome-hero-badge-bg: color-mix(in srgb, var(--wso2-brand-accent-soft) 18%, transparent);
    --welcome-hero-badge-border: color-mix(in srgb, var(--wso2-brand-accent-soft) 52%, transparent);
    background: linear-gradient(180deg, var(--wso2-brand-hero-start) 0%, var(--wso2-brand-hero-end) 100%);
    padding: 40px 60px 80px;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

export const TopControlsSection = styled.div`
    position: absolute;
    top: 40px;
    right: 60px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
    width: fit-content;
`;

export const TopBtnSection = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

export const ConfigureBtn = styled.button`
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

    body.vscode-light & {
        background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
        border: 2px solid color-mix(in srgb, var(--wso2-brand-accent) 58%, var(--wso2-brand-primary-alt) 18%);
        color: var(--wso2-brand-ink);
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.92),
            0 0 0 1px color-mix(in srgb, var(--wso2-brand-accent-soft) 50%, transparent),
            0 8px 18px color-mix(in srgb, var(--wso2-brand-accent) 20%, transparent);
    }
`;

export const SigninBtn = styled(ConfigureBtn)`
    && {
        height: 33px;
        padding: 0 18px;
        border-radius: 10px;
        border: 1.5px solid color-mix(in srgb, var(--wso2-brand-white) 28%, transparent);
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
    }

    body.vscode-light && {
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

    &&:hover {
        background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--wso2-brand-primary) 100%, var(--wso2-brand-white)) 0%,
            var(--wso2-brand-primary-deep) 100%
        );
    }

    body.vscode-light &&:hover {
        background: linear-gradient(
            135deg,
            var(--wso2-brand-ink) 0%,
            var(--wso2-brand-ink-alt) 100%
        );
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

export const GetStartedBadge = styled.div`
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

export const Headline = styled.h1`
    font-size: 48px;
    font-weight: 700;
    margin: 0;
    color: var(--welcome-hero-foreground);
    line-height: 1.2;
`;

export const Caption = styled.p`
    font-size: 16px;
    line-height: 1.6;
    font-weight: 400;
    color: var(--welcome-hero-muted);
    margin: 16px 0 0 0;
    max-width: 800px;
`;

export const CardsContainer = styled.div`
    /* Cap and center the whole cards area so the primary cards, the More Actions
       rows, and Recent Projects all share one content width and line up. */
    padding: 0 60px 60px;
    margin: -40px auto 0;
    max-width: 1160px;
    box-sizing: border-box;
    position: relative;
    z-index: 1;
`;

export const CardsLoadingState = styled.div`
    min-height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
`;

export const CardsGrid = styled.div`
    display: grid;
    /* Cards stretch to fill the shared container width (auto-fit collapses the
       empty track when there are only two), so the two primary cards span the
       same width as the full-width More Actions rows below them. */
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 24px;

    @media (max-width: 640px) {
        grid-template-columns: minmax(0, 1fr);
    }
`;

export interface ActionCardProps {
	isPrimary?: boolean;
	disabled?: boolean;
}

export interface RecentProject {
	path: string;
	label: string;
	description?: string;
	isWorkspace?: boolean;
}

export const ActionCard = styled.div<ActionCardProps>`
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

export interface CardIconProps {
	bgColor?: string;
}

export const CardIconContainer = styled.div`
    display: flex;
    justify-content: flex-start;
    margin-bottom: 20px;
`;

export const CardIcon = styled.div<CardIconProps>`
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

export const CardContent = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
`;

export const CardTitle = styled.h3`
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: var(--vscode-foreground);
`;

export const CardDescription = styled.p`
    font-size: 14px;
    line-height: 1.6;
    margin: 0 0 24px 0;
    color: var(--vscode-descriptionForeground);
    flex: 1;
`;

// Use a native button element. Filter custom props so they are not forwarded to the DOM.
export const StyledButton = styled("button", {
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
			props.isPrimary ? "none" : "1px solid var(--button-primary-background)"};
    box-shadow: ${(props: { isPrimary?: boolean }) =>
			props.isPrimary ? "none" : "var(--button-secondary-shadow)"};
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

export const ButtonContent = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
`;

// Lays out a card's Create/Open buttons side by side at the bottom of the card.
export const CardButtonRow = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
`;

// Card variant whose body is inert — actions live only on its buttons,
// so the pointer cursor is suppressed. The hover lift is kept for visual
// consistency with the other action cards.
export const StaticActionCard = styled(ActionCard)`
    cursor: default;
`;

export const BottomSection = styled.div`
    padding: 0 60px 56px;
`;

export const RecentProjectsSection = styled.section`
    max-width: 900px;
    margin: 0 auto;
    border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 82%, transparent);
    border-radius: 12px;
    background: var(--vscode-editor-background);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--wso2-brand-ink) 12%, transparent);
    overflow: hidden;
`;

export const RecentProjectsHeader = styled.div`
    display: flex;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 74%, transparent);
    background: color-mix(in srgb, var(--vscode-sideBar-background) 45%, transparent);
`;

export const RecentProjectsTitle = styled.h3`
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--vscode-foreground);
    opacity: 0.86;
    margin: 0;
`;

export const ViewAllButton = styled.button`
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

export const ProjectsList = styled.div`
    display: flex;
    flex-direction: column;
`;

export const ProjectItem = styled.button`
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

export const ProjectName = styled.span`
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground);
`;

export const ProjectPath = styled.span`
    display: block;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

export const RecentProjectsEmptyState = styled.div`
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    padding: 18px;
`;

/**
 * Loads the recent-projects list while `active` is true (i.e. the welcome
 * content itself is on screen, not a sub-view).
 */
export function useRecentProjects(wsClient: WsClient, active: boolean) {
	const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
	const [isRecentProjectsLoaded, setIsRecentProjectsLoaded] = useState(false);

	useEffect(() => {
		if (!active) {
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
	}, [active, wsClient]);

	return { recentProjects, isRecentProjectsLoaded };
}

/** The "Recent Projects" panel shown at the bottom of the welcome pages. */
export const RecentProjectsPanel: React.FC<{
	recentProjects: RecentProject[];
	onOpenProject: (projectPath: string) => void;
	onSeeMore: () => void;
}> = ({ recentProjects, onOpenProject, onSeeMore }) => (
	<BottomSection>
		<RecentProjectsSection>
			<RecentProjectsHeader>
				<RecentProjectsTitle>Recent Projects</RecentProjectsTitle>
				<ViewAllButton type="button" onClick={onSeeMore}>
					See more
				</ViewAllButton>
			</RecentProjectsHeader>
			{recentProjects.length > 0 ? (
				<ProjectsList>
					{recentProjects.map((project) => (
						<ProjectItem
							key={project.path}
							type="button"
							onClick={() => onOpenProject(project.path)}
							title={project.description || project.path}
						>
							<ProjectName>{project.label}</ProjectName>
							<ProjectPath>{project.description || project.path}</ProjectPath>
						</ProjectItem>
					))}
				</ProjectsList>
			) : (
				<RecentProjectsEmptyState>
					No recent integrations or projects found in your history.
				</RecentProjectsEmptyState>
			)}
		</RecentProjectsSection>
	</BottomSection>
);

/**
 * Sign-in button state shared by the welcome pages: tracks the in-flight
 * sign-in, resets on completion/cancel/timeout, and shows the spinner while
 * the extension's URI handler round-trip is pending.
 */
export function useSignInControls(wsClient: WsClient, userInfo: unknown) {
	const [isSigningIn, setIsSigningIn] = useState(false);
	const signingInTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	// Show loader when the extension's URI handler fires (i.e. user confirmed
	// the "Allow ... to open this URI?" VS Code dialog).
	// Clear it once auth completes or after a short timeout (user cancelled).
	useEffect(() => {
		const unsubscribe = wsClient.onSignInInitiated(() => {
			if (signingInTimeoutRef.current) {
				clearTimeout(signingInTimeoutRef.current);
			}
			signingInTimeoutRef.current = setTimeout(() => {
				setIsSigningIn(false);
				signingInTimeoutRef.current = null;
			}, 15000);
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		if (userInfo && isSigningIn) {
			setIsSigningIn(false);
			if (signingInTimeoutRef.current) {
				clearTimeout(signingInTimeoutRef.current);
				signingInTimeoutRef.current = null;
			}
		}
	}, [userInfo]);

	useEffect(() => {
		return () => {
			if (signingInTimeoutRef.current)
				clearTimeout(signingInTimeoutRef.current);
		};
	}, []);

	const handleSignIn = () => {
		setIsSigningIn(true);
		// Give the user 5 minutes to complete browser login before auto-resetting.
		if (signingInTimeoutRef.current) {
			clearTimeout(signingInTimeoutRef.current);
		}
		signingInTimeoutRef.current = setTimeout(() => {
			setIsSigningIn(false);
			signingInTimeoutRef.current = null;
		}, 300000);
		wsClient.runCommand({ command: WICommandIds.SignIn, args: [] });
	};

	const handleCancelSignIn = () => {
		setIsSigningIn(false);
		if (signingInTimeoutRef.current) {
			clearTimeout(signingInTimeoutRef.current);
			signingInTimeoutRef.current = null;
		}
		wsClient.runCommand({ command: WICommandIds.CancelSignIn, args: [] });
	};

	return { isSigningIn, handleSignIn, handleCancelSignIn };
}
