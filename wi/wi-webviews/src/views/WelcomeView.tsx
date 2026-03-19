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
import { Codicon } from "@wso2/ui-toolkit";
import { CreationView } from "./creationView";
import { ImportIntegration } from "./ImportIntegration";
import { SamplesView } from "./samplesView";
import { SettingsView } from "./settingsView";
import { useVisualizerContext } from "../contexts";
import { useCloudContext } from "../providers";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { UserAccountPopover } from "./UserAccountPopover";

enum ViewState {
    WELCOME = "welcome",
    CREATE_PROJECT = "create_project",
    SAMPLES = "samples",
    IMPORT_EXTERNAL = "import_external",
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
    border-radius: 10px;
    padding: 0 24px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-white) 18%, transparent);
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
    box-shadow: 0 6px 16px color-mix(in srgb, var(--wso2-brand-neutral-900) 16%, transparent);

    body.vscode-light & {
        border-color: color-mix(in srgb, var(--wso2-brand-ink-alt) 20%, transparent);
        background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--wso2-brand-ink) 94%, var(--wso2-brand-accent-soft)) 0%,
            color-mix(in srgb, var(--wso2-brand-ink-alt) 96%, var(--wso2-brand-accent)) 100%
        );
        color: var(--wso2-brand-white);
        box-shadow: 0 6px 16px color-mix(in srgb, var(--wso2-brand-ink-alt) 14%, transparent);
    }
`;

const SigninBtn = styled(ConfigureBtn)`
    height: 33px;
    padding: 0 18px;
    border-radius: 10px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--wso2-brand-white) 98%, var(--wso2-brand-accent-soft)) 0%,
        color-mix(in srgb, var(--wso2-brand-white) 90%, var(--wso2-brand-accent-soft)) 100%
    );
    border: 2px solid color-mix(in srgb, var(--wso2-brand-ink-alt) 40%, var(--wso2-brand-accent) 44%);
    color: var(--wso2-brand-ink);
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--wso2-brand-white) 76%, transparent),
        0 0 0 1px color-mix(in srgb, var(--wso2-brand-accent-soft) 24%, transparent),
        0 8px 18px color-mix(in srgb, var(--wso2-brand-accent) 14%, transparent);

    &:hover:not(:disabled) {
        filter: none;
        transform: translateY(-1px);
        background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--wso2-brand-white) 94%, var(--wso2-brand-accent)) 0%,
            color-mix(in srgb, var(--wso2-brand-white) 84%, var(--wso2-brand-accent-soft)) 100%
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

const CardsContainer = styled.div`
    padding: 0 60px 60px;
    margin-top: -40px;
    position: relative;
    z-index: 1;
`;

const CardsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
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
    box-shadow: ${(props: { isPrimary?: boolean }) =>
        props.isPrimary ? 'none' : 'var(--button-secondary-shadow)'};
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
    justify-content: space-between;
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
    color: var(--vscode-foreground);
    cursor: pointer;
    transition: all 0.15s ease;
    border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 58%, transparent);
    
    &:hover {
        background: var(--vscode-list-hoverBackground);
    }

    &:last-of-type {
        border-bottom: none;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }
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

