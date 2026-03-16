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
import { sanitizePackageName, validatePackageName, validateOrgName, joinPath } from "./utils";
import { DirectorySelector } from "../../../components/DirectorySelector/DirectorySelector";
import { PackageInfoSection } from "./components";
import { SectionDivider, OptionalSectionsLabel } from "./styles";
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

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

interface LibraryFormData {
    libraryName: string;
    packageName: string;
    path: string;
    orgName: string;
    version: string;
}

export function LibraryCreationView({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [libraryNameError, setLibraryNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [defaultPath, setDefaultPath] = useState("");
    const [pathTouched, setPathTouched] = useState(false);
    const [formData, setFormData] = useState<LibraryFormData>({
        libraryName: "",
        packageName: "",
        path: "",
        orgName: "",
        version: "",
    });

    useEffect(() => {
        (async () => {
            const { path: workspacePath } = await wsClient.getWorkspaceRoot();
            const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
            setDefaultPath(dp);
            setFormData(prev => ({ ...prev, path: dp }));

            try {
                const { orgName } = await wsClient.getDefaultOrgName();
                setFormData(prev => ({ ...prev, orgName }));
            } catch (error) {
                console.error("Failed to fetch default org name:", error);
            }
        })();
    }, []);

    useEffect(() => {
        const error = validatePackageName(formData.packageName, formData.libraryName);
        setPackageNameError(error);
    }, [formData.packageName, formData.libraryName]);

    useEffect(() => {
        setOrgNameError(validateOrgName(formData.orgName));
    }, [formData.orgName]);

    const displayedPath = pathTouched ? formData.path : joinPath(formData.path || defaultPath, formData.packageName);

    const handleLibraryName = (value: string) => {
        if (libraryNameError) setLibraryNameError(null);
        setPathTouched(false);
        setFormData(prev => ({
            ...prev,
            libraryName: value,
            packageName: packageNameTouched ? prev.packageName : sanitizePackageName(value),
        }));
    };

    const handlePathSelection = async () => {
        const result = await wsClient.selectFileOrDirPath({ startPath: formData.path || defaultPath });
        if (!result.path) return;
        if (pathError) setPathError(null);
        setPathTouched(false);
        setFormData(prev => ({ ...prev, path: result.path }));
    };

    const handleCreate = async () => {
        setIsValidating(true);
        setLibraryNameError(null);
        setPathError(null);
        setPackageNameError(null);

        let hasError = false;

        if (formData.libraryName.length < 2) {
            setLibraryNameError("Library name must be at least 2 characters");
            hasError = true;
        }

        if (formData.packageName.length < 2) {
            setPackageNameError("Package name must be at least 2 characters");
            hasError = true;
        } else {
            const pkgError = validatePackageName(formData.packageName, formData.libraryName);
            if (pkgError) {
                setPackageNameError(pkgError);
                hasError = true;
            }
        }

        if (formData.path.length < 2) {
            setPathError("Please select a path for your library");
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            const validationResult = await wsClient.validateProjectPath({
                projectPath: formData.path,
                projectName: formData.packageName,
                createDirectory: true,
                createAsWorkspace: false,
            });

            if (!validationResult.isValid) {
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setPathError(validationResult.errorMessage || "Invalid library path");
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    setPackageNameError(validationResult.errorMessage || "Invalid package name");
                }
                setIsValidating(false);
                return;
            }

            wsClient.createBIProject({
                projectName: formData.libraryName,
                packageName: formData.packageName,
                projectPath: formData.path,
                createDirectory: true,
                orgName: formData.orgName || undefined,
                version: formData.version || undefined,
                isLibrary: true,
            });
        } catch (error) {
            setPathError("An error occurred during validation");
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
                        <HeaderTitle variant="h2">Create Library</HeaderTitle>
                        <HeaderSubtitle>
                            Build a reusable Ballerina library package to share across integrations.
                        </HeaderSubtitle>
                    </HeaderText>
                </HeaderRow>

                <FormPanel>
                    <FormPanelHeader>
                        <FormPanelTitle>Library Details</FormPanelTitle>
                        <FormPanelSubtitle>Configure the name, package, and location of your library.</FormPanelSubtitle>
                    </FormPanelHeader>
                    <FormBody>
                        <FormContent>
                            <FieldGroup>
                                <TextField
                                    onTextChange={handleLibraryName}
                                    value={formData.libraryName}
                                    label="Library Name"
                                    placeholder="Enter a library name"
                                    autoFocus={true}
                                    required={true}
                                    errorMsg={libraryNameError || ""}
                                />
                            </FieldGroup>

                            <FieldGroup>
                                <DirectorySelector
                                    id="library-folder-selector"
                                    label="Select Path"
                                    placeholder="Browse to select a folder..."
                                    selectedPath={displayedPath}
                                    required={true}
                                    onSelect={handlePathSelection}
                                    onChange={(value) => {
                                        if (pathError) setPathError(null);
                                        setPathTouched(true);
                                        setFormData(prev => ({ ...prev, path: value }));
                                    }}
                                    errorMsg={pathError || undefined}
                                />
                            </FieldGroup>

                            <SectionDivider />
                            <OptionalSectionsLabel>Optional Configurations</OptionalSectionsLabel>

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
                                    setFormData(prev => ({ ...prev, ...data }));
                                }}
                                isLibrary={true}
                                packageNameError={packageNameError}
                                orgNameError={orgNameError}
                            />

                            <FormFooter>
                                <Button
                                    disabled={isValidating}
                                    onClick={handleCreate}
                                    appearance="primary"
                                >
                                    {isValidating ? "Validating..." : "Create Library"}
                                </Button>
                            </FormFooter>
                        </FormContent>
                    </FormBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
