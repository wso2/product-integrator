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
import { useVisualizerContext } from "../../contexts/WsContext";
import { SamplesContainer } from "./SamplesContainer";

const PageBackdrop = styled.div`
    min-height: 100vh;
    padding: 28px 30px 24px;
    background:
        radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--wso2-brand-accent) 12%, transparent) 0%, transparent 36%),
        radial-gradient(circle at 8% 100%, color-mix(in srgb, var(--wso2-brand-primary) 8%, transparent) 0%, transparent 42%),
        var(--vscode-editor-background);
`;

const PageContainer = styled.div`
    max-width: 1180px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: calc(100vh - 52px);
`;

const Header = styled.header`
    display: flex;
    align-items: center;
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
    margin-top: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: color-mix(in srgb, var(--wso2-brand-accent) 16%, transparent);
        border-color: color-mix(in srgb, var(--wso2-brand-accent) 45%, transparent);
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
    height: 100%;
`;

export type ProjectType = "WSO2: BI" | "WSO2: MI" | "WSO2: SI";

const RUNTIME_DISPLAY_LABEL: Record<ProjectType, string> = {
    "WSO2: BI": "Default",
    "WSO2: MI": "WSO2: MI",
    "WSO2: SI": "WSO2: SI",
};

export function SamplesView({ onBack }: { onBack?: () => void }) {
    const [enabledRuntimes, setEnabledRuntimes] = useState<ProjectType[]>([]);
    const [projectType, setProjectType] = useState<ProjectType | "">("");
    const [isLoading, setIsLoading] = useState(true);
    const { wsClient } = useVisualizerContext();

    // Load enabled runtimes from VS Code configuration (three individual boolean settings)
    useEffect(() => {
        const loadDefaultRuntime = async () => {
            try {
                const [biResp, miResp, siResp] = await Promise.all([
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.bi" }),
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.mi" }),
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.si" }),
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
            <Loader>
                <ProgressIndicator />
            </Loader>
        );
    }

    return (
        <PageBackdrop>
            <PageContainer>
                <Header>
                    <BackButton type="button" onClick={gotToWelcome} title="Go back">
                        <Icon name="bi-arrow-back" iconSx={{ color: "var(--vscode-foreground)" }} />
                    </BackButton>
                    <HeaderText>
                        <HeaderTitle variant="h2">Browse Samples</HeaderTitle>
                        <HeaderSubtitle>
                            Start quickly by downloading a curated integration sample for your selected runtime.
                        </HeaderSubtitle>
                    </HeaderText>
                </Header>
                {enabledRuntimes.length > 1 && (
                    <RuntimePanel>
                        <RuntimeLabel>Runtime</RuntimeLabel>
                        <RuntimeOptions>
                            {enabledRuntimes.map((runtime: ProjectType) => (
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
                <ContentPanel>
                    {projectType && <SamplesContainer projectType={projectType as ProjectType} />}
                </ContentPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
