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

import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { useVisualizerContext } from "../contexts";

export const WORKSPACE_INFO_QUERY_KEYS = {
    projectModeSupported: ["project_mode_supported"] as const,
    workspaceRoot: ["workspace_root"] as const,
} as const;

const PROJECT_MODE_MIN_VERSION = { major: 2201, minor: 13, patch: 0 };

/**
 * Returns whether the current Ballerina SL version supports project mode.
 * - Returns `true` optimistically while the check is in flight.
 * - Result is cached for the entire session (version never changes mid-session).
 */
export function useProjectModeSupported(): boolean {
    const { wsClient } = useVisualizerContext();
    const { data } = useQuery({
        queryKey: WORKSPACE_INFO_QUERY_KEYS.projectModeSupported,
        queryFn: () => wsClient.isSupportedSLVersion(PROJECT_MODE_MIN_VERSION),
        staleTime: Infinity,
        placeholderData: true,
    });
    return data ?? true;
}

/**
 * Returns the current VS Code workspace root path and a ready flag.
 * - `path`: the workspace root (empty string if none is open).
 * - `isReady`: false while the initial fetch is in flight.
 *
 * Uses stale-while-revalidate so callers get cached data instantly on
 * subsequent renders while a background refresh confirms the value.
 */
export function useWorkspaceRoot(): { path: string; isReady: boolean } {
    const { wsClient } = useVisualizerContext();
    const { data, isSuccess } = useQuery({
        queryKey: WORKSPACE_INFO_QUERY_KEYS.workspaceRoot,
        queryFn: () => wsClient.getWorkspaceRoot().then(r => r.path ?? ""),
        staleTime: 0, // always stale — revalidates in background, serves cache instantly
    });
    return { path: data ?? "", isReady: isSuccess };
}

/**
 * Drop this once inside the provider tree (inside WIWebviewQueryClientProvider).
 * It calls the workspace info hooks purely to pre-warm their React Query entries
 * at app startup, so any form that renders later receives cached values immediately.
 */
export function WorkspaceInfoPrefetcher({ children }: { children: ReactNode }) {
    useProjectModeSupported();
    useWorkspaceRoot();
    return <>{children}</>;
}
