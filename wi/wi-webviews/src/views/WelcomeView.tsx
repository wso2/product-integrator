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

import React, { useRef, useState } from "react";
import "./WelcomeView.css";
import styled from "@emotion/styled";
import { CreationView } from "./creationView";
import { ImportIntegration } from "./ImportIntegration";
import { SamplesView } from "./samplesView";
import { LibraryCreationView } from "./libraryCreationView";
import { ProjectCreationView } from "./projectCreationView";
import { useVisualizerContext } from "../contexts";
import { useCloudContext } from "../providers";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { UserAccountPopover } from "./UserAccountPopover";

enum ViewState {
    WELCOME = "welcome",
    CREATE_INTEGRATION = "create_integration",
    SAMPLES = "samples",
    IMPORT_EXTERNAL = "import_external",
    CREATE_LIBRARY = "create_library",
    CREATE_PROJECT = "create_project",
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
    background: linear-gradient(135deg, #667eea 0%, #204377 100%);
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
`;

const SigninBtn = styled(ConfigureBtn)`
    background: var(--vscode-button-background);
    &:hover:not(:disabled) {
        filter: brightness(1.2);
        background: var(--vscode-button-background);
    }
`;

export const UserAvatar = styled.div`
    width: 34px;
    height: 34px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--vscode-button-background);
    border: 1.5px solid color-mix(in srgb, var(--vscode-button-background) 60%, transparent);
    cursor: pointer;
    user-select: none;
    transition: all 0.2s ease;

    &:hover {
        filter: brightness(1.2);
        transform: translateY(-1px);
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
    color: var(--vscode-button-foreground);
    line-height: 1;
    text-transform: uppercase;
`;


const GetStartedBadge = styled.div`
    display: inline-block;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.3);
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
    color: rgba(255, 255, 255, 0.9);
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
    background: ${(props: CardIconProps) => props.bgColor || "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"};
    color: white;
    flex-shrink: 0;
    font-size: 26px;
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
    color: white;
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
`;

const ButtonContent = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
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

const SecondaryActionCard = styled.div`
    background: color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-sideBar-background) 15%);
    border-radius: 12px;
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    transition: all 0.3s ease;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15));
    min-height: 260px;
    cursor: pointer;

    &:hover {
        transform: translateY(-3px);
        box-shadow: 0 6px 14px rgba(0, 0, 0, 0.14);
        border-color: var(--vscode-focusBorder, rgba(128, 128, 128, 0.35));
    }
`;

const SecondaryCardsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    padding-top: 6px;

    @media (max-width: 1000px) {
        grid-template-columns: repeat(2, 1fr);
    }

    @media (max-width: 640px) {
        grid-template-columns: 1fr;
    }
`;

// ─────────────────────────────────────────────────────────────────────────────

