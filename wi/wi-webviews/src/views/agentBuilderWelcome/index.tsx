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

import { Codicon } from "@wso2/ui-toolkit";
import React, { useEffect, useRef, useState } from "react";
import { useVisualizerContext } from "../../contexts";
import { useCloudContext } from "../../providers";
import { OpenProjectView } from "../OpenProjectView";
import { UserAccountPopover } from "../UserAccountPopover";
import { RemoteBIProjectForm } from "../creationView/federation/RemoteBIProjectForm";
import { prefetchBiCreateFlow } from "../creationView/federation/biFormRemote";
import { SamplesView } from "../samplesView";
import { SettingsView } from "../settingsView";
import {
	ActionCard,
	BALLERINA_MISSING_ACTION_TOOLTIP,
	BALLERINA_MISSING_CONFIGURE_TOOLTIP,
	ButtonContent,
	Caption,
	CardButtonRow,
	CardContent,
	CardDescription,
	CardIcon,
	CardIconContainer,
	CardTitle,
	CardsContainer,
	CardsGrid,
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
} from "../shared/welcomeLayout";

/**
 * Welcome page shown when the product runs as WSO2 Agent Builder
 * (ViewType.AGENT_BUILDER_WELCOME). BI/Ballerina-only: no runtime/profile
 * switching, no MI/SI flows.
 */

enum ViewState {
	WELCOME = "welcome",
	CREATE_PROJECT = "create_project",
	SAMPLES = "samples",
	SETTINGS = "settings",
	OPEN_PROJECT = "open_project",
}

const DEFAULT_PRODUCT_NAME = "WSO2 Agent Builder";

