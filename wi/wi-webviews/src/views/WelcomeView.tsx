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

import React, { useEffect, useMemo, useRef, useState } from "react";
import "./WelcomeView.css";
import styled from "@emotion/styled";
import { Codicon } from "@wso2/ui-toolkit";
import { CreationView } from "./creationView";
import { ImportIntegration } from "./ImportIntegration";
import { SamplesView } from "./samplesView";
import { SettingsView } from "./settingsView";
import { LibraryCreationView } from "./creationView/biForm/LibraryCreationView";
import { ProjectCreationView } from "./creationView/biForm/ProjectCreationView";
import { useVisualizerContext } from "../contexts";
import { useCloudContext } from "../providers";
import { WICommandIds, type AuthState } from "@wso2/wso2-platform-core";
import { UserAccountPopover } from "./UserAccountPopover";

enum ViewState {
    WELCOME = "welcome",
    CREATE_INTEGRATION = "create_integration",
    SAMPLES = "samples",
    IMPORT_EXTERNAL = "import_external",
    CREATE_LIBRARY = "create_library",
    CREATE_PROJECT = "create_project",
    SETTINGS = "settings",
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
    background: linear-gradient(120deg, var(--wso2-brand-ink) 0%, var(--wso2-brand-ink-alt) 58%, var(--wso2-brand-primary) 100%);
    padding: 40px 60px 80px;
    position: relative;
    display: flex;
    flex-direction: column;
`;

const TopBtnSection = styled.div`
    position: absolute;
    top: 40px;
    right: 60px;
    display: flex;
    align-items: center;
    gap: 12px;
`;

const ConfigureBtn = styled.button`

    height: 33px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 8px;
    padding: 0 24px;
    border: none;
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
    background: linear-gradient(135deg, var(--wso2-brand-primary) 0%, var(--wso2-brand-primary-alt) 100%);
    color: white;
`;

const SigninBtn = styled(ConfigureBtn)`
    background: color-mix(in srgb, var(--wso2-brand-white) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--wso2-brand-white) 40%, transparent);
    color: var(--wso2-brand-white);
    &:hover:not(:disabled) {
        filter: none;
        background: color-mix(in srgb, var(--wso2-brand-white) 28%, transparent);
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
    background: color-mix(in srgb, var(--wso2-brand-white) 18%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--wso2-brand-white) 45%, transparent);
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
    color: var(--wso2-brand-white);
    line-height: 1;
    text-transform: uppercase;
`;

const GetStartedBadge = styled.div`
    display: inline-block;
    backdrop-filter: blur(10px);
    background: color-mix(in srgb, var(--wso2-brand-accent) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 65%, transparent);
    border-radius: 20px;
    padding: 8px 16px;
    margin-bottom: 24px;
    font-size: 13px;
    color: white;
    font-weight: 500;
    width: 106px;
`;

const Headline = styled.h1`
    font-size: 48px;
    font-weight: 700;
    margin: 0;
    color: white;
    line-height: 1.2;
`;

const Caption = styled.p`
    font-size: 16px;
    line-height: 1.6;
    font-weight: 400;
    color: var(--wso2-brand-neutral-100);
    margin: 16px 0 0 0;
    max-width: 800px;
`;

const OrgBadge = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 20px;
    align-self: flex-start;
    padding: 5px 12px 5px 8px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--wso2-brand-white) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--wso2-brand-white) 22%, transparent);
    font-size: 12px;
    color: color-mix(in srgb, var(--wso2-brand-white) 75%, transparent);
`;

