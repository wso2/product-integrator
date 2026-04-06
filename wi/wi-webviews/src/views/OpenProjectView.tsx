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

import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Codicon, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { Project, WICommandIds } from "@wso2/wso2-platform-core";
import {
    BackButton,
    FormBody,
    FormPanel,
    FormPanelHeader,
    FormPanelSubtitle,
    FormPanelTitle,
    HeaderRow,
    HeaderSubtitle,
    HeaderText,
    HeaderTitle,
    PageBackdrop,
    PageContainer,
} from "./shared/FormPageLayout";
import { useVisualizerContext } from "../contexts";
import { useCloudContext } from "../providers";
import { useSignIn } from "../hooks/useSignIn";
import { CloneProgressStage } from "@wso2/wi-core";

// ── Project list styles ───────────────────────────────────────────────────────

const ProjectList = styled.div`
    display: flex;
    flex-direction: column;
`;

const ProjectRow = styled.button`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
    padding: 12px 16px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    transition: background 0.15s ease;
    border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 50%, transparent);

    &:last-child {
        border-bottom: none;
    }

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }
`;

const ProjectRowIcon = styled.div`
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--wso2-brand-primary) 0%, var(--wso2-brand-primary-alt) 100%);
    flex-shrink: 0;
`;

const ProjectRowContent = styled.div`
    flex: 1;
    min-width: 0;
`;

const ProjectRowName = styled.span`
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin-bottom: 2px;
`;

const ProjectRowDescription = styled.span`
    display: block;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

// ── Confirmation panel styles ─────────────────────────────────────────────────

const ConfirmBody = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 36px 32px 28px;
    gap: 0;
`;

const ConfirmProjectIcon = styled.div`
    width: 56px;
    height: 56px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--wso2-brand-primary) 0%, var(--wso2-brand-primary-alt) 100%);
    margin-bottom: 16px;
    flex-shrink: 0;
`;

const ConfirmProjectName = styled.h2`
    margin: 0 0 6px;
    font-size: 18px;
    font-weight: 700;
    color: var(--vscode-foreground);
    text-align: center;
`;

const ConfirmProjectDescription = styled.p`
    margin: 0 0 24px;
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
    line-height: 1.5;
    max-width: 420px;
`;

const CloneInfoCallout = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 8px;
    border: 1px solid var(--vscode-panel-border);
    background: color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
    width: 100%;
    max-width: 420px;
    margin-bottom: 28px;
    font-size: 12px;
    color: var(--vscode-foreground);
    line-height: 1.5;
`;

const CalloutText = styled.span`
    flex: 1;
    min-width: 0;
`;

const CalloutTitle = styled.span`
    display: block;
    font-weight: 600;
    margin-bottom: 2px;
    color: var(--vscode-foreground);
`;

const CalloutDesc = styled.span`
    display: block;
    color: var(--vscode-descriptionForeground);
`;

const ConfirmActions = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
    max-width: 420px;
`;

const CloneButton = styled.button`
    width: 100%;
    height: 40px;
    border-radius: 8px;
    border: none;
    background: var(--button-primary-background);
    color: var(--vscode-button-foreground);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 0.15s ease;

    &:hover:not(:disabled) {
        background: var(--button-primary-hover-background);
    }

    &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

const BackToListButton = styled.button`
    background: none;
    border: none;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;

    &:hover {
        color: var(--vscode-textLink-activeForeground);
        text-decoration: underline;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

// ── Landing choice card styles ────────────────────────────────────────────────

const LandingWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
`;

const ChoiceGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    width: 100%;
`;

const ChoiceCard = styled.button`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 60px 20px;
    border-radius: 10px;
    border: 1px solid var(--vscode-panel-border);
    background: color-mix(in srgb, var(--vscode-foreground) 3%, transparent);
    cursor: pointer;
    text-align: center;
    font-family: var(--vscode-font-family);
    transition: background 0.15s ease, border-color 0.15s ease;

    &:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: color-mix(in srgb, var(--vscode-focusBorder) 55%, transparent);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

const ChoiceCardIconWrapper = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
    flex-shrink: 0;
`;

const ChoiceCardTitle = styled.span`
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin-bottom: 6px;
    text-align: center;
`;

const ChoiceCardDesc = styled.span`
    display: block;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
    text-align: center;
`;

// ── Shared styles ─────────────────────────────────────────────────────────────

const CenteredMessage = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    gap: 12px;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    text-align: center;
`;

const RetryButton = styled.button`
    padding: 6px 16px;
    border-radius: 6px;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--button-secondary-background);
    color: var(--vscode-button-secondaryForeground);
    font-size: 13px;
    font-family: var(--vscode-font-family);
    cursor: pointer;

    &:hover {
        background: var(--button-secondary-hover-background);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

const SignInPrompt = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 32px 36px;
    gap: 0;
    text-align: center;
`;

const SignInIconWrapper = styled.div`
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--wso2-brand-primary) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 20%, transparent);
    margin-bottom: 16px;
    flex-shrink: 0;
