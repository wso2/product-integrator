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
const REMOTE_MODULE = "./EmbeddedBIProjectForm";

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

/** The BI creation variant the federated form should render. */
type EmbeddedFormMode = "integration" | "project" | "library";

/** Props of the federated form exposed by the Ballerina extension. */
interface EmbeddedFormProps {
    wsClient: unknown;
    ballerinaUnavailable?: boolean;
    mode?: EmbeddedFormMode;
    onBack?: () => void;
}

/**
 * Loads and renders the BI project-creation form that is owned by (and served
 * from) the Ballerina extension via Module Federation. The form is the exact
 * integrator form, relocated to the Ballerina repo as the single source of
 * truth. It runs in this webview and is driven by the integrator's own live
 * `wsClient` (passed across the federation boundary), so behavior — validation,
 * cloud projects, project creation, `.wso2/context.yaml` — is identical to
 * before. The `integration` variant renders inside the integrator's CreationView
 * chrome (which supplies the header and back button); the `project` and
 * `library` variants carry their own page chrome and use `onBack` for back
 * navigation.
 */
export function RemoteBIProjectForm({
    ballerinaUnavailable,
    mode = "integration",
    onBack,
}: { ballerinaUnavailable?: boolean; mode?: EmbeddedFormMode; onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const [FormComponent, setFormComponent] = useState<React.ComponentType<EmbeddedFormProps> | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (ballerinaUnavailable) {
            return;
        }
        const remoteUrl = window.__WI_BI_FORM_REMOTE;
        if (!remoteUrl) {
            setError(describeBiFormRemoteUnavailable("creation form"));
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const module = await loadRemoteModule<{ default: React.ComponentType<EmbeddedFormProps> }>(
                    remoteUrl,
                    REMOTE_GLOBAL_NAME,
                    REMOTE_MODULE,
                );
                if (!cancelled) {
                    setFormComponent(() => module.default);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : "Failed to load the integration form.");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [ballerinaUnavailable]);

    if (ballerinaUnavailable) {
        return (
            <StateContainer>
                <Typography variant="h4">Ballerina distribution is not set up</Typography>
                <Typography variant="body2">Use Configure to set it up, then try again.</Typography>
            </StateContainer>
        );
    }

    if (error) {
        return (
            <StateContainer>
                <Typography variant="h4">Unable to load the integration form</Typography>
                <Typography variant="body2">{error}</Typography>
            </StateContainer>
        );
    }

    if (!FormComponent) {
        return (
            <StateContainer>
                <ProgressIndicator />
                <Typography variant="body2">Preparing the integration form…</Typography>
            </StateContainer>
        );
    }

    return <FormComponent wsClient={wsClient} ballerinaUnavailable={ballerinaUnavailable} mode={mode} onBack={onBack} />;
}
