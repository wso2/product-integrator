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

import { CheckBox, Icon, ProgressIndicator, Typography } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useEffect, useState } from "react";
import { useVisualizerContext } from "../../contexts/WsContext";

type RuntimeKey = "bi" | "mi" | "si";

interface RuntimeConfigState {
    bi: boolean;
    mi: boolean;
    si: boolean;
}

interface EnableConfirmationState {
    runtimeKey: RuntimeKey;
    runtimeLabel: string;
    extensionName: string;
}

interface RuntimeDefinition {
    key: RuntimeKey;
    label: string;
    description: string;
    extensionName: string;
    section: string;
}

const RUNTIME_DEFINITIONS: RuntimeDefinition[] = [
    {
        key: "bi",
        label: "Default",
        description: "Enable the default runtime for Ballerina-based integration projects.",
        extensionName: "Ballerina Integrator extension",
        section: "integrator.enabledRuntimes.bi",
    },
    {
        key: "mi",
        label: "WSO2: MI",
        description: "Enable Micro Integrator runtime templates and samples.",
        extensionName: "WSO2 Micro Integrator extension",
        section: "integrator.enabledRuntimes.mi",
    },
    {
        key: "si",
        label: "WSO2: SI",
        description: "Enable Stream Integrator runtime templates and samples.",
        extensionName: "WSO2 Stream Integrator extension",
        section: "integrator.enabledRuntimes.si",
    },
];

const PageBackdrop = styled.div`
    min-height: 100vh;
    padding: 28px 30px 24px;
    background:
        radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--wso2-brand-accent) 10%, transparent) 0%, transparent 34%),
        radial-gradient(circle at 10% 100%, color-mix(in srgb, var(--wso2-brand-primary) 8%, transparent) 0%, transparent 40%),
        var(--vscode-editor-background);
`;

const PageContainer = styled.div`
    max-width: 920px;
    margin: 0 auto;
    min-height: calc(100vh - 52px);
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const Header = styled.header`
    display: flex;
    align-items: flex-start;
    gap: 10px;
`;

const BackButton = styled.button`
    cursor: pointer;
    border-radius: 6px;
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
    background: transparent;
    appearance: none;
    padding: 0;
    line-height: 1;
    margin-top: 2px;
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

const SettingsPanel = styled.section`
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

const PanelHeader = styled.div`
    border-bottom: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 10%, var(--vscode-panel-border));
    padding: 14px 18px 12px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--wso2-brand-accent) 4%, var(--vscode-editor-background)) 0%,
        var(--vscode-editor-background) 100%
    );
`;

const PanelTitle = styled.h3`
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const PanelSubtitle = styled.p`
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const PanelBody = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const InfoText = styled.p`
    margin: 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const RuntimeList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const RuntimeItem = styled.div`
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 12%, var(--vscode-panel-border));
    border-radius: 10px;
    padding: 12px;
    background: color-mix(in srgb, var(--wso2-brand-primary) 4%, var(--vscode-editor-background));
`;

const RuntimeHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
`;

const RuntimeState = styled.span<{ enabled: boolean }>`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: ${(props: { enabled: boolean }) =>
        props.enabled ? "var(--wso2-brand-primary)" : "var(--vscode-descriptionForeground)"};
`;

const RuntimeDescription = styled.p`
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const ErrorText = styled.div`
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--vscode-errorForeground) 30%, transparent);
    background: color-mix(in srgb, var(--vscode-errorForeground) 10%, transparent);
    color: var(--vscode-errorForeground);
    font-size: 12px;
`;

const Footer = styled.div`
    margin-top: 4px;
    display: flex;
    justify-content: flex-end;
`;

const SecondaryButton = styled.button`
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 30%, var(--vscode-button-border));
    background: color-mix(in srgb, var(--wso2-brand-accent) 10%, transparent);
    color: var(--vscode-foreground);
    border-radius: 8px;
    height: 30px;
    padding: 0 12px;
    font-size: 12px;
    cursor: pointer;
`;

