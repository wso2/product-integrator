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

import { Icon, ProgressIndicator } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useEffect, useState } from "react";
import { useVisualizerContext } from "../../contexts/WsContext";
import {
    PageBackdrop,
    BackButton,
    HeaderRow,
    HeaderText,
    HeaderTitle,
    HeaderSubtitle,
    FormPanel,
    FormPanelHeader,
    FormPanelTitle,
    FormPanelSubtitle,
    FormBody,
} from "../shared/FormPageLayout";

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
        description: "Use the default profile for Ballerina-based integration projects.",
        extensionName: "Ballerina Integrator extension",
        section: "integrator.enabledRuntimes.bi",
    },
    {
        key: "mi",
        label: "WSO2: MI",
        description: "Use the Micro Integrator profile templates and samples.",
        extensionName: "WSO2 Micro Integrator extension",
        section: "integrator.enabledRuntimes.mi",
    },
    {
        key: "si",
        label: "WSO2: SI",
        description: "Use the Stream Integrator profile templates and samples.",
        extensionName: "WSO2 Stream Integrator extension",
        section: "integrator.enabledRuntimes.si",
    },
];

const PageContainer = styled.div`
    max-width: 920px;
    margin: 0 auto;
    min-height: calc(100vh - 52px);
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const PanelBody = styled(FormBody)`
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

const RuntimeOption = styled.label`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
`;

const RuntimeRadio = styled.input`
    margin: 0;
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

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
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

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
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

                const currentState: RuntimeConfigState = {
                    bi: biResp?.value === true,
                    mi: miResp?.value === true,
                    si: siResp?.value === true,
                };

                const selectedRuntime = (Object.keys(currentState) as RuntimeKey[]).find(
                    (runtimeKey) => currentState[runtimeKey],
                ) ?? "bi";

                const nextState: RuntimeConfigState = {
                    bi: selectedRuntime === "bi",
                    mi: selectedRuntime === "mi",
                    si: selectedRuntime === "si",
                };

                await Promise.all(
                    RUNTIME_DEFINITIONS.map((runtime) =>
                        wsClient.setConfiguration({
                            section: runtime.section,
                            value: nextState[runtime.key],
                        }),
                    ),
                );

                setRuntimeState(nextState);
            } catch (loadError) {
                console.error("Failed to load profile settings:", loadError);
                setError("Failed to load settings. Showing defaults.");
                setRuntimeState({ bi: true, mi: false, si: false });
            } finally {
                setIsLoading(false);
            }
        };

        loadRuntimeSettings();
    }, [wsClient]);

    const applyRuntimeSelection = async (runtimeKey: RuntimeKey) => {
        const runtimeDefinition = RUNTIME_DEFINITIONS.find((runtime) => runtime.key === runtimeKey);
        if (!runtimeDefinition) {
            return;
        }

        if (runtimeState[runtimeKey]) {
            return;
        }

        setError(null);
        const previousState = runtimeState;
        const nextState: RuntimeConfigState = {
            bi: runtimeKey === "bi",
            mi: runtimeKey === "mi",
            si: runtimeKey === "si",
        };

        setRuntimeState(nextState);
        setSavingRuntime(runtimeKey);

        try {
            await Promise.all(
                RUNTIME_DEFINITIONS.map((runtime) =>
                    wsClient.setConfiguration({
                        section: runtime.section,
                        value: nextState[runtime.key],
                    }),
                ),
            );
        } catch (updateError) {
            console.error("Failed to update profile setting:", updateError);
            setRuntimeState(previousState);
            setError("Failed to save the setting. Please try again.");
        } finally {
            setSavingRuntime(null);
        }
    };

    const handleRuntimeSelect = (runtimeKey: RuntimeKey) => {
        const runtimeDefinition = RUNTIME_DEFINITIONS.find((runtime) => runtime.key === runtimeKey);
        if (!runtimeDefinition) {
            return;
        }

        if (!runtimeState[runtimeKey]) {
            setPendingEnableConfirmation({
                runtimeKey,
                runtimeLabel: runtimeDefinition.label,
                extensionName: runtimeDefinition.extensionName,
            });
            return;
        }

        void applyRuntimeSelection(runtimeKey);
    };

    const confirmEnableRuntime = async () => {
        if (!pendingEnableConfirmation) {
            return;
        }
        const runtimeKey = pendingEnableConfirmation.runtimeKey;
        setPendingEnableConfirmation(null);
        await applyRuntimeSelection(runtimeKey);
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
                        <HeaderTitle variant="h2">Settings</HeaderTitle>
                        <HeaderSubtitle>Manage profile selection for project creation and sample browsing.</HeaderSubtitle>
                    </HeaderText>
                </HeaderRow>
                <FormPanel>
                    <FormPanelHeader>
                        <FormPanelTitle>Selected Profile</FormPanelTitle>
                        <FormPanelSubtitle>Changes are saved directly to your integrator configuration.</FormPanelSubtitle>
                    </FormPanelHeader>
                    <PanelBody>
                        <InfoText>Select one profile to use for project creation and welcome content.</InfoText>
                        {error && <ErrorText>{error}</ErrorText>}
                        <RuntimeList>
                            {RUNTIME_DEFINITIONS.map((runtime) => (
                                <RuntimeItem key={runtime.key}>
                                    <RuntimeHeader>
                                        <RuntimeOption>
                                            <RuntimeRadio
                                                type="radio"
                                                name="selected-runtime"
                                                checked={runtimeState[runtime.key]}
                                                disabled={savingRuntime !== null}
                                                onChange={() => {
                                                    handleRuntimeSelect(runtime.key);
                                                }}
                                            />
                                            <span>{runtime.label}</span>
                                        </RuntimeOption>
                                        <RuntimeState enabled={runtimeState[runtime.key]}>
                                            {runtimeState[runtime.key] ? "Selected" : "Not selected"}
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
                </FormPanel>
            </PageContainer>
            {pendingEnableConfirmation && (
                <ConfirmBackdrop>
                    <ConfirmDialog role="dialog" aria-modal="true" aria-label="Select profile confirmation">
                        <ConfirmTitle>Select Profile</ConfirmTitle>
                        <ConfirmDescription>
                            Selecting {pendingEnableConfirmation.runtimeLabel} will download the{" "}
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
                                Select Profile
                            </ConfirmButton>
                        </ConfirmActions>
                    </ConfirmDialog>
                </ConfirmBackdrop>
            )}
        </PageBackdrop>
    );
}
