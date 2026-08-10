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
import styled from "@emotion/styled";
import { Codicon, ProgressIndicator } from "@wso2/ui-toolkit";
import { useVisualizerContext } from "../contexts";
import { useCloudContext } from "../providers";
import { UserAccountPopover } from "./UserAccountPopover";
import { CreationView } from "./creationView";
import { prefetchBiCreateFlow } from "./creationView/federation/biFormRemote";
import { RemoteBIProjectForm } from "./creationView/federation/RemoteBIProjectForm";
import { RemoteImportIntegration } from "./creationView/federation/RemoteImportIntegration";
import { SamplesView } from "./samplesView";
import { SettingsView } from "./settingsView";
import {
	type WIRuntime,
	loadSelectedRuntime,
} from "./shared/runtime";
import {
	BALLERINA_MISSING_ACTION_TOOLTIP,
	BALLERINA_MISSING_CONFIGURE_TOOLTIP,
	ActionCard,
	ButtonContent,
	CardButtonRow,
	CardContent,
	CardDescription,
	CardIcon,
	CardIconContainer,
	CardTitle,
	CardsContainer,
	CardsGrid,
	CardsLoadingState,
	Caption,
	ConfigureBtn,
	GetStartedBadge,
	Headline,
	RecentProjectsPanel,
	SigninBtn,
	StaticActionCard,
	StyledButton,
	TopBtnSection,
	TopControlsSection,
	TopSection,
	UserAvatar,
	UserAvatarImg,
	UserInitial,
	Wrapper,
	useRecentProjects,
	useSignInControls,
} from "./shared/welcomeLayout";
import { OpenProjectView } from "./OpenProjectView";

enum ViewState {
    WELCOME = "welcome",
    /** Unified Create flow: project chooser → integration wizard / library form. */
    CREATE = "create",
    CREATE_INTEGRATION = "create_integration",
    SAMPLES = "samples",
    IMPORT_EXTERNAL = "import_external",
    CREATE_LIBRARY = "create_library",
    CREATE_PROJECT = "create_project",
    SETTINGS = "settings",
    OPEN_PROJECT = "open_project",
}

const DISABLED_ROW_STYLE: React.CSSProperties = {
    opacity: 0.5,
    cursor: "not-allowed",
    pointerEvents: "none",
};

const MoreChevron = styled.span`
    display: inline-block;
    transition: transform 0.25s ease;
    font-size: 11px;
    line-height: 1;
`;

