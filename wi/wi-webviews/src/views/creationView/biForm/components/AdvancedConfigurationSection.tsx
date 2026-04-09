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

import { Codicon, Dropdown, TextField } from "@wso2/ui-toolkit";
import {
    Description,
    FieldGroup,
    Note,
    SubSectionDivider,
    SubSectionLabel,
    SignInHint,
    SignInHintButton
} from "../styles";
import { CollapsibleSection } from "./CollapsibleSection";
import { sanitizePackageName, sanitizeProjectHandle } from "../utils";
import { useSignIn } from "../../../../hooks/useSignIn";

export interface ConfigurationData {
    packageName: string;
    orgName: string;
    version: string;
    projectHandle?: string;
}

export interface Organization {
    id?: number | string;
    handle: string;
    name: string;
}

export interface AdvancedConfigurationSectionProps {
    /** Whether the section is expanded */
    isExpanded: boolean;
    /** Callback when the section is toggled */
    onToggle: () => void;
    /** The advanced configuration data */
    data: ConfigurationData;
    /** Callback when the advanced configuration data changes */
    onChange: (data: Partial<ConfigurationData>) => void;
    /** Whether the package is a library */
    isLibrary?: boolean;
    /** Error message for org name validation */
    orgNameError?: string | null;
    /** Error message for package name validation */
    packageNameError?: string | null;
    /** Error message for project handle validation */
    projectHandleError?: string | null;
    /** Organizations list — when provided, renders a dropdown instead of a free-text field */
    organizations?: Organization[];
    /** Whether the section contains validation errors */
    hasError?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

interface OrgFieldProps {
    organizations?: Organization[];
    orgName: string;
    orgNameError?: string | null;
    description: string;
    isSigningIn: boolean;
    onOrgChange: (value: string) => void;
    onSignIn: () => void;
    onCancelSignIn: () => void;
}

function OrgField({ organizations, orgName, orgNameError, description, isSigningIn, onOrgChange, onSignIn, onCancelSignIn }: OrgFieldProps) {
    const hasOrgs = organizations && organizations.length > 0;
    return hasOrgs ? (
        <>
            <Dropdown
                id="org-name-dropdown"
                label="Organization Name"
                items={organizations.map((org) => ({ value: org.handle, content: org.name }))}
                value={orgName}
                onValueChange={onOrgChange}
            />
            <Description>{description}</Description>
        </>
    ) : (
        <>
            <TextField
                onTextChange={onOrgChange}
                value={orgName}
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
                <SignInHintButton type="button" onClick={isSigningIn ? onCancelSignIn : onSignIn}>
                    {isSigningIn ? (
                        <>
                            <Codicon
                                name="loading"
                                iconSx={{ fontSize: "11px", animation: "codicon-spin 1.5s steps(30) infinite" }}
                            />
                            Signing in...
                            <Codicon
                                name="close"
                                iconSx={{ fontSize: "10px" }}
                            />
                        </>
                    ) : (
                        "Sign In"
                    )}
                </SignInHintButton>
            </SignInHint>
        </>
    );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AdvancedConfigurationSection({
    isExpanded,
    onToggle,
    data,
    onChange,
    isLibrary,
    orgNameError,
    packageNameError,
    projectHandleError,
    organizations,
    hasError
}: AdvancedConfigurationSectionProps) {
    const { isSigningIn, handleSignIn, handleCancelSignIn } = useSignIn();

    const createWithinProject = data.projectHandle !== undefined;

    return (
        <CollapsibleSection
            isExpanded={isExpanded}
            onToggle={onToggle}
            icon="gear"
            title="Advanced Configurations"
            hasError={hasError}
        >
            {createWithinProject && (
                <>
                    <SubSectionLabel>Project</SubSectionLabel>
                    <FieldGroup>
                        <OrgField
                            organizations={organizations}
                            orgName={data.orgName}
                            orgNameError={orgNameError}
                            description="The organization that owns this project."
                            isSigningIn={isSigningIn}
                            onOrgChange={(value) => onChange({ orgName: value })}
                            onSignIn={handleSignIn}
                            onCancelSignIn={handleCancelSignIn}
                        />
                    </FieldGroup>
                    <FieldGroup>
                        <TextField
                            onTextChange={(value) => onChange({ projectHandle: sanitizeProjectHandle(value, { trimTrailing: false }) })}
                            value={data.projectHandle}
                            label="Project ID"
                            errorMsg={projectHandleError || undefined}
                        />
                        <Description>Unique identifier for your project in various contexts. Cannot be changed after creation.</Description>
                    </FieldGroup>
                    <SubSectionDivider />
                </>
            )}
            <SubSectionLabel>Ballerina Package</SubSectionLabel>
            <Note style={{ marginBottom: "16px" }}>
                {createWithinProject
                    ? `This ${isLibrary ? "library" : "integration"} is generated as a Ballerina package. Specify the package name and version to be assigned.`
                    : `This ${isLibrary ? "library" : "integration"} is generated as a Ballerina package. Specify the organization, package name and version to be assigned.`}
            </Note>
            <FieldGroup>
                <TextField
                    onTextChange={(value) => onChange({ packageName: sanitizePackageName(value) })}
                    value={data.packageName}
                    label="Package Name"
                    errorMsg={packageNameError || undefined}
                />
                <Description>Specify the package name.</Description>
            </FieldGroup>
            {!createWithinProject && (
                <FieldGroup>
                    <OrgField
                        organizations={organizations}
                        orgName={data.orgName}
                        orgNameError={orgNameError}
                        description="The organization that owns this package."
                        isSigningIn={isSigningIn}
                        onOrgChange={(value) => onChange({ orgName: value })}
                        onSignIn={handleSignIn}
                        onCancelSignIn={handleCancelSignIn}
                    />
                </FieldGroup>
            )}
            <FieldGroup>
                <TextField
                    onTextChange={(value) => onChange({ version: value })}
                    value={data.version}
                    label="Package Version"
                    placeholder="0.1.0"
                />
                <Description>Version of the package.</Description>
            </FieldGroup>
        </CollapsibleSection>
    );
}