`;

const SignInTitle = styled.h3`
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: var(--vscode-foreground);
`;

const SignInDescription = styled.p`
    margin: 0 0 24px;
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
    max-width: 320px;
`;

const SignInButton = styled.button`
    height: 36px;
    padding: 0 20px;
    border-radius: 8px;
    border: none;
    background: var(--button-primary-background);
    color: var(--vscode-button-foreground);
    font-size: 13px;
    font-weight: 600;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 7px;
    transition: background 0.15s ease;

    &:hover:not(:disabled) {
        background: var(--button-primary-hover-background);
    }

    &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

// ── Org switcher ──────────────────────────────────────────────────────────────

const OrgSwitcherWrapper = styled.div`
    position: relative;
    flex-shrink: 0;
`;

const OrgTriggerButton = styled.button<{ open: boolean }>`
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px 5px 6px;
    border-radius: 20px;
    border: 1px solid ${({ open }: { open: boolean }) =>
        open
            ? "color-mix(in srgb, var(--vscode-focusBorder) 55%, transparent)"
            : "var(--vscode-widget-border, rgba(128,128,128,0.3))"};
    background: ${({ open }: { open: boolean }) => (open ? "var(--vscode-list-hoverBackground)" : "transparent")};
    color: var(--vscode-foreground);
    font-size: 13px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease, border-color 0.15s ease;

    &:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: color-mix(in srgb, var(--vscode-focusBorder) 55%, transparent);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

const OrgAvatar = styled.div`
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--wso2-brand-primary) 0%, var(--wso2-brand-primary-alt) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--wso2-brand-white, #fff);
    text-transform: uppercase;
`;

const OrgChevron = styled.span<{ open: boolean }>`
    display: flex;
    align-items: center;
    opacity: 0.6;
    transition: transform 0.15s ease;
    transform: ${({ open }: { open: boolean }) => (open ? "rotate(180deg)" : "rotate(0deg)")};
`;

const OrgDropdownPanel = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 200px;
    max-height: 260px;
    overflow-y: auto;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    box-shadow: 0 8px 24px color-mix(in srgb, var(--vscode-widget-shadow, #000) 20%, transparent);
    z-index: 100;
    padding: 4px;
`;

