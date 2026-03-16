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
import { useVisualizerContext } from "../../contexts";
import { DirectorySelector } from "../../components/DirectorySelector/DirectorySelector";
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

export function ProjectCreationView({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const [formData, setFormData] = useState({
        projectName: "",
        path: "",
    });

    useEffect(() => {
        (async () => {
            const currentDir = await wsClient.getWorkspaceRoot();
            setFormData(prev => ({ ...prev, path: currentDir.path }));
        })();
    }, []);

    const handlePathSelection = async () => {
        const result = await wsClient.selectFileOrDirPath({});
        setFormData(prev => ({ ...prev, path: result.path }));
    };

    const handleCreate = () => {
        wsClient.createBIProject({
            workspaceName: formData.projectName,
            projectPath: formData.path,
            createDirectory: true,
            createAsWorkspace: true,
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
                                    onTextChange={(value) => setFormData(prev => ({ ...prev, projectName: value }))}
                                    value={formData.projectName}
                                    label="Project Name"
                                    placeholder="Enter a project name"
                                    autoFocus={true}
                                    required={true}
                                />
                            </FieldGroup>

                            <FieldGroup>
                                <DirectorySelector
                                    id="project-folder-selector"
                                    label="Select Path"
                                    placeholder="Enter path or browse to select a folder..."
                                    selectedPath={formData.path}
                                    required={true}
                                    onSelect={handlePathSelection}
                                    onChange={(value) => setFormData(prev => ({ ...prev, path: value }))}
                                />
                            </FieldGroup>

                            <FormFooter>
                                <Button
                                    disabled={!formData.path || !formData.projectName}
                                    onClick={handleCreate}
                                    appearance="primary"
                                >
                                    Create Project
                                </Button>
                            </FormFooter>
                        </FormContent>
                    </FormBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
