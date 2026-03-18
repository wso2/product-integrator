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

import { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { Popover, ThemeColors, VSCodeColors, Button, Codicon } from "@wso2/ui-toolkit";
import { useQueryClient } from "@tanstack/react-query";
import { useVisualizerContext } from "../contexts";
import { useCloudContext } from "../providers";
import { WICommandIds } from "@wso2/wso2-platform-core";

interface UserOrganization {
    id?: number | string;
    uuid?: string;
    name: string;
}

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

const OrgList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 160px;
    overflow-y: auto;
    margin: 0 -4px;
`;

const OrgItem = styled.button<{ isSelected?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: none;
    background: ${(p: { isSelected?: boolean }) =>
        p.isSelected ? "var(--vscode-list-activeSelectionBackground)" : "transparent"};
    color: ${(p: { isSelected?: boolean }) =>
        p.isSelected ? "var(--vscode-list-activeSelectionForeground)" : "var(--vscode-foreground)"};
    border-radius: 4px;
    padding: 6px 8px;
    text-align: left;
    cursor: pointer;

    &:hover:not(:disabled) {
        background: var(--vscode-list-hoverBackground);
    }

    &:disabled {
        cursor: default;
    }
`;

const OrgItemName = styled.span`
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12px;
`;

const OrgErrorText = styled.div`
    font-size: 11px;
    color: var(--vscode-errorForeground);
    padding: 4px 2px 0;
`;

export interface UserAccountPopoverProps {
    isOpen: boolean;
    anchorEl: HTMLElement | null;
    onClose: () => void;
    onOrgSwitch?: (orgId: string, orgName: string) => void;
}

export function UserAccountPopover({ isOpen, anchorEl, onClose, onOrgSwitch }: UserAccountPopoverProps) {
    const { wsClient } = useVisualizerContext();
    const { authState, contextState } = useCloudContext();
    const queryClient = useQueryClient();
    const [isSwitchingOrg, setIsSwitchingOrg] = useState(false);
    const [localSelectedOrgId, setLocalSelectedOrgId] = useState<string | null>(null);
    const [orgSwitchError, setOrgSwitchError] = useState<string | null>(null);

    const organizations = useMemo(
        () => ((authState?.userInfo?.organizations || []) as UserOrganization[]).filter((org) => Boolean(org?.name)),
        [authState?.userInfo?.organizations]
    );

    const selectedOrgId = localSelectedOrgId != null ? localSelectedOrgId : (authState as any)?.selectedOrgId ?? contextState?.selected?.org?.id;

    // Clear error when popover closes
    useEffect(() => {
        if (!isOpen) {
            setOrgSwitchError(null);
        }
    }, [isOpen]);

    // Sync from authState when an external update arrives (e.g. AUTH_STATE_CHANGED)
    useEffect(() => {
        const incoming = (authState as any)?.selectedOrgId;
        if (incoming && incoming !== localSelectedOrgId) {
            setLocalSelectedOrgId(String(incoming));
        } else if (incoming == null) {
            setLocalSelectedOrgId(null);
        }
    }, [(authState as any)?.selectedOrgId]);

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

    const handleSwitchOrg = async (org: UserOrganization) => {
        if (!org?.id || String(org.id) === String(selectedOrgId) || isSwitchingOrg) {
            return;
        }

        const previousOrgId = localSelectedOrgId;
        setOrgSwitchError(null);
        setIsSwitchingOrg(true);
        setLocalSelectedOrgId(String(org.id));
        try {
            await wsClient.changeOrgContext(String(org.id));
            onOrgSwitch?.(String(org.id), org.name);
            onClose();
        } catch (error) {
            console.error("Failed to switch organization", error);
            setOrgSwitchError("Unable to switch organization right now.");
            setLocalSelectedOrgId(previousOrgId);
            if (previousOrgId) {
                const prevOrg = organizations.find((o) => String(o.id) === previousOrgId);
                if (prevOrg) onOrgSwitch?.(previousOrgId, prevOrg.name);
            }
        } finally {
            setIsSwitchingOrg(false);
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
                    <Button appearance="icon" tooltip="Sign Out" onClick={handleSignOut}>
                        <Codicon name="sign-out" iconSx={{ color: ThemeColors.ERROR }} />
                    </Button>
                </UserHeader>

                {organizations.length > 0 && (
                    <ContextSection>
                        <SectionLabel>Organization</SectionLabel>
                        {organizations.length === 1 ? (
                            <RowValue>{organizations[0].name}</RowValue>
                        ) : (
                            <OrgList>
                                {organizations.map((org) => {
                                    const isSelected = String(org.id) === String(selectedOrgId);
                                    return (
                                        <OrgItem
                                            type="button"
                                            key={String(org.id || org.uuid || org.name)}
                                            isSelected={isSelected}
                                            disabled={isSwitchingOrg || isSelected}
                                            onClick={() => handleSwitchOrg(org)}
                                        >
                                            <OrgItemName title={org.name}>{org.name}</OrgItemName>
                                            {isSelected && (
                                                <Codicon
                                                    name={isSwitchingOrg ? "loading" : "check"}
                                                    iconSx={{
                                                        fontSize: 12,
                                                        ...(isSwitchingOrg && {
                                                            animation: "codicon-spin 1.5s steps(30) infinite",
                                                        }),
                                                    }}
                                                />
                                            )}
                                        </OrgItem>
                                    );
                                })}
                            </OrgList>
                        )}
                        {orgSwitchError && <OrgErrorText>{orgSwitchError}</OrgErrorText>}
                    </ContextSection>
                )}

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
