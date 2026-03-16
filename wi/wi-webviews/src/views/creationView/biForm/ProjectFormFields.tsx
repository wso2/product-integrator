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
    packageNameValidationError?: string;
}

export function ProjectFormFields({
    formData,
    onFormDataChange,
    integrationNameError,
    pathError,
    packageNameValidationError,
}: ProjectFormFieldsProps) {
    const { wsClient } = useVisualizerContext();
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const [withinProjectNameTouched, setWithinProjectNameTouched] = useState(false);
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [isProjectModeSupported, setIsProjectModeSupported] = useState(false);
    const [isProjectSettingsExpanded, setIsProjectSettingsExpanded] = useState(false);
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const [defaultPath, setDefaultPath] = useState("");
    const [pathTouched, setPathTouched] = useState(false);

    const computeDisplayedPath = (): string => {
        const base = formData.path || defaultPath;
        if (formData.createWithinProject) {
            const projectPath = formData.withinProjectName
                ? joinPath(base, formData.withinProjectName)
                : base;
            return formData.packageName ? joinPath(projectPath, formData.packageName) : projectPath;
        }
        return joinPath(base, formData.packageName);
    };

    const displayedPath = pathTouched ? formData.path : computeDisplayedPath();

    const handleIntegrationName = (value: string) => {
        setPathTouched(false);
        const updates: Partial<ProjectFormData> = { integrationName: value };
        if (!packageNameTouched) {
            const sanitized = sanitizePackageName(value);
            updates.packageName = sanitized;
            if (!withinProjectNameTouched) {
                updates.withinProjectName = sanitized ? sanitized + "_project" : "";
            }
        }
        onFormDataChange(updates);
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

    const handleCreateWithinProjectToggle = (checked: boolean) => {
        setPathTouched(false);
        const updates: Partial<ProjectFormData> = { createWithinProject: checked };
        if (checked && !formData.withinProjectName && formData.packageName) {
            updates.withinProjectName = formData.packageName + "_project";
        }
        onFormDataChange(updates);
    };

    useEffect(() => {
        (async () => {
            const { path: workspacePath } = await wsClient.getWorkspaceRoot();

            // Set default path if not already set
            if (!formData.path) {
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

            if (projectModeSupported && !workspacePath) {
                // No workspace open: expand project section and enable "create within project" by default
                setIsProjectSettingsExpanded(true);
                onFormDataChange({ createWithinProject: true });
            }
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
                            label="Create within a project"
                            checked={formData.createWithinProject}
                            onChange={handleCreateWithinProjectToggle}
                        />
                        <Description>
                            Wrap this integration inside a project, making it easy to add more integrations and libraries later.
                        </Description>
                    </CheckboxContainer>
                    {formData.createWithinProject && (
                        <FieldGroup>
                            <TextField
                                onTextChange={(value) => {
                                    setWithinProjectNameTouched(true);
                                    setPathTouched(false);
                                    onFormDataChange({ withinProjectName: value });
                                }}
                                value={formData.withinProjectName}
                                label="Project Name"
                                placeholder="Enter project name"
                                required={true}
                                errorMsg=""
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
                        const updates: Partial<ProjectFormData> = { ...data };
                        if (!withinProjectNameTouched) {
                            updates.withinProjectName = data.packageName ? data.packageName + "_project" : "";
                        }
                        onFormDataChange(updates);
                        return;
                    }
                    onFormDataChange(data);
                }}
                orgNameError={orgNameError}
                packageNameError={packageNameValidationError || packageNameError}
            />
        </>
    );
}