const Loader = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
`;

const ConfirmBackdrop = styled.div`
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--vscode-editor-background) 45%, transparent);
    backdrop-filter: blur(1px);
    z-index: 1000;
`;

const ConfirmDialog = styled.div`
    width: min(460px, calc(100vw - 32px));
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 20%, var(--vscode-panel-border));
    background: var(--vscode-editor-background);
    box-shadow: 0 16px 32px color-mix(in srgb, var(--wso2-brand-neutral-900) 25%, transparent);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const ConfirmTitle = styled.h4`
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const ConfirmDescription = styled.p`
    margin: 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.45;
`;

const ConfirmActions = styled.div`
    margin-top: 6px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
`;

const ConfirmButton = styled.button<{ primary?: boolean }>`
    border: 1px solid
        ${(props: { primary?: boolean }) =>
            props.primary
                ? "color-mix(in srgb, var(--wso2-brand-primary) 55%, var(--vscode-button-border))"
                : "color-mix(in srgb, var(--wso2-brand-accent) 30%, var(--vscode-button-border))"};
    background:
        ${(props: { primary?: boolean }) =>
            props.primary
                ? "var(--wso2-brand-primary)"
                : "color-mix(in srgb, var(--wso2-brand-accent) 10%, transparent)"};
    color: ${(props: { primary?: boolean }) => (props.primary ? "var(--vscode-button-foreground)" : "var(--vscode-foreground)")};
    border-radius: 8px;
    height: 30px;
    padding: 0 12px;
    font-size: 12px;
    cursor: pointer;
