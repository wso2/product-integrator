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
import { TextField, CheckBox } from "@wso2/ui-toolkit";
import { DirectorySelector } from "../../../components/DirectorySelector/DirectorySelector";
import { useVisualizerContext } from "../../../contexts/WsContext";
import {
    FieldGroup,
    CheckboxContainer,
    Description,
    SectionDivider,
    OptionalSectionsLabel,
} from "./styles";
import { CollapsibleSection, PackageInfoSection } from "./components";
import { sanitizePackageName, validatePackageName, validateOrgName, joinPath } from "./utils";
import { ProjectFormData } from "./types";

// Re-export for backwards compatibility
export type { ProjectFormData } from "./types";

export interface ProjectFormFieldsProps {
    formData: ProjectFormData;
    onFormDataChange: (data: Partial<ProjectFormData>) => void;
    integrationNameError?: string;
    pathError?: string;
    projectNameError?: string;
    packageNameValidationError?: string;
}

export function ProjectFormFields({
    formData,
    onFormDataChange,
    integrationNameError,
    pathError,
    projectNameError,
    packageNameValidationError,
}: ProjectFormFieldsProps) {
    const { wsClient } = useVisualizerContext();
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [isProjectModeSupported, setIsProjectModeSupported] = useState(false);
    const [isProjectSettingsExpanded, setIsProjectSettingsExpanded] = useState(false);
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const [defaultPath, setDefaultPath] = useState("");
    const [pathTouched, setPathTouched] = useState(false);

    const pathName = formData.createAsWorkspace ? formData.workspaceName : formData.packageName;
    const displayedPath = pathTouched ? formData.path : joinPath(formData.path || defaultPath, pathName);

    const handleIntegrationName = (value: string) => {
        onFormDataChange({ integrationName: value });
        setPathTouched(false);
        // Auto-populate package name if user hasn't manually edited it
        if (!packageNameTouched) {
            onFormDataChange({ packageName: sanitizePackageName(value) });
        }
    };

    const handleProjectDirSelection = async () => {
        const selectedDirectory = await wsClient.selectFileOrDirPath({ startPath: formData.path || defaultPath });
        if (!selectedDirectory.path) return;
        setPathTouched(false);
        onFormDataChange({ path: selectedDirectory.path });
    };

    const handleProjectSettingsToggle = () => {
        setIsProjectSettingsExpanded(!isProjectSettingsExpanded);
    };

    useEffect(() => {
        (async () => {
            // Set default path if not already set
            if (!formData.path) {
                const { path: workspacePath } = await wsClient.getWorkspaceRoot();
                const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                setDefaultPath(dp);
                onFormDataChange({ path: dp });
            }

            // Set default org name if not already set
            if (!formData.orgName) {
                try {
                    const { orgName } = await wsClient.getDefaultOrgName();
                    onFormDataChange({ orgName });
                } catch (error) {
                    console.error("Failed to fetch default org name:", error);
                }
            }

            const projectModeSupported = await wsClient
                .isSupportedSLVersion({ major: 2201, minor: 13, patch: 0 })
                .catch((err) => {
                    console.error("Failed to check project mode support:", err);
                    return false;
                });
            setIsProjectModeSupported(projectModeSupported);
        })();
    }, []);

    useEffect(() => {
        const error = validatePackageName(formData.packageName, formData.integrationName);
        setPackageNameError(error);
    }, [formData.packageName, formData.integrationName]);

    // Validation effect for org name
    useEffect(() => {
        const orgError = validateOrgName(formData.orgName);
        setOrgNameError(orgError);
    }, [formData.orgName]);

    return (
        <>
            {/* Primary Fields - Always Visible */}
            <FieldGroup>
                <TextField
                    onTextChange={handleIntegrationName}
                    value={formData.integrationName}
                    label={`Integration Name`}
                    placeholder={`Enter an integration name`}
                    autoFocus={true}
                    required={true}
                    errorMsg={integrationNameError || ""}
                />
            </FieldGroup>

            <FieldGroup>
                <DirectorySelector
                    id="project-folder-selector"
                    label="Select Path"
                    placeholder="Browse to select a folder..."
                    selectedPath={displayedPath}
                    required={true}
                    onSelect={handleProjectDirSelection}
                    onChange={(value) => {
                        setPathTouched(true);
                        onFormDataChange({ path: value });
                    }}
                    errorMsg={pathError || undefined}
                />
            </FieldGroup>

            <SectionDivider />
            <OptionalSectionsLabel>Optional Configurations</OptionalSectionsLabel>

            {/* Project Section */}
            {isProjectModeSupported && (
                <CollapsibleSection
                    isExpanded={isProjectSettingsExpanded}
                    onToggle={handleProjectSettingsToggle}
                    icon="folder"
                    title="Project"
                >
                    <CheckboxContainer>
                        <CheckBox
                            label="Create as project"
                            checked={formData.createAsWorkspace}
                            onChange={(checked) => { setPathTouched(false); onFormDataChange({ createAsWorkspace: checked }); }}
                        />
                        <Description>
                            Enable project mode to manage multiple integrations and libraries within a single repository.
                        </Description>
                    </CheckboxContainer>
                    {formData.createAsWorkspace && (
                        <FieldGroup>
                            <TextField
                                onTextChange={(value) => { setPathTouched(false); onFormDataChange({ workspaceName: value }); }}
                                value={formData.workspaceName}
                                label="Project Name"
                                placeholder="Enter project name"
                                required={true}
                                errorMsg={projectNameError || ""}
                            />
                        </FieldGroup>
                    )}
                </CollapsibleSection>
            )}

            {/* Ballerina Package Section */}
            <PackageInfoSection
                isExpanded={isPackageInfoExpanded}
                onToggle={() => setIsPackageInfoExpanded(!isPackageInfoExpanded)}
                data={{ packageName: formData.packageName, orgName: formData.orgName, version: formData.version }}
                onChange={(data) => {
                    if (data.packageName !== undefined) {
                        setPackageNameTouched(data.packageName.length > 0);
                        if (packageNameError) setPackageNameError(null);
                        setPathTouched(false);
                    }
                    onFormDataChange(data);
                }}
                orgNameError={orgNameError}
                packageNameError={packageNameValidationError || packageNameError}
            />
        </>
    );
}
