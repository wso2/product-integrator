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
    padding: 10px 14px;
    border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700);
    border-radius: 2px;
    background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 6%, transparent);
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

export function SetupContent() {
    const { wsClient } = useVisualizerContext();
    const { progress, setProgress, isStarting, setIsStarting, isSetupRunning, handleRestart } = useSetupProgress();

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
                {isStarting ? "Starting…" : "Set up Ballerina"}
            </Button>

            {progress && (progress.step ?? 0) !== -1 && (
                <CompactStepContainer>
                    {STEPS.map((step, idx) => (
                        <StepRow key={idx}>
                            <StepIconWrap>{getStepIcon(progress, idx + 1)}</StepIconWrap>
                            <StepContent>
                                <StepTitle>{getStepTitle(progress, idx + 1, step.title)}</StepTitle>
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
                    <StepDesc>Restart the editor to finish applying the changes.</StepDesc>
                    <div style={{ marginTop: "4px" }}>
                        <Button appearance="primary" onClick={handleRestart}>Restart Editor</Button>
                    </div>
                </CompactSuccessSection>
            )}
        </CompactWrapper>
    );
}
