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
import { Icon, ProgressIndicator, Typography } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { BIProjectForm } from "./biForm";
import { useVisualizerContext } from "../../contexts/WsContext";
import { MiProjectWizard } from "./miForm";
import { SiProjectWizard } from "./siForm";

const PageBackdrop = styled.div`
    min-height: 100vh;
    padding: 28px 30px 24px;
    background:
        radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--wso2-brand-accent) 10%, transparent) 0%, transparent 34%),
        radial-gradient(circle at 10% 100%, color-mix(in srgb, var(--wso2-brand-primary) 8%, transparent) 0%, transparent 40%),
        var(--vscode-editor-background);
`;

const PageContainer = styled.div`
    max-width: 900px;
    margin: 0 auto;
    min-height: calc(100vh - 52px);
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const HeaderRow = styled.header`
    display: flex;
    align-items: flex-start;
    gap: 10px;
`;

const BackButton = styled.button`
    cursor: pointer;
    border-radius: 6px;
    width: 28px;
    height: 28px;
    font-size: 20px;
    border: 1px solid transparent;
    background: transparent;
    appearance: none;
    padding: 0;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;

    & > * {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
    }

    &:hover {
        background-color: color-mix(in srgb, var(--wso2-brand-accent) 16%, transparent);
        border-color: color-mix(in srgb, var(--wso2-brand-accent) 45%, transparent);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

const HeaderText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const HeaderTitle = styled(Typography)`
    margin: 0;
    font-weight: 600;
`;

const HeaderSubtitle = styled.p`
    margin: 0;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

const RuntimePanel = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 14%, var(--vscode-panel-border));
    background: var(--vscode-editor-background);
    width: fit-content;
`;

const RuntimeLabel = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.08em;
`;

const RuntimeOptions = styled.div`
    display: inline-flex;
    flex-wrap: wrap;
    gap: 8px;
`;

const RuntimeOptionButton = styled.button<{ active: boolean }>`
    border: 1px solid
        ${(props: { active: boolean }) =>
            props.active
                ? "var(--wso2-brand-primary)"
                : "var(--vscode-input-border)"};
    background:
        ${(props: { active: boolean }) =>
            props.active
                ? "var(--wso2-brand-primary)"
                : "var(--vscode-input-background)"};
    color:
        ${(props: { active: boolean }) =>
            props.active ? "var(--vscode-button-foreground)" : "var(--vscode-foreground)"};
    border-radius: 999px;
    height: 28px;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;

    &:hover {
        border-color: ${({ active }: { active: boolean }) =>
            active ? "var(--wso2-brand-primary-alt)" : "var(--vscode-focusBorder)"};
        background: ${({ active }: { active: boolean }) =>
            active ? "var(--wso2-brand-primary-alt)" : "var(--vscode-list-hoverBackground)"};
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

const FormPanel = styled.section`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 16%, var(--vscode-panel-border));
    background: var(--vscode-editor-background);
    box-shadow: 0 10px 24px color-mix(in srgb, var(--wso2-brand-neutral-900) 16%, transparent);
    overflow: hidden;
`;

const FormPanelHeader = styled.div`
    border-bottom: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 10%, var(--vscode-panel-border));
    padding: 14px 18px 12px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--wso2-brand-accent) 4%, var(--vscode-editor-background)) 0%,
        var(--vscode-editor-background) 100%
    );
`;

const FormPanelTitle = styled.h3`
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const FormPanelSubtitle = styled.p`
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const FormBody = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px;
`;

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
                        <HeaderTitle variant="h2">Create New Project</HeaderTitle>
                        <HeaderSubtitle>
                            Select a runtime and configure your integration project details.
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
