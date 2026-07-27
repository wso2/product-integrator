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
import { ProgressIndicator } from "@wso2/ui-toolkit";
import React, { useEffect, useState } from "react";
import { useVisualizerContext } from "../../../contexts/WsContext";
import { loadRemoteModule } from "./loadRemote";

/** Transport bootstrap consumed by the MI form's `MiWsClient` (mirrors the MI
 *  extension's `WebviewTransportBootstrap` wire type). */
interface MiBridgeBootstrap {
    mode: "proxy" | "websocket";
    wsServer: string;
    wsPort: number;
    token?: string;
}

interface EmbeddedMiProjectFormProps {
    onBack?: () => void;
    bootstrap?: MiBridgeBootstrap;
}

declare global {
    interface Window {
        /** URL of the MI extension's federation remoteEntry.js, injected by the
         *  extension host (`webviewManager.ts`); null/undefined when the MI
         *  extension is not installed. */
        __WI_MI_FORM_REMOTE?: string | null;
        /** Transport coordinates injected for the federated MI form. */
        __MI_BRIDGE_BOOTSTRAP?: MiBridgeBootstrap;
    }
}

const MI_FORM_CONTAINER = "miProjectForm";
const MI_FORM_MODULE = "./EmbeddedMiProjectForm";

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 320px;
`;

const ErrorContainer = styled.div`
    color: var(--vscode-errorForeground);
    padding: 16px 0;
`;

/**
 * Loads the MI project-creation form served by the MI extension as a Module
 * Federation remote, and connects it to the MI extension's giga-bridge
 * websocket (coordinates fetched through this webview's own bridge).
 */
export function RemoteMiProjectForm({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const [remoteForm, setRemoteForm] = useState<{
        Component: React.ComponentType<EmbeddedMiProjectFormProps>;
        bootstrap: MiBridgeBootstrap;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const remoteUrl = window.__WI_MI_FORM_REMOTE;
                if (!remoteUrl) {
                    throw new Error(
                        "The WSO2 Integrator: MI extension is not available. Please install it to create MI projects.",
                    );
                }
                const coords = await wsClient.getMiFormWsBootstrap();
                const bootstrap: MiBridgeBootstrap = {
                    mode: "websocket",
                    wsServer: coords.host,
                    wsPort: coords.port,
                    token: coords.token,
                };
                window.__MI_BRIDGE_BOOTSTRAP = bootstrap;
                const module = await loadRemoteModule<{ default: React.ComponentType<EmbeddedMiProjectFormProps> }>(
                    remoteUrl,
                    MI_FORM_CONTAINER,
                    MI_FORM_MODULE,
                );
                if (!cancelled) {
                    setRemoteForm({ Component: module.default, bootstrap });
                }
            } catch (loadError) {
                console.error("Failed to load the MI project form remote:", loadError);
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : String(loadError));
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [wsClient]);

    if (error) {
        return <ErrorContainer>{error}</ErrorContainer>;
    }

    if (!remoteForm) {
        return (
            <LoadingContainer>
                <ProgressIndicator />
            </LoadingContainer>
        );
    }

    const { Component, bootstrap } = remoteForm;
    return <Component onBack={onBack} bootstrap={bootstrap} />;
}
