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
import { useEffect, useRef, useState } from "react";
import { ConfigureProjectForm } from "./ConfigureProjectForm";
import { ImportIntegrationForm } from "./ImportIntegrationForm";
import { MigrationProgressView } from "./MigrationProgressView";
import { WizardAIEnhancementView } from "./WizardAIEnhancementView";
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
import { useCloudContext } from "../../providers";
import { DownloadProgress, ImportIntegrationResponse, ImportIntegrationWsRequest, MigrationTool } from "@wso2/wi-core";
import { MigrateRequest } from "@wso2/wi-core";
import { FormPanelHeader, HeaderRow } from "../shared/FormPageLayout";

export function ImportIntegration({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const { contextState } = useCloudContext();
    const selectedOrgName = contextState?.selected?.org?.name;

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
    const [aiEnhancementActive, setAiEnhancementActive] = useState(false);
    const [storedProjectRequest, setStoredProjectRequest] = useState<ProjectRequest | null>(null);
    const migrationStartedRef = useRef(false);

    const defaultSteps = aiEnhancementActive
        ? ["Configure Source", "Configure New Integration", "Static Migration Status", "AI Enhancement"]
        : ["Configure Source", "Configure New Integration", "Static Migration Status"];

    // isMultiProject for ConfigureProjectForm is derived from the source config (step 0 selection)
    const boolParamKey = selectedIntegration?.parameters.find(p => p.valueType === "boolean")?.key;
    const isMultiProjectFromConfig = boolParamKey ? importParams?.parameters?.[boolParamKey] === true : false;
    // isMultiProject for MigrationProgressView is derived from actual dry-run results
    const isMultiProject = migratedProjects.length > 0;

    const pullIntegrationTool = (commandName: string, version: string) => {
        setPullingTool(true);
        wsClient.pullMigrationTool({
            toolName: commandName,
            version: version,
        });
    };

    // Runs the static CLI migration (importIntegration) and stores the report.
    // migrateProject (file writing + folder open) is deferred to the user's choice at step 2.
    const handleStartImport = async (
        params: FinalIntegrationParams,
        integration: MigrationTool,
        project: ProjectRequest
    ) => {
        if (integration.needToPull && toolPullProgress && toolPullProgress.step === -1) {
            console.error("Cannot start import, tool download failed.");
            return;
        }
        console.log("Starting import with params:", params);

        const wsParams: ImportIntegrationWsRequest = {
            packageName: "",
            commandName: integration.commandName,
            sourcePath: params.importSourcePath,
            orgName: selectedOrgName,
            parameters: params.parameters,
        };
        try {
            const response = await wsClient.importIntegration(wsParams);
            setMigrationCompleted(true);
            setMigrationResponse(response);
            if (!response.error) {
                setMigrationSuccessful(true);
            }
        } catch (error) {
            console.error("Error during migration:", error);
            setMigrationCompleted(true);
            setMigrationSuccessful(false);
        }
    };

    const handleConfigureDestinationDone = (project: ProjectRequest, _aiFeatureUsed: boolean) => {
        if (!importParams || !selectedIntegration) return;
        setStoredProjectRequest(project);
        // Advance to migration step; import starts automatically when step 2 renders.
        setStep(2);
    };

    const handleStepBack = () => {
        if (step === 2) {
            migrationStartedRef.current = false;
            setMigrationToolState(null);
            setMigrationToolLogs([]);
            setMigrationCompleted(false);
            setMigrationSuccessful(false);
            setMigrationResponse(null);
            setMigratedProjects([]);
        }

        setStep(step - 1);
    };

    const handleAIEnhancement = async () => {
        if (!importParams || !storedProjectRequest || !migrationResponse) return;
        await wsClient.migrateProject({
            project: storedProjectRequest,
            textEdits: migrationResponse.textEdits,
            projects: migratedProjects,
            aiFeatureUsed: true,
            sourcePath: importParams.importSourcePath,
        });
        setAiEnhancementActive(true);
        setStep(3);
    };

    const handleOpenProject = async () => {
        if (!importParams || !storedProjectRequest || !migrationResponse) return;
        // aiFeatureUsed: false → extension calls vscode.openFolder immediately (VS Code reloads)
        await wsClient.migrateProject({
            project: storedProjectRequest,
            textEdits: migrationResponse.textEdits,
            projects: migratedProjects,
            aiFeatureUsed: false,
            sourcePath: importParams.importSourcePath,
        });
    };

    const handleDone = async () => {
        if (!importParams || !storedProjectRequest || !migrationResponse) return;
        // aiFeatureUsed: true → project created but folder not opened; user can enhance later
        await wsClient.migrateProject({
            project: storedProjectRequest,
            textEdits: migrationResponse.textEdits,
            projects: migratedProjects,
            aiFeatureUsed: true,
            sourcePath: importParams.importSourcePath,
        });
        onBack?.();
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
        // Start the static migration when step 2 is reached and the tool (if needToPull) is ready.
        // migrationStartedRef prevents a double-start if multiple deps fire simultaneously.
        if (
            step === 2 &&
            !migrationStartedRef.current &&
            importParams &&
            selectedIntegration &&
            storedProjectRequest &&
            (!selectedIntegration.needToPull || toolPullProgress?.success)
        ) {
            migrationStartedRef.current = true;
            handleStartImport(importParams, selectedIntegration, storedProjectRequest);
        }
    }, [step, toolPullProgress?.success, storedProjectRequest]);

    return (
        <PageBackdrop>
            <PageContainer>
                <ContentPanel>
                    <FormPanelHeader>
                        <HeaderRow>
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
                                    Convert your MuleSoft or TIBCO projects into new WSO2 Integrator projects.
                                </HeaderSubtitle>
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>
                    <FormContainer>
                        <StepperWrapper>
                            <StepperContainer>
                                <Stepper alignment="flex-start" steps={defaultSteps} currentStep={step} />
                            </StepperContainer>
                        </StepperWrapper>
                        {step === 0 && (
                            <ImportIntegrationForm
                                selectedIntegration={selectedIntegration}
                                migrationTools={migrationTools}
                                setImportParams={setImportParams}
                                pullIntegrationTool={pullIntegrationTool}
                                pullingTool={pullingTool}
                                toolPullProgress={toolPullProgress}
                                onSelectIntegration={setSelectedIntegration}
                                onNext={() => setStep(1)}
                                onBack={onBack}
                            />
                        )}
                        {step === 1 && (
                            <ConfigureProjectForm
                                isMultiProject={isMultiProjectFromConfig}
                                onNext={handleConfigureDestinationDone}
                                onBack={handleStepBack}
                                selectedOrgName={selectedOrgName}
                            />
                        )}
                        {step === 2 && (
                            <MigrationProgressView
                                migrationState={migrationToolState}
                                migrationLogs={migrationToolLogs}
                                migrationCompleted={migrationCompleted}
                                migrationSuccessful={migrationSuccessful}
                                migrationResponse={migrationResponse}
                                projects={migratedProjects}
                                isMultiProject={isMultiProject}
                                onStartAIEnhancement={handleAIEnhancement}
                                onDone={handleDone}
                                onOpenProject={handleOpenProject}
                                onBack={handleStepBack}
                            />
                        )}
                        {step === 3 && (
                            <WizardAIEnhancementView
                                wsClient={wsClient}
                                projectCount={migratedProjects.length}
                                onFinish={onBack ?? (() => { })}
                            />
                        )}
                    </FormContainer>
                </ContentPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
