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
import { Icon, ProgressIndicator } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { BIProjectForm } from "./biForm";
import { useVisualizerContext } from "../../contexts/WsContext";
import { MiProjectWizard } from "./miForm";
import { SiProjectWizard } from "./siForm";
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
    RuntimePanel,
    RuntimeLabel,
    RuntimeOptions,
    RuntimeOptionButton,
} from "../shared/FormPageLayout";

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 320px;
`;

export type RuntimeType = "WSO2: BI" | "WSO2: MI" | "WSO2: SI";

const RUNTIME_DISPLAY_LABEL: Record<RuntimeType, string> = {
    "WSO2: BI": "Default",
    "WSO2: MI": "WSO2: MI",
    "WSO2: SI": "WSO2: SI",
};

const RUNTIME_HELP: Record<RuntimeType, string> = {
    "WSO2: BI": "Create a Ballerina integration with package and workspace options.",
    "WSO2: MI": "Create a Micro Integrator project with runtime version and advanced Maven settings.",
    "WSO2: SI": "Create a Stream Integrator project with quick path and name setup.",
};

export function CreationView({ onBack }: { onBack?: () => void }) {
    const [enabledRuntimes, setEnabledRuntimes] = useState<RuntimeType[]>(["WSO2: BI"]);
    const [projectType, setProjectType] = useState<RuntimeType>("WSO2: BI");
    const [isLoading, setIsLoading] = useState(true);
    const { wsClient } = useVisualizerContext();

    useEffect(() => {
        const loadDefaultRuntime = async () => {
            try {
                const [biResp, miResp, siResp] = await Promise.all([
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.bi" }),
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.mi" }),
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.si" }),
                ]);

                const runtimes: RuntimeType[] = [];
                if (biResp?.value === true) {
                    runtimes.push("WSO2: BI");
                }
                if (miResp?.value === true) {
                    runtimes.push("WSO2: MI");
                }
                if (siResp?.value === true) {
                    runtimes.push("WSO2: SI");
                }

                const resolved = runtimes.length > 0 ? runtimes : ["WSO2: BI" as RuntimeType];
                setEnabledRuntimes(resolved);
                setProjectType(resolved[0]);
            } catch (error) {
                console.warn("Failed to load default integrator config, using fallback:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadDefaultRuntime();
    }, [wsClient]);

    const gotToWelcome = () => {
        if (onBack) {
            onBack();
        }
    };

    if (isLoading) {
        return (
            <PageBackdrop>
                <PageContainer>
                    <LoadingContainer>
                        <ProgressIndicator />
                    </LoadingContainer>
                </PageContainer>
            </PageBackdrop>
        );
    }

    return (
        <PageBackdrop>
            <PageContainer>
                <HeaderRow>
                    <BackButton type="button" onClick={gotToWelcome} title="Go back">
                        <Icon
                            name="arrow-left"
                            isCodicon
                            sx={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            iconSx={{ color: "var(--vscode-foreground)", fontSize: "16px", lineHeight: 1 }}
                        />
                    </BackButton>
                    <HeaderText>
                        <HeaderTitle variant="h2">Create Integration</HeaderTitle>
                        <HeaderSubtitle>
                            Select a runtime and configure your integration details.
                        </HeaderSubtitle>
                    </HeaderText>
                </HeaderRow>
                {enabledRuntimes.length > 1 && (
                    <RuntimePanel>
                        <RuntimeLabel>Runtime</RuntimeLabel>
                        <RuntimeOptions>
                            {enabledRuntimes.map((runtime: RuntimeType) => (
                                <RuntimeOptionButton
                                    type="button"
                                    key={runtime}
                                    active={projectType === runtime}
                                    onClick={() => setProjectType(runtime)}
                                >
                                    {RUNTIME_DISPLAY_LABEL[runtime]}
                                </RuntimeOptionButton>
                            ))}
                        </RuntimeOptions>
                    </RuntimePanel>
                )}
                <FormPanel>
                    <FormPanelHeader>
                        <FormPanelTitle>{RUNTIME_DISPLAY_LABEL[projectType]} Project</FormPanelTitle>
                        <FormPanelSubtitle>{RUNTIME_HELP[projectType]}</FormPanelSubtitle>
                    </FormPanelHeader>
                    <FormBody>
                        {projectType === "WSO2: BI" && <BIProjectForm />}
                        {projectType === "WSO2: MI" && <MiProjectWizard />}
                        {projectType === "WSO2: SI" && <SiProjectWizard />}
                    </FormBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