// Collapsed state hides the subtree with `visibility` as well as clipping it, so
// nothing inside stays focusable while the section is aria-hidden. Transitioning
// `visibility` keeps it visible for the duration of the collapse animation.
const SecondaryCardsSection = styled.div`
    overflow: hidden;
    transition: max-height 0.4s ease, opacity 0.3s ease, visibility 0.4s;
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

const SecondaryRowIcon = styled.div<{ bgColor?: string }>`
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${(props: { bgColor?: string }) =>
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

// Row variant whose body is inert — actions live only on its trailing buttons,
// so the pointer cursor and hover highlight are suppressed.
const StaticSecondaryActionRow = styled(SecondaryActionRow)`
    cursor: default;

    &:hover {
        background: transparent;
        border-color: var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    }
`;

// Right-aligned action buttons inside a secondary row.
const SecondaryRowActions = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
`;

// Smaller button used inside secondary rows so it fits the compact row height.
const CompactButton = styled(StyledButton)`
    height: 30px;
    padding: 0 16px;
    font-size: 13px;
    border-radius: 6px;
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
	const [selectedRuntime, setSelectedRuntime] = useState<WIRuntime | null>(null);
	const [isRuntimeLoading, setIsRuntimeLoading] = useState(true);
    const [showSecondary, setShowSecondary] = useState(false);
    // null = check not yet done; false = available; true = unavailable
    const [isBallerinaUnavailable, setIsBallerinaUnavailable] = useState<boolean | null>(null);
	const avatarRef = useRef<HTMLButtonElement>(null);
    const biStatusCheckDone = useRef(false);
	const { recentProjects, isRecentProjectsLoaded } = useRecentProjects(
		wsClient,
		currentView === ViewState.WELCOME,
	);
	const { isSigningIn, handleSignIn, handleCancelSignIn } = useSignInControls(
		wsClient,
		authState?.userInfo,
	);

    useEffect(() => {
        if (currentView !== ViewState.WELCOME) {
            return;
        }

        const fetchSelectedRuntime = async () => {
            setIsRuntimeLoading(true);
            try {
                const runtime = await loadSelectedRuntime(wsClient);
                setSelectedRuntime(runtime);
            } catch (error) {
                console.warn("Failed to load selected profile, using fallback:", error);
                setSelectedRuntime("WSO2: BI");
            } finally {
                setIsRuntimeLoading(false);
            }
        };

        fetchSelectedRuntime();
    }, [currentView, wsClient]);

    // Runs the Ballerina activation check in the background,
    // after the runtime is already known. This way the welcome cards render
    // immediately and only disable actions if Ballerina is definitely unavailable.
    // wsClient is intentionally omitted from the dependency array — it is a stable
    // singleton and the check should only re-run when selectedRuntime changes.
    useEffect(() => {
        if (selectedRuntime !== "WSO2: BI" || biStatusCheckDone.current) {
            return;
        }
        biStatusCheckDone.current = true;

        // Warm the Create flow now, using the seconds the user spends on this view, so
        // clicking Create lands on the form instead of on a spinner. Deliberately not
        // gated on the status check below: it needs the same Ballerina activation, and
        // waiting for that answer would give away most of the head start.
        prefetchBiCreateFlow(wsClient);

        wsClient.getBIRuntimeStatus().then(({ isAvailable }) => {
            setIsBallerinaUnavailable(!isAvailable);
        }).catch(() => {
            // If the check fails, let the user proceed — do not block the welcome view.
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRuntime]);

	useEffect(() => {
		if (selectedRuntime !== "WSO2: BI") {
			setShowSecondary(false);
			setIsBallerinaUnavailable(null);
		}
	}, [selectedRuntime]);

	const goToCreate = () => setCurrentView(ViewState.CREATE);
	const goToCreateIntegration = () =>
		setCurrentView(ViewState.CREATE_INTEGRATION);
	const goToSamples = () => setCurrentView(ViewState.SAMPLES);
	const goToImportExternal = () => setCurrentView(ViewState.IMPORT_EXTERNAL);
	const goToSettings = () => setCurrentView(ViewState.SETTINGS);
	const goBackToWelcome = () => setCurrentView(ViewState.WELCOME);

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

    const handleImportCapp = () => {
        wsClient.importProjectFromCapp();
    }

	const renderCurrentView = () => {
        // While we're still determining which runtime is active, show a full-page
        // spinner so the banner never flashes.
        if (isRuntimeLoading && currentView === ViewState.WELCOME) {
            return (
                <CardsLoadingState style={{ height: "100vh" }}>
                    <ProgressIndicator />
                </CardsLoadingState>
            );
        }

        const biUnavailable = isBallerinaUnavailable === true;

		switch (currentView) {
			case ViewState.CREATE:
				return <RemoteBIProjectForm mode="create" onBack={goBackToWelcome} ballerinaUnavailable={biUnavailable} />;
			case ViewState.CREATE_INTEGRATION:
				return (
					<CreationView
						onBack={goBackToWelcome}
						runtime={selectedRuntime ?? undefined}
						ballerinaUnavailable={biUnavailable}
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
				return <RemoteImportIntegration onBack={goBackToWelcome} />;
			case ViewState.CREATE_LIBRARY:
				return <RemoteBIProjectForm mode="library" onBack={goBackToWelcome} ballerinaUnavailable={biUnavailable} />;
			case ViewState.CREATE_PROJECT:
				return <RemoteBIProjectForm mode="project" onBack={goBackToWelcome} ballerinaUnavailable={biUnavailable} />;
			case ViewState.SETTINGS:
				return <SettingsView onBack={goBackToWelcome} ballerinaUnavailable={biUnavailable} />;
            case ViewState.OPEN_PROJECT:
                return <OpenProjectView onBack={goBackToWelcome} />;
			case ViewState.WELCOME:
			default:
				return renderWelcomeContent();
		}
	};

	const renderWelcomeContent = () => {
        const biUnavailable = isBallerinaUnavailable === true;
        return (
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
						) : isSigningIn ? (
							<SigninBtn type="button" onClick={handleCancelSignIn} title="Cancel sign in">
								<Codicon
									name="loading"
									iconSx={{ fontSize: 13, color: "var(--wso2-brand-white)", animation: "codicon-spin 1.5s steps(30) infinite" }}
								/>
								Signing in...
								<Codicon
									name="close"
									iconSx={{ fontSize: 12, color: "var(--wso2-brand-white)", opacity: 0.8 }}
								/>
							</SigninBtn>
						) : (
							<SigninBtn type="button" onClick={handleSignIn}>
								Sign In
							</SigninBtn>
						)}
						<ConfigureBtn
							type="button"
							onClick={goToSettings}
							title={biUnavailable ? BALLERINA_MISSING_CONFIGURE_TOOLTIP : undefined}
						>
							<Codicon
								name="settings-gear"
								iconSx={{ fontSize: 16 }}
							/>
							<span>Configure</span>
							{biUnavailable && (
								<Codicon
									name="warning"
									iconSx={{ fontSize: 16, color: "var(--vscode-editorWarning-foreground, #cca700)" }}
								/>
							)}
						</ConfigureBtn>
					</TopBtnSection>
				</TopControlsSection>
				<GetStartedBadge>Get Started</GetStartedBadge>
				<Headline>WSO2 Integrator</Headline>
				<Caption>
                    Connect AI agents, APIs, data, and events across cloud, on-prem,
                    and hybrid environments. Build any type of integration and AI agent
                    with the 100% open source WSO2 Integrator.
				</Caption>
			</TopSection>

			<>
					<CardsContainer>
						{isRuntimeLoading || !selectedRuntime ? (
							<CardsLoadingState>
								<ProgressIndicator />
							</CardsLoadingState>
						) : (
							<>
								<CardsGrid>
									{selectedRuntime === "WSO2: BI" ? (
										<>
											<StaticActionCard
												disabled={biUnavailable}
												title={biUnavailable ? BALLERINA_MISSING_ACTION_TOOLTIP : undefined}
											>
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
													<CardTitle>Start your Integration Project</CardTitle>
													<CardDescription>
														Create and manage your integrations to connect services, APIs, and data sources.
													</CardDescription>
													<CardButtonRow>
														<StyledButton
															isPrimary={true}
															disabled={biUnavailable}
															onClick={goToCreate}
														>
															<ButtonContent>Create</ButtonContent>
														</StyledButton>
														<StyledButton
															disabled={biUnavailable}
															onClick={handleProjectDirSelection}
														>
															<ButtonContent>Open</ButtonContent>
														</StyledButton>
													</CardButtonRow>
												</CardContent>
											</StaticActionCard>

											<ActionCard
												disabled={biUnavailable}
												onClick={biUnavailable ? undefined : goToSamples}
												title={biUnavailable ? BALLERINA_MISSING_ACTION_TOOLTIP : undefined}
											>
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
													<CardTitle>Pre-built Integrations and Samples</CardTitle>
													<CardDescription>
														Ready-to-use pre-built integrations and samples to accelerate your development.
													</CardDescription>
													<StyledButton
														disabled={biUnavailable}
														onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
															e.stopPropagation();
															if (!biUnavailable) goToSamples();
														}}
													>
														<ButtonContent>Explore</ButtonContent>
													</StyledButton>
												</CardContent>
											</ActionCard>
										</>
									) : (
										<>
											<ActionCard
												disabled={biUnavailable}
												onClick={biUnavailable ? undefined : goToCreateIntegration}
												title={biUnavailable ? BALLERINA_MISSING_ACTION_TOOLTIP : undefined}
											>
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
													<CardTitle>Create New Project</CardTitle>
													<CardDescription>
														Start building a new project.
													</CardDescription>
													<StyledButton
														isPrimary={true}
														disabled={biUnavailable}
														onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
															e.stopPropagation();
															if (!biUnavailable) goToCreateIntegration();
														}}
													>
														<ButtonContent>Create</ButtonContent>
													</StyledButton>
												</CardContent>
											</ActionCard>

											<ActionCard
												disabled={biUnavailable}
												onClick={biUnavailable ? undefined : openIntegrationFileBrowser}
												title={biUnavailable ? BALLERINA_MISSING_ACTION_TOOLTIP : undefined}
											>
												<CardIconContainer>
													<CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-primary-alt) 0%, var(--wso2-brand-accent-alt) 100%)">
														<Codicon
															name="folder-opened"
															iconSx={{ fontSize: "25px" }}
															sx={{ width: "23px", height: "25px" }}
														/>
													</CardIcon>
												</CardIconContainer>
												<CardContent>
													<CardTitle>Open Project</CardTitle>
													<CardDescription>
														Open an existing project and continue building your solution.
													</CardDescription>
													<StyledButton
														disabled={biUnavailable}
														onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
															e.stopPropagation();
															if (!biUnavailable) openIntegrationFileBrowser();
														}}
													>
														<ButtonContent>Open</ButtonContent>
													</StyledButton>
												</CardContent>
											</ActionCard>

											{selectedRuntime !== "WSO2: SI" && (
												<ActionCard
													disabled={biUnavailable}
													onClick={biUnavailable ? undefined : goToSamples}
													title={biUnavailable ? BALLERINA_MISSING_ACTION_TOOLTIP : undefined}
												>
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
															Ready-to-use pre-built integrations and samples to accelerate your development.
														</CardDescription>
														<StyledButton
															disabled={biUnavailable}
															onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
																e.stopPropagation();
																if (!biUnavailable) goToSamples();
															}}
														>
															<ButtonContent>Explore</ButtonContent>
														</StyledButton>
													</CardContent>
												</ActionCard>
											)}
										</>
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
											aria-hidden={!showSecondary}
											style={{
												maxHeight: showSecondary ? "200px" : "0",
												opacity: showSecondary ? 1 : 0,
												visibility: showSecondary ? "visible" : "hidden",
											}}
										>
											<SecondaryCardsGrid>
												<SecondaryActionRow
													onClick={biUnavailable ? undefined : goToImportExternal}
													style={biUnavailable ? DISABLED_ROW_STYLE : undefined}
													title={biUnavailable ? BALLERINA_MISSING_ACTION_TOOLTIP : undefined}
												>
													<SecondaryRowIcon bgColor="var(--wso2-brand-primary-alt)">
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

		{selectedRuntime === "WSO2: MI" && (
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
									aria-hidden={!showSecondary}
									style={{
										maxHeight: showSecondary ? "300px" : "0",
										opacity: showSecondary ? 1 : 0,
										visibility: showSecondary ? "visible" : "hidden",
									}}
								>
									<SecondaryCardsGrid>
										<SecondaryActionRow onClick={handleImportCapp}>
											<SecondaryRowIcon bgColor="var(--wso2-brand-primary-alt)">
												<Codicon
													name="library"
													iconSx={{ fontSize: "16px" }}
													sx={{ width: "16px", height: "16px" }}
												/>
											</SecondaryRowIcon>
											<SecondaryRowContent>
												<SecondaryRowTitle>Import a CApp</SecondaryRowTitle>
												<SecondaryRowDescription>
                                                    Import a CApp to create a new project.
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
					</>				)}
					</CardsContainer>

					{isRecentProjectsLoaded && (
						<RecentProjectsPanel
							recentProjects={recentProjects}
							onOpenProject={openRecentProject}
							onSeeMore={openRecentProjectsPicker}
						/>
					)}
				</>
            <UserAccountPopover
                isOpen={popoverOpen}
                anchorEl={avatarRef.current}
                onClose={() => setPopoverOpen(false)}
            />
        </>
        );
    };

	return <Wrapper>{renderCurrentView()}</Wrapper>;
};
