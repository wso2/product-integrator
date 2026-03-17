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

import { useState } from "react";
import { Button } from "@wso2/ui-toolkit";
import { useVisualizerContext } from "../../../contexts";
import {
    PageWrapper,
    FormContainer,
    ScrollableContent,
    ButtonWrapper
} from "./styles";
import { ProjectFormFields } from "./ProjectFormFields";
import { ProjectFormData } from "./types";
import { validatePackageName } from "./utils";
import { ValidateProjectFormErrorField } from "@wso2/wi-core";

export function BIProjectForm() {
    const { wsClient } = useVisualizerContext();
    const [formData, setFormData] = useState<ProjectFormData>({
        integrationName: "",
        packageName: "",
        path: "",
        createAsWorkspace: false,
        workspaceName: "",
        createWithinProject: false,
        withinProjectName: "",
        orgName: "",
        version: "",
        isLibrary: false,
    });
    const [isValidating, setIsValidating] = useState(false);
    const [integrationNameError, setIntegrationNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [packageNameValidationError, setPackageNameValidationError] = useState<string | null>(null);
    const [projectNameError, setProjectNameError] = useState<string | null>(null);
    const createActionLabel = "Create Integration";


    const handleFormDataChange = (data: Partial<ProjectFormData>) => {
        setFormData(prev => ({ ...prev, ...data }));
        // Clear validation errors when form data changes
        if (integrationNameError) {
            setIntegrationNameError(null);
        }
        if (pathError) {
            setPathError(null);
        }
        if (packageNameValidationError) {
            setPackageNameValidationError(null);
        }
        if (projectNameError) {
            setProjectNameError(null);
        }
    };

    const handleCreateProject = async () => {
        setIsValidating(true);
        setIntegrationNameError(null);
        setPathError(null);
        setPackageNameValidationError(null);
        setProjectNameError(null);

        let hasError = false;

        if (formData.integrationName.length < 2) {
            setIntegrationNameError(`Integration name must be at least 2 characters`);
            hasError = true;
        }

        if (formData.packageName.length < 2) {
            setPackageNameValidationError("Package name must be at least 2 characters");
            hasError = true;
        } else {
            const packageNameError = validatePackageName(formData.packageName, formData.integrationName);
            if (packageNameError) {
                setPackageNameValidationError(packageNameError);
                hasError = true;
            }
        }

        if (formData.path.length < 2) {
            setPathError("Please select a path for your integration");
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            const targetNameForValidation = formData.createWithinProject
                ? formData.withinProjectName
                : formData.packageName;

            const validationResult = await wsClient.validateProjectPath({
                projectPath: formData.path,
                projectName: targetNameForValidation,
                createDirectory: true,
                createAsWorkspace: formData.createWithinProject,
            });

            if (!validationResult.isValid) {
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setPathError(validationResult.errorMessage || "Invalid integration path");
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    if (formData.createWithinProject) {
                        setProjectNameError(validationResult.errorMessage || "Invalid project name");
                    } else {
                        setPackageNameValidationError(
                            validationResult.errorMessage || "Invalid integration name"
                        );
                    }
                }
                setIsValidating(false);
                return;
            }

            await wsClient.createBIProject({
                projectName: formData.integrationName,
                packageName: formData.packageName,
                projectPath: formData.path,
                createDirectory: true,
                createAsWorkspace: formData.createWithinProject,
                workspaceName: formData.createWithinProject ? formData.withinProjectName : undefined,
                orgName: formData.orgName || undefined,
                version: formData.version || undefined
            });
        } catch (error) {
            setPathError("An error occurred during validation");
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <PageWrapper>
            <FormContainer>
                <ScrollableContent>
                    <ProjectFormFields
                        formData={formData}
                        onFormDataChange={handleFormDataChange}
                        integrationNameError={integrationNameError || undefined}
                        pathError={pathError || undefined}
                        projectNameError={projectNameError || undefined}
                        packageNameValidationError={packageNameValidationError || undefined}
                    />
                </ScrollableContent>

                <ButtonWrapper>
                    <Button
                        disabled={isValidating}
                        onClick={handleCreateProject}
                        appearance="primary"
                    >
                        {isValidating ? "Validating..." : createActionLabel}
                    </Button>
                </ButtonWrapper>
            </FormContainer>
        </PageWrapper>
    );
}
