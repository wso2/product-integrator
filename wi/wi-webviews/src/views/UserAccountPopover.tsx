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

import styled from "@emotion/styled";
import { Popover, ThemeColors, VSCodeColors, Button, Codicon } from "@wso2/ui-toolkit";
import { useQueryClient } from "@tanstack/react-query";
import { useVisualizerContext } from "../contexts";
import { useCloudContext } from "../providers";
import { WICommandIds } from "@wso2/wso2-platform-core";

const PopoverContent = styled.div`
    min-width: 220px;
    max-width: 280px;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE};
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const UserHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const AvatarCircle = styled.div`
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--vscode-button-background);
    border: 1.5px solid color-mix(in srgb, var(--vscode-button-background) 60%, transparent);
    flex-shrink: 0;
    overflow: hidden;
`;

const AvatarImg = styled.img`
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
`;

const AvatarInitial = styled.span`
    font-size: 14px;
    font-weight: 700;
    color: var(--vscode-button-foreground);
    text-transform: uppercase;
`;

const UserDetails = styled.div`
    flex: 1;
    min-width: 0;
`;

const UserName = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const UserEmail = styled.div`
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.65;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
`;

const ContextSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid ${VSCodeColors.PANEL_BORDER};
`;

const SectionLabel = styled.div`
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.55;
    margin-bottom: 2px;
`;

const Row = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 8px;
`;

const RowContent = styled.div`
    flex: 1;
    min-width: 0;
`;

const RowValue = styled.div`
    font-size: 12px;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const RowValueButton = styled(RowValue)`
    cursor: pointer;
    &:hover {
        text-decoration: underline;
    }
`;


export interface UserAccountPopoverProps {
    isOpen: boolean;
    anchorEl: HTMLElement | null;
    onClose: () => void;
}

export function UserAccountPopover({ isOpen, anchorEl, onClose }: UserAccountPopoverProps) {
    const { wsClient } = useVisualizerContext();
    const { authState, contextState } = useCloudContext();
    const queryClient = useQueryClient();

    const handleSignOut = () => {
        queryClient.setQueryData(["cloud_auth_state"], (old: any) =>
            old ? { ...old, userInfo: null } : old
        );
        wsClient.runCommand({ command: WICommandIds.SignOut, args: [] })
            .then(() => queryClient.invalidateQueries({ queryKey: ["cloud_auth_state"] }))
            .catch(() => {});
        onClose();
    };

    const handleSwitchProject = () => {
        wsClient.runCommand({ command: WICommandIds.ManageDirectoryContext, args: [{ onlyShowSwitchProject: true }] });
        onClose();
    };

    return (
        <Popover
            open={isOpen}
            anchorEl={anchorEl}
            handleClose={onClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            sx={{
                backgroundColor: ThemeColors.SURFACE_DIM,
                padding: 12,
                borderRadius: 6,
                marginTop: 6,
                border: `1px solid ${VSCodeColors.PANEL_BORDER}`,
                zIndex: 1000,
                marginRight: -200
            }}
        >
            <PopoverContent>
                <UserHeader>
                    <AvatarCircle>
                        {authState?.userInfo?.userProfilePictureUrl ? (
                            <AvatarImg src={authState.userInfo.userProfilePictureUrl} alt={authState.userInfo.displayName} />
                        ) : (
                            <AvatarInitial>{authState?.userInfo?.displayName?.charAt(0)}</AvatarInitial>
                        )}
                    </AvatarCircle>
                    <UserDetails>
                        <UserName title={authState?.userInfo?.displayName}>{authState?.userInfo?.displayName}</UserName>
                        <UserEmail title={authState?.userInfo?.userEmail}>{authState?.userInfo?.userEmail}</UserEmail>
                    </UserDetails>
                    <Button appearance="icon" tooltip="Sign Out" onClick={handleSignOut}>
                        <Codicon name="sign-out" iconSx={{ color: ThemeColors.ERROR }} />
                    </Button>
                </UserHeader>

                {contextState?.selected?.project && (
                    <ContextSection>
                        <Row>
                            <RowContent>
                                <SectionLabel>Project</SectionLabel>
                                <RowValueButton title="Switch to a different project" onClick={handleSwitchProject}>
                                    {contextState.selected.project?.name}
                                </RowValueButton>
                            </RowContent>
                            <Button appearance="icon" tooltip="Switch Project" onClick={handleSwitchProject}>
                                <Codicon name="arrow-swap" />
                            </Button>
                        </Row>
                    </ContextSection>
                )}
            </PopoverContent>
        </Popover>
    );
}
