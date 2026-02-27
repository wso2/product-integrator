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

import { useState, useEffect } from "react";
import {
    Icon,
    ProgressIndicator,
    Typography
} from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { BIProjectForm } from "./biForm";
import { useVisualizerContext } from "../../contexts/RpcContext";
import { MiProjectWizard } from "./miForm";
import { IntegrationTypeSelector } from "../../components/IntegrationTypeSelector";

const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    overflow: hidden;
    align-items: center;
    height: 100vh;
    max-width: 600px;
    margin: 0 auto;
    margin-top: calc(25vh - 80px);
`;

const TitleContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 32px;
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

const DropdownContainer = styled.div`
    margin-bottom: 20px;
`;

export function CreationView({ onBack }: { onBack?: () => void }) {
    const [defaultType, setDefaultType] = useState<string>("WSO2: BI");
    const [projectType, setProjectType] = useState<string>(defaultType);
    const [isLoading, setIsLoading] = useState(true);
    const { rpcClient } = useVisualizerContext();

    const projectTypeOptions = [
        { label: "WSO2: BI", value: "WSO2: BI" },
        { label: "WSO2: MI", value: "WSO2: MI" }
    ];

    // Load default integrator from VS Code configuration
    useEffect(() => {
        const loadDefaultRuntime = async () => {
            try {
                const configResponse = await rpcClient.getMainRpcClient().getConfiguration({
                    section: "integrator.defaultRuntime"
                });

                if (configResponse?.value) {
                    setDefaultType(configResponse.value);
                    setProjectType(configResponse.value);
                }
            } catch (error) {
                console.warn("Failed to load default integrator config, using fallback:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadDefaultRuntime();
    }, []);

    const gotToWelcome = () => {
        if (onBack) {
            onBack();
        }
    };

    // Show loading while fetching configuration
    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px' }}>
                <ProgressIndicator />
            </div>
        );
    }

    return (
        <div style={{ position: 'absolute', background: 'var(--vscode-editor-background)', height: '100vh', width: '100%', overflow: 'hidden' }} >
            <FormContainer>
                <div style={{ width: "100%" }}>
                    <TitleContainer>
                        <IconButton onClick={gotToWelcome}>
                            <Icon name="bi-arrow-back" iconSx={{ color: "var(--vscode-foreground)" }} />
                        </IconButton>
                        <Typography variant="h2">Create Your Integration</Typography>
                    </TitleContainer>
                    {defaultType === "WSO2: MI" && (
                        <IntegrationTypeSelector
                            value={projectType}
                            options={projectTypeOptions}
                            onChange={setProjectType}
                        />
                    )}
                </div>
                {projectType === "WSO2: BI" && <BIProjectForm />}
                {projectType === "WSO2: MI" && <MiProjectWizard />}
            </FormContainer>
        </div>
    );
}
