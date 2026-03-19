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

import { Dropdown, TextField } from "@wso2/ui-toolkit";
import { FieldGroup, Note } from "../styles";
import { CollapsibleSection } from "./CollapsibleSection";
import { sanitizePackageName } from "../utils";

export interface PackageInfoData {
    packageName: string;
    orgName: string;
    version: string;
}

export interface Organization {
    id?: number | string;
    handle: string;
    name: string;
}

export interface PackageInfoSectionProps {
    /** Whether the section is expanded */
    isExpanded: boolean;
    /** Callback when the section is toggled */
    onToggle: () => void;
    /** The package info data */
    data: PackageInfoData;
    /** Callback when the package info changes */
    onChange: (data: Partial<PackageInfoData>) => void;
    /** Whether the package is a library */
    isLibrary?: boolean;
    /** Error message for org name validation */
    orgNameError?: string | null;
    /** Error message for package name validation */
    packageNameError?: string | null;
    /** Organizations list — when provided, renders a dropdown instead of a free-text field */
    organizations?: Organization[];
}

export function PackageInfoSection({
    isExpanded,
    onToggle,
    data,
    onChange,
    isLibrary,
    orgNameError,
    packageNameError,
    organizations,
}: PackageInfoSectionProps) {
    const hasOrgs = organizations && organizations.length > 0;

    return (
        <CollapsibleSection
            isExpanded={isExpanded}
            onToggle={onToggle}
            icon="gear"
            title="Advanced Configurations"
        >
            <Note style={{ marginBottom: "16px" }}>
                {`This ${isLibrary ? "library" : "integration"} is generated as a Ballerina package. Define the organization and version that will be assigned to it. `}
            </Note>
            <FieldGroup>
                <TextField
                    onTextChange={(value) => onChange({ packageName: sanitizePackageName(value) })}
                    value={data.packageName}
                    label="Package Name"
                    description={`This will be used as the Ballerina package name for the ${isLibrary ? "library" : "integration"}.`}
                    errorMsg={packageNameError || undefined}
                />
            </FieldGroup>
            <FieldGroup>
                {hasOrgs ? (
                    <Dropdown
                        id="org-name-dropdown"
                        label="Organization Name"
                        items={organizations.map((org) => ({ value: org.handle, content: org.name }))}
                        value={data.orgName}
                        onValueChange={(value: string) => onChange({ orgName: value })}
                    />
                ) : (
                    <TextField
                        onTextChange={(value) => onChange({ orgName: value })}
                        value={data.orgName}
                        label="Organization Name"
                        description="The organization that owns this Ballerina package."
                        errorMsg={orgNameError || undefined}
                    />
                )}
            </FieldGroup>
            <FieldGroup>
                <TextField
                    onTextChange={(value) => onChange({ version: value })}
                    value={data.version}
                    label="Package Version"
                    placeholder="0.1.0"
                    description="Version of the Ballerina package."
                />
            </FieldGroup>
        </CollapsibleSection>
    );
}

