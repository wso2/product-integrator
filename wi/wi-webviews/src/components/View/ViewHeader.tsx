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
import React from 'react';
import styled from '@emotion/styled';
import { Button, Icon, Codicon } from "@wso2/ui-toolkit";


type ViewHeaderProps = {
    title: string | React.ReactNode;
    children?: React.ReactNode;
    codicon?: string;
    icon?: string;
    iconSx?: any;
    onEdit?: () => void;
};

// Emotion styled components
const Header = styled.div({
    backgroundColor: 'var(--vscode-editor-background)',
});

const HeaderContentWrapper = styled.div({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
});

const TitleContainer = styled.div({
    display: 'flex',
    alignItems: 'center',
    '& > *:not(:last-child)': { // Apply margin right to all children except the last one
        marginRight: '5px',
    },
});

const Title = styled.h3({
    /* Style for title */
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
});

const Actions = styled.div({
    /* Style for actions */
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
});

const ViewHeader: React.FC<ViewHeaderProps> = ({ title, children, codicon, icon, iconSx, onEdit }) => {
    return (
        <Header>
            <HeaderContentWrapper>
                <TitleContainer data-testid="diagram-title">
                    {codicon && <Codicon name={codicon} />}
                    {icon && <div style={{ marginRight: "12px" }}><Icon iconSx={iconSx} name={icon} /></div>}
                    {typeof title === 'string' ? <Title>{title}</Title> : title}
                    {onEdit && (
                        <Button
                            data-testid="edit-button"
                            appearance="icon"
                            onClick={onEdit}
                            tooltip="Edit"
                        >
                            <Codicon
                                name="edit"
                            />
                            &nbsp;Edit
                        </Button>
                    )}
                </TitleContainer>
                <Actions>{children}</Actions>
            </HeaderContentWrapper>
        </Header>
    );
};

export default ViewHeader;
