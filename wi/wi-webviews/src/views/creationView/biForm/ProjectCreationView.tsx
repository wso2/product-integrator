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

import { useState, useEffect } from "react";
import { Button, Icon, TextField } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useVisualizerContext } from "../../../contexts";
import { useCloudContext } from "../../../providers";
import { DirectorySelector } from "../../../components/DirectorySelector/DirectorySelector";
import { joinPath } from "./utils";
import { ValidateProjectFormErrorField } from "@wso2/wi-core";
import {
    PageBackdrop,
    PageContainer,
    HeaderRow,
    BackButton,
    HeaderText,
    HeaderTitle,
    HeaderSubtitle,
    FormPanel,
    FormPanelHeader,
    FormPanelTitle,
    FormPanelSubtitle,
    FormBody,
    FormContent,
    FormFooter,
} from "../../shared/FormPageLayout";
import { ResolvedPathText } from "../biForm/styles";

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

const validateProjectName = (name: string): string | null => {
    if (!name || name.length === 0) {
        return "Project name is required";
    }
    if (!/^[a-zA-Z]/.test(name)) {
        return "Project name must start with an alphabetic letter";
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
        return "Project name cannot contain special characters";
    }
    const letterCount = (name.match(/[a-zA-Z]/g) || []).length;
    if (letterCount < 3) {
        return "Project name must contain at least three letters";
    }
    return null;
};

export function ProjectCreationView({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const { authState } = useCloudContext();
    const organizations = authState?.userInfo?.organizations as Array<{ id?: any; handle: string; name: string }> | undefined;
    const [isValidating, setIsValidating] = useState(false);
    const [projectNameError, setProjectNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [defaultPath, setDefaultPath] = useState("");
    const [formData, setFormData] = useState({
        projectName: "Default",
        path: "",
        orgName: "",
        version: "",
    });

    useEffect(() => {
        (async () => {
            try {
                const { path: workspacePath } = await wsClient.getWorkspaceRoot();
                const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                setDefaultPath(dp);
                setFormData(prev => ({ ...prev, path: dp }));
            } catch (error) {
                console.error("Failed to fetch default path:", error);
            }
        })();
    }, [wsClient]);

    useEffect(() => {
        if (formData.orgName) return;
        if (organizations && organizations.length > 0) {
            setFormData(prev => ({ ...prev, orgName: organizations[0].handle }));
        } else {
            wsClient.getDefaultOrgName().then(({ orgName }) => {
                setFormData(prev => ({ ...prev, orgName }));
            }).catch((error) => {
                console.error("Failed to fetch default organization name:", error);
            });
        }
    }, [organizations, wsClient, formData.orgName]);

    const resolvedPath = joinPath(formData.path || defaultPath, formData.projectName);

    const handlePathSelection = async () => {
        try {
            const result = await wsClient.selectFileOrDirPath({ startPath: formData.path || defaultPath });
            if (!result.path) return;
            if (pathError) setPathError(null);
            setFormData(prev => ({ ...prev, path: result.path }));
        } catch (error) {
            console.error("Failed to select path:", error);
            setPathError("Failed to select path. Please try again.");
        }
    };

    const handleCreate = async () => {
        setIsValidating(true);
        setProjectNameError(null);
        setPathError(null);

        let hasError = false;

        const nameError = validateProjectName(formData.projectName);
        if (nameError) {
            setProjectNameError(nameError);
            hasError = true;
        }

        if (formData.path.length < 2) {
            setPathError("Please select a path for your project");
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            const validationResult = await wsClient.validateProjectPath({
                projectPath: formData.path,
                projectName: formData.projectName,
                createDirectory: true,
                createAsWorkspace: true,
            });

            if (!validationResult.isValid) {
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setPathError(validationResult.errorMessage || "Invalid project path");
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    setProjectNameError(validationResult.errorMessage || "Invalid project name");
                }
                setIsValidating(false);
                return;
            }

            await wsClient.createBIProject({
                workspaceName: formData.projectName,
                projectPath: formData.path,
                createDirectory: true,
                createAsWorkspace: true,
                orgName: formData.orgName || undefined,
                version: formData.version || undefined,
            });
        } catch (error) {
            setPathError("An error occurred during validation");
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <PageBackdrop>
            <PageContainer>
                <HeaderRow>
                    <BackButton type="button" onClick={onBack} title="Go back">
                        <Icon
                            name="arrow-left"
                            isCodicon
                            sx={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            iconSx={{ color: "var(--vscode-foreground)", fontSize: "16px", lineHeight: 1 }}
                        />
                    </BackButton>
                    <HeaderText>
                        <HeaderTitle variant="h2">Create Project</HeaderTitle>
                        <HeaderSubtitle>
                            Set up a new multi-integration workspace project.
                        </HeaderSubtitle>
                    </HeaderText>
                </HeaderRow>

                <FormPanel>
                    <FormPanelHeader>
                        <FormPanelTitle>Project Details</FormPanelTitle>
                        <FormPanelSubtitle>Configure the name and location of your project.</FormPanelSubtitle>
                    </FormPanelHeader>
                    <FormBody>
                        <FormContent>
                            <FieldGroup>
                                <TextField
                                    onTextChange={(value) => {
                                        if (projectNameError) setProjectNameError(null);
                                        setFormData(prev => ({ ...prev, projectName: value }));
                                    }}
                                    value={formData.projectName}
                                    label="Project Name"
                                    placeholder="Enter a project name"
                                    autoFocus={true}
                                    required={true}
                                    errorMsg={projectNameError || ""}
                                />
                            </FieldGroup>

                            <FieldGroup>
                                <DirectorySelector
                                    id="project-folder-selector"
                                    label="Select Path"
                                    placeholder="Browse to select a folder..."
                                    selectedPath={formData.path || defaultPath}
                                    required={true}
                                    onSelect={handlePathSelection}
                                    onChange={(value) => {
                                        if (pathError) setPathError(null);
                                        setFormData(prev => ({ ...prev, path: value }));
                                    }}
                                    errorMsg={pathError || undefined}
                                />
                                {resolvedPath && resolvedPath !== (formData.path || defaultPath) && (
                                    <ResolvedPathText>Will be created at: {resolvedPath}</ResolvedPathText>
                                )}
                            </FieldGroup>

                            <FormFooter>
                                <Button
                                    disabled={isValidating}
                                    onClick={handleCreate}
                                    appearance="primary"
                                >
                                    {isValidating ? "Validating..." : "Create Project"}
                                </Button>
                            </FormFooter>
                        </FormContent>
                    </FormBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
