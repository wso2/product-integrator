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

import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Button, Codicon, Icon, ProgressRing } from "@wso2/ui-toolkit";
import { useVisualizerContext } from "../../contexts";
import { DownloadProgress } from "@wso2/wi-core";

/**
 * Matches the geometry of WelcomeView's `CardsContainer` so this content
 * slots in below the hero banner without any layout gap or centering.
 */
const Wrapper = styled.div`
    padding: 0 60px 60px;
    margin-top: -40px;
    position: relative;
    z-index: 1;
    font-family: var(--vscode-font-family);
`;

const BackLink = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    font-size: 13px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    padding: 0;
    margin-bottom: 32px;
    &:hover {
        color: var(--vscode-textLink-activeForeground);
        text-decoration: underline;
    }
`;

const TitleContainer = styled.div`
    margin-bottom: 32px;
`;

const Headline = styled.h1`
    font-size: 28px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin: 0 0 8px 0;
    line-height: 1.3;
`;

const SubLine = styled.p`
    font-size: 16px;
    font-weight: 500;
    color: var(--vscode-foreground);
    margin: 0 0 12px 0;
`;

const Caption = styled.p`
    font-size: 14px;
    line-height: 1.6;
    color: var(--vscode-descriptionForeground);
    margin: 0;
`;

const SetupButton = styled(Button)`
    margin-top: 8px;
    min-width: 220px;
`;

const StepContainer = styled.div`
    margin-top: 40px;
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const StepRow = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 12px;
`;

const StepIconWrap = styled.div`
    margin-top: 2px;
    flex-shrink: 0;
    width: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const StepContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

interface StepTitleProps {
    error?: boolean;
}

const StepTitle = styled.span<StepTitleProps>`
    font-size: 13px;
    font-weight: 500;
    color: ${(p: StepTitleProps) => p.error ? "var(--vscode-errorForeground)" : "var(--vscode-foreground)"};
`;

const StepDesc = styled.span`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
`;

const ErrorSection = styled.div`
    margin-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const SuccessSection = styled.div`
    margin-top: 40px;
    padding: 20px;
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    border-radius: 8px;
`;

const SuccessTitle = styled.p`
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin: 0 0 6px 0;
`;

const SuccessDesc = styled.p`
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 16px 0;
    line-height: 1.5;
`;

/* ── Compact (inline settings panel) styles ─────────────────────────── */

const CompactWrapper = styled.div`
    font-family: var(--vscode-font-family);
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const CompactHeader = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 10px;
`;

const CompactWarningIcon = styled.div`
    flex-shrink: 0;
    margin-top: 1px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-editorWarning-foreground, #cca700);
`;

const CompactHeaderText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const CompactTitle = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    line-height: 1.4;
`;

const CompactCaption = styled.span`
    font-size: 12px;
    line-height: 1.5;
    color: var(--vscode-descriptionForeground);
`;

const CompactStepContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    border-radius: 6px;
    background: color-mix(in srgb, var(--vscode-editor-background) 60%, transparent);
`;

const CompactSuccessSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--vscode-textLink-foreground) 30%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--vscode-textLink-foreground) 6%, transparent);
`;

const CompactErrorSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--vscode-errorForeground) 30%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--vscode-errorForeground) 6%, transparent);
`;

const STEPS = [
    { title: "Prepare Installation", description: "Checking versions and preparing environment for installation." },
    { title: "Install Ballerina Tool", description: "Downloading and installing the Ballerina tool package." },
    { title: "Install Ballerina Distribution", description: "Downloading and installing the Ballerina distribution package." },
    { title: "Install Java Runtime", description: "Downloading and installing the required Java Runtime Environment." },
    { title: "Complete Setup", description: "Configuring VS Code, setting permissions and finalizing installation." },
];

export interface SetupContentProps {
    onBack?: () => void;
    /** Render without the WelcomeView-specific padding/margin offsets. */
    compact?: boolean;
}

export function SetupContent({ onBack, compact }: SetupContentProps) {
    const { wsClient } = useVisualizerContext();
    const [progress, setProgress] = useState<DownloadProgress | null>(null);
    const [isStarting, setIsStarting] = useState(false);

    useEffect(() => {
        wsClient.onDownloadProgress((p: DownloadProgress) => setProgress(p));
    }, [wsClient]);

    const handleSetup = async () => {
        setIsStarting(true);
        setProgress(null);
        try {
            await wsClient.initBIRuntimeContext();
            await wsClient.runCommand({ command: "ballerina.setup-ballerina" });
        } catch {
            // Errors surface via onDownloadProgress with step === -1
        } finally {
            setIsStarting(false);
        }
    };

    const handleRestart = () => {
        wsClient.runCommand({ command: "workbench.action.reloadWindow" });
    };

    const getStepIcon = (stepIndex: number) => {
        if (!progress) {
            return <Icon name="radio-button-unchecked" iconSx={{ fontSize: "16px", cursor: "default" }} />;
        }
        const currentStep = progress.step ?? 0;
        const isComplete = progress.success || currentStep > stepIndex;
        const isActive = !progress.success && currentStep === stepIndex;
        if (isComplete) {
            return <Icon name="enable-inverse" iconSx={{ fontSize: "15px", color: "var(--vscode-textLink-foreground)", cursor: "default" }} />;
        }
        if (isActive) {
            return <ProgressRing sx={{ height: "16px", width: "16px" }} />;
        }
        return <Icon name="radio-button-unchecked" iconSx={{ fontSize: "16px", cursor: "default" }} />;
    };

    const getStepTitle = (stepIndex: number, baseTitle: string) => {
        if (!progress) return baseTitle;
        const currentStep = progress.step ?? 0;
        if (!progress.success && currentStep === stepIndex && progress.percentage && progress.totalSize) {
            return `${baseTitle} (${progress.percentage}% - ${progress.totalSize.toFixed(0)}MB)`;
        }
        return baseTitle;
    };

    const isSetupRunning = progress !== null && !progress.success && (progress.step ?? 0) !== -1;

    if (compact) {
        return (
            <CompactWrapper>
                <CompactHeader>
                    <CompactWarningIcon>
                        <Codicon name="warning" iconSx={{ fontSize: 16 }} />
                    </CompactWarningIcon>
                    <CompactHeaderText>
                        <CompactTitle>Ballerina Distribution Not Found</CompactTitle>
                        <CompactCaption>
                            The WSO2 Integrator: Default Profile requires the Ballerina distribution.
                            You can switch to a different profile above, or set it up now.
                        </CompactCaption>
                    </CompactHeaderText>
                </CompactHeader>

                <Button
                    appearance="primary"
                    onClick={handleSetup}
                    disabled={isStarting || isSetupRunning}
                >
                    {isStarting ? "Starting\u2026" : "Set up Ballerina"}
                </Button>

                {progress && (progress.step ?? 0) !== -1 && (
                    <CompactStepContainer>
                        {STEPS.map((step, idx) => (
                            <StepRow key={idx}>
                                <StepIconWrap>{getStepIcon(idx + 1)}</StepIconWrap>
                                <StepContent>
                                    <StepTitle>{getStepTitle(idx + 1, step.title)}</StepTitle>
                                    <StepDesc>{step.description}</StepDesc>
                                </StepContent>
                            </StepRow>
                        ))}
                    </CompactStepContainer>
                )}

                {progress && progress.step === -1 && (
                    <CompactErrorSection>
                        <StepTitle error>Setup failed</StepTitle>
                        <StepDesc>{progress.message}</StepDesc>
                        <StepDesc>Check your internet connection or permissions and try again.</StepDesc>
                        <div style={{ marginTop: "4px" }}>
                            <Button appearance="primary" onClick={handleSetup}>Retry</Button>
                        </div>
                    </CompactErrorSection>
                )}

                {progress?.success && (
                    <CompactSuccessSection>
                        <StepTitle>Setup complete</StepTitle>
                        <StepDesc>Restart VS Code to finish applying the changes.</StepDesc>
                        <div style={{ marginTop: "4px" }}>
                            <Button appearance="primary" onClick={handleRestart}>Restart VS Code</Button>
                        </div>
                    </CompactSuccessSection>
                )}
            </CompactWrapper>
        );
    }

    return (
        <Wrapper>
            {onBack && (
                <BackLink type="button" onClick={onBack}>
                    <Codicon name="arrow-left" iconSx={{ fontSize: 13 }} />
                    Back
                </BackLink>
            )}

            <TitleContainer>
                <Headline>WSO2 Integrator: BI for VS Code</Headline>
                <SubLine>Let's set up your environment</SubLine>
                <Caption>
                    Ballerina distribution is required but not found. Click the button below and we'll take care of everything step by step.
                </Caption>
            </TitleContainer>

            <SetupButton
                appearance="primary"
                onClick={handleSetup}
                disabled={isStarting || isSetupRunning}
            >
                {isStarting ? "Starting\u2026" : "Set up Ballerina distribution"}
            </SetupButton>

            {progress && (progress.step ?? 0) !== -1 && (
                <StepContainer>
                    {STEPS.map((step, idx) => (
                        <StepRow key={idx}>
                            <StepIconWrap>{getStepIcon(idx + 1)}</StepIconWrap>
                            <StepContent>
                                <StepTitle>{getStepTitle(idx + 1, step.title)}</StepTitle>
                                <StepDesc>{step.description}</StepDesc>
                            </StepContent>
                        </StepRow>
                    ))}
                </StepContainer>
            )}

            {progress && progress.step === -1 && (
                <ErrorSection>
                    <StepTitle error>Something went wrong while setting up WSO2 Integrator: BI</StepTitle>
                    <StepDesc>{progress.message}</StepDesc>
                    <StepDesc>Please check your internet connection or permissions and try again.</StepDesc>
                    <SetupButton appearance="primary" onClick={handleSetup} style={{ marginTop: "12px" }}>
                        Retry Setup
                    </SetupButton>
                </ErrorSection>
            )}

            {progress?.success && (
                <SuccessSection>
                    <SuccessTitle>Restart to apply changes</SuccessTitle>
                    <SuccessDesc>
                        To finish the setup, please restart VS Code. This ensures everything is configured correctly and ready to use.
                    </SuccessDesc>
                    <Button appearance="primary" onClick={handleRestart}>
                        Restart VS Code
                    </Button>
                </SuccessSection>
            )}
        </Wrapper>
    );
}
