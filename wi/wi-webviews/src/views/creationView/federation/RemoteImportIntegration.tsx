/* eslint-disable @typescript-eslint/no-explicit-any */

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
import { ProgressIndicator, Typography } from "@wso2/ui-toolkit";
import { useEffect, useState } from "react";
import { useVisualizerContext } from "../../../contexts";
import { loadRemoteModule } from "./loadRemote";
import { describeBiFormRemoteUnavailable } from "./remoteStatus";

const REMOTE_GLOBAL_NAME = "ballerinaBiForm";
const REMOTE_MODULE = "./EmbeddedImportIntegration";

const StateContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    justify-content: center;
    align-items: center;
    min-height: 320px;
    text-align: center;
    padding: 24px;
`;

/** Props of the federated import wizard exposed by the Ballerina extension. */
interface EmbeddedImportProps {
    wsClient: unknown;
    onBack: () => void;
}

/**
 * Loads and renders the Import Integration (migration) wizard owned by — and
 * served from — the Ballerina extension via Module Federation. The wizard talks
 * to the Ballerina host directly over the giga-bridge WS manager (websocket
 * mode), so the migration RPCs run on the Ballerina side. Rendered inline in the
 * integrator welcome panel; `onBack` returns to the welcome view.
 */
export function RemoteImportIntegration({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const [FormComponent, setFormComponent] = useState<React.ComponentType<EmbeddedImportProps> | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const remoteUrl = window.__WI_BI_FORM_REMOTE;
        if (!remoteUrl) {
            setError(describeBiFormRemoteUnavailable("migration wizard"));
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const module = await loadRemoteModule<{ default: React.ComponentType<EmbeddedImportProps> }>(
                    remoteUrl,
                    REMOTE_GLOBAL_NAME,
                    REMOTE_MODULE,
                );
                if (!cancelled) {
                    setFormComponent(() => module.default);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : "Failed to load the migration wizard.");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (error) {
        return (
            <StateContainer>
                <Typography variant="h4">Unable to load the migration wizard</Typography>
                <Typography variant="body2">{error}</Typography>
            </StateContainer>
        );
    }

    if (!FormComponent) {
        return (
            <StateContainer>
                <ProgressIndicator />
                <Typography variant="body2">Preparing the migration wizard…</Typography>
            </StateContainer>
        );
    }

    return <FormComponent wsClient={wsClient} onBack={() => onBack?.()} />;
}