export const AgentBuilderWelcomeView: React.FC = () => {
	const { wsClient, webviewContext } = useVisualizerContext();
	const { authState } = useCloudContext();
	const [currentView, setCurrentView] = useState<ViewState>(ViewState.WELCOME);
	const [popoverOpen, setPopoverOpen] = useState(false);
	// null = check not yet done; false = available; true = unavailable
	const [isBallerinaUnavailable, setIsBallerinaUnavailable] = useState<
		boolean | null
	>(null);
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

	const productName = webviewContext?.productName ?? DEFAULT_PRODUCT_NAME;

	// Agent Builder always runs on the Ballerina runtime: warm the Create flow
	// and check runtime availability once, in the background, so the cards
	// render immediately and only disable if Ballerina is definitely missing.
	useEffect(() => {
		if (biStatusCheckDone.current) {
			return;
		}
		biStatusCheckDone.current = true;

		prefetchBiCreateFlow(wsClient);

		wsClient
			.getBIRuntimeStatus()
			.then(({ isAvailable }) => {
				setIsBallerinaUnavailable(!isAvailable);
			})
			.catch(() => {
				// If the check fails, let the user proceed — do not block the welcome view.
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const goToCreate = () => setCurrentView(ViewState.CREATE_PROJECT);
	const goToSamples = () => setCurrentView(ViewState.SAMPLES);
	const goToSettings = () => setCurrentView(ViewState.SETTINGS);
	const goToOpenProject = () => setCurrentView(ViewState.OPEN_PROJECT);
	const goBackToWelcome = () => setCurrentView(ViewState.WELCOME);

	const openRecentProjectsPicker = () => {
		wsClient
			.runCommand({ command: "workbench.action.openRecent" })
			.catch((): void => undefined);
	};

	const openRecentProject = (projectPath: string) => {
		if (!projectPath) return;
		wsClient.openFolder(projectPath);
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
								<SigninBtn
									type="button"
									onClick={handleCancelSignIn}
									title="Cancel sign in"
								>
									<Codicon
										name="loading"
										iconSx={{
											fontSize: 13,
											color: "var(--wso2-brand-white)",
											animation: "codicon-spin 1.5s steps(30) infinite",
										}}
									/>
									Signing in...
									<Codicon
										name="close"
										iconSx={{
											fontSize: 12,
											color: "var(--wso2-brand-white)",
											opacity: 0.8,
										}}
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
								title={
									biUnavailable
										? BALLERINA_MISSING_CONFIGURE_TOOLTIP
										: undefined
								}
							>
								<Codicon name="settings-gear" iconSx={{ fontSize: 16 }} />
								<span>Configure</span>
								{biUnavailable && (
									<Codicon
										name="warning"
										iconSx={{
											fontSize: 16,
											color: "var(--vscode-editorWarning-foreground, #cca700)",
										}}
									/>
								)}
							</ConfigureBtn>
						</TopBtnSection>
					</TopControlsSection>
					<GetStartedBadge>Get Started</GetStartedBadge>
					<Headline>{productName}</Headline>
					<Caption>
						Design, build, and manage AI agents that connect to your APIs, data,
						and events. Create production-ready agents with the 100% open source{" "}
						{productName}.
					</Caption>
				</TopSection>

				<CardsContainer>
					<CardsGrid>
						<StaticActionCard
							disabled={biUnavailable}
							title={
								biUnavailable ? BALLERINA_MISSING_ACTION_TOOLTIP : undefined
							}
						>
							<CardIconContainer>
								<CardIcon bgColor="linear-gradient(135deg, var(--wso2-brand-primary-alt) 0%, var(--wso2-brand-primary-deep) 100%)">
									<Codicon
										name="hubot"
										iconSx={{ fontSize: "25px" }}
										sx={{ width: "23px", height: "25px" }}
									/>
								</CardIcon>
							</CardIconContainer>
							<CardContent>
								<CardTitle>Start Building your Agent</CardTitle>
								<CardDescription>
									Create a new AI agent project, or open an existing one to
									continue building.
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
										onClick={goToOpenProject}
									>
										<ButtonContent>Open</ButtonContent>
									</StyledButton>
								</CardButtonRow>
							</CardContent>
						</StaticActionCard>

						<ActionCard
							disabled={biUnavailable}
							onClick={biUnavailable ? undefined : goToSamples}
							title={
								biUnavailable ? BALLERINA_MISSING_ACTION_TOOLTIP : undefined
							}
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
								<CardTitle>Pre-built Agents and Samples</CardTitle>
								<CardDescription>
									Ready-to-use samples to accelerate your agent development.
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
					</CardsGrid>
				</CardsContainer>

				{isRecentProjectsLoaded && (
					<RecentProjectsPanel
						recentProjects={recentProjects}
						onOpenProject={openRecentProject}
						onSeeMore={openRecentProjectsPicker}
					/>
				)}

				<UserAccountPopover
					isOpen={popoverOpen}
					anchorEl={avatarRef.current}
					onClose={() => setPopoverOpen(false)}
				/>
			</>
		);
	};

	const renderCurrentView = () => {
		// Until the first Ballerina status answer arrives the cards render
		// enabled; sub-views receive the definite answer when known.
		const biUnavailable = isBallerinaUnavailable === true;

		switch (currentView) {
			case ViewState.CREATE_PROJECT:
				return (
					<RemoteBIProjectForm
						mode="create"
						onBack={goBackToWelcome}
						ballerinaUnavailable={biUnavailable}
					/>
				);
			case ViewState.SAMPLES:
				return <SamplesView onBack={goBackToWelcome} runtime="WSO2: BI" />;
			case ViewState.SETTINGS:
				return (
					<SettingsView
						onBack={goBackToWelcome}
						ballerinaUnavailable={biUnavailable}
					/>
				);
			case ViewState.OPEN_PROJECT:
				return <OpenProjectView onBack={goBackToWelcome} />;
			case ViewState.WELCOME:
			default:
				return renderWelcomeContent();
		}
	};

	return <Wrapper>{renderCurrentView()}</Wrapper>;
};
