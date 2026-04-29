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
import { Icon, ProgressIndicator, Typography } from "@wso2/ui-toolkit";
import { useEffect, useState } from "react";
import { useVisualizerContext } from "../../contexts/WsContext";
import {
    BackButton,
    FormPanelHeader,
    HeaderRow,
    HeaderSubtitle,
    HeaderText,
    HeaderTitle,
    PageBackdrop,
} from "../shared/FormPageLayout";
import {
    RUNTIME_DISPLAY_LABEL,
    type WIRuntime,
    loadSelectedRuntime,
    supportsSamples,
} from "../shared/runtime";
import { SamplesContainer } from "./SamplesContainer";

const PageContainer = styled.div`
    max-width: 1180px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: calc(100vh - 52px);
`;

const ContentPanel = styled.section`
    flex: 1;
    min-height: 0;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 16%, var(--vscode-panel-border));
    background: var(--vscode-editor-background);
    box-shadow: 0 10px 24px color-mix(in srgb, var(--wso2-brand-neutral-900) 16%, transparent);
    overflow: hidden;
`;

const Loader = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 320px;
`;

const EmptyState = styled.div`
    margin-top: calc(50vh - 150px);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    color: var(--vscode-descriptionForeground);
`;

const EmptyStateContent = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: 420px;
`;

const EmptyStateMessage = styled(Typography)`
    margin: 0;
`;

export function SamplesView({ onBack, runtime }: { onBack?: () => void; runtime?: WIRuntime }) {
    const [projectType, setProjectType] = useState<WIRuntime | null>(runtime ?? null);
    const [isLoading, setIsLoading] = useState(runtime === undefined);
    const { wsClient } = useVisualizerContext();

    useEffect(() => {
        if (runtime) {
            setProjectType(runtime);
            setIsLoading(false);
            return;
        }

        let disposed = false;

        const resolveRuntime = async () => {
            setIsLoading(true);
            try {
                const selectedRuntime = await loadSelectedRuntime(wsClient);
                if (!disposed) {
                    setProjectType(selectedRuntime);
                }
            } catch (error) {
                console.warn(
                    "Failed to load selected profile, using fallback:",
                    error,
                );
                if (!disposed) {
                    setProjectType("WSO2: BI");
                }
            } finally {
                if (!disposed) {
                    setIsLoading(false);
                }
            }
        };

        resolveRuntime();

        return () => {
            disposed = true;
        };
    }, [runtime, wsClient]);

    const gotToWelcome = () => {
        if (onBack) {
            onBack();
        }
    };

    if (isLoading) {
        return (
            <PageBackdrop>
                <PageContainer>
                    <Loader>
                        <ProgressIndicator />
                    </Loader>
                </PageContainer>
            </PageBackdrop>
        );
    }

    return (
        <PageBackdrop>
            <PageContainer>
                <ContentPanel>
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
                                <HeaderTitle variant="h2">Browse Samples</HeaderTitle>
                                <HeaderSubtitle>
                                    Start quickly by downloading a curated integration sample for your selected profile.
                                </HeaderSubtitle>
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>
                    {projectType && supportsSamples(projectType) ? (
                        <SamplesContainer projectType={projectType} />
                    ) : (
                        <EmptyState>
                            <EmptyStateContent>
                                <EmptyStateMessage variant="body2">
                                    Samples for{" "}
                                    {projectType
                                        ? RUNTIME_DISPLAY_LABEL[projectType]
                                        : "this profile"}{" "}
                                    are not available yet.
                                </EmptyStateMessage>
                                <Icon
                                    name="info"
                                    isCodicon
                                    sx={{
                                        width: "28px",
                                        height: "28px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                    iconSx={{
                                        color: "var(--vscode-descriptionForeground)",
                                        fontSize: "24px",
                                        lineHeight: 1,
                                    }}
                                />
                            </EmptyStateContent>
                        </EmptyState>
                    )}
                </ContentPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
