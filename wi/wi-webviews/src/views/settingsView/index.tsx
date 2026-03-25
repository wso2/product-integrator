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
    BackButton,
    FormBody,
    FormPanel,
    FormPanelHeader,
    HeaderRow,
    HeaderSubtitle,
    HeaderText,
    HeaderTitle,
    PageBackdrop,
} from "../shared/FormPageLayout";

type SelectedProfileValue = "Default" | "WSO2 Integrator: MI" | "WSO2 Integrator: SI";
type LegacyProfileValue = "bi" | "mi" | "si";
const SELECTED_PROFILE_SECTION = "integrator.selectedProfile";

interface EnableConfirmationState {
    runtimeProfile: SelectedProfileValue;
    runtimeLabel: string;
    extensionName: string;
}

interface RuntimeDefinition {
    profile: SelectedProfileValue;
    description?: string;
    extensionName: string;
}

const RUNTIME_DEFINITIONS: RuntimeDefinition[] = [
    {
        profile: "Default",
        extensionName: "Ballerina Integrator extension",
    },
    {
        profile: "WSO2 Integrator: MI",
        description: "Enable the Micro Integrator profile templates and samples.",
        extensionName: "WSO2 Micro Integrator extension",
    },
    {
        profile: "WSO2 Integrator: SI",
        description: "Enable the Stream Integrator profile templates and samples.",
        extensionName: "WSO2 Stream Integrator extension",
    },
];

const RuntimeDescription = styled.p`
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

function isSelectedProfileValue(value: unknown): value is SelectedProfileValue {
    return value === "Default"
        || value === "WSO2 Integrator: MI"
        || value === "WSO2 Integrator: SI";
}

function isLegacyProfileValue(value: unknown): value is LegacyProfileValue {
    return value === "bi" || value === "mi" || value === "si";
}

function normalizeProfileValue(profileValue: unknown): SelectedProfileValue | undefined {
    if (isSelectedProfileValue(profileValue)) {
        return profileValue;
    }

    if (!isLegacyProfileValue(profileValue)) {
        return undefined;
    }

    switch (profileValue) {
        case "bi":
            return "Default";
        case "mi":
            return "WSO2 Integrator: MI";
        case "si":
            return "WSO2 Integrator: SI";
    }
}

function getProfileForEnabledRuntimes(enabled: Record<LegacyProfileValue, boolean>): SelectedProfileValue {
    if (enabled.bi) {
        return "Default";
    }
    if (enabled.mi) {
        return "WSO2 Integrator: MI";
    }
    if (enabled.si) {
        return "WSO2 Integrator: SI";
    }
    return "Default";
}

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
    const [selectedProfile, setSelectedProfile] = useState<SelectedProfileValue>("Default");
    const [isLoading, setIsLoading] = useState(true);
    const [savingRuntime, setSavingRuntime] = useState<SelectedProfileValue | null>(null);
    const [pendingEnableConfirmation, setPendingEnableConfirmation] = useState<EnableConfirmationState | null>(null);
    const [error, setError] = useState<string | null>(null);

    const persistSelectedProfile = async (profile: SelectedProfileValue) => {
        await wsClient.setConfiguration({
            section: SELECTED_PROFILE_SECTION,
            value: profile,
        });
    };

    useEffect(() => {
        const loadRuntimeSettings = async () => {
            try {
                const selectedProfileResponse = await wsClient.getConfiguration({
                    section: SELECTED_PROFILE_SECTION,
                });

                const normalizedProfile = normalizeProfileValue(selectedProfileResponse?.value);
                if (normalizedProfile) {
                    if (selectedProfileResponse?.value !== normalizedProfile) {
                        await persistSelectedProfile(normalizedProfile);
                    }
                    setSelectedProfile(normalizedProfile);
                    return;
                }

                const [biResp, miResp, siResp] = await Promise.all([
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.bi" }),
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.mi" }),
                    wsClient.getConfiguration({ section: "integrator.enabledRuntimes.si" }),
                ]);

                const currentState: Record<LegacyProfileValue, boolean> = {
                    bi: biResp?.value === true,
                    mi: miResp?.value === true,
                    si: siResp?.value === true,
                };

                const fallbackProfile = getProfileForEnabledRuntimes(currentState);
                await persistSelectedProfile(fallbackProfile);
                setSelectedProfile(fallbackProfile);
            } catch (loadError) {
                console.error("Failed to load profile settings:", loadError);
                setError("Failed to load settings. Showing defaults.");
                setSelectedProfile("Default");
            } finally {
                setIsLoading(false);
            }
        };

        loadRuntimeSettings();
    }, [wsClient]);

    const applyRuntimeSelection = async (runtimeProfile: SelectedProfileValue) => {
        const runtimeDefinition = RUNTIME_DEFINITIONS.find((runtime) => runtime.profile === runtimeProfile);
        if (!runtimeDefinition) {
            return;
        }

        if (selectedProfile === runtimeProfile) {
            return;
        }

        setError(null);
        const previousProfile = selectedProfile;

        setSelectedProfile(runtimeProfile);
        setSavingRuntime(runtimeProfile);

        try {
            await persistSelectedProfile(runtimeProfile);
        } catch (updateError) {
            console.error("Failed to update profile setting:", updateError);
            setSelectedProfile(previousProfile);
            setError("Failed to save the setting. Please try again.");
        } finally {
            setSavingRuntime(null);
        }
    };

    const handleRuntimeSelect = (runtimeProfile: SelectedProfileValue) => {
        const runtimeDefinition = RUNTIME_DEFINITIONS.find((runtime) => runtime.profile === runtimeProfile);
        if (!runtimeDefinition) {
            return;
        }

        if (selectedProfile !== runtimeProfile) {
            setPendingEnableConfirmation({
                runtimeProfile,
                runtimeLabel: runtimeDefinition.profile,
                extensionName: runtimeDefinition.extensionName,
            });
            return;
        }

        void applyRuntimeSelection(runtimeProfile);
    };

    const confirmEnableRuntime = async () => {
        if (!pendingEnableConfirmation) {
            return;
        }
        const runtimeProfile = pendingEnableConfirmation.runtimeProfile;
        setPendingEnableConfirmation(null);
        await applyRuntimeSelection(runtimeProfile);
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

                <FormPanel>
                    <FormPanelHeader>
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
                                <HeaderSubtitle>Settings related to WSO2 Integrator.</HeaderSubtitle>
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>
                    <PanelBody>
                        <div style={{ marginBottom: '5px'}}>Select your Integration Profile.</div>
                        {error && <ErrorText>{error}</ErrorText>}
                        <RuntimeList>
                            {RUNTIME_DEFINITIONS.map((runtime) => (
                                <RuntimeItem key={runtime.profile}>
                                    <RuntimeHeader>
                                        <RuntimeOption>
                                            <RuntimeRadio
                                                type="radio"
                                                name="selected-runtime"
                                                checked={selectedProfile === runtime.profile}
                                                disabled={savingRuntime !== null}
                                                onChange={() => {
                                                    handleRuntimeSelect(runtime.profile);
                                                }}
                                            />
                                            <span>{runtime.profile}</span>
                                        </RuntimeOption>
                                    </RuntimeHeader>
                                    {runtime.description && <RuntimeDescription>{runtime.description}</RuntimeDescription>}
                                </RuntimeItem>
                            ))}
                        </RuntimeList>
                        <Footer>
                            <SecondaryButton type="button" onClick={() => wsClient.openSettings("integrator.selectedProfile")}>
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
