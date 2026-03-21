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

import React from "react";
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



export interface UserAccountPopoverProps {
    isOpen: boolean;
    anchorEl: HTMLElement | null;
    onClose: () => void;
}

export function UserAccountPopover({ isOpen, anchorEl, onClose }: UserAccountPopoverProps) {
    const { wsClient } = useVisualizerContext();
    const { authState } = useCloudContext();
    const queryClient = useQueryClient();
    const [isSigningOut, setIsSigningOut] = React.useState(false);

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            await wsClient.runCommand({ command: WICommandIds.SignOut, args: [] });
            await queryClient.invalidateQueries({ queryKey: ["cloud_auth_state"] });
        } catch {
            // ignore
        } finally {
            setIsSigningOut(false);
            onClose();
        }
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
                    <Button appearance="icon" tooltip={isSigningOut ? "Signing out..." : "Sign Out"} onClick={handleSignOut} disabled={isSigningOut}>
                        <Codicon
                            name={isSigningOut ? "loading" : "sign-out"}
                            iconSx={{ color: ThemeColors.ERROR, ...(isSigningOut && { animation: "codicon-spin 1.5s steps(30) infinite" }) }}
                        />
                    </Button>
                </UserHeader>

            </PopoverContent>
        </Popover>
    );
}
