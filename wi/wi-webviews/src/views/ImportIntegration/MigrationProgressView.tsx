/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { ActionButtons, Button, Codicon, ProgressRing, Typography } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useEffect, useState } from "react";
import { MigrationLogs } from "./components/MigrationLogs";
import {
    AIEnhancementSection,
    AIEnhancementTitle,
    BodyText,
    ButtonWrapper,
    RadioContent,
    RadioDescription,
    RadioGroup,
    RadioInput,
    RadioOption,
    RadioTitle,
} from "./styles";
import { MigrationProgressProps } from "./types";
import { getMigrationDisplayState, getMigrationProgressHeaderData } from "./utils";
import { useVisualizerContext } from "../../contexts";

const StatusRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 20%, var(--vscode-widget-border));
    background: color-mix(in srgb, var(--wso2-brand-accent) 6%, transparent);
    padding: 10px 12px;
`;

const StatusText = styled.span`
    color: var(--vscode-foreground);
`;

export function MigrationProgressView({
    migrationState,
    migrationLogs,
    migrationCompleted,
    migrationSuccessful,
    migrationResponse,
    projects,
    isMultiProject,
    onStartAIEnhancement,
    onDone,
    onOpenProject,
    onBack,
}: MigrationProgressProps) {
    const [isLogsOpen, setIsLogsOpen] = useState(false);
    const [aiEnhancementEnabled, setAiEnhancementEnabled] = useState(false);
    const { wsClient } = useVisualizerContext();

    // Auto-open logs during migration and auto-collapse when completed
    useEffect(() => {
        if (!migrationCompleted && migrationLogs.length > 0) {
            // Migration is in progress and we have logs - open the dropdown
            setIsLogsOpen(true);
        } else if (migrationCompleted) {
            // Migration is completed - collapse the dropdown
            setIsLogsOpen(false);
        }
    }, [migrationCompleted, migrationLogs.length]);

    const displayState = getMigrationDisplayState(migrationCompleted, migrationSuccessful, false);
    const { headerText, headerDesc } = getMigrationProgressHeaderData(displayState, isMultiProject);

    return (
        <>
            <div>
                <Typography variant="h2">{headerText}</Typography>
                <BodyText>{headerDesc}</BodyText>
            </div>
            {displayState.isInProgress && (
                <StatusRow>
                    <ProgressRing sx={{ width: 14, height: 14 }} color="var(--vscode-foreground)" />
                    <StatusText>{migrationState || "Starting migration..."}</StatusText>
                </StatusRow>
            )}
            <MigrationLogs
                migrationLogs={migrationLogs}
                migrationCompleted={migrationCompleted}
                isLogsOpen={isLogsOpen}
                onToggleLogs={() => setIsLogsOpen(!isLogsOpen)}
                showHeader={!(migrationCompleted && !migrationSuccessful)}
            />

            {/* Show button after logs when migration is in progress or failed */}
            {displayState.showButtonsAfterLogs && (
                <ButtonWrapper>
                    <ActionButtons
                        primaryButton={{
                            text: "Next",
                            onClick: onDone,
                            disabled: !migrationCompleted || !migrationSuccessful
                        }}
                        secondaryButton={{
                            text: "Back",
                            onClick: onBack,
                            disabled: false
                        }}
                    />
                </ButtonWrapper>
            )}

            {/* Show AI enhancement options and action buttons after successful migration */}
            {displayState.isSuccess && (
                <>
                    <AIEnhancementSection>
                        <AIEnhancementTitle>
                            <Codicon name="sparkle" sx={{ fontSize: "14px", color: "var(--wso2-brand-accent)" }} />
                            AI Enhancement (Recommended)
                        </AIEnhancementTitle>
                        <RadioGroup role="radiogroup" aria-label="AI Enhancement mode">
                            <RadioOption selected={aiEnhancementEnabled} onClick={() => setAiEnhancementEnabled(true)}>
                                <RadioInput type="radio" name="ai-enhancement-mode-report" checked={aiEnhancementEnabled} onChange={() => setAiEnhancementEnabled(true)} />
                                <RadioContent>
                                    <RadioTitle>Enhance with AI</RadioTitle>
                                    <RadioDescription>AI will automatically resolve unmapped elements, fix build errors, and improve migration quality.</RadioDescription>
                                </RadioContent>
                            </RadioOption>
                            <RadioOption selected={!aiEnhancementEnabled} onClick={() => setAiEnhancementEnabled(false)}>
                                <RadioInput type="radio" name="ai-enhancement-mode-report" checked={!aiEnhancementEnabled} onChange={() => setAiEnhancementEnabled(false)} />
                                <RadioContent>
                                    <RadioTitle>Skip for Now – Enhance Later</RadioTitle>
                                    <RadioDescription>Keep the project as-is. You can trigger AI enhancement later from the WSO2 Integrator Copilot.</RadioDescription>
                                </RadioContent>
                            </RadioOption>
                        </RadioGroup>
                    </AIEnhancementSection>
                    <ButtonWrapper>
                        {aiEnhancementEnabled ? (
                            <Button appearance="primary" onClick={onStartAIEnhancement}>Start AI Enhancement</Button>
                        ) : (
                            <ActionButtons
                                primaryButton={{ text: "Open Project", onClick: onOpenProject }}
                                secondaryButton={{ text: "Done", onClick: onDone, disabled: false }}
                            />
                        )}
                    </ButtonWrapper>
                </>
            )}
        </>
    );
}
