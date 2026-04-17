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

import { ActionButtons, Button, Codicon, Typography } from "@wso2/ui-toolkit";
import { useEffect, useMemo, useState } from "react";
import { MigrationLogs } from "./components/MigrationLogs";
import { MigrationStatusContent } from "./components/MigrationStatusContent";
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
    StepWrapper,
} from "./styles";
import { MigrationProgressProps, MigrationReportJSON } from "./types";
import { getMigrationDisplayState, getMigrationProgressHeaderData, handleMultiProjectReportOpening } from "./utils";
import { useVisualizerContext } from "../../contexts";

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

    // Parse migration report JSON when available
    const parsedReportData = useMemo(() => {
        if (!migrationResponse?.jsonReport) return null;
        try {
            const reportData = typeof migrationResponse.jsonReport === "string"
                ? JSON.parse(migrationResponse.jsonReport)
                : migrationResponse.jsonReport;
            return reportData as MigrationReportJSON;
        } catch (error) {
            console.error("Failed to parse migration report JSON:", error);
        }
    }, [migrationResponse?.jsonReport]);

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

    const handleViewReport = async () => {
        console.log("View report clicked", { migrationResponse });
        try {
            if (migrationResponse?.report) {
                handleMultiProjectReportOpening(migrationResponse, projects, wsClient);
                console.log("Report found, opening via bridge request...");
                wsClient.openMigrationReport({
                    reportContent: migrationResponse.report,
                    fileName: "migration-report.html",
                });
            }
        } catch (error) {
            console.error("Failed to open migration report:", error);
        }
    };

    const handleSaveReport = async () => {
        console.log("Save report clicked", { migrationResponse, isMultiProject, projects });
        try {
            if (!migrationResponse?.report) {
                console.error("No report content available to save");
                return;
            }

            // Check if this is a multi-project migration
            const hasMultipleProjects = isMultiProject && projects && projects.length > 0;

            if (hasMultipleProjects) {
                // For multi-project scenarios, extract reports from projects array
                const projectReports: { [projectName: string]: string } = {};

                projects.forEach((project) => {
                    if (project.projectName && project.report) {
                        projectReports[project.projectName] = project.report;
                    }
                });

                console.log("Saving multi-project reports via VSCode folder dialog...", { projectReports });
                wsClient.saveMigrationReport({
                    reportContent: migrationResponse.report,
                    defaultFileName: "aggregate_migration_report.html",
                    projectReports: projectReports,
                });
            } else {
                // Single project - use simple save dialog
                console.log("Saving single project report via VSCode save dialog...");
                wsClient.saveMigrationReport({
                    reportContent: migrationResponse.report,
                    defaultFileName: "migration-report.html",
                });
            }
        } catch (error) {
            console.error("Failed to save migration report:", error);
        }
    };

    const displayState = getMigrationDisplayState(migrationCompleted, migrationSuccessful, !!parsedReportData);
    const { headerText, headerDesc } = getMigrationProgressHeaderData(displayState, isMultiProject);

    return (
        <>
            <div>
                <Typography variant="h2">{headerText}</Typography>
                <BodyText>{headerDesc}</BodyText>
            </div>
            <StepWrapper>
                <MigrationStatusContent
                    state={displayState}
                    migrationState={migrationState}
                    migrationResponse={migrationResponse}
                    parsedReportData={parsedReportData}
                    onViewReport={handleViewReport}
                    onSaveReport={handleSaveReport}
                    isMultiProject={isMultiProject}
                />

            </StepWrapper>

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
                            AI Enhancement
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
                                    <RadioDescription>Open the project as-is. You can trigger AI enhancement later from the BI Copilot.</RadioDescription>
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
