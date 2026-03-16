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
import { Button, Icon, TextField, CheckBox } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useVisualizerContext } from "../../contexts";
import { sanitizePackageName } from "../creationView/biForm/utils";
import { DirectorySelector } from "../../components/DirectorySelector/DirectorySelector";
import { PackageInfoSection } from "../creationView/biForm/components";
import { SectionDivider, OptionalSectionsLabel } from "../creationView/biForm/styles";
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
} from "../shared/FormPageLayout";

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

const CheckboxContainer = styled.div`
    margin: 16px 0;
`;

interface LibraryFormData {
    libraryName: string;
    packageName: string;
    path: string;
    createDirectory: boolean;
    orgName: string;
    version: string;
}

export function LibraryCreationView({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const [formData, setFormData] = useState<LibraryFormData>({
        libraryName: "",
        packageName: "",
        path: "",
        createDirectory: true,
        orgName: "",
        version: "",
    });

    useEffect(() => {
        (async () => {
            const currentDir = await wsClient.getWorkspaceRoot();
            setFormData(prev => ({ ...prev, path: currentDir.path }));
        })();
    }, []);

    const handleLibraryName = (value: string) => {
        setFormData(prev => ({
            ...prev,
            libraryName: value,
            packageName: packageNameTouched ? prev.packageName : sanitizePackageName(value),
        }));
    };

    const handlePackageName = (value: string) => {
        setFormData(prev => ({ ...prev, packageName: sanitizePackageName(value) }));
        setPackageNameTouched(value.length > 0);
    };

    const handlePathSelection = async () => {
        const result = await wsClient.selectFileOrDirPath({});
        setFormData(prev => ({ ...prev, path: result.path }));
    };

    const handleCreate = () => {
        wsClient.createBIProject({
            projectName: formData.libraryName,
            packageName: formData.packageName,
            projectPath: formData.path,
            createDirectory: formData.createDirectory,
            orgName: formData.orgName || undefined,
            version: formData.version || undefined,
            isLibrary: true,
        });
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
                                />
                            </FieldGroup>

                            <FieldGroup>
                                <TextField
                                    onTextChange={handlePackageName}
                                    value={formData.packageName}
                                    label="Package Name"
                                    description="This will be used as the Ballerina package name for the library."
                                />
                            </FieldGroup>

                            <FieldGroup>
                                <DirectorySelector
                                    id="library-folder-selector"
                                    label="Select Path"
                                    placeholder="Enter path or browse to select a folder..."
                                    selectedPath={formData.path}
                                    required={true}
                                    onSelect={handlePathSelection}
                                    onChange={(value) => setFormData(prev => ({ ...prev, path: value }))}
                                />
                                <CheckboxContainer>
                                    <CheckBox
                                        label="Create a new folder using the package name"
                                        checked={formData.createDirectory}
                                        onChange={(checked) => setFormData(prev => ({ ...prev, createDirectory: checked }))}
                                    />
                                </CheckboxContainer>
                            </FieldGroup>

                            <SectionDivider />
                            <OptionalSectionsLabel>Optional Configurations</OptionalSectionsLabel>

                            <PackageInfoSection
                                isExpanded={isPackageInfoExpanded}
                                onToggle={() => setIsPackageInfoExpanded(!isPackageInfoExpanded)}
                                data={{ orgName: formData.orgName, version: formData.version }}
                                onChange={(data) => setFormData(prev => ({ ...prev, ...data }))}
                                isLibrary={true}
                            />

                            <FormFooter>
                                <Button
                                    disabled={!formData.path || !formData.libraryName}
                                    onClick={handleCreate}
                                    appearance="primary"
                                >
                                    Create Library
                                </Button>
                            </FormFooter>
                        </FormContent>
                    </FormBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
