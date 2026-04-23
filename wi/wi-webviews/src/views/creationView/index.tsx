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

import styled from "@emotion/styled";
import { Icon, ProgressIndicator } from "@wso2/ui-toolkit";
import { useEffect, useState } from "react";
import { useVisualizerContext } from "../../contexts/WsContext";
import {
    BackButton,
    FormBody,
    FormPanel,
    FormPanelHeader,
    HeaderRow,
    HeaderSubtitle,
    HeaderText,
    HeaderTitle,
    PageBackdrop,
    PageContainer,
} from "../shared/FormPageLayout";
import {
    type WIRuntime,
    loadSelectedRuntime,
} from "../shared/runtime";
import { BIProjectForm } from "./biForm";
import { MiProjectWizard } from "./miForm";
import { SiProjectWizard } from "./siForm";

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 320px;
`;

export function CreationView({
    onBack,
    runtime,
    ballerinaUnavailable,
}: { onBack?: () => void; runtime?: WIRuntime; ballerinaUnavailable?: boolean }) {
    const [projectType, setProjectType] = useState<WIRuntime | null>(
        runtime ?? null,
    );
    const [isLoading, setIsLoading] = useState(runtime === undefined);
    const { wsClient } = useVisualizerContext();

    useEffect(() => {
        if (runtime) {
            setProjectType(runtime);
            setIsLoading(false);
            return;
        }

        const resolveRuntime = async () => {
            setIsLoading(true);
            try {
                setProjectType(await loadSelectedRuntime(wsClient));
            } catch (error) {
                console.warn(
                    "Failed to load selected profile, using fallback:",
                    error,
                );
                setProjectType("WSO2: BI");
            } finally {
                setIsLoading(false);
            }
        };

        resolveRuntime();
    }, [runtime, wsClient]);

    const gotToWelcome = () => {
        if (onBack) {
            onBack();
        }
    };

    if (isLoading || !projectType) {
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
                <FormPanel>
                    <FormPanelHeader>
                        <HeaderRow>
                            <BackButton type="button" onClick={gotToWelcome} title="Go back">
                                <Icon
                                    name="arrow-left"
                                    isCodicon
                                    sx={{
                                        width: "16px",
                                        height: "16px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                    iconSx={{
                                        color: "var(--vscode-foreground)",
                                        fontSize: "16px",
                                        lineHeight: 1,
                                    }}
                                />
                            </BackButton>
                            <HeaderText>
                                <HeaderTitle variant="h2">Create Integration</HeaderTitle>
                                <HeaderSubtitle>
                                    Start building a new integration.
                                </HeaderSubtitle>
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>
                    <FormBody>
                        {projectType === "WSO2: BI" && <BIProjectForm ballerinaUnavailable={ballerinaUnavailable} />}
                        {projectType === "WSO2: MI" && <MiProjectWizard />}
                        {projectType === "WSO2: SI" && <SiProjectWizard />}
                    </FormBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
