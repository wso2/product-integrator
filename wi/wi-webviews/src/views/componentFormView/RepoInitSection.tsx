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

import React, { type FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dropdown, ProgressIndicator, TextField } from "@wso2/ui-toolkit";
import { buildGitURL, GitProvider } from "@wso2/wso2-platform-core";
import {
    GitConfigGrid,
    GitConfigLabel,
    GitConfigSection,
    RepoBanner,
    RepoBannerActions,
    RepoBannerButton,
    RepoBannerMessage,
    SmVSCodeLink,
    SmVSCodeLinks,
} from "./styles";

// ── Exported data shape ────────────────────────────────────────────────────────

export interface RepoInitData {
    gitProvider: string;
    org: string;
    orgHandler: string;
    repo: string;
    branch: string;
    subPath: string;
    credential: string;
    serverUrl: string;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface RepoInitSectionProps {
    wsClient: any;
    orgId: string;
    orgUuid: string;
    orgHandle: string;
    consoleUrl: string;
    onValidityChange: (isValid: boolean) => void;
    onRepoInitDataChange: (data: RepoInitData) => void;
}


const GIT_PROVIDER_ITEMS = [
    { value: GitProvider.GITHUB, content: "GitHub" },
    { value: GitProvider.BITBUCKET, content: "Bitbucket" },
    { value: GitProvider.GITLAB_SERVER, content: "GitLab" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export const RepoInitSection: FC<RepoInitSectionProps> = ({
    wsClient,
    orgId,
    orgUuid,
    orgHandle,
    consoleUrl,
    onValidityChange,
    onRepoInitDataChange,
}) => {
    // ── Local state ────────────────────────────────────────────────────────────
    const [gitProvider, setGitProvider] = useState<string>(GitProvider.GITHUB);
    const [org, setOrg] = useState<string>("");
    const [orgHandler, setOrgHandler] = useState<string>("");
    const [repo, setRepo] = useState<string>("");
    const [branch, setBranch] = useState<string>("main");
    const [subPath, setSubPath] = useState<string>("/");
    const [credential, setCredential] = useState<string>("");
    const [serverUrl, setServerUrl] = useState<string>("");
    const [creatingRepo, setCreatingRepo] = useState<boolean>(false);

    // ── Queries ────────────────────────────────────────────────────────────────

    const {
        data: gitOrgsData,
        isLoading: loadingGitOrgs,
        error: errorFetchingOrgs,
    } = useQuery({
        queryKey: ["repo-init-git-orgs", { gitProvider, credential, orgId }],
        queryFn: () =>
            wsClient.getAuthorizedGitOrgs({
                orgId,
                provider: gitProvider,
                credential,
            }),
        enabled: gitProvider === GitProvider.GITHUB || !!credential,
        refetchOnWindowFocus: true,
    });

    const gitOrgs = gitOrgsData?.gitOrgs ?? [];
    const matchingOrgItem = gitOrgs.find(
        (item: { orgName: string }) => item.orgName === org
    );

    const { data: allCredentials = [], isLoading: isLoadingCredentials } = useQuery({
        queryKey: ["repo-init-creds", { gitProvider, orgId, orgUuid }],
        queryFn: () =>
            wsClient.getCredentials({ orgId, orgUuid }),
        select: (data: any[]) =>
            data?.filter((item: any) => item.type === gitProvider) ?? [],
        enabled: gitProvider !== GitProvider.GITHUB,
        refetchOnWindowFocus: true,
    });

    const { data: credentialDetailsData, isLoading: isLoadingCredentialDetails } = useQuery({
        queryKey: ["repo-init-cred-details", { credential, gitProvider, orgId, orgUuid }],
        queryFn: () =>
            wsClient.getCredentialDetails({
                orgId,
                orgUuid,
                credentialId: credential,
            }),
        enabled: gitProvider === GitProvider.GITLAB_SERVER && !!credential,
    });

    useEffect(() => {
        if (credentialDetailsData?.serverUrl) {
            setServerUrl(credentialDetailsData.serverUrl);
        }
    }, [credentialDetailsData]);

    const repoUrl = useMemo(() => {
        if (!orgHandler || !repo) return null;
        return buildGitURL(orgHandler, repo, gitProvider, false, serverUrl);
    }, [orgHandler, repo, gitProvider, serverUrl]);

    const { data: branches = [], isLoading: isLoadingBranches } = useQuery({
        queryKey: ["repo-init-branches", { orgHandler, repo, gitProvider, orgId, serverUrl }],
        queryFn: () =>
            wsClient.getBranches({
                repoUrl,
                orgId,
                credRef: gitProvider !== GitProvider.GITHUB ? credential : "",
            }),
        enabled: !!repo && !!repoUrl,
        refetchOnWindowFocus: true,
    });

    // ── Auto-populate org when gitOrgs change ──────────────────────────────────

    useEffect(() => {
        if (gitOrgs.length > 0) {
            if (
                org === "" ||
                !gitOrgs.some((item: { orgName: string }) => item.orgName === org)
            ) {
                setOrg(gitOrgs[0].orgName);
            }
        } else if (gitOrgs.length === 0 && org !== "") {
            setOrg("");
        }
    }, [gitOrgsData]);

    // ── When org changes: update orgHandler, conditionally clear repo ──────────

    useEffect(() => {
        if (matchingOrgItem) {
            setOrgHandler(matchingOrgItem.orgHandler);
            if (
                matchingOrgItem.repositories?.length > 0 &&
                !matchingOrgItem.repositories.some(
                    (r: { name: string }) => r.name === repo
                )
            ) {
                setRepo("");
            }
        }
    }, [org, matchingOrgItem?.orgHandler]);

    // ── Auto-select credential when credentials load ───────────────────────────

    useEffect(() => {
        if (allCredentials.length > 0) {
            if (
                credential === "" ||
                !allCredentials.some((item: any) => item.id === credential)
            ) {
                setCredential(allCredentials[0].id);
            }
        } else if (allCredentials.length === 0 && credential !== "") {
            setCredential("");
        }
    }, [allCredentials]);

    // ── Auto-select branch when branches change ────────────────────────────────

    useEffect(() => {
        if (branches.length > 0 && !branches.includes(branch)) {
            if (branches.includes("main")) {
                setBranch("main");
            } else if (branches.includes("master")) {
                setBranch("master");
            } else {
                setBranch(branches[0]);
            }
        }
    }, [branches]);

    // ── Reset creatingRepo when provider changes ───────────────────────────────

    useEffect(() => {
        setCreatingRepo(false);
    }, [gitProvider]);

    // ── Notify parent of data changes ──────────────────────────────────────────

    useEffect(() => {
        onRepoInitDataChange({
            gitProvider,
            org,
            orgHandler,
            repo,
            branch,
            subPath,
            credential,
            serverUrl,
        });
    }, [gitProvider, org, orgHandler, repo, branch, subPath, credential, serverUrl]);

    // ── Compute and notify validity ────────────────────────────────────────────

    useEffect(() => {
        const isProviderSelected = !!gitProvider;
        const isOrgSelected = !!org;
        const isRepoSelected = !!repo;
        const isCredentialValid =
            gitProvider === GitProvider.GITHUB || !!credential;
        const isValid =
            isProviderSelected &&
            isOrgSelected &&
            isRepoSelected &&
            isCredentialValid;
        onValidityChange(isValid);
    }, [gitProvider, org, repo, isLoadingBranches, credential]);

    // ── Handlers ───────────────────────────────────────────────────────────────

    const handleProviderChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            const value = e.target.value;
            setGitProvider(value);
            setOrg("");
            setOrgHandler("");
            setRepo("");
            setCredential("");
            setServerUrl("");
            setBranch("main");
        },
        []
    );

    const handleCreateNewRepo = useCallback(() => {
        let newRepoLink = "https://github.com/new";
        if (gitProvider === GitProvider.BITBUCKET) {
            newRepoLink = `https://bitbucket.org/${org}/workspace/create/repository`;
        } else if (gitProvider === GitProvider.GITLAB_SERVER) {
            newRepoLink = `${serverUrl}/projects/new`;
        }
        wsClient.openExternal(newRepoLink);
        setCreatingRepo(true);
    }, [wsClient, gitProvider, org, serverUrl]);

    const handleClickCreateCreds = () => {
        wsClient.openExternal(`${consoleUrl}/organizations/${orgHandle}/settings/credentials`);
    }

    const handleBranchChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            setBranch(e.target.value);
        },
        []
    );


    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <>
            <GitConfigSection>
                <GitConfigLabel>Repository Details</GitConfigLabel>
                <GitConfigGrid>
                    {/* Git Provider */}
                    <Dropdown
                        label="Git Provider"
                        id="repo-init-git-provider"
                        required
                        items={GIT_PROVIDER_ITEMS}
                        value={gitProvider ?? ""}
                        onChange={handleProviderChange}
                    />

                    {/* GitHub authorization error banner */}
                    {gitProvider === GitProvider.GITHUB && !loadingGitOrgs && errorFetchingOrgs && (
                        <RepoBanner variant="info">
                            <RepoBannerMessage>
                                Please authorize WSO2 to access your GitHub repositories.
                            </RepoBannerMessage>
                            <RepoBannerActions>
                                <RepoBannerButton
                                    type="button"
                                    onClick={() => wsClient.triggerGithubAuthFlow(orgId)}
                                >
                                    Authorize
                                </RepoBannerButton>
                            </RepoBannerActions>
                        </RepoBanner>
                    )}

                    {/* Credentials dropdown (non-GitHub providers) */}
                    {gitProvider !== GitProvider.GITHUB && (
                        <div>
                            <Dropdown
                                label="Credentials"
                                id="repo-init-credentials"
                                required
                                items={allCredentials.map((item: any) => ({
                                    value: item.id,
                                    content: item.name,
                                })) ?? []}
                                value={credential ?? ""}
                                onChange={(e) => setCredential(e.target.value)}
                            />
                            <SmVSCodeLink onClick={handleClickCreateCreds}>Create New Credential</SmVSCodeLink>
                        </div>
                    )}

                    {/* Organization / Repository / Branch */}
                    {(gitProvider === GitProvider.GITHUB || credential) && (
                        <>
                            <div>
                                <Dropdown
                                    label="Organization"
                                    id="repo-init-org"
                                    required
                                    items={gitOrgs.map((item: { orgName: string }) => ({
                                        value: item.orgName,
                                        content: item.orgName,
                                    })) ?? []}
                                    value={org ?? ""}
                                    onChange={(e) => setOrg(e.target.value)}
                                />
                                <SmVSCodeLink onClick={() => wsClient.triggerGithubInstallFlow(orgId)}>Add Organization</SmVSCodeLink>
                            </div>

                            <div style={{ position: "relative" }}>
                                {matchingOrgItem && (
                                    <div>
                                        <Dropdown
                                            label="Repository"
                                            id="repo-init-repo"
                                            required
                                            items={matchingOrgItem?.repositories?.map((r: { name: string }) => ({
                                                value: r.name,
                                                content: r.name,
                                            })) ?? []}
                                            value={repo ?? ""}
                                            onChange={(e) => setRepo(e.target.value)}
                                        />
                                        <SmVSCodeLinks>
                                            {gitProvider === GitProvider.GITHUB ? (
                                                <>
                                                    {creatingRepo ? (
                                                        <>
                                                            <SmVSCodeLink onClick={() => wsClient.triggerGithubInstallFlow(orgId)}>Connect Newly Created Repository</SmVSCodeLink>
                                                            <SmVSCodeLink onClick={() => setCreatingRepo(false)}>Cancel</SmVSCodeLink>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <SmVSCodeLink onClick={handleCreateNewRepo}>Create New Repository</SmVSCodeLink>
                                                            <SmVSCodeLink onClick={() => wsClient.triggerGithubInstallFlow(orgId)}>Connect More Repositories</SmVSCodeLink>
                                                        </>
                                                    )}
                                                </>
                                            ) : (
                                                <SmVSCodeLink onClick={handleCreateNewRepo}>Create New Repository</SmVSCodeLink>
                                            )}

                                        </SmVSCodeLinks>
                                    </div>
                                )}
                            </div>

                            {repo && branches.length > 0 && (
                                <Dropdown
                                    label="Branch"
                                    id="repo-init-branch"
                                    required
                                    items={branches.map((b: string) => ({ value: b, content: b })) ?? []}
                                    value={branch ?? ""}
                                    onChange={handleBranchChange}
                                />
                            )}
                        </>
                    )}

                    {/* Sub-path input */}
                    <TextField
                        label="Path"
                        required
                        value={subPath ?? ""}
                        placeholder="/directory-path"
                        spellCheck={false}
                        onChange={(e) => setSubPath(e.target.value)}
                    />
                </GitConfigGrid>
            </GitConfigSection>
            {(loadingGitOrgs || isLoadingCredentials || isLoadingCredentialDetails || isLoadingBranches) && (
                <div style={{ position: "relative" }}>
                    <ProgressIndicator />
                </div>
            )}
        </>
    );
};