export const WelcomeView: React.FC = () => {
    const { wsClient } = useVisualizerContext();
    const [currentView, setCurrentView] = useState<ViewState>(ViewState.WELCOME);
    const { authState } = useCloudContext();
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [showSecondary, setShowSecondary] = useState(false);
    const avatarRef = useRef<HTMLDivElement>(null);

    const goToCreateIntegration = () => {
        setCurrentView(ViewState.CREATE_INTEGRATION);
    };

    const goToSamples = () => {
        setCurrentView(ViewState.SAMPLES);
    };

    const goToImportExternal = () => {
        setCurrentView(ViewState.IMPORT_EXTERNAL);
    };

    const goToCreateLibrary = () => {
        setCurrentView(ViewState.CREATE_LIBRARY);
    };

    const goToCreateProject = () => {
        setCurrentView(ViewState.CREATE_PROJECT);
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
        wsClient.openSettings('integrator.enabledRuntimes');
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
                    <ConfigureBtn onClick={openConfigure}>
                        <span style={{ fontSize: 25 }}>⚙</span>
                        <span>Configure</span>
                    </ConfigureBtn>
                </TopBtnSection>
                <GetStartedBadge>Get Started</GetStartedBadge>
                <Headline>WSO2 Integrator</Headline>
                <Caption>
                    Connect any system across your business, build AI agents, and orchestrate AI-enabled workflows with the 100% open source and AI-native WSO2 Integrator.
                </Caption>
            </TopSection>

            <CardsContainer>
                {/* Primary action cards */}
                <CardsGrid>
                    <ActionCard onClick={goToCreateIntegration}>
                        <CardIconContainer>
                            <CardIcon bgColor="linear-gradient(135deg, #667eea 0%, #764ba2 100%)">⇌</CardIcon>
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
                            <CardIcon bgColor="linear-gradient(135deg, #fa709a 0%, #fee140 100%)">↗</CardIcon>
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
                            <CardIcon bgColor="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)">★</CardIcon>
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

                    <ActionCard onClick={goToSamples}>
                        <CardIconContainer>
                            <CardIcon bgColor="linear-gradient(135deg, #11998e 0%, #38ef7d 100%)">☰</CardIcon>
                        </CardIconContainer>
                        <CardContent>
                            <CardTitle>Pre-built Integrations</CardTitle>
                            <CardDescription>
                                Browse and deploy ready-made integration templates and pre-built connectors directly from our catalog.
                            </CardDescription>
                            <StyledButton
                                onClick={(e: any) => { e.stopPropagation(); goToSamples(); }}>
                                <ButtonContent>Browse</ButtonContent>
                            </StyledButton>
                        </CardContent>
                    </ActionCard>
                </CardsGrid>

                {/* More actions toggle */}
                <MoreToggleWrapper>
                    <MoreDivider />
                    <MoreToggleButton onClick={() => setShowSecondary(!showSecondary)}>
                        <span>{showSecondary ? 'Show less' : 'More actions'}</span>
                        <MoreChevron style={{ transform: showSecondary ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▾
                        </MoreChevron>
                    </MoreToggleButton>
                    <MoreDivider />
                </MoreToggleWrapper>

                {/* Secondary action cards — expandable */}
                <SecondaryCardsSection
                    style={{
                        maxHeight: showSecondary ? '800px' : '0',
                        opacity: showSecondary ? 1 : 0,
                    }}
                >
                    <SecondaryCardsGrid>
                        <SecondaryActionCard onClick={goToCreateLibrary}>
                            <CardIconContainer>
                                <CardIcon bgColor="linear-gradient(135deg, #4ecdc4 0%, #1a9691 100%)">⊞</CardIcon>
                            </CardIconContainer>
                            <CardContent>
                                <CardTitle>Create Library</CardTitle>
                                <CardDescription>
                                    Build a reusable library of integration components, transformers, and utilities to share across multiple projects.
                                </CardDescription>
                                <StyledButton
                                    onClick={(e: any) => { e.stopPropagation(); goToCreateLibrary(); }}>
                                    <ButtonContent>Create Library</ButtonContent>
                                </StyledButton>
                            </CardContent>
                        </SecondaryActionCard>

                        <SecondaryActionCard onClick={goToCreateProject}>
                            <CardIconContainer>
                                <CardIcon bgColor="linear-gradient(135deg, #f7971e 0%, #d4841a 100%)">◫</CardIcon>
                            </CardIconContainer>
                            <CardContent>
                                <CardTitle>Create Project</CardTitle>
                                <CardDescription>
                                    Create a new integration project within your workspace with structure, configuration, and dependencies ready to go.
                                </CardDescription>
                                <StyledButton
                                    onClick={(e: any) => { e.stopPropagation(); goToCreateProject(); }}>
                                    <ButtonContent>Create Project</ButtonContent>
                                </StyledButton>
                            </CardContent>
                        </SecondaryActionCard>

                        <SecondaryActionCard onClick={goToImportExternal}>
                            <CardIconContainer>
                                <CardIcon bgColor="linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)">↷</CardIcon>
                            </CardIconContainer>
                            <CardContent>
                                <CardTitle>Migrate 3rd Party Integrations</CardTitle>
                                <CardDescription>
                                    Transform and migrate your existing MuleSoft or TIBCO integrations to WSO2 Integrator automatically.
                                </CardDescription>
                                <StyledButton
                                    onClick={(e: any) => { e.stopPropagation(); goToImportExternal(); }}>
                                    <ButtonContent>Migrate</ButtonContent>
                                </StyledButton>
                            </CardContent>
                        </SecondaryActionCard>
                    </SecondaryCardsGrid>
                </SecondaryCardsSection>
            </CardsContainer>

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