`;

export function SettingsView({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const [runtimeState, setRuntimeState] = useState<RuntimeConfigState>({ bi: true, mi: false, si: false });
    const [isLoading, setIsLoading] = useState(true);
    const [savingRuntime, setSavingRuntime] = useState<RuntimeKey | null>(null);
    const [pendingEnableConfirmation, setPendingEnableConfirmation] = useState<EnableConfirmationState | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadRuntimeSettings = async () => {
            try {
                const [biResp, miResp, siResp] = await Promise.all([
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.bi" }),
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.mi" }),
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.si" }),
                ]);

                const nextState: RuntimeConfigState = {
                    bi: biResp?.value === true,
                    mi: miResp?.value === true,
                    si: siResp?.value === true,
                };

                if (!Object.values(nextState).some(Boolean)) {
                    nextState.bi = true;
                    await wsClient.setConfiguration({
                        section: "integrator.enabledRuntimes.bi",
                        value: true,
                    });
                }

                setRuntimeState(nextState);
            } catch (loadError) {
                console.error("Failed to load runtime settings:", loadError);
                setError("Failed to load settings. Showing defaults.");
                setRuntimeState({ bi: true, mi: false, si: false });
            } finally {
                setIsLoading(false);
            }
        };

        loadRuntimeSettings();
    }, [wsClient]);

    const applyRuntimeToggle = async (runtimeKey: RuntimeKey, enabled: boolean) => {
        const runtimeDefinition = RUNTIME_DEFINITIONS.find((runtime) => runtime.key === runtimeKey);
        if (!runtimeDefinition) {
            return;
        }

        if (!enabled && runtimeState[runtimeKey] && Object.values(runtimeState).filter(Boolean).length === 1) {
            setError("At least one runtime must stay enabled.");
            return;
        }

        setError(null);
        const previousState = runtimeState;
        const nextState = {
            ...runtimeState,
            [runtimeKey]: enabled,
        };

        setRuntimeState(nextState);
        setSavingRuntime(runtimeKey);

        try {
            await wsClient.setConfiguration({
                section: runtimeDefinition.section,
                value: enabled,
            });
        } catch (updateError) {
            console.error("Failed to update runtime setting:", updateError);
            setRuntimeState(previousState);
            setError("Failed to save the setting. Please try again.");
        } finally {
            setSavingRuntime(null);
        }
    };

    const handleRuntimeToggle = (runtimeKey: RuntimeKey, enabled: boolean) => {
        const runtimeDefinition = RUNTIME_DEFINITIONS.find((runtime) => runtime.key === runtimeKey);
        if (!runtimeDefinition) {
            return;
        }

        if (enabled && !runtimeState[runtimeKey]) {
            setPendingEnableConfirmation({
                runtimeKey,
                runtimeLabel: runtimeDefinition.label,
                extensionName: runtimeDefinition.extensionName,
            });
            return;
        }

        void applyRuntimeToggle(runtimeKey, enabled);
    };

    const confirmEnableRuntime = async () => {
        if (!pendingEnableConfirmation) {
            return;
        }
        const runtimeKey = pendingEnableConfirmation.runtimeKey;
        setPendingEnableConfirmation(null);
        await applyRuntimeToggle(runtimeKey, true);
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
                <Header>
                    <BackButton type="button" onClick={onBack} title="Go back">
                        <Icon
                            name="arrow-left"
                            isCodicon
                            sx={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            iconSx={{ color: "var(--vscode-foreground)", fontSize: "16px", lineHeight: 1 }}
                        />
                    </BackButton>
                    <HeaderText>
                        <HeaderTitle variant="h2">Settings</HeaderTitle>
                        <HeaderSubtitle>Manage runtime availability for project creation and sample browsing.</HeaderSubtitle>
                    </HeaderText>
                </Header>
                <SettingsPanel>
                    <PanelHeader>
                        <PanelTitle>Enabled Runtimes</PanelTitle>
                        <PanelSubtitle>Changes are saved directly to your integrator configuration.</PanelSubtitle>
                    </PanelHeader>
                    <PanelBody>
                        <InfoText>Select which runtimes should be available in project creation and samples.</InfoText>
                        {error && <ErrorText>{error}</ErrorText>}
                        <RuntimeList>
                            {RUNTIME_DEFINITIONS.map((runtime) => (
                                <RuntimeItem key={runtime.key}>
                                    <RuntimeHeader>
                                        <CheckBox
                                            label={runtime.label}
                                            checked={runtimeState[runtime.key]}
                                            disabled={savingRuntime !== null}
                                            onChange={(checked) => {
                                                handleRuntimeToggle(runtime.key, checked);
                                            }}
                                        />
                                        <RuntimeState enabled={runtimeState[runtime.key]}>
                                            {runtimeState[runtime.key] ? "Enabled" : "Disabled"}
                                        </RuntimeState>
                                    </RuntimeHeader>
                                    <RuntimeDescription>{runtime.description}</RuntimeDescription>
                                </RuntimeItem>
                            ))}
                        </RuntimeList>
                        <Footer>
                            <SecondaryButton type="button" onClick={() => wsClient.openSettings("integrator.enabledRuntimes")}>
                                Open Advanced Settings
                            </SecondaryButton>
                        </Footer>
                    </PanelBody>
                </SettingsPanel>
            </PageContainer>
            {pendingEnableConfirmation && (
                <ConfirmBackdrop>
                    <ConfirmDialog role="dialog" aria-modal="true" aria-label="Enable runtime confirmation">
                        <ConfirmTitle>Enable Runtime</ConfirmTitle>
                        <ConfirmDescription>
                            Enabling {pendingEnableConfirmation.runtimeLabel} will download the{" "}
                            {pendingEnableConfirmation.extensionName}. Do you want to continue?
                        </ConfirmDescription>
                        <ConfirmActions>
                            <ConfirmButton type="button" onClick={() => setPendingEnableConfirmation(null)}>
                                Cancel
                            </ConfirmButton>
                            <ConfirmButton
                                type="button"
                                primary
                                onClick={() => {
                                    void confirmEnableRuntime();
                                }}
                            >
                                Enable Runtime
                            </ConfirmButton>
                        </ConfirmActions>
                    </ConfirmDialog>
                </ConfirmBackdrop>
            )}
        </PageBackdrop>
    );
}
