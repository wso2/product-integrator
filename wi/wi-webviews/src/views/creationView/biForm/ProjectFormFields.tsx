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

import { useEffect, useState } from "react";
import { LocationSelector, TextField, CheckBox, LinkButton, ThemeColors, Codicon } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useVisualizerContext } from "../../../contexts/RpcContext";
import { sanitizePackageName, validatePackageName } from "./utils";
import { DirectorySelector } from "../../../components/DirectorySelector/DirectorySelector";
import { CollapsibleSection, PackageInfoSection, ProjectTypeSelector } from "./components";

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

const CheckboxContainer = styled.div`
    margin: 16px 0;
`;

const OptionalConfigRow = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    margin-bottom: 8px;
`;

const OptionalConfigButtonContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex-grow: 1;
    justify-content: flex-end;
`;

const OptionalConfigContent = styled.div`
    margin-top: 16px;
`;

const Description = styled.div`
    color: var(--vscode-list-deemphasizedForeground);
    margin-top: 4px;
    text-align: left;
`;

export const SectionDivider = styled.div`
    height: 1px;
    background: var(--vscode-panel-border);
    margin: 24px 0 20px 0;
`;

export const OptionalSectionsLabel = styled.div`
    font-size: 11px;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 12px;
`;

export interface BaseProjectFormData {
    integrationName: string;
    packageName: string;
    orgName: string;
    version: string;
    isLibrary: boolean;
}

/**
 * Form data for the AddProject form (adding to existing workspace)
 */
export interface AddProjectFormData extends BaseProjectFormData {
    workspaceName?: string;
}

/**
 * Form data for the main Project form (creating new project)
 */
export interface ProjectFormData extends BaseProjectFormData {
    path: string;
    createDirectory: boolean;
    createAsWorkspace: boolean;
    workspaceName: string;
}

export interface ProjectFormFieldsProps {
    formData: ProjectFormData;
    onFormDataChange: (data: Partial<ProjectFormData>) => void;
    integrationNameError?: string;
    pathError?: string;
    packageNameValidationError?: string;
}

export function ProjectFormFields({ formData, onFormDataChange, integrationNameError, pathError, packageNameValidationError }: ProjectFormFieldsProps) {
    const { rpcClient } = useVisualizerContext();
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [isWorkspaceSupported, setIsWorkspaceSupported] = useState(false);
    const [isProjectStructureExpanded, setIsProjectStructureExpanded] = useState(false);
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);

    const handleIntegrationName = (value: string) => {
        onFormDataChange({ integrationName: value });
        // Auto-populate package name if user hasn't manually edited it
        if (!packageNameTouched) {
            onFormDataChange({ packageName: sanitizePackageName(value) });
        }
    };

    const handlePackageName = (value: string) => {
        // Allow dots and other characters while typing
        const sanitized = sanitizePackageName(value);
        onFormDataChange({ packageName: sanitized });
        setPackageNameTouched(value.length > 0);
    };

    const handleProjectDirSelection = async () => {
        const projectDirectory = await rpcClient.getMainRpcClient().selectFileOrDirPath({});
        onFormDataChange({ path: projectDirectory.path });
    };

    const handleProjectStructureToggle = () => {
        setIsProjectStructureExpanded(!isProjectStructureExpanded);
    };

    useEffect(() => {
        (async () => {
            if (!formData.path) {
                const currentDir = await rpcClient.getMainRpcClient().getWorkspaceRoot();
                onFormDataChange({ path: currentDir.path });
            }
            const isWorkspaceSupported = await rpcClient
                .getMainRpcClient()
                .isSupportedSLVersion({ major: 2201, minor: 13, patch: 0 })
                .catch((err) => {
                    console.error("Failed to check workspace support:", err);
                    return false;
                });
            setIsWorkspaceSupported(isWorkspaceSupported);
        })();
    }, []);

    return (
        <>
            {/* Primary Fields - Always Visible */}
            <FieldGroup>
                <TextField
                    onTextChange={handleIntegrationName}
                    value={formData.integrationName}
                    label="Integration Name"
                    placeholder="Enter an integration name"
                    autoFocus={true}
                    required={true}
                    errorMsg={integrationNameError || ""}
                />
            </FieldGroup>

            <FieldGroup>
                <TextField
                    onTextChange={handlePackageName}
                    value={formData.packageName}
                    label="Package Name"
                    description="This will be used as the Ballerina package name for the integration."
                    errorMsg={packageNameValidationError || ""}
                />
            </FieldGroup>

            <FieldGroup>
                <DirectorySelector
                    id="project-folder-selector"
                    label="Select Path"
                    placeholder="Enter path or browse to select a folder..."
                    selectedPath={formData.path}
                    required={true}
                    onSelect={handleProjectDirSelection}
                    onChange={(value) => onFormDataChange({ path: value })}
                    errorMsg={pathError || undefined}
                />

                <CheckboxContainer>
                    <CheckBox
                        label={`Create a new folder using the ${formData.createAsWorkspace ? "workspace name" : "package name"}`}
                        checked={formData.createDirectory}
                        onChange={(checked) => onFormDataChange({ createDirectory: checked })}
                    />
                </CheckboxContainer>
            </FieldGroup>

            <SectionDivider />
            <OptionalSectionsLabel>Optional Configurations</OptionalSectionsLabel>

            {/* Project Structure Section */}
            {isWorkspaceSupported && (
                <CollapsibleSection
                    isExpanded={isProjectStructureExpanded}
                    onToggle={handleProjectStructureToggle}
                    icon="folder"
                    title="Project Structure"
                >
                    <CheckboxContainer>
                        <CheckBox
                            label="Create as workspace"
                            checked={formData.createAsWorkspace}
                            onChange={(checked) => onFormDataChange({ createAsWorkspace: checked })}
                        />
                        <Description>
                            Include this integration in a new workspace for multi-project management.
                        </Description>
                    </CheckboxContainer>
                    {formData.createAsWorkspace && (
                        <>
                            <FieldGroup>
                                <TextField
                                    onTextChange={(value) => onFormDataChange({ workspaceName: value })}
                                    value={formData.workspaceName}
                                    label="Workspace Name"
                                    placeholder="Enter workspace name"
                                    required={true}
                                />
                            </FieldGroup>

                            <ProjectTypeSelector
                                value={formData.isLibrary}
                                onChange={(isLibrary) => onFormDataChange({ isLibrary })}
                                note="This sets the type for your first project. You can add more projects or libraries to this workspace later."
                            />
                        </>
                    )}
                </CollapsibleSection>
            )}

            {/* Package Information Section */}
            <PackageInfoSection
                isExpanded={isPackageInfoExpanded}
                onToggle={() => setIsPackageInfoExpanded(!isPackageInfoExpanded)}
                data={{ orgName: formData.orgName, version: formData.version }}
                onChange={(data) => onFormDataChange(data)}
            />
        </>
    );
}
