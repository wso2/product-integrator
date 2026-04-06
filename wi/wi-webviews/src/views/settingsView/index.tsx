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

import styled from "@emotion/styled";
import {
    Dropdown,
    Icon,
    type OptionProps,
    ProgressIndicator,
} from "@wso2/ui-toolkit";
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

type SelectedProfileValue = "WSO2 Integrator: Default" | "WSO2 Integrator: MI" | "WSO2 Integrator: SI";
type LegacyProfileValue = "bi" | "mi" | "si";
const SELECTED_PROFILE_SECTION = "integrator.selectedProfile";

const PROFILES: SelectedProfileValue[] = [
    "WSO2 Integrator: Default",
    "WSO2 Integrator: MI",
    "WSO2 Integrator: SI",
];

const PROFILE_OPTIONS: OptionProps[] = PROFILES.map((profile) => ({
    id: profile,
    value: profile,
    content: profile,
}));

function isSelectedProfileValue(value: unknown): value is SelectedProfileValue {
    return (
        value === "WSO2 Integrator: Default" ||
        value === "WSO2 Integrator: MI" ||
        value === "WSO2 Integrator: SI"
    );
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
            return "WSO2 Integrator: Default";
        case "mi":
            return "WSO2 Integrator: MI";
        case "si":
            return "WSO2 Integrator: SI";
    }
}

function getProfileForEnabledRuntimes(enabled: Record<LegacyProfileValue, boolean>): SelectedProfileValue {
    if (enabled.bi) {
        return "WSO2 Integrator: Default";
    }
    if (enabled.mi) {
        return "WSO2 Integrator: MI";
    }
    if (enabled.si) {
        return "WSO2 Integrator: SI";
    }
    return "WSO2 Integrator: Default";
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
    padding: 28px;
`;

const RuntimeField = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const DropdownShell = styled.div`
    max-width: 320px;
`;

const profileDropdownSx = {
    width: "100%",
};

const profileDropdownContainerSx = {
    position: "relative",
    "& vscode-dropdown::part(listbox)": {
        position: "absolute !important",
        top: "100% !important",
        bottom: "auto !important",
        transform: "none !important",
        marginTop: "2px !important",
    },
};

const ErrorText = styled.div`
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--vscode-errorForeground) 30%, transparent);
    background: color-mix(in srgb, var(--vscode-errorForeground) 10%, transparent);
    color: var(--vscode-errorForeground);
    font-size: 12px;
`;

const Loader = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
`;

export function SettingsView({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const [selectedProfile, setSelectedProfile] = useState<SelectedProfileValue>("WSO2 Integrator: Default");
    const [isLoading, setIsLoading] = useState(true);
    const [savingRuntime, setSavingRuntime] = useState<SelectedProfileValue | null>(null);
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
                setSelectedProfile("WSO2 Integrator: Default");
            } finally {
                setIsLoading(false);
            }
        };

        loadRuntimeSettings();
    }, [wsClient]);

    const applyRuntimeSelection = async (runtimeProfile: SelectedProfileValue) => {
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
                        <RuntimeField>
                            <DropdownShell>
                                <Dropdown
                                    id="selected-runtime"
                                    items={PROFILE_OPTIONS}
                                    value={selectedProfile}
                                    disabled={savingRuntime !== null}
                                    onValueChange={(value: string) => {
                                        void applyRuntimeSelection(value as SelectedProfileValue);
                                    }}
                                    sx={profileDropdownSx}
                                    containerSx={profileDropdownContainerSx}
                                />
                            </DropdownShell>
                        </RuntimeField>
                    </PanelBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
