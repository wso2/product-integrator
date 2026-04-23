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
    DEFAULT_PROFILE,
    SELECTED_PROFILE_CONFIG_SECTION,
    SELECTED_PROFILE_VALUES,
    type SelectedProfileValue,
} from "@wso2/wi-core";
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
import { SetupContent } from "../setupView";

const PROFILE_OPTIONS: OptionProps[] = SELECTED_PROFILE_VALUES.map((profile) => ({
    id: profile,
    value: profile,
    content: profile,
}));

function isSelectedProfileValue(value: unknown): value is SelectedProfileValue {
    return typeof value === "string"
        && (SELECTED_PROFILE_VALUES as readonly string[]).includes(value);
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

const SetupSeparator = styled.div`
    margin-top: 28px;
    padding-top: 24px;
    border-top: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
`;

export function SettingsView({ onBack, ballerinaUnavailable }: { onBack?: () => void; ballerinaUnavailable?: boolean }) {
    const { wsClient } = useVisualizerContext();
    const [selectedProfile, setSelectedProfile] = useState<SelectedProfileValue>(DEFAULT_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const [savingRuntime, setSavingRuntime] = useState<SelectedProfileValue | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [localBallerinaUnavailable, setLocalBallerinaUnavailable] = useState<boolean>(ballerinaUnavailable ?? false);

    const persistSelectedProfile = async (profile: SelectedProfileValue) => {
        await wsClient.setConfiguration({
            section: SELECTED_PROFILE_CONFIG_SECTION,
            value: profile,
        });
    };

    useEffect(() => {
        const loadRuntimeSettings = async () => {
            try {
                const selectedProfileResponse = await wsClient.getConfiguration({
                    section: SELECTED_PROFILE_CONFIG_SECTION,
                });

                if (isSelectedProfileValue(selectedProfileResponse?.value)) {
                    setSelectedProfile(selectedProfileResponse.value);
                    return;
                }

                await persistSelectedProfile(DEFAULT_PROFILE);
                setSelectedProfile(DEFAULT_PROFILE);
            } catch (loadError) {
                console.error("Failed to load profile settings:", loadError);
                setError("Failed to load settings. Showing defaults.");
                setSelectedProfile(DEFAULT_PROFILE);
            } finally {
                setIsLoading(false);
            }
        };

        loadRuntimeSettings();
    }, [wsClient]);

    useEffect(() => {
        if (selectedProfile !== DEFAULT_PROFILE || isLoading) {
            setLocalBallerinaUnavailable(false);
            return;
        }
        // If the parent already knows Ballerina is unavailable, use that directly.
        if (ballerinaUnavailable) {
            setLocalBallerinaUnavailable(true);
            return;
        }
        wsClient.getBIRuntimeStatus().then(({ isAvailable }) => {
            setLocalBallerinaUnavailable(!isAvailable);
        }).catch(() => {
            // Don't block on failure
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProfile, isLoading]);

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
                                <HeaderTitle variant="h2">Configurations</HeaderTitle>
                                <HeaderSubtitle>Configurations related to WSO2 Integrator.</HeaderSubtitle>
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
                        {localBallerinaUnavailable && selectedProfile === DEFAULT_PROFILE && (
                            <SetupSeparator>
                                <SetupContent />
                            </SetupSeparator>
                        )}
                    </PanelBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
