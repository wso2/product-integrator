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

import { useState, useEffect, useRef, useMemo } from "react";
import { Button, Codicon, Dropdown, Icon, TextField } from "@wso2/ui-toolkit";
import { useVisualizerContext } from "../../../contexts";
import { useCloudContext, useCloudProjects } from "../../../providers";
import { DirectorySelector } from "../../../components/DirectorySelector/DirectorySelector";
import {
    joinPath,
    sanitizeProjectHandle,
    validateProjectHandle,
    validateProjectName,
    validateOrgName,
    suggestAvailableProjectName
} from "./utils";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { CollapsibleSection } from "./components";
import { ValidateProjectFormErrorField } from "@wso2/wi-core";
import {
    PageBackdrop,
    PageContainer,
    HeaderRow,
    BackButton,
    HeaderText,
    HeaderTitle,
    HeaderSubtitle,
    FormPanel,
    FormPanelHeader,
    FormBody,
    FormContent,
    FormFooter,
} from "../../shared/FormPageLayout";
import {
    ResolvedPathText,
    CloudErrorActionRow,
    ActionLink,
    Description,
    FieldGroup,
    SignInHint,
    SignInHintButton
} from "../biForm/styles";
import { DEFAULT_PROJECT_NAME } from "./types";


export function ProjectCreationView({ onBack }: { onBack?: () => void }) {
    const { wsClient } = useVisualizerContext();
    const { authState } = useCloudContext();
    const organizations = authState?.userInfo?.organizations as Array<{ id?: any; handle: string; name: string }> | undefined;
    const firstFieldRef = useRef<HTMLInputElement>(null);
    const handleTouched = useRef(false);
    const projectNameTouchedRef = useRef(false);
    const orgNameInitialized = useRef(false);
    const [isValidating, setIsValidating] = useState(false);
    const [projectNameError, setProjectNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [projectHandleError, setProjectHandleError] = useState<string | null>(null);
    const [cloudProjectNameError, setCloudProjectNameError] = useState<string | null>(null);
    const [cloudProjectHandleError, setCloudProjectHandleError] = useState<string | null>(null);
    const [matchedCloudProject, setMatchedCloudProject] = useState<{ project: any; org: any } | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const signingInTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
    const [projectHandle, setProjectHandle] = useState(() => sanitizeProjectHandle(DEFAULT_PROJECT_NAME));
    const [defaultPath, setDefaultPath] = useState("");
    const [formData, setFormData] = useState({
        projectName: DEFAULT_PROJECT_NAME,
        path: "",
        orgName: "",
        version: "",
    });

    const resolvedOrg = useMemo(() => {
        if (!organizations || organizations.length === 0) return undefined;
        return formData.orgName
            ? (organizations.find(o => o.handle === formData.orgName) ?? organizations[0])
            : organizations[0];
    }, [organizations, formData.orgName]);

    const { data: cloudProjectsData } = useCloudProjects(
        resolvedOrg?.id?.toString(),
        resolvedOrg?.handle
    );

    const hasOrgs = !!organizations && organizations.length > 0;

    useEffect(() => {
        const unsubscribe = wsClient.onSignInInitiated(() => {
            setIsSigningIn(true);
            signingInTimeoutRef.current = setTimeout(() => {
                setIsSigningIn(false);
                signingInTimeoutRef.current = null;
            }, 15000);
        });
        return unsubscribe;
    }, [wsClient]);

    useEffect(() => {
        if (authState?.userInfo && isSigningIn) {
            setIsSigningIn(false);
            if (signingInTimeoutRef.current) {
                clearTimeout(signingInTimeoutRef.current);
                signingInTimeoutRef.current = null;
            }
        }
    }, [authState?.userInfo, isSigningIn]);

    useEffect(() => {
        return () => {
            if (signingInTimeoutRef.current) clearTimeout(signingInTimeoutRef.current);
        };
    }, []);

    const handleSignIn = () => {
        wsClient.runCommand({ command: WICommandIds.SignIn, args: [] });
    };

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const { path: workspacePath } = await wsClient.getWorkspaceRoot();
                if (!mounted) return;
                const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                if (!mounted) return;
                setDefaultPath(dp);
                setFormData(prev => ({ ...prev, path: dp }));
            } catch (error) {
                console.error("Failed to fetch default path:", error);
            }

            if (!orgNameInitialized.current) {
                orgNameInitialized.current = true;
                if (organizations && organizations.length > 0) {
                    if (mounted) setFormData(prev => ({ ...prev, orgName: organizations[0].handle }));
                } else {
                    try {
                        const { orgName } = await wsClient.getDefaultOrgName();
                        if (mounted) setFormData(prev => ({ ...prev, orgName }));
                    } catch (error) {
                        console.error("Failed to fetch default organization name:", error);
                    }
                }
            }
        })();
        return () => { mounted = false; };
    }, [organizations, wsClient]);

    // Validate project handle against cached cloud project handles
    useEffect(() => {
        if (!cloudProjectsData?.projects || !projectHandle?.trim()) {
            setCloudProjectHandleError(null);
            return;
        }
        const handleToCheck = projectHandle.trim().toLowerCase();
        const matched = cloudProjectsData.projects.find(p => p.handler.toLowerCase() === handleToCheck);
        if (matched) {
            const suggested = suggestAvailableProjectName(
                projectHandle.trim(),
                cloudProjectsData.projects.map(p => p.handler)
            );
            if (!handleTouched.current) {
                setProjectHandle(suggested);
                setCloudProjectHandleError(null);
            } else {
                setCloudProjectHandleError("A project with this id already exists in cloud");
            }
        } else {
            setCloudProjectHandleError(null);
        }
    }, [cloudProjectsData, projectHandle]);

    // Focus and select the first field on mount — VSCodeTextField is a web component,
    // so the real <input> is inside its shadow DOM and needs to be targeted directly.
    useEffect(() => {
        setTimeout(() => {
            const inner = (firstFieldRef.current as any)?.shadowRoot?.querySelector("input") as HTMLInputElement | null;
            inner?.focus();
            inner?.select();
        }, 0);
    }, []);

    // Auto-derive handle from projectName unless manually edited
    useEffect(() => {
        if (handleTouched.current) return;
        const derived = sanitizeProjectHandle(formData.projectName);
        setProjectHandle(derived);
    }, [formData.projectName]);

    // Validate handle
    useEffect(() => {
        setProjectHandleError(validateProjectHandle(projectHandle));
    }, [projectHandle]);

    // Validate project name against cached cloud projects — synchronous, no debounce needed.
    useEffect(() => {
        if (!cloudProjectsData?.projects || !formData.projectName?.trim()) {
            setCloudProjectNameError(null);
            setMatchedCloudProject(null);
            return;
        }
        const nameToCheck = formData.projectName.trim().toLowerCase();
        const matched = cloudProjectsData.projects.find(p => p.name.toLowerCase() === nameToCheck);
        if (matched) {
            const suggested = suggestAvailableProjectName(
                formData.projectName.trim(),
                cloudProjectsData.projects.map(p => p.name)
            );
            if (!projectNameTouchedRef.current) {
                // Default name conflicts — silently auto-rename
                setFormData(prev => ({ ...prev, projectName: suggested }));
                setCloudProjectNameError(null);
                setMatchedCloudProject(null);
            } else {
                setCloudProjectNameError("A project with this name already exists in cloud");
                setMatchedCloudProject({ project: matched, org: resolvedOrg });
            }
        } else {
            setCloudProjectNameError(null);
            setMatchedCloudProject(null);
        }
    }, [cloudProjectsData, formData.projectName]);

    const resolvedPath = joinPath(formData.path || defaultPath, projectHandle);

    const handlePathSelection = async () => {
        try {
            const result = await wsClient.selectFileOrDirPath({ startPath: formData.path || defaultPath });
            if (!result.path) return;
            if (pathError) setPathError(null);
            setFormData(prev => ({ ...prev, path: result.path }));
        } catch (error) {
            console.error("Failed to select path:", error);
            setPathError("Failed to select path. Please try again.");
        }
    };

    const handleCreate = async () => {
        setIsValidating(true);
        setProjectNameError(null);
        setPathError(null);
        setProjectHandleError(null);

        let hasError = false;

        const nameError = validateProjectName(formData.projectName);
        if (nameError) {
            setProjectNameError(nameError);
            hasError = true;
        }

        const hErr = validateProjectHandle(projectHandle);
        if (hErr) {
            setProjectHandleError(hErr);
            setIsAdvancedExpanded(true);
            hasError = true;
        }

        if (formData.path.length < 2) {
            setPathError("Please select a path for your project");
            hasError = true;
        }

        const orgErr = validateOrgName(formData.orgName);
        if (orgErr) {
            setOrgNameError(orgErr);
            setIsAdvancedExpanded(true);
            hasError = true;
        }

        if (cloudProjectNameError) {
            hasError = true;
        }

        if (cloudProjectHandleError) {
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            const validationResult = await wsClient.validateProjectPath({
                projectPath: formData.path,
                projectName: projectHandle,
                createDirectory: true,
                createAsWorkspace: true,
            });

            if (!validationResult.isValid) {
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setPathError(validationResult.errorMessage || "Invalid project path");
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    setProjectHandleError(validationResult.errorMessage || "Invalid project ID");
                    setIsAdvancedExpanded(true);
                }
                setIsValidating(false);
                return;
            }

            await wsClient.createBIProject({
                workspaceName: formData.projectName,
                projectPath: formData.path,
                createDirectory: true,
                createAsWorkspace: true,
                orgName: formData.orgName || undefined,
                version: formData.version || undefined,
                projectHandle: projectHandle,
            });
        } catch (error) {
            setPathError("An error occurred during validation");
        } finally {
            setIsValidating(false);
        }
    };

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
                                <HeaderTitle variant="h2">Create Project</HeaderTitle>
                                <HeaderSubtitle>
                                    Set up a new multi-integration workspace project.
                                </HeaderSubtitle>
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>
                    <FormBody>
                        <FormContent>
                            <FieldGroup>
                                <TextField
                                    ref={firstFieldRef}
                                    onTextChange={(value) => {
                                        projectNameTouchedRef.current = true;
                                        if (projectNameError) setProjectNameError(null);
                                        setFormData(prev => ({ ...prev, projectName: value }));
                                    }}
                                    value={formData.projectName}
                                    label="Project Name"
                                    placeholder="Enter a project name"
                                    required={true}
                                    errorMsg={projectNameError || cloudProjectNameError || ""}
                                />
                                {cloudProjectNameError && (
                                    <CloudErrorActionRow>
                                        {matchedCloudProject && (
                                            <ActionLink type="button" onClick={() =>
                                                wsClient.runCommand({
                                                    command: WICommandIds.CloneProject,
                                                    args: [{ organization: matchedCloudProject.org, project: matchedCloudProject.project, integrationOnly: true }],
                                                })
                                            }>
                                                Open existing project
                                            </ActionLink>
                                        )}
                                    </CloudErrorActionRow>
                                )}
                            </FieldGroup>

                            <FieldGroup>
                                <DirectorySelector
                                    id="project-folder-selector"
                                    label="Select Path"
                                    placeholder="Browse to select a folder..."
                                    selectedPath={formData.path || defaultPath}
                                    required={true}
                                    onSelect={handlePathSelection}
                                    onChange={(value) => {
                                        if (pathError) setPathError(null);
                                        setFormData(prev => ({ ...prev, path: value }));
                                    }}
                                    errorMsg={pathError || undefined}
                                />
                                {resolvedPath && resolvedPath !== (formData.path || defaultPath) && (
                                    <ResolvedPathText>Will be created at: {resolvedPath}</ResolvedPathText>
                                )}
                            </FieldGroup>

                            <CollapsibleSection
                                isExpanded={isAdvancedExpanded}
                                onToggle={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
                                icon="gear"
                                title="Advanced Configurations"
                                hasError={!!(orgNameError || projectHandleError || cloudProjectHandleError)}
                            >
                                <FieldGroup>
                                    {hasOrgs ? (
                                        <>
                                            <Dropdown
                                                id="org-name-dropdown"
                                                label="Organization Name"
                                                items={organizations!.map((org) => ({ value: org.handle, content: org.name }))}
                                                value={formData.orgName}
                                                onValueChange={(value: string) => {
                                                    if (orgNameError) setOrgNameError(null);
                                                    setFormData(prev => ({ ...prev, orgName: value }));
                                                }}
                                            />
                                            <Description>The organization that owns this project.</Description>
                                        </>
                                    ) : (
                                        <>
                                            <TextField
                                                onTextChange={(value) => {
                                                    if (orgNameError) setOrgNameError(null);
                                                    setFormData(prev => ({ ...prev, orgName: value }));
                                                }}
                                                value={formData.orgName}
                                                label="Organization Name"
                                                errorMsg={orgNameError || undefined}
                                            />
                                            <SignInHint>
                                                <Codicon
                                                    name="account"
                                                    iconSx={{ color: "var(--vscode-descriptionForeground)" }}
                                                    sx={{ display: "flex" }}
                                                />
                                                <span>Sign in to pick from your organizations —</span>
                                                <SignInHintButton type="button" onClick={handleSignIn} disabled={isSigningIn}>
                                                    {isSigningIn ? (
                                                        <>
                                                            <Codicon
                                                                name="loading"
                                                                iconSx={{ fontSize: "11px", animation: "codicon-spin 1.5s steps(30) infinite" }}
                                                            />
                                                            Signing in...
                                                        </>
                                                    ) : (
                                                        "Sign In"
                                                    )}
                                                </SignInHintButton>
                                            </SignInHint>
                                        </>
                                    )}
                                </FieldGroup>
                                <FieldGroup>
                                    <TextField
                                        onTextChange={(value) => {
                                            handleTouched.current = true;
                                            if (projectHandleError) setProjectHandleError(null);
                                            setProjectHandle(sanitizeProjectHandle(value, { trimTrailing: false }));
                                        }}
                                        value={projectHandle}
                                        label="Project ID"
                                        errorMsg={projectHandleError || cloudProjectHandleError || ""}
                                    />
                                    <Description>Unique identifier for your project in various contexts. Cannot be changed after creation.</Description>
                                </FieldGroup>
                            </CollapsibleSection>

                            <FormFooter>
                                <Button
                                    disabled={isValidating}
                                    onClick={handleCreate}
                                    appearance="primary"
                                >
                                    {isValidating ? "Validating..." : "Create Project"}
                                </Button>
                            </FormFooter>
                        </FormContent>
                    </FormBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
