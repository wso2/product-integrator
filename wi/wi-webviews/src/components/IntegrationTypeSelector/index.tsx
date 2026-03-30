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
    cursor: pointer;
    width: fit-content;
`;

const PropertyKey = styled.span`
    color: var(--vscode-editor-foreground);
    font-weight: 500;
`;

const PropertyValue = styled.span`
    display: flex;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family);
`;

const PropertyInline = styled.div<{ active?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background: ${({ active }: { active?: boolean }) =>
        active ? 'var(--vscode-foreground)' : 'var(--vscode-sideBar-background)'};
    border: 1px solid ${({ active }: { active?: boolean }) =>
        active ? 'var(--vscode-foreground)' : 'var(--vscode-widget-border)'};
    border-radius: 4px;
    font-size: 11px;
    height: 24px;
    width: fit-content;
    transition: background 0.15s ease, border-color 0.15s ease;

    span {
        color: ${({ active }: { active?: boolean }) =>
            active ? 'var(--vscode-editor-background)' : 'var(--vscode-disabledForeground)'};
    }

    &:hover {
        background: ${({ active }: { active?: boolean }) =>
            active ? 'var(--vscode-foreground)' : 'var(--vscode-toolbar-hoverBackground)'};
        filter: ${({ active }: { active?: boolean }) => active ? 'brightness(0.9)' : 'none'};
    }
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
        <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center', position: 'relative', top: '-35px' }}>
            <PropertyKey>{label}</PropertyKey>
            {options.map((option) => (
                <SelectorContainer key={option.value} ref={dropdownRef} onClick={() => onChange(option.value)}>
                    <PropertyInline active={option.value === value}>
                        <PropertyKey>{option.label}</PropertyKey>
                    </PropertyInline>
                </SelectorContainer>
            ))}
        </div>

    );
}


