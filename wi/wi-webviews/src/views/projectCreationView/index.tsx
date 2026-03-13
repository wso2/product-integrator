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
import { Button, Icon, TextField, Typography } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useVisualizerContext } from "../../contexts";
import { DirectorySelector } from "../../components/DirectorySelector/DirectorySelector";

const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 600px;
    margin: 0 auto;
    margin-top: calc(25vh - 80px);
    width: 100%;
`;

const TitleContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 32px;
    width: 100%;
`;

const IconButton = styled.div`
    cursor: pointer;
    border-radius: 4px;
    width: 20px;
    height: 20px;
    font-size: 20px;
    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

const FieldGroup = styled.div`
    margin-bottom: 20px;
    width: 100%;
`;

const ButtonWrapper = styled.div`
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
    width: 100%;
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
            projectName: formData.projectName,
            packageName: formData.projectName,
            projectPath: formData.path,
            createDirectory: true,
        });
    };

    return (
        <div style={{ position: 'absolute', background: 'var(--vscode-editor-background)', height: '100vh', width: '100%', overflow: 'hidden' }}>
            <FormContainer>
                <TitleContainer>
                    <IconButton onClick={onBack}>
                        <Icon name="bi-arrow-back" iconSx={{ color: "var(--vscode-foreground)" }} />
                    </IconButton>
                    <Typography variant="h2">Create a Project</Typography>
                </TitleContainer>

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

                <ButtonWrapper>
                    <Button
                        disabled={!formData.path || !formData.projectName}
                        onClick={handleCreate}
                        appearance="primary"
                    >
                        Create Project
                    </Button>
                </ButtonWrapper>
            </FormContainer>
        </div>
    );
}
