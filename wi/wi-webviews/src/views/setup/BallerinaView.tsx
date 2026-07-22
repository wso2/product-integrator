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

import styled from "@emotion/styled";
import { Button, Codicon } from "@wso2/ui-toolkit";
import { useVisualizerContext } from "../../contexts";
import {
    PageBackdrop,
    PageContainer,
    HeaderRow,
    HeaderText,
    HeaderTitle,
    HeaderSubtitle,
    FormPanel,
    FormPanelHeader,
    FormBody,
    FormContent,
} from "../shared/FormPageLayout";
import {
    STEPS,
    StepRow,
    StepIconWrap,
    StepContent,
    StepTitle,
    StepDesc,
    useSetupProgress,
    getStepIcon,
    getStepTitle,
} from "./shared";

const WarningIconWrap = styled.div`
    flex-shrink: 0;
    margin-top: 1px;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-editorWarning-foreground, #cca700);
`;

const StepContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    border-radius: 6px;
    background: color-mix(in srgb, var(--vscode-editor-background) 60%, transparent);
`;

const SuccessSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--vscode-textLink-foreground) 30%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--vscode-textLink-foreground) 6%, transparent);
`;

const ErrorSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--vscode-errorForeground) 30%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--vscode-errorForeground) 6%, transparent);
`;

const ActionArea = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 4px;
`;

export function SetupBallerinaView() {
    const { wsClient } = useVisualizerContext();
    const { progress, setProgress, isStarting, setIsStarting, isSetupRunning, handleRestart } = useSetupProgress();

    const handleUpdate = async () => {
        setIsStarting(true);
        setProgress(null);
        try {
            await wsClient.runCommand({ command: "ballerina.setup-ballerina" });
        } catch {
            setProgress({ step: -1, success: false, message: "Failed to start the setup process. Please try again." });
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <PageBackdrop>
            <PageContainer>
                <FormPanel>
                    <FormPanelHeader>
                        <HeaderRow>
                            <WarningIconWrap>
                                <Codicon name="warning" iconSx={{ fontSize: 22 }} />
                            </WarningIconWrap>
                            <HeaderText>
                                <HeaderTitle variant="h3">Ballerina Setup Required</HeaderTitle>
                                <HeaderSubtitle>
                                    A compatible Ballerina distribution was not found or needs to be updated. Click below to install or update it automatically.
                                </HeaderSubtitle>
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>

                    <FormBody>
                        <FormContent>
                            <ActionArea>
                                <Button
                                    appearance="primary"
                                    onClick={handleUpdate}
                                    disabled={isStarting || isSetupRunning}
                                >
                                    {isStarting ? "Starting…" : "Set Up Ballerina"}
                                </Button>

                                {progress && (progress.step ?? 0) !== -1 && (
                                    <StepContainer>
                                        {STEPS.map((step, idx) => (
                                            <StepRow key={idx}>
                                                <StepIconWrap>{getStepIcon(progress, idx + 1)}</StepIconWrap>
                                                <StepContent>
                                                    <StepTitle>{getStepTitle(progress, idx + 1, step.title)}</StepTitle>
                                                    <StepDesc>{step.description}</StepDesc>
                                                </StepContent>
                                            </StepRow>
                                        ))}
                                    </StepContainer>
                                )}

                                {progress && progress.step === -1 && (
                                    <ErrorSection>
                                        <StepTitle error>Setup failed</StepTitle>
                                        <StepDesc>{progress.message}</StepDesc>
                                        <StepDesc>Check your internet connection or permissions and try again.</StepDesc>
                                        <div style={{ marginTop: "4px" }}>
                                            <Button appearance="primary" onClick={handleUpdate}>Retry</Button>
                                        </div>
                                    </ErrorSection>
                                )}

                                {progress?.success && (
                                    <SuccessSection>
                                        <StepTitle>Setup complete</StepTitle>
                                        <StepDesc>Restart the editor to finish applying the changes.</StepDesc>
                                        <div style={{ marginTop: "4px" }}>
                                            <Button appearance="primary" onClick={handleRestart}>Restart Editor</Button>
                                        </div>
                                    </SuccessSection>
                                )}
                            </ActionArea>
                        </FormContent>
                    </FormBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
