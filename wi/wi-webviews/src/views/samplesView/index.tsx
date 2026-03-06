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
    Typography,
    Dropdown,
    ProgressIndicator,
} from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
// import { BIProjectForm } from "./biForm";
import { useVisualizerContext } from "../../contexts/RpcContext";
import { SamplesContainer } from "./SamplesContainer";
import { IntegrationTypeSelector } from "../../components/IntegrationTypeSelector";

const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    margin: 80px 120px;
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

export type ProjectType = "WSO2: BI" | "WSO2: MI" | "WSO2: SI";

export function SamplesView({ onBack }: { onBack?: () => void }) {
    const [enabledRuntimes, setEnabledRuntimes] = useState<ProjectType[]>([]);
    const [projectType, setProjectType] = useState<ProjectType | "">("");
    const [isLoading, setIsLoading] = useState(true);
    const { rpcClient } = useVisualizerContext();

    // Load enabled runtimes from VS Code configuration (three individual boolean settings)
    useEffect(() => {
        const loadDefaultRuntime = async () => {
            try {
                const [biResp, miResp, siResp] = await Promise.all([
                    rpcClient.getMainRpcClient().getConfiguration({ section: "integrator.enabledRuntimes.bi" }),
                    rpcClient.getMainRpcClient().getConfiguration({ section: "integrator.enabledRuntimes.mi" }),
                    rpcClient.getMainRpcClient().getConfiguration({ section: "integrator.enabledRuntimes.si" }),
                ]);

                const runtimes: ProjectType[] = [];
                if (biResp?.value === true) { runtimes.push("WSO2: BI"); }
                if (miResp?.value === true) { runtimes.push("WSO2: MI"); }
                if (siResp?.value === true) { runtimes.push("WSO2: SI"); }

                // Enforce at least one runtime (extension will have already corrected settings)
                const resolved = runtimes.length > 0 ? runtimes : ["WSO2: BI" as ProjectType];
                setEnabledRuntimes(resolved);
                setProjectType(resolved[0]);
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
        <div style={{ position: 'absolute', background: 'var(--vscode-editor-background)', height: '100%', width: '100%' }} >
            <FormContainer>
                <TitleContainer>
                    <IconButton onClick={gotToWelcome}>
                        <Icon name="bi-arrow-back" iconSx={{ color: "var(--vscode-foreground)" }} />
                    </IconButton>
                    <Typography variant="h2">Create using samples</Typography>
                </TitleContainer>
                {enabledRuntimes.length > 1 && (
                    <IntegrationTypeSelector
                        value={projectType as ProjectType}
                        options={enabledRuntimes.map((r) => ({ label: r, value: r }))}
                        onChange={(value) => setProjectType(value as ProjectType)}
                    />
                )}
                {projectType && <SamplesContainer projectType={projectType as ProjectType} />}
            </FormContainer>
        </div>
    );
}