const CardsContainer = styled.div`
    padding: 0 60px 60px;
    margin-top: -40px;
    position: relative;
    z-index: 1;
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

interface ExtendedAuthState extends AuthState {
    selectedOrgId?: string;
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
            props.bgColor || "linear-gradient(135deg, var(--wso2-brand-primary) 0%, var(--wso2-brand-primary-alt) 100%)"};
    color: white;
    flex-shrink: 0;
    pointer-events: none;

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
const StyledButton = styled('button', {
    shouldForwardProp: (prop) => prop !== 'isPrimary'
}) <{ isPrimary?: boolean }>`
    height: 44px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 8px;
    align-self: flex-start;
    padding: 0 24px;
    background: ${(props: { isPrimary?: boolean }) =>
        props.isPrimary ? 'var(--button-primary-background)' : 'var(--button-secondary-background)'};
    color: ${(props: { isPrimary?: boolean }) =>
        props.isPrimary ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)'};
    border: none;
    transition: all 0.2s ease;
    cursor: pointer;

    &:hover:not(:disabled) {
        background: ${(props: { isPrimary?: boolean }) =>
        props.isPrimary ? 'var(--button-primary-hover-background)' : 'var(--button-secondary-hover-background)'};
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
    text-transform: uppercase;
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
    const { authState, contextState } = useCloudContext();
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [isRecentProjectsLoaded, setIsRecentProjectsLoaded] = useState(false);
    const [showSecondary, setShowSecondary] = useState(false);
    const [localOrgName, setLocalOrgName] = useState<string | null>(null);
    const avatarRef = useRef<HTMLButtonElement>(null);

    const selectedOrgName = useMemo(() => {
        if (localOrgName) return localOrgName;
        const extendedAuthState = authState as ExtendedAuthState | undefined;
        const orgId = extendedAuthState?.selectedOrgId || contextState?.selected?.org?.id;
        if (orgId && authState?.userInfo?.organizations) {
            const match = (authState.userInfo.organizations as Array<{ id?: any; name: string }>)
                .find((o) => String(o.id) === String(orgId));
            if (match?.name) return match.name;
        }
        return contextState?.selected?.org?.name ?? null;
    }, [localOrgName, authState, contextState?.selected?.org?.id, contextState?.selected?.org?.name]);

    useEffect(() => {
        if (!localOrgName) return;

        const extendedAuthState = authState as ExtendedAuthState | undefined;
        const orgId = extendedAuthState?.selectedOrgId || contextState?.selected?.org?.id;
        let derivedName: string | null = null;

        if (orgId && authState?.userInfo?.organizations) {
            const match = (authState.userInfo.organizations as Array<{ id?: any; name: string }>)
                .find((o) => String(o.id) === String(orgId));
            if (match?.name) derivedName = match.name;
        }

        if (!derivedName) {
            derivedName = contextState?.selected?.org?.name ?? null;
        }

        if (derivedName && derivedName === localOrgName) {
            setLocalOrgName(null);
        }
    }, [authState, contextState?.selected?.org?.id, contextState?.selected?.org?.name, localOrgName]);

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
                        (project: RecentProject) => typeof project?.path === "string" && project.path.trim().length > 0
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

    const goToCreateIntegration = () => setCurrentView(ViewState.CREATE_INTEGRATION);
    const goToSamples = () => setCurrentView(ViewState.SAMPLES);
    const goToImportExternal = () => setCurrentView(ViewState.IMPORT_EXTERNAL);
    const goToSettings = () => setCurrentView(ViewState.SETTINGS);
    const goBackToWelcome = () => setCurrentView(ViewState.WELCOME);
    const goToCreateLibrary = () => setCurrentView(ViewState.CREATE_LIBRARY);
    const goToCreateProject = () => setCurrentView(ViewState.CREATE_PROJECT);

    const handleProjectDirSelection = async () => {
        const response = await wsClient.selectFileOrDirPath({});
        if (response?.path) {
            wsClient.openFolder(response.path);
        }
    };

    const openRecentProjectsPicker = () => {
        wsClient.runCommand({ command: "workbench.action.openRecent" }).catch((): void => undefined);
    };

    const openRecentProject = (projectPath: string) => {
        if (!projectPath) return;
        wsClient.openFolder(projectPath);
    };

    const handleSignIn = () => {
        wsClient.runCommand({ command: WICommandIds.SignIn, args: [] });
    };

    const renderCurrentView = () => {
        switch (currentView) {
            case ViewState.CREATE_INTEGRATION:
                return <CreationView onBack={goBackToWelcome} />;
            case ViewState.SAMPLES:
                return <SamplesView onBack={goBackToWelcome} />;
            case ViewState.IMPORT_EXTERNAL:
                return <ImportIntegration onBack={goBackToWelcome} />;
            case ViewState.CREATE_LIBRARY:
                return <LibraryCreationView onBack={goBackToWelcome} />;
            case ViewState.CREATE_PROJECT:
                return <ProjectCreationView onBack={goBackToWelcome} />;
            case ViewState.SETTINGS:
                return <SettingsView onBack={goBackToWelcome} />;
            case ViewState.WELCOME:
            default:
                return renderWelcomeContent();
        }
    };

    const renderWelcomeContent = () => (
        <>
            <TopSection>
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
                                <UserInitial>{authState.userInfo.displayName.charAt(0)}</UserInitial>
                            )}
                        </UserAvatar>
                    ) : (
                        <SigninBtn type="button" onClick={handleSignIn}>Sign In</SigninBtn>
                    )}
                    <ConfigureBtn type="button" onClick={goToSettings}>
                        <Codicon name="settings-gear" iconSx={{ fontSize: 16, color: "var(--wso2-brand-white)" }} />
                        <span>Settings</span>
                    </ConfigureBtn>
                </TopBtnSection>
                <GetStartedBadge>Get Started</GetStartedBadge>
                <Headline>WSO2 Integrator</Headline>
                <Caption>
                    Connect any system across your business, build AI agents, and orchestrate AI-enabled workflows with the 100% open source and AI-native WSO2 Integrator.
                </Caption>
                {selectedOrgName && (
                    <OrgBadge>
                        <Codicon name="organization" iconSx={{ fontSize: 12, color: "color-mix(in srgb, var(--wso2-brand-white) 75%, transparent)" }} />
                        {selectedOrgName}
                    </OrgBadge>
                )}
            </TopSection>

            <CardsContainer>
                {/* Primary action cards */}
                <CardsGrid>
                    <ActionCard onClick={goToCreateIntegration}>
                        <CardIconContainer>
                            <CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-primary) 0%, var(--wso2-brand-primary-alt) 100%)">
                                <Codicon name="circuit-board" iconSx={{ fontSize: '25px' }} sx={{ width: '23px', height: '25px' }} />
                            </CardIcon>
                        </CardIconContainer>
                        <CardContent>
                            <CardTitle>Create New Integration</CardTitle>
                            <CardDescription>
                                Ready to build? Start a new integration using our intuitive graphical designer.
                            </CardDescription>
                            <StyledButton
                                isPrimary={true}
                                onClick={(e: any) => { e.stopPropagation(); goToCreateIntegration(); }}>
                                <ButtonContent>Create</ButtonContent>
                            </StyledButton>
                        </CardContent>
                    </ActionCard>

                    <ActionCard onClick={handleProjectDirSelection}>
                        <CardIconContainer>
                            <CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-ink) 0%, var(--wso2-brand-ink-alt) 100%)">
                                <Codicon name="folder-opened" iconSx={{ fontSize: '25px' }} sx={{ width: '23px', height: '25px' }} />
                            </CardIcon>
                        </CardIconContainer>
                        <CardContent>
                            <CardTitle>Open Integration or Project</CardTitle>
                            <CardDescription>
                                Open an existing integration project and continue building your solution.
                            </CardDescription>
                            <StyledButton
                                onClick={(e: any) => { e.stopPropagation(); handleProjectDirSelection(); }}>
                                <ButtonContent>Open</ButtonContent>
                            </StyledButton>
                        </CardContent>
                    </ActionCard>

                    <ActionCard onClick={goToSamples}>
                        <CardIconContainer>
                            <CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-accent) 0%, var(--wso2-brand-ink-alt) 100%)">
                                <Codicon name="lightbulb" iconSx={{ fontSize: '25px' }} sx={{ width: '23px', height: '25px' }} />
                            </CardIcon>
                        </CardIconContainer>
                        <CardContent>
                            <CardTitle>Explore Samples</CardTitle>
                            <CardDescription>
                                Need inspiration? Browse through sample projects to see how WSO2 Integrator works in real-world scenarios.
                            </CardDescription>
                            <StyledButton
                                onClick={(e: any) => { e.stopPropagation(); goToSamples(); }}>
                                <ButtonContent>Explore</ButtonContent>
                            </StyledButton>
                        </CardContent>
                    </ActionCard>
                </CardsGrid>

                {/* More actions toggle */}
                <MoreToggleWrapper>
                    <MoreDivider />
                    <MoreToggleButton onClick={() => setShowSecondary(!showSecondary)}>
                        <span>{showSecondary ? 'Show less' : 'More actions'}</span>
                        <MoreChevron>
                            <span
                                className={`codicon ${showSecondary ? 'codicon-triangle-up' : 'codicon-triangle-down'}`}
                            />
                        </MoreChevron>
                    </MoreToggleButton>
                    <MoreDivider />
                </MoreToggleWrapper>

                {/* Secondary action cards — expandable */}
                <SecondaryCardsSection
                    style={{
                        maxHeight: showSecondary ? '300px' : '0',
                        opacity: showSecondary ? 1 : 0,
                    }}
                >
                    <SecondaryCardsGrid>
                        <SecondaryActionRow onClick={goToCreateLibrary}>
                            <SecondaryRowIcon bgColor="#3aada5">
                                <Codicon name="book" iconSx={{ fontSize: '16px' }} sx={{ width: '16px', height: '16px' }} />
                            </SecondaryRowIcon>
                            <SecondaryRowContent>
                                <SecondaryRowTitle>Create Library</SecondaryRowTitle>
                                <SecondaryRowDescription>Build reusable components and utilities to share across projects.</SecondaryRowDescription>
                            </SecondaryRowContent>
                            <Codicon name="chevron-right" iconSx={{ fontSize: '14px', color: 'var(--vscode-descriptionForeground)', opacity: 0.6 }} />
                        </SecondaryActionRow>

                        <SecondaryActionRow onClick={goToCreateProject}>
                            <SecondaryRowIcon bgColor="#c07d18">
                                <Codicon name="new-folder" iconSx={{ fontSize: '16px' }} sx={{ width: '16px', height: '16px' }} />
                            </SecondaryRowIcon>
                            <SecondaryRowContent>
                                <SecondaryRowTitle>Create Project</SecondaryRowTitle>
                                <SecondaryRowDescription>Create a workspace to organize multiple integrations and libraries.</SecondaryRowDescription>
                            </SecondaryRowContent>
                            <Codicon name="chevron-right" iconSx={{ fontSize: '14px', color: 'var(--vscode-descriptionForeground)', opacity: 0.6 }} />
                        </SecondaryActionRow>

                        <SecondaryActionRow onClick={goToImportExternal}>
                            <SecondaryRowIcon bgColor="#7c5fb5">
                                <Codicon name="cloud-download" iconSx={{ fontSize: '16px' }} sx={{ width: '16px', height: '16px' }} />
                            </SecondaryRowIcon>
                            <SecondaryRowContent>
                                <SecondaryRowTitle>Migrate 3rd Party Integrations</SecondaryRowTitle>
                                <SecondaryRowDescription>Transform MuleSoft or TIBCO integrations to WSO2 Integrator automatically.</SecondaryRowDescription>
                            </SecondaryRowContent>
                            <Codicon name="chevron-right" iconSx={{ fontSize: '14px', color: 'var(--vscode-descriptionForeground)', opacity: 0.6 }} />
                        </SecondaryActionRow>
                    </SecondaryCardsGrid>
                </SecondaryCardsSection>
            </CardsContainer>

            {isRecentProjectsLoaded && (
                <BottomSection>
                    <RecentProjectsSection>
                        <RecentProjectsHeader>
                            <RecentProjectsTitle>Recent Projects</RecentProjectsTitle>
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
                                        <ProjectPath>{project.description || project.path}</ProjectPath>
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
                onOrgSwitch={(_id, name) => setLocalOrgName(name)}
            />
        </>
    );

    return (
        <Wrapper>
            {renderCurrentView()}
        </Wrapper>
    );
};
