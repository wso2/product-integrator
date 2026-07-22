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

/**
 * Availability of the Ballerina-owned federated BI forms, injected by the
 * extension host at webview creation (see webviewManager.ts). `missing` = the
 * Ballerina extension is not installed; `outdated` = it is installed but its
 * version predates the federated forms.
 */
export interface BiFormRemoteState {
    status: "ok" | "missing" | "outdated";
    /** Installed Ballerina extension version — set for `ok`/`outdated`. */
    version?: string;
}

declare global {
    interface Window {
        /** Webview URI of the Ballerina-owned BI form remoteEntry.js, injected by
         *  the extension host at webview creation. Null when unavailable. */
        __WI_BI_FORM_REMOTE?: string | null;
        /** Why the remote is (un)available — drives the fallback messaging. */
        __WI_BI_FORM_REMOTE_STATE?: BiFormRemoteState;
    }
}

/**
 * Human-readable, actionable explanation for why the federated BI view cannot
 * be shown. `viewLabel` names the view in the message (e.g. "creation form",
 * "migration wizard").
 */
export function describeBiFormRemoteUnavailable(viewLabel: string): string {
    const state = window.__WI_BI_FORM_REMOTE_STATE;
    if (state?.status === "outdated") {
        const installed = state.version ? ` (v${state.version})` : "";
        return `The installed Ballerina extension${installed} does not support the embedded ${viewLabel}. ` +
            "Update it to the latest version, then reload the window.";
    }
    return "The Ballerina extension is not installed. " +
        "Install it from the Extensions view, then reload the window.";
}