const OrgDropdownItem = styled.button<{ active: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 6px;
    background: ${({ active }: { active: boolean }) =>
        active ? "color-mix(in srgb, var(--wso2-brand-primary) 8%, transparent)" : "transparent"};
    color: var(--vscode-foreground);
    font-size: 13px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease;

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }
`;

const OrgDropdownItemName = styled.span`
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
`;

const FormPanelHeaderRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

// ── Component ─────────────────────────────────────────────────────────────────

interface OpenProjectViewProps {
    onBack: () => void;
}

export const OpenProjectView: React.FC<OpenProjectViewProps> = ({ onBack }) => {
    const { wsClient } = useVisualizerContext();
    const { authState, authStateLoading } = useCloudContext();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [cloning, setCloning] = useState(false);
    const [cloneStage, setCloneStage] = useState<CloneProgressStage | null>(null);
    const [cloneSuccess, setCloneSuccess] = useState(false);
    const [cloningError, setCloningError] = useState<string | null>(null);
    const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
    const { isSigningIn, handleSignIn, handleCancelSignIn } = useSignIn();
    const [view, setView] = useState<"landing" | "cloud">("landing");

    const orgs = (authState?.userInfo?.organizations as Array<{ id: number | string; handle: string; name: string }> | undefined) ?? [];
    const org = (selectedOrgId ? orgs.find((o) => String(o.id) === selectedOrgId) : null) ?? orgs[0];
    const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
    const orgSwitcherRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSelectedProject(null);
        setCloneSuccess(false);
        setCloningError(null);
    }, [org?.id]);

    useEffect(() => {
        return wsClient.onCloneProgress((stage) => setCloneStage(stage));
    }, [wsClient]);

    useEffect(() => {
        if (!orgDropdownOpen) return;
        const handleMouseDown = (e: MouseEvent) => {
            if (orgSwitcherRef.current && !orgSwitcherRef.current.contains(e.target as Node)) {
                setOrgDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [orgDropdownOpen]);

    const fetchProjects = () => {
        if (!org) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        wsClient
            .getCloudProjects({ orgId: org.id.toString(), orgHandle: org.handle })
            .then((resp) => {
                setProjects(resp.projects);
                setLoading(false);
            })
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Failed to load projects");
                setLoading(false);
            });
    };

    useEffect(() => {
        let cancelled = false;
        if (!org) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        wsClient
            .getCloudProjects({ orgId: org.id.toString(), orgHandle: org.handle })
            .then((resp) => {
                if (!cancelled) {
                    setProjects(resp.projects);
                    setLoading(false);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load projects");
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [org?.id]);

    const handleCloneProject = () => {
        if (!org || !selectedProject) {
            return;
        }
        setCloning(true);
        setCloneStage("selecting_folder");
        setCloneSuccess(false);
        setCloningError(null);
        wsClient
            .runCommand({
                command: WICommandIds.CloneProject,
                args: [{ organization: org, project: selectedProject, integrationOnly: true }],
            })
            .then(() => {
                setCloning(false);
                setCloneStage(null);
                setCloneSuccess(true);
            })
            .catch((err: unknown) => {
                setCloning(false);
                setCloneStage(null);
                // Cancelling the folder picker throws "Directory is required…" — treat it as a
                // silent cancel rather than an error so the user can try again cleanly.
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.toLowerCase().includes("directory is required") || msg.toLowerCase().includes("cancelled")) {
                    setCloneSuccess(false);
                    return;
                }
                setCloningError(msg || "Cloning failed. Please try again.");
            });
    };

    const handleOpenLocal = async () => {
        try {
            const { path: startPath } = await wsClient.getDefaultCreationPath();
            const response = await wsClient.selectFileOrDirPath({ startPath });
            if (response?.path) {
                wsClient.openFolder(response.path);
            }
        } catch (err) {
            console.error("Failed to open local folder:", err);
            const errorMessage = err instanceof Error ? err.message : "Failed to open local folder";
            setError(errorMessage);
        }
    };

    // ── Confirmation panel ────────────────────────────────────────────────────

    const renderConfirm = (project: Project) => (
        <>
            <FormPanelHeader>
                <FormPanelTitle>{cloneSuccess ? "All done!" : "Clone Project"}</FormPanelTitle>
                <FormPanelSubtitle>
                    {cloneSuccess
                        ? "The project was cloned. Check the prompt in your editor to open it."
                        : cloningError
                            ? "Something went wrong — you can try again below."
                            : "Review and confirm before cloning"}
                </FormPanelSubtitle>
            </FormPanelHeader>
            <FormBody>
                <ConfirmBody>
                    <ConfirmProjectIcon>
                        <Codicon
                            name="project"
                            iconSx={{ fontSize: "24px", color: "var(--wso2-brand-white)" }}
                            sx={{ width: "24px", height: "24px" }}
                        />
                    </ConfirmProjectIcon>
                    <ConfirmProjectName>{project.name}</ConfirmProjectName>
                    {project.description ? (
                        <ConfirmProjectDescription>{project.description}</ConfirmProjectDescription>
                    ) : (
                        <ConfirmProjectDescription style={{ marginBottom: 24 }} />
                    )}

                    {cloneSuccess ? (
                        <CloneInfoCallout style={{ borderColor: "color-mix(in srgb, var(--vscode-testing-iconPassed) 40%, var(--vscode-panel-border))", background: "color-mix(in srgb, var(--vscode-testing-iconPassed) 6%, transparent)" }}>
                            <Codicon
                                name="pass-filled"
                                iconSx={{ fontSize: "15px", color: "var(--vscode-testing-iconPassed)", marginTop: "1px" }}
                            />
                            <CalloutText>
                                <CalloutTitle style={{ color: "var(--vscode-testing-iconPassed)" }}>Cloned successfully!</CalloutTitle>
                                <CalloutDesc>Your repository has been cloned. A prompt should appear in your editor to open it in this window, a new window, or your workspace.</CalloutDesc>
                            </CalloutText>
                        </CloneInfoCallout>
                    ) : cloningError ? (
                        <CloneInfoCallout style={{ borderColor: "color-mix(in srgb, var(--vscode-errorForeground) 40%, var(--vscode-panel-border))", background: "color-mix(in srgb, var(--vscode-errorForeground) 6%, transparent)" }}>
                            <Codicon
                                name="error"
                                iconSx={{ fontSize: "15px", color: "var(--vscode-errorForeground)", marginTop: "1px" }}
                            />
                            <CalloutText>
                                <CalloutTitle style={{ color: "var(--vscode-errorForeground)" }}>Cloning failed</CalloutTitle>
                                <CalloutDesc>{cloningError}</CalloutDesc>
                            </CalloutText>
                        </CloneInfoCallout>
                    ) : cloneStage === "selecting_folder" ? (
                        <CloneInfoCallout>
                            <Codicon name="loading" iconSx={{ fontSize: "15px", color: "var(--vscode-descriptionForeground)", marginTop: "1px", animation: "codicon-spin 1.5s steps(30) infinite" }} />
                            <CalloutText>
                                <CalloutTitle>Where should we put it?</CalloutTitle>
                                <CalloutDesc>A folder picker is open in your editor — choose a local directory to clone into.</CalloutDesc>
                            </CalloutText>
                        </CloneInfoCallout>
                    ) : cloneStage === "fetching_components" ? (
                        <CloneInfoCallout>
                            <Codicon name="loading" iconSx={{ fontSize: "15px", color: "var(--vscode-descriptionForeground)", marginTop: "1px", animation: "codicon-spin 1.5s steps(30) infinite" }} />
                            <CalloutText>
                                <CalloutTitle>Loading project details...</CalloutTitle>
                                <CalloutDesc>Fetching the list of integrations in this project. Won't be long.</CalloutDesc>
                            </CalloutText>
                        </CloneInfoCallout>
                    ) : cloneStage === "selecting_component" ? (
                        <CloneInfoCallout>
                            <Codicon name="loading" iconSx={{ fontSize: "15px", color: "var(--vscode-descriptionForeground)", marginTop: "1px", animation: "codicon-spin 1.5s steps(30) infinite" }} />
                            <CalloutText>
                                <CalloutTitle>Which integration to clone?</CalloutTitle>
                                <CalloutDesc>A picker appeared in your editor — this project has multiple integrations. Select one to continue.</CalloutDesc>
                            </CalloutText>
                        </CloneInfoCallout>
                    ) : cloneStage === "cloning" ? (
                        <CloneInfoCallout>
                            <Codicon name="loading" iconSx={{ fontSize: "15px", color: "var(--vscode-descriptionForeground)", marginTop: "1px", animation: "codicon-spin 1.5s steps(30) infinite" }} />
                            <CalloutText>
                                <CalloutTitle>Almost there!</CalloutTitle>
                                <CalloutDesc>Cloning your repository into the selected folder. Hang on just a moment.</CalloutDesc>
                            </CalloutText>
                        </CloneInfoCallout>
                    ) : (
                        <CloneInfoCallout style={{ borderColor: "color-mix(in srgb, var(--vscode-editorInfo-foreground) 40%, var(--vscode-panel-border))", background: "color-mix(in srgb, var(--vscode-editorInfo-foreground) 6%, transparent)" }}>
                            <Codicon
                                name="info"
                                iconSx={{ fontSize: "15px", color: "var(--vscode-editorInfo-foreground)", marginTop: "1px" }}
                            />
                            <CalloutText>
                                <CalloutTitle>Choose where to clone it</CalloutTitle>
                                <CalloutDesc>
                                    You'll be asked to select a local folder. For projects with multiple integrations, you'll also choose which one to clone.
                                </CalloutDesc>
                            </CalloutText>
                        </CloneInfoCallout>
                    )}

                    <ConfirmActions>
                        <CloneButton type="button" onClick={handleCloneProject} disabled={cloning}>
                            {cloning ? (
                                <>
                                    <Codicon
                                        name="loading"
                                        iconSx={{ fontSize: "16px", color: "var(--vscode-button-foreground)", animation: "codicon-spin 1.5s steps(30) infinite" }}
                                        sx={{ width: "16px", height: "16px" }}
                                    />
                                    {cloneStage === "selecting_folder" && "Picking a folder..."}
                                    {cloneStage === "fetching_components" && "Loading..."}
                                    {cloneStage === "selecting_component" && "Waiting for selection..."}
                                    {cloneStage === "cloning" && "Cloning..."}
                                    {!cloneStage && "Working..."}
                                </>
                            ) : cloneSuccess ? (
                                <>
                                    <Codicon
                                        name="repo-clone"
                                        iconSx={{ fontSize: "16px", color: "var(--vscode-button-foreground)" }}
                                        sx={{ width: "16px", height: "16px" }}
                                    />
                                    Clone Again
                                </>
                            ) : cloningError ? (
                                <>
                                    <Codicon
                                        name="repo-clone"
                                        iconSx={{ fontSize: "16px", color: "var(--vscode-button-foreground)" }}
                                        sx={{ width: "16px", height: "16px" }}
                                    />
                                    Try Again
                                </>
                            ) : (
                                <>
                                    <Codicon
                                        name="repo-clone"
                                        iconSx={{ fontSize: "16px", color: "var(--vscode-button-foreground)" }}
                                        sx={{ width: "16px", height: "16px" }}
                                    />
                                    Choose Folder &amp; Clone
                                </>
                            )}
                        </CloneButton>
                        {!cloning && (
                            <BackToListButton type="button" onClick={() => setSelectedProject(null)}>
                                Back to project list
                            </BackToListButton>
                        )}
                    </ConfirmActions>
                </ConfirmBody>
            </FormBody>
        </>
    );

    // ── Project list ──────────────────────────────────────────────────────────

    const renderList = () => {
        if (authStateLoading && !authState?.userInfo) {
            return (
                <CenteredMessage>
                    <ProgressRing color={ThemeColors.PRIMARY} />
                    <span>Checking sign-in...</span>
                </CenteredMessage>
            );
        }
        if (!authState?.userInfo) {
            return (
                <SignInPrompt>
                    <SignInIconWrapper>
                        <Codicon
                            name="cloud"
                            iconSx={{ fontSize: "22px", color: "var(--wso2-brand-primary)" }}
                            sx={{ width: "22px", height: "22px" }}
                        />
                    </SignInIconWrapper>
                    <SignInTitle>Sign in to browse cloud projects</SignInTitle>
                    <SignInDescription>
                        Connect your WSO2 account to clone and open projects directly from the cloud.
                    </SignInDescription>
                    <SignInButton type="button" onClick={isSigningIn ? handleCancelSignIn : handleSignIn}>
                        {isSigningIn ? (
                            <>
                                <Codicon
                                    name="loading"
                                    iconSx={{ fontSize: "14px", color: "var(--vscode-button-foreground)", animation: "codicon-spin 1.5s steps(30) infinite" }}
                                    sx={{ width: "14px", height: "14px" }}
                                />
                                Signing in...
                                <Codicon
                                    name="close"
                                    iconSx={{ fontSize: "12px", color: "var(--vscode-button-foreground)", opacity: 0.8 }}
                                    sx={{ width: "12px", height: "12px" }}
                                />
                            </>
                        ) : (
                            <>
                                <Codicon
                                    name="account"
                                    iconSx={{ fontSize: "14px", color: "var(--vscode-button-foreground)" }}
                                    sx={{ width: "14px", height: "14px" }}
                                />
                                Sign In
                            </>
                        )}
                    </SignInButton>
                </SignInPrompt>
            );
        }
        if (loading) {
            return (
                <CenteredMessage>
                    <ProgressRing color={ThemeColors.PRIMARY} />
                    <span>Loading projects...</span>
                </CenteredMessage>
            );
        }
        if (error) {
            return (
                <CenteredMessage>
                    <span>{error}</span>
                    <RetryButton onClick={fetchProjects}>Retry</RetryButton>
                </CenteredMessage>
            );
        }
        if (!org) {
            return (
                <CenteredMessage>
                    <span>No organization found. Please sign in to an organization.</span>
                </CenteredMessage>
            );
        }
        if (projects.length === 0) {
            return (
                <CenteredMessage>
                    <span>No projects found in <strong>{org.name}</strong>.</span>
                </CenteredMessage>
            );
        }
        return (
            <ProjectList>
                {projects.map((project) => (
                    <ProjectRow key={project.id} type="button" onClick={() => { setSelectedProject(project); setCloneSuccess(false); setCloningError(null); }}>
                        <ProjectRowIcon>
                            <Codicon
                                name="project"
                                iconSx={{ fontSize: "16px", color: "var(--wso2-brand-white)" }}
                                sx={{ width: "16px", height: "16px" }}
                            />
                        </ProjectRowIcon>
                        <ProjectRowContent>
                            <ProjectRowName>{project.name}</ProjectRowName>
                            {project.description && (
                                <ProjectRowDescription>{project.description}</ProjectRowDescription>
                            )}
                        </ProjectRowContent>
                        <Codicon
                            name="chevron-right"
                            iconSx={{ fontSize: "14px", color: "var(--vscode-descriptionForeground)", opacity: 0.6 }}
                        />
                    </ProjectRow>
                ))}
            </ProjectList>
        );
    };

    // ── Header back target: list → welcome, confirm → list ───────────────────

    const handleBack = () => {
        if (selectedProject) {
            setSelectedProject(null);
            setCloning(false);
            setCloneStage(null);
            setCloneSuccess(false);
            setCloningError(null);
        } else if (view === "cloud") {
            setView("landing");
        } else {
            onBack();
        }
    };

    const headerTitle = "Open Project";
    const headerSubtitle =
        view === "landing"
            ? "Choose how you'd like to open a project."
            : selectedProject
                ? "Review and confirm before cloning."
                : "Select a cloud project to clone to your machine.";
    const panelTitle = selectedProject ? null : view === "cloud" ? "Cloud Projects" : null;
    const panelSubtitle = !selectedProject && view === "cloud" && org ? "Select a project to clone it to your local machine." : null;

    const renderLanding = () => (
        <LandingWrapper>
            <ChoiceGrid>
                <ChoiceCard type="button" onClick={handleOpenLocal}>
                    <ChoiceCardIconWrapper
                        style={{
                            background: "color-mix(in srgb, var(--vscode-foreground) 8%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--vscode-foreground) 12%, transparent)",
                        }}
                    >
                        <Codicon
                            name="folder-opened"
                            iconSx={{ fontSize: "20px", color: "var(--vscode-foreground)" }}
                            sx={{ width: "20px", height: "20px" }}
                        />
                    </ChoiceCardIconWrapper>
                    <ChoiceCardTitle>Open Local Project</ChoiceCardTitle>
                    <ChoiceCardDesc>Browse your computer and open an existing integration project folder.</ChoiceCardDesc>
                </ChoiceCard>
                <ChoiceCard type="button" onClick={() => setView("cloud")}>
                    <ChoiceCardIconWrapper
                        style={{
                            background: "color-mix(in srgb, var(--vscode-foreground) 8%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--vscode-foreground) 12%, transparent)",
                        }}
                    >
                        <Codicon
                            name="cloud"
                            iconSx={{ fontSize: "20px", color: "var(--vscode-foreground)" }}
                            sx={{ width: "20px", height: "20px" }}
                        />
                    </ChoiceCardIconWrapper>
                    <ChoiceCardTitle>Open Cloud Project</ChoiceCardTitle>
                    <ChoiceCardDesc>Browse and clone a project from your WSO2 Cloud organization.</ChoiceCardDesc>
                </ChoiceCard>
            </ChoiceGrid>
        </LandingWrapper>
    );

    const renderCloudView = () => (
        <>
            <FormPanelHeader>
                <FormPanelHeaderRow>
                    <div>
                        <FormPanelTitle>{panelTitle}</FormPanelTitle>
                        {panelSubtitle && <FormPanelSubtitle>{panelSubtitle}</FormPanelSubtitle>}
                    </div>
                    {orgs.length > 1 && (
                        <OrgSwitcherWrapper ref={orgSwitcherRef}>
                            <OrgTriggerButton
                                type="button"
                                open={orgDropdownOpen}
                                onClick={() => setOrgDropdownOpen((v) => !v)}
                                title="Switch organization"
                            >
                                <OrgAvatar>{org?.name?.charAt(0) ?? "?"}</OrgAvatar>
                                <span>{org?.name}</span>
                                <OrgChevron open={orgDropdownOpen}>
                                    <Codicon name="chevron-down" iconSx={{ fontSize: "12px" }} />
                                </OrgChevron>
                            </OrgTriggerButton>
                            {orgDropdownOpen && (
                                <OrgDropdownPanel>
                                    {orgs.map((o) => (
                                        <OrgDropdownItem
                                            key={o.id}
                                            type="button"
                                            active={String(o.id) === String(org?.id)}
                                            onClick={() => {
                                                setSelectedOrgId(String(o.id));
                                                setOrgDropdownOpen(false);
                                            }}
                                        >
                                            <OrgAvatar>{o.name.charAt(0)}</OrgAvatar>
                                            <OrgDropdownItemName>{o.name}</OrgDropdownItemName>
                                            {String(o.id) === String(org?.id) && (
                                                <Codicon
                                                    name="check"
                                                    iconSx={{ fontSize: "12px", color: "var(--wso2-brand-primary)", flexShrink: 0 }}
                                                />
                                            )}
                                        </OrgDropdownItem>
                                    ))}
                                </OrgDropdownPanel>
                            )}
                        </OrgSwitcherWrapper>
                    )}
                </FormPanelHeaderRow>
            </FormPanelHeader>
            <FormBody style={{ padding: 0 }}>
                {renderList()}
            </FormBody>
        </>
    );

    return (
        <PageBackdrop>
            <PageContainer>
                <FormPanel variant={view === "landing" ? "compact" : "default"}>
                    <FormPanelHeader>
                        <HeaderRow>
                            <BackButton type="button" onClick={handleBack} title="Back">
                                <Codicon name="arrow-left" iconSx={{ fontSize: "18px", color: "var(--vscode-foreground)" }} />
                            </BackButton>
                            <HeaderText>
                                <HeaderTitle variant="h2">{headerTitle}</HeaderTitle>
                                <HeaderSubtitle>{headerSubtitle}</HeaderSubtitle>
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>
                    {selectedProject ? (
                        renderConfirm(selectedProject)
                    ) : view === "landing" ? (
                        renderLanding()
                    ) : (
                        renderCloudView()
                    )}
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
};
