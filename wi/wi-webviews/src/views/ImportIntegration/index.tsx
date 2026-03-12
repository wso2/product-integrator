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

import { Icon, Typography } from "@wso2/ui-toolkit";
import { Stepper, StepperContainer } from "@wso2/ui-toolkit/lib/components/Stepper/Stepper";
import { useEffect, useState } from "react";
import { ConfigureProjectForm } from "./ConfigureProjectForm";
import { ImportIntegrationForm } from "./ImportIntegrationForm";
import { MigrationProgressView } from "./MigrationProgressView";
import {
    ContentPanel,
    FormContainer,
    HeaderSubtitle,
    HeaderText,
    IconButton,
    PageBackdrop,
    PageContainer,
    StepperWrapper,
    TitleContainer,
} from "./styles";
import { FinalIntegrationParams, ProjectMigrationResult, ProjectRequest } from "./types";
import { useVisualizerContext } from "../../contexts";
import { DownloadProgress, ImportIntegrationResponse, ImportIntegrationWsRequest, MigrationTool } from "@wso2/wi-core";
import { MigrateRequest } from "@wso2/wi-core";

export function ImportIntegration({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();

    // State managed by the parent component
    const [step, setStep] = useState(0);
    const [toolPullProgress, setToolPullProgress] = useState<DownloadProgress | null>(null);
    const [migrationToolState, setMigrationToolState] = useState<string | null>(null);
    const [migrationToolLogs, setMigrationToolLogs] = useState<string[]>([]);
    const [migratedProjects, setMigratedProjects] = useState<ProjectMigrationResult[]>([]);
    const [pullingTool, setPullingTool] = useState(false);
    const [selectedIntegration, setSelectedIntegration] = useState<MigrationTool | null>(null);
    const [migrationTools, setMigrationTools] = useState<MigrationTool[]>([]);
    const [importParams, setImportParams] = useState<FinalIntegrationParams | null>(null);
    const [migrationCompleted, setMigrationCompleted] = useState(false);
    const [migrationSuccessful, setMigrationSuccessful] = useState(false);
    const [migrationResponse, setMigrationResponse] = useState<ImportIntegrationResponse | null>(null);

    const defaultSteps = ["Select Source Project", "Migration Status", "Create and Open Project"];

    const isMultiProject = migratedProjects.length! > 0;

    const pullIntegrationTool = (commandName: string, version: string) => {
        setPullingTool(true);
        wsClient.pullMigrationTool({
            toolName: commandName,
            version: version,
        });
    };

    // Handler to begin the import and switch to the migration progress view
    const handleStartImport = (
        importParams: FinalIntegrationParams,
        selectedIntegration: MigrationTool,
        toolPullProgress: DownloadProgress
    ) => {
        if (selectedIntegration.needToPull && toolPullProgress && toolPullProgress.step === -1) {
            console.error("Cannot start import, tool download failed.");
        }
        setStep(1);
        console.log("Starting import with params:", importParams);

        const params: ImportIntegrationWsRequest = {
            packageName: "",
            commandName: selectedIntegration.commandName,
            sourcePath: importParams.importSourcePath,
            parameters: importParams.parameters,
        };
        wsClient
            
            .importIntegration(params)
            .then((response) => {
                setMigrationCompleted(true);
                setMigrationResponse(response);
                if (!response.error) {
                    setMigrationSuccessful(true);
                }
            })
            .catch((error) => {
                console.error("Error during TIBCO import:", error);
            });
    };

    const handleCreateIntegrationFiles = (project: ProjectRequest) => {
        console.log("Creating integration files with params:", importParams);
        if (migrationResponse) {
            const params: MigrateRequest = {
                project: project,
                textEdits: migrationResponse.textEdits,
                projects: migratedProjects,
            };
            wsClient.migrateProject(params);
        }
    };

    const handleStepBack = () => {
        if (step === 1) {
            setMigrationToolState(null);
            setMigrationToolLogs([]);
            setMigrationCompleted(false);
            setMigrationSuccessful(false);
            setMigrationResponse(null);
            setMigratedProjects([]);
        }

        setStep(step - 1);
    };

    const getMigrationTools = () => {
        wsClient
            
            .getMigrationTools()
            .then((response) => {
                console.log("Available migration tools:", response.tools);
                setMigrationTools(response.tools);
            });
    };

    useEffect(() => {
        getMigrationTools();

        wsClient.onDownloadProgress((progressUpdate) => {
            setToolPullProgress(progressUpdate);
            if (progressUpdate.success) {
                setPullingTool(false);
            }

            if (progressUpdate.step === -1) {
                setPullingTool(false);
                wsClient.showErrorMessage({ message: progressUpdate.message })
            }
        });

        wsClient.onMigrationToolStateChanged((state) => {
            setMigrationToolState(state);
        });

        wsClient.onMigrationToolLogs((log) => {
            setMigrationToolLogs((prevLogs) => [...prevLogs, log]);
        });

        wsClient.onMigratedProject((project) => {
            setMigratedProjects((prevProjects) => [...prevProjects, project]);
        });
    }, [wsClient]);

    useEffect(() => {
        if (selectedIntegration?.needToPull && toolPullProgress && toolPullProgress.success && importParams) {
            handleStartImport(importParams, selectedIntegration, toolPullProgress);
        }
    }, [toolPullProgress, importParams, selectedIntegration]);

    return (
        <PageBackdrop>
            <PageContainer>
                <TitleContainer>
                    <IconButton type="button" onClick={onBack} title="Go back">
                        <Icon
                            name="arrow-left"
                            isCodicon
                            sx={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            iconSx={{ color: "var(--vscode-foreground)", fontSize: "16px", lineHeight: 1 }}
                        />
                    </IconButton>
                    <HeaderText>
                        <Typography variant="h2" sx={{ margin: 0, fontWeight: 600 }}>
                            Migrate External Integration
                        </Typography>
                        <HeaderSubtitle>
                            Convert your MuleSoft or TIBCO project into a new integration project.
                        </HeaderSubtitle>
                    </HeaderText>
                </TitleContainer>
                <ContentPanel>
                    <StepperWrapper>
                        <StepperContainer>
                            <Stepper alignment="flex-start" steps={defaultSteps} currentStep={step} />
                        </StepperContainer>
                    </StepperWrapper>
                    <FormContainer>
                        {step === 0 && (
                            <ImportIntegrationForm
                                selectedIntegration={selectedIntegration}
                                migrationTools={migrationTools}
                                setImportParams={setImportParams}
                                pullIntegrationTool={pullIntegrationTool}
                                pullingTool={pullingTool}
                                toolPullProgress={toolPullProgress}
                                onSelectIntegration={setSelectedIntegration}
                                handleStartImport={handleStartImport}
                                onBack={onBack}
                            />
                        )}
                        {step === 1 && (
                            <MigrationProgressView
                                migrationState={migrationToolState}
                                migrationLogs={migrationToolLogs}
                                migrationCompleted={migrationCompleted}
                                migrationSuccessful={migrationSuccessful}
                                migrationResponse={migrationResponse}
                                projects={migratedProjects}
                                isMultiProject={isMultiProject}
                                onNext={() => setStep(2)}
                                onBack={handleStepBack}
                            />
                        )}
                        {step === 2 && (
                            <ConfigureProjectForm
                                isMultiProject={isMultiProject}
                                onNext={handleCreateIntegrationFiles}
                                onBack={handleStepBack}
                            />
                        )}
                    </FormContainer>
                </ContentPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
