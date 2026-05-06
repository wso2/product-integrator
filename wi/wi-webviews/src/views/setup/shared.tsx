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
 * Shared constants, styled-components, helper functions, and the
 * `useSetupProgress` hook consumed by both `BallerinaView` and
 * `CompactContent`.  Keep layout-specific styled-components in their
 * respective view files — only logic and atoms that are 100% identical
 * between the two belong here.
 */

import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Icon, ProgressRing } from "@wso2/ui-toolkit";
import { DownloadProgress } from "@wso2/wi-core";
import { useVisualizerContext } from "../../contexts";

// ---------------------------------------------------------------------------
// STEPS constant
// ---------------------------------------------------------------------------

export const STEPS = [
    { title: "Prepare Installation", description: "Checking versions and preparing environment for installation." },
    { title: "Install Ballerina Tool", description: "Downloading and installing the Ballerina tool package." },
    { title: "Install Ballerina Distribution", description: "Downloading and installing the Ballerina distribution package." },
    { title: "Install Java Runtime", description: "Downloading and installing the required Java Runtime Environment." },
    { title: "Complete Setup", description: "Configuring VS Code, setting permissions and finalizing installation." },
];

// ---------------------------------------------------------------------------
// Shared step-row styled-components
// ---------------------------------------------------------------------------

export const StepRow = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 12px;
`;

export const StepIconWrap = styled.div`
    margin-top: 2px;
    flex-shrink: 0;
    width: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
`;

export const StepContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

export interface StepTitleProps {
    error?: boolean;
}

export const StepTitle = styled.span<StepTitleProps>`
    font-size: 13px;
    font-weight: 500;
    color: ${(p: StepTitleProps) => p.error ? "var(--vscode-errorForeground)" : "var(--vscode-foreground)"};
`;

export const StepDesc = styled.span`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
`;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function getStepIcon(progress: DownloadProgress | null, stepIndex: number): React.ReactElement {
    if (!progress) {
        return <Icon name="radio-button-unchecked" iconSx={{ fontSize: "16px", cursor: "default" }} />;
    }
    const currentStep = progress.step ?? 0;
    const isComplete = progress.success || currentStep > stepIndex;
    const isActive = !progress.success && currentStep === stepIndex;
    if (isComplete) {
        return <Icon name="enable-inverse" iconSx={{ fontSize: "15px", color: "var(--vscode-textLink-foreground)", cursor: "default" }} />;
    }
    if (isActive) {
        return <ProgressRing sx={{ height: "16px", width: "16px" }} />;
    }
    return <Icon name="radio-button-unchecked" iconSx={{ fontSize: "16px", cursor: "default" }} />;
}

export function getStepTitle(progress: DownloadProgress | null, stepIndex: number, baseTitle: string): string {
    if (!progress) return baseTitle;
    const currentStep = progress.step ?? 0;
    if (!progress.success && currentStep === stepIndex && progress.percentage && progress.totalSize) {
        const sizeKB = progress.totalSize / 1024;
        const sizeLabel = sizeKB < 1024 ? `${Math.floor(sizeKB)} KB` : `${Math.floor(sizeKB / 1024)} MB`;
        return `${baseTitle} (${progress.percentage}% - ${sizeLabel})`;
    }
    return baseTitle;
}

// ---------------------------------------------------------------------------
// useSetupProgress hook
// ---------------------------------------------------------------------------

export interface UseSetupProgressResult {
    progress: DownloadProgress | null;
    setProgress: React.Dispatch<React.SetStateAction<DownloadProgress | null>>;
    isStarting: boolean;
    setIsStarting: React.Dispatch<React.SetStateAction<boolean>>;
    isSetupRunning: boolean;
    handleRestart: () => void;
}

export function useSetupProgress(): UseSetupProgressResult {
    const { wsClient } = useVisualizerContext();
    const [progress, setProgress] = useState<DownloadProgress | null>(null);
    const [isStarting, setIsStarting] = useState(false);

    useEffect(() => {
        return wsClient.onDownloadProgress((p: DownloadProgress) => setProgress(p));
    }, [wsClient]);

    const isSetupRunning = progress !== null && !progress.success && (progress.step ?? 0) !== -1;

    const handleRestart = () => {
        wsClient.runCommand({ command: "workbench.action.reloadWindow" });
    };

    return { progress, setProgress, isStarting, setIsStarting, isSetupRunning, handleRestart };
}