export const WelcomeView: React.FC = () => {
    const { wsClient } = useVisualizerContext();
    const [currentView, setCurrentView] = useState<ViewState>(ViewState.WELCOME);
    const { authState } = useCloudContext();
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [isRecentProjectsLoaded, setIsRecentProjectsLoaded] = useState(false);
    const avatarRef = useRef<HTMLButtonElement>(null);

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

    const goToCreateProject = () => {
        setCurrentView(ViewState.CREATE_PROJECT);
    };

    const goToSamples = () => {
        setCurrentView(ViewState.SAMPLES);
    };

    const goToImportExternal = () => {
        setCurrentView(ViewState.IMPORT_EXTERNAL);
    };

    const goToSettings = () => {
        setCurrentView(ViewState.SETTINGS);
    };

    const handleProjectDirSelection = async () => {
        const response = await wsClient.selectFileOrDirPath({});
        if (response?.path) {
            wsClient.openFolder(response.path);
        }
    };

    const goBackToWelcome = () => {
        setCurrentView(ViewState.WELCOME);
    };

    const openConfigure = () => {
        goToSettings();
    };

    const openRecentProjectsPicker = () => {
        wsClient.runCommand({ command: "workbench.action.openRecent" }).catch((): void => undefined);
    };

    const openRecentProject = (projectPath: string) => {
        if (!projectPath) {
            return;
        }
        wsClient.openFolder(projectPath);
    };

    // Helper function to render current view content
    const renderCurrentView = () => {
        switch (currentView) {
            case ViewState.CREATE_PROJECT:
                return <CreationView onBack={goBackToWelcome} />;
            case ViewState.SAMPLES:
                return (
                    <SamplesView onBack={goBackToWelcome} />
                );
            case ViewState.IMPORT_EXTERNAL:
                return (
                    <ImportIntegration onBack={goBackToWelcome} />
                );
            case ViewState.SETTINGS:
                return (
                    <SettingsView onBack={goBackToWelcome} />
                );
            case ViewState.WELCOME:
            default:
                return renderWelcomeContent();
        }
    };

    const handleSignIn = () => {
        wsClient.runCommand({ command: WICommandIds.SignIn, args: [] });
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
                    <ConfigureBtn type="button" onClick={openConfigure}>
                        <Codicon name="settings-gear" iconSx={{ fontSize: 16, color: "var(--wso2-brand-white)" }} />
                        <span>Settings</span>
                    </ConfigureBtn>
                </TopBtnSection>
                <GetStartedBadge>Get Started</GetStartedBadge>
                <Headline>WSO2 Integrator</Headline>
                <Caption>
                    Connect any system across your business, build AI agents, and orchestrate AI-enabled workflows with the 100% open source and AI-native WSO2 Integrator.
                </Caption>
            </TopSection>

            <CardsContainer>
                <CardsGrid>
                    <ActionCard onClick={goToCreateProject}>
                        <CardIconContainer>
                            <CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-primary-alt) 0%, #35537d 100%)">
                                <Codicon name="plus" iconSx={{ fontSize: '25px' }} sx={{ width: '23px', height: '25px' }} />
                            </CardIcon>
                        </CardIconContainer>
                        <CardContent>
                            <CardTitle>Create New Project</CardTitle>
                            <CardDescription>
                                Ready to build? Start a new integration project using our intuitive graphical designer.
                            </CardDescription>
                            <StyledButton
                                isPrimary={true}
                                onClick={(e: any) => { e.stopPropagation(); goToCreateProject(); }}>
                                <ButtonContent>Create</ButtonContent>
                            </StyledButton>
                        </CardContent>
                    </ActionCard>

                    <ActionCard onClick={handleProjectDirSelection}>
                        <CardIconContainer>
                            <CardIcon bgColor="linear-gradient(135deg, #0b1220 0%, var(--wso2-brand-ink-alt) 100%)">
                                <Codicon name="file-text" iconSx={{ fontSize: '25px' }} sx={{ width: '23px', height: '25px' }} />
                            </CardIcon>
                        </CardIconContainer>
                        <CardContent>
                            <CardTitle>Open Project</CardTitle>
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
                            <CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-accent) 0%, #3a90bf 100%)">
                                <Codicon name="symbol-class" iconSx={{ fontSize: '25px' }} sx={{ width: '23px', height: '25px' }} />
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

                    <ActionCard onClick={goToImportExternal}>
                        <CardIconContainer>
                            <CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-accent-soft) 0%, #4f84aa 100%)">
                                <Codicon name="arrow-swap" iconSx={{ fontSize: '25px' }} sx={{ width: '23px', height: '25px' }} />
                            </CardIcon>
                        </CardIconContainer>
                        <CardContent>
                            <CardTitle>Import External Integration</CardTitle>
                            <CardDescription>
                                Have an integration from another platform? Import your MuleSoft or TIBCO integration project and continue building.
                            </CardDescription>
                            <StyledButton
                                onClick={(e: any) => { e.stopPropagation(); goToImportExternal(); }}>
                                <ButtonContent>Import</ButtonContent>
                            </StyledButton>
                        </CardContent>
                    </ActionCard>
                </CardsGrid>
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
            />
        </>
    );

    return (
        <Wrapper>
            {renderCurrentView()}
        </Wrapper>
    );
};
