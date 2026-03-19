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

import { useEffect, useState, useRef } from "react";
import { TextField, CheckBox } from "@wso2/ui-toolkit";
import { DirectorySelector } from "../../../components/DirectorySelector/DirectorySelector";
import { useVisualizerContext } from "../../../contexts/WsContext";
import { useProjectModeSupported, useWorkspaceRoot } from "../../../providers";
import {
    FieldGroup,
    CheckboxContainer,
    Description,
    SectionDivider,
    OptionalSectionsLabel,
    ResolvedPathText,
} from "./styles";
import { CollapsibleSection, PackageInfoSection } from "./components";
import { sanitizePackageName, validatePackageName, validateOrgName, joinPath } from "./utils";
import { ProjectFormData } from "./types";

// Re-export for backwards compatibility
export type { ProjectFormData } from "./types";

const validateWithinProjectName = (name: string): string | null => {
    if (!name || name.trim().length === 0) {
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

export interface ProjectFormFieldsProps {
    formData: ProjectFormData;
    onFormDataChange: (data: Partial<ProjectFormData>) => void;
    integrationNameError?: string;
    pathError?: string;
    projectNameError?: string;
    packageNameValidationError?: string;
    selectedOrgName?: string;
}

export function ProjectFormFields({
    formData,
    onFormDataChange,
    integrationNameError,
    pathError,
    projectNameError,
    packageNameValidationError,
    selectedOrgName
}: ProjectFormFieldsProps) {
    const { wsClient } = useVisualizerContext();
    const isProjectModeSupported = useProjectModeSupported();
    const { path: workspacePath, isReady: workspaceReady } = useWorkspaceRoot();
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const [withinProjectNameTouched, setWithinProjectNameTouched] = useState(false);
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [withinProjectNameError, setWithinProjectNameError] = useState<string | null>(null);
    const [isProjectSettingsExpanded, setIsProjectSettingsExpanded] = useState(false);
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const [defaultPath, setDefaultPath] = useState("");
    const [pathTouched, setPathTouched] = useState(false);
    const [editablePath, setEditablePath] = useState("");
    const hasUserToggledCreateWithinProject = useRef(false);
    const hasAutoInitializedProjectMode = useRef(false);

    const computeDisplayedPath = (): string => {
        const base = editablePath || formData.path || defaultPath;
        if (formData.createWithinProject) {
            const projectPath = formData.withinProjectName
                ? joinPath(base, formData.withinProjectName)
                : base;
            return formData.packageName ? joinPath(projectPath, formData.packageName) : projectPath;
        }
        return joinPath(base, formData.packageName);
    };

    const resolvedPath = computeDisplayedPath();

    useEffect(() => {
        if (!pathTouched) {
            setEditablePath(formData.path || defaultPath);
        }
    }, [formData.path, defaultPath, pathTouched]);

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
        const selectedDirectory = await wsClient.selectFileOrDirPath({ startPath: editablePath || formData.path || defaultPath });
        if (!selectedDirectory.path) return;
        setPathTouched(false);
        setEditablePath(selectedDirectory.path);
        onFormDataChange({ path: selectedDirectory.path });
    };

    const handleProjectSettingsToggle = () => {
        setIsProjectSettingsExpanded(!isProjectSettingsExpanded);
    };

    const handleCreateWithinProjectToggle = (checked: boolean) => {
        hasUserToggledCreateWithinProject.current = true;
        setPathTouched(false);
        const updates: Partial<ProjectFormData> = { createWithinProject: checked };
        if (checked && !formData.withinProjectName && formData.packageName) {
            updates.withinProjectName = formData.packageName + "_project";
        }
        onFormDataChange(updates);
    };

    useEffect(() => {
        if (!workspaceReady) return;
        (async () => {
            if (!formData.path) {
                try {
                    const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                    setDefaultPath(dp);
                    onFormDataChange({ path: dp });
                } catch (error) {
                    console.error("Failed to fetch default creation path:", error);
                    if (workspacePath) {
                        setDefaultPath(workspacePath);
                        onFormDataChange({ path: workspacePath });
                    }
                }
            }
            if (!formData.orgName) {
                try {
                    const { orgName } = await wsClient.getDefaultOrgName();
                    onFormDataChange({ orgName });
                } catch (error) {
                    console.error("Failed to fetch default org name:", error);
                }
            }
            if (
                !hasAutoInitializedProjectMode.current &&
                !hasUserToggledCreateWithinProject.current &&
                isProjectModeSupported
            ) {
                hasAutoInitializedProjectMode.current = true;
                setIsProjectSettingsExpanded(true);
                const updates: Partial<ProjectFormData> = { createWithinProject: true };
                if (!formData.withinProjectName && formData.packageName) {
                    updates.withinProjectName = formData.packageName + "_project";
                }
                onFormDataChange(updates);
            }
        })();
    }, [
        workspaceReady,
        wsClient,
        workspacePath,
        isProjectModeSupported,
        formData.path,
        formData.orgName,
        formData.packageName,
        formData.withinProjectName,
        formData.createWithinProject,
        onFormDataChange
    ]);

    useEffect(() => {
        const error = validatePackageName(formData.packageName, formData.integrationName);
        setPackageNameError(error);
    }, [formData.packageName, formData.integrationName]);

    // Validation effect for org name
    useEffect(() => {
        const orgError = validateOrgName(formData.orgName);
        setOrgNameError(orgError);
    }, [formData.orgName]);

    useEffect(() => {
        if (formData.createWithinProject) {
            const error = validateWithinProjectName(formData.withinProjectName);
            setWithinProjectNameError(error);
        } else {
            setWithinProjectNameError(null);
        }
    }, [formData.withinProjectName, formData.createWithinProject]);

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
                    selectedPath={editablePath}
                    required={true}
                    onSelect={handleProjectDirSelection}
                    onChange={(value) => {
                        setPathTouched(true);
                        setEditablePath(value);
                    }}
                    onBlur={() => {
                        if (pathTouched && editablePath !== formData.path) {
                            onFormDataChange({ path: editablePath });
                        }
                    }}
                    errorMsg={pathError || undefined}
                />
                {resolvedPath && resolvedPath !== editablePath && (
                    <ResolvedPathText>Will be created at: {resolvedPath}</ResolvedPathText>
                )}
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
                                    if (withinProjectNameError) setWithinProjectNameError(null);
                                    onFormDataChange({ withinProjectName: value });
                                }}
                                value={formData.withinProjectName}
                                label="Project Name"
                                placeholder="Enter project name"
                                required={true}
                                errorMsg={projectNameError ?? (withinProjectNameTouched && withinProjectNameError ? withinProjectNameError : "")}
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
                selectedOrgName={selectedOrgName}
            />
        </>
    );
}
