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

import { ActionButtons, Codicon, Typography } from "@wso2/ui-toolkit";
import { useEffect, useState } from "react";
import { useVisualizerContext } from "../../contexts";
import { ValidateProjectFormErrorField } from "@wso2/wi-core";
import { BodyText } from "./styles";
import {
    AIEnhancementSection,
    AIEnhancementTitle,
    RadioGroup,
    RadioOption,
    RadioInput,
    RadioContent,
    RadioTitle,
    RadioDescription,
} from "./styles";
import { ProjectFormData, ProjectFormFields } from "../creationView/biForm/ProjectFormFields";
import { validatePackageName, validateProjectName, validateProjectHandle, validateOrgName } from "../creationView/biForm/utils";
import { MultiProjectFormData, MultiProjectFormFields } from "./components/MultiProjectFormFields";
import { ButtonWrapper } from "./styles";
import { ConfigureProjectFormProps } from "./types";

export function ConfigureProjectForm({ isMultiProject, onNext, onBack, selectedOrgName }: ConfigureProjectFormProps) {
    const { wsClient } = useVisualizerContext();
    const [singleIntegrationData, setSingleIntegrationData] = useState<ProjectFormData>({
        integrationName: "",
        packageName: "",
        path: "",
        createAsWorkspace: false,
        workspaceName: "",
        createWithinProject: false,
        withinProjectName: "",
        projectHandle: "",
        orgName: "",
        version: "",
        isLibrary: false,
    });

    const [multiProjectData, setMultiProjectData] = useState<MultiProjectFormData>({
        rootFolderName: "",
        path: "",
        createDirectory: true,
    });

    const [isValidating, setIsValidating] = useState(false);
    const [aiEnhancementEnabled, setAiEnhancementEnabled] = useState(true);
    const [pathError, setPathError] = useState<string | null>(null);
    const [folderNameError, setFolderNameError] = useState<string | null>(null);
    const [singleIntegrationNameError, setSingleIntegrationNameError] = useState<string | null>(null);
    const [singleIntegrationPathError, setSingleIntegrationPathError] = useState<string | null>(null);
    const [projectNameError, setProjectNameError] = useState<string | null>(null);
    const [singleIntegrationPackageNameError, setSingleIntegrationPackageNameError] = useState<string | null>(null);
    const [singleIntegrationProjectHandleError, setSingleIntegrationProjectHandleError] = useState<string | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [singleIntegrationCloudProjectNameError, setSingleIntegrationCloudProjectNameError] = useState<string | null>(null);
    const [singleIntegrationCloudProjectHandleError, setSingleIntegrationCloudProjectHandleError] = useState<string | null>(null);
    const selectedResourceTypeLabel = singleIntegrationData.isLibrary ? "Library" : "Integration";

    useEffect(() => {
        if (!selectedOrgName) {
            return;
        }
        setSingleIntegrationData((prev) => ({ ...prev, orgName: selectedOrgName }));
    }, [selectedOrgName]);

    const handleSingleProjectFormChange = (data: Partial<ProjectFormData>) => {
        setSingleIntegrationData(prev => ({ ...prev, ...data }));
        // Clear validation errors when form data changes
        if (singleIntegrationNameError) {
            setSingleIntegrationNameError(null);
        }
        if (orgNameError && data.orgName !== undefined) {
            setOrgNameError(null);
        }
        if (singleIntegrationPathError) {
            setSingleIntegrationPathError(null);
        }
        if (projectNameError) {
            setProjectNameError(null);
        }
        if (singleIntegrationPackageNameError) {
            setSingleIntegrationPackageNameError(null);
        }
        if (singleIntegrationProjectHandleError) {
            setSingleIntegrationProjectHandleError(null);
        }
    };

    const handleMultiProjectFormChange = (data: Partial<MultiProjectFormData>) => {
        setMultiProjectData(prev => ({ ...prev, ...data }));
        // Clear validation errors when form data changes
        if (pathError) {
            setPathError(null);
        }
        if (folderNameError) {
            setFolderNameError(null);
        }
    };

    const handleCreateSingleProject = async () => {
        setIsValidating(true);
        setSingleIntegrationNameError(null);
        setSingleIntegrationPathError(null);
        setProjectNameError(null);
        setSingleIntegrationPackageNameError(null);
        setSingleIntegrationProjectHandleError(null);
        setOrgNameError(null);

        // Validate required fields first
        let hasError = false;

        if (singleIntegrationData.integrationName.trim().length < 2) {
            setSingleIntegrationNameError(`${selectedResourceTypeLabel} name must be at least 2 characters`);
            hasError = true;
        }

        if (singleIntegrationData.packageName.trim().length < 2) {
            setSingleIntegrationPackageNameError("Package name must be at least 2 characters");
            hasError = true;
        } else {
            const packageNameError = validatePackageName(singleIntegrationData.packageName, singleIntegrationData.integrationName);
            if (packageNameError) {
                setSingleIntegrationPackageNameError(packageNameError);
                hasError = true;
            }
        }

        if (singleIntegrationData.createWithinProject) {
            const projectNameErr = validateProjectName(singleIntegrationData.withinProjectName.trim());
            if (projectNameErr) {
                setProjectNameError(projectNameErr);
                hasError = true;
            }
        }

        if (singleIntegrationData.createWithinProject) {
            const handleErr = validateProjectHandle(singleIntegrationData.projectHandle);
            if (handleErr) {
                setSingleIntegrationProjectHandleError(handleErr);
                hasError = true;
            }
        }

        const orgErr = validateOrgName(singleIntegrationData.orgName);
        if (orgErr) {
            setOrgNameError(orgErr);
            hasError = true;
        } else {
            setOrgNameError(null);
        }

        if (singleIntegrationCloudProjectNameError) {
            hasError = true;
        }

        if (singleIntegrationCloudProjectHandleError) {
            hasError = true;
        }

        if (singleIntegrationData.path.trim().length < 2) {
            setSingleIntegrationPathError(`Please select a path for your ${selectedResourceTypeLabel.toLowerCase()}`);
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            // Validate the project path
            const targetNameForValidation = singleIntegrationData.createWithinProject
                ? singleIntegrationData.projectHandle
                : singleIntegrationData.packageName;

            const validationResult = await wsClient.validateProjectPath({
                projectPath: singleIntegrationData.path,
                projectName: targetNameForValidation,
                createDirectory: true,
                createAsWorkspace: singleIntegrationData.createWithinProject,
            });

            if (!validationResult.isValid) {
                // Show error on the appropriate field
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setSingleIntegrationPathError(
                        validationResult.errorMessage || `Invalid ${selectedResourceTypeLabel.toLowerCase()} path`
                    );
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    if (singleIntegrationData.createWithinProject) {
                        setProjectNameError(validationResult.errorMessage || "Invalid project name");
                    } else {
                        setSingleIntegrationPackageNameError(
                            validationResult.errorMessage || `Invalid ${selectedResourceTypeLabel.toLowerCase()} name`
                        );
                    }
                }
                setIsValidating(false);
                return;
            }

            // If validation passes, proceed
            const payload = {
                projectName: singleIntegrationData.integrationName,
                packageName: singleIntegrationData.packageName,
                projectPath: singleIntegrationData.path,
                createDirectory: true,
                createAsWorkspace: singleIntegrationData.createWithinProject,
                workspaceName: singleIntegrationData.createWithinProject
                    ? singleIntegrationData.withinProjectName
                    : undefined,
                orgName: singleIntegrationData.orgName || undefined,
                version: singleIntegrationData.version || undefined,
                isLibrary: singleIntegrationData.isLibrary,
                projectHandle: singleIntegrationData.createWithinProject
                    ? singleIntegrationData.projectHandle
                    : undefined,
            };
            setIsValidating(false);
            onNext(payload, aiEnhancementEnabled);
        } catch (error) {
            setSingleIntegrationPathError("An error occurred during validation");
            setIsValidating(false);
        }
    };

    const handleCreateMultiProject = async () => {
        setIsValidating(true);
        setPathError(null);
        setFolderNameError(null);

        // Validate required fields first
        let hasError = false;

        if (!multiProjectData.path.trim() || multiProjectData.path.length < 2) {
            setPathError("Please select a path for your project");
            hasError = true;
        }

        if (multiProjectData.createDirectory && (!multiProjectData.rootFolderName.trim() || multiProjectData.rootFolderName.length < 1)) {
            setFolderNameError("Folder name is required when creating a new directory");
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            // Validate the project path
            const validationResult = await wsClient.validateProjectPath({
                projectPath: multiProjectData.path,
                projectName: multiProjectData.rootFolderName,
                createDirectory: multiProjectData.createDirectory,
            });

            if (!validationResult.isValid) {
                // Show error on the appropriate field
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setPathError(validationResult.errorMessage || "Invalid project path");
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    setFolderNameError(validationResult.errorMessage || "Invalid folder name");
                }
                setIsValidating(false);
                return;
            }

            // If validation passes, proceed
            onNext({
                projectName: multiProjectData.rootFolderName,
                packageName: multiProjectData.rootFolderName,
                projectPath: multiProjectData.path,
                createDirectory: multiProjectData.createDirectory,
                createAsWorkspace: false,
            }, aiEnhancementEnabled);
        } catch (error) {
            setPathError("An error occurred during validation");
            setIsValidating(false);
        }
    };

    return (
        <>
            {isMultiProject ? (
                <>
                    <Typography variant="h2">Configure Multi-Project Import</Typography>
                    <BodyText>Select the location where you want to save the migrated integrations.</BodyText>

                    <MultiProjectFormFields
                        formData={multiProjectData}
                        onFormDataChange={handleMultiProjectFormChange}
                        pathError={pathError || undefined}
                        folderNameError={folderNameError || undefined}
                    />

                    <AIEnhancementSection>
                        <AIEnhancementTitle>
                            <Codicon name="sparkle" sx={{ fontSize: "14px", color: "var(--wso2-brand-accent)" }} />
                            AI Enhancement
                        </AIEnhancementTitle>
                        <RadioGroup role="radiogroup" aria-label="AI Enhancement mode">
                            <RadioOption selected={aiEnhancementEnabled} onClick={() => setAiEnhancementEnabled(true)}>
                                <RadioInput type="radio" name="ai-enhancement-mode-multi" checked={aiEnhancementEnabled} onChange={() => setAiEnhancementEnabled(true)} />
                                <RadioContent>
                                    <RadioTitle>Enable AI Enhancement</RadioTitle>
                                    <RadioDescription>AI will automatically resolve unmapped elements, fix build errors, and improve the quality of the migration.</RadioDescription>
                                </RadioContent>
                            </RadioOption>
                            <RadioOption selected={!aiEnhancementEnabled} onClick={() => setAiEnhancementEnabled(false)}>
                                <RadioInput type="radio" name="ai-enhancement-mode-multi" checked={!aiEnhancementEnabled} onChange={() => setAiEnhancementEnabled(false)} />
                                <RadioContent>
                                    <RadioTitle>Skip for Now – Enhance Later</RadioTitle>
                                    <RadioDescription>Open the project as-is. You can trigger AI enhancement later from the BI Copilot.</RadioDescription>
                                </RadioContent>
                            </RadioOption>
                        </RadioGroup>
                    </AIEnhancementSection>

                    <ButtonWrapper>
                        <ActionButtons
                            primaryButton={{
                                text: isValidating
                                    ? "Validating..."
                                    : aiEnhancementEnabled
                                        ? "Create and Start AI Enhancement"
                                        : "Create and Open Project",
                                onClick: handleCreateMultiProject,
                                disabled: isValidating
                            }}
                            secondaryButton={{
                                text: "Back",
                                onClick: onBack,
                                disabled: false
                            }}
                        />
                    </ButtonWrapper>
                </>
            ) : (
                <>
                    <Typography variant="h2">Configure Your {selectedResourceTypeLabel}</Typography>
                    <BodyText>
                        Please provide the necessary details to create your {selectedResourceTypeLabel.toLowerCase()}.
                    </BodyText>

                    <ProjectFormFields
                        formData={singleIntegrationData}
                        onFormDataChange={handleSingleProjectFormChange}
                        integrationNameError={singleIntegrationNameError || undefined}
                        pathError={singleIntegrationPathError || undefined}
                        packageNameValidationError={singleIntegrationPackageNameError || undefined}
                        projectNameError={projectNameError || undefined}
                        projectHandleError={singleIntegrationProjectHandleError || undefined}
                        orgNameError={orgNameError ?? undefined}
                        onCloudProjectNameError={setSingleIntegrationCloudProjectNameError}
                        onCloudProjectHandleError={setSingleIntegrationCloudProjectHandleError}
                    />

                    <AIEnhancementSection>
                        <AIEnhancementTitle>
                            <Codicon name="sparkle" sx={{ fontSize: "14px", color: "var(--wso2-brand-accent)" }} />
                            AI Enhancement
                        </AIEnhancementTitle>
                        <RadioGroup role="radiogroup" aria-label="AI Enhancement mode">
                            <RadioOption selected={aiEnhancementEnabled} onClick={() => setAiEnhancementEnabled(true)}>
                                <RadioInput type="radio" name="ai-enhancement-mode-single" checked={aiEnhancementEnabled} onChange={() => setAiEnhancementEnabled(true)} />
                                <RadioContent>
                                    <RadioTitle>Enable AI Enhancement</RadioTitle>
                                    <RadioDescription>AI will automatically resolve unmapped elements, fix build errors, and improve the quality of the migration.</RadioDescription>
                                </RadioContent>
                            </RadioOption>
                            <RadioOption selected={!aiEnhancementEnabled} onClick={() => setAiEnhancementEnabled(false)}>
                                <RadioInput type="radio" name="ai-enhancement-mode-single" checked={!aiEnhancementEnabled} onChange={() => setAiEnhancementEnabled(false)} />
                                <RadioContent>
                                    <RadioTitle>Skip for Now – Enhance Later</RadioTitle>
                                    <RadioDescription>Open the project as-is. You can trigger AI enhancement later from the BI Copilot.</RadioDescription>
                                </RadioContent>
                            </RadioOption>
                        </RadioGroup>
                    </AIEnhancementSection>

                    <ButtonWrapper>
                        <ActionButtons
                            primaryButton={{
                                text: isValidating
                                    ? "Validating..."
                                    : aiEnhancementEnabled
                                        ? "Create and Start AI Enhancement"
                                        : `Create and Open ${selectedResourceTypeLabel}`,
                                onClick: handleCreateSingleProject,
                                disabled: isValidating
                            }}
                            secondaryButton={{
                                text: "Back",
                                onClick: onBack,
                                disabled: false
                            }}
                        />
                    </ButtonWrapper>
                </>
            )}
        </>
    );
}
