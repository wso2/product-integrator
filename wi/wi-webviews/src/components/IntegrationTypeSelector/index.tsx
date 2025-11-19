/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { Codicon } from "@wso2/ui-toolkit";

const SelectorContainer = styled.div`
    position: relative;
    top: -35px;
    cursor: pointer;
    width: fit-content;
`;

const PropertyKey = styled.span`
    color: var(--vscode-descriptionForeground);
    font-weight: 500;
`;

const PropertyValue = styled.span`
    display: flex;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family);
`;

const PropertyInline = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    font-size: 11px;
    height: 24px;
    pointer-events: none;
    width: fit-content;
`;

const DropdownMenu = styled.div`
    position: absolute;
    top: 100%;
    left: 36px;
    margin-top: 0;
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    min-width: 90px;
    z-index: 1000;
`;

const DropdownItem = styled.div`
    padding: 4px 8px;
    cursor: pointer;
    font-size: 11px;
    color: var(--vscode-dropdown-foreground);
    font-family: var(--vscode-editor-font-family);
    
    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
    
    &:first-of-type {
        border-radius: 4px 4px 0 0;
    }
    
    &:last-of-type {
        border-radius: 0 0 4px 4px;
    }
`;

export interface TypeOption {
    label: string;
    value: string;
}

export interface IntegrationTypeSelectorProps {
    label?: string;
    value: string;
    options: TypeOption[];
    onChange: (value: string) => void;
}

export function IntegrationTypeSelector({ 
    label = "Type:", 
    value, 
    options, 
    onChange 
}: IntegrationTypeSelectorProps) {
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };

        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showDropdown]);

    return (
        <SelectorContainer ref={dropdownRef} onClick={() => setShowDropdown(!showDropdown)}>
            <PropertyInline>
                <PropertyKey>{label}</PropertyKey>
                <PropertyValue>{value}</PropertyValue>
                <Codicon
                    name="chevron-down"
                    sx={{ fontSize: 10, color: "var(--vscode-editor-foreground)" }}
                />
            </PropertyInline>
            {showDropdown && (
                <DropdownMenu>
                    {options.map((option) => (
                        <DropdownItem
                            key={option.value}
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange(option.value);
                                setShowDropdown(false);
                            }}
                        >
                            {option.label}
                        </DropdownItem>
                    ))}
                </DropdownMenu>
            )}
        </SelectorContainer>
    );
}


