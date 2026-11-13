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

import React, { type FC, useEffect, useState } from "react";
import { Dropdown, ProgressIndicator, Codicon } from "@wso2/ui-toolkit";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GitProvider, parseGitURL, toSentenceCase } from "@wso2/wso2-platform-core";
import { SOURCE_READINESS_ACTION_LABELS, type SourceReadinessAction, type SourceReadinessRefresh, sourceReadiness } from "@wso2/wi-core";
import { buildConsoleUrl } from "@wso2/wso2-cloud-client/contract";
import {
	GitConfigGrid,
	GitConfigLabel,
	GitConfigSection as GitConfigSectionStyled,
	RepoBanner,
	RepoBannerActions,
	RepoBannerButton,
	RepoBannerMessage,
	RepoBannerRefreshButton,
} from "./styles";

// ── Exported data shape ────────────────────────────────────────────────────────

export interface GitConfigData {
	gitRemote: string | null;
	gitProvider: string | null;
	branch: string | null;
	credential: string | null;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface GitConfigSectionProps {
	wsClient: any;
	workspaceFsPath: string;
	orgId: string;
	orgUuid: string;
	orgHandle: string;
	consoleUrl: string;
	onBlockCreationChange: (blocked: boolean) => void;
	onGitConfigDataChange: (data: GitConfigData) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export const ExistingGitConfigSection: FC<GitConfigSectionProps> = ({
	wsClient,
	workspaceFsPath,
	orgId,
	orgUuid,
	orgHandle,
	consoleUrl,
	onBlockCreationChange,
	onGitConfigDataChange,
}) => {
	const [gitRemote, setGitRemote] = useState<string | null>(null);
	const [gitProvider, setGitProvider] = useState<string | null>(null);
	const [branch, setBranch] = useState<string | null>(null);
	const [credential, setCredential] = useState<string | null>(null);

	// ── Queries ──────────────────────────────────────────────────────────────

	const {
		data: gitData,
		isLoading: isLoadingGitData,
		refetch: refetchGitData,
	} = useQuery({
		queryKey: ["git-data", { directoryFsPath: workspaceFsPath }],
		queryFn: async () => {
			const data = await wsClient.getLocalGitData(workspaceFsPath);
			return data ?? null;
		},
		enabled: !!workspaceFsPath,
		refetchOnWindowFocus: true,
	});

	useEffect(() => {
		if (gitData?.remotes?.length > 0 && !gitData?.remotes.includes(gitRemote)) {
			if (gitData?.upstream?.remoteUrl) {
				setGitRemote(gitData?.upstream?.remoteUrl);
			} else {
				setGitRemote(gitData?.remotes[0]);
			}
		}
	}, [gitData]);

	useEffect(() => {
		const parsedRepo = parseGitURL(gitRemote);
		if (parsedRepo && gitProvider !== parsedRepo[2]) {
			setGitProvider(parsedRepo[2]);
		}
	}, [gitRemote]);

	const {
		data: gitCredentials = [],
		isLoading: isLoadingGitCred,
	} = useQuery({
		queryKey: ["git-creds", { gitProvider, orgId, orgUuid }],
		queryFn: () =>
			wsClient.getCredentials({ orgId, orgUuid }),
		select: (data: any[]) => data?.filter((item: any) => item.type === gitProvider),
		refetchOnWindowFocus: true,
		enabled: !!gitProvider && gitProvider !== GitProvider.GITHUB,
	});

	useEffect(() => {
		if (gitCredentials.length > 0 && (credential || !gitCredentials.some((item: any) => item.id === credential))) {
			setCredential(gitCredentials[0]?.id);
		}
	}, [gitCredentials]);

	const {
		isFetching: isFetchingRepoAccess,
		isLoading: isLoadingRepoAccess,
		data: isRepoAuthorizedResp,
		refetch: refetchRepoAccess,
	} = useQuery({
		queryKey: ["git-repo-access", { repo: gitRemote, orgId, provider: gitProvider, credential }],
		queryFn: () =>
			wsClient.isRepoAuthorized({
				repoUrl: gitRemote,
				orgId,
				credRef: gitProvider !== GitProvider.GITHUB ? credential : "",
			}),
		enabled: !!gitRemote && !!gitProvider && (gitProvider !== GitProvider.GITHUB ? !!credential : true),
		refetchOnWindowFocus: true,
	});

	const {
		isFetching: isFetchingBranches,
		isLoading: isLoadingBranches,
		data: branches = [],
		refetch: refetchBranches,
	} = useQuery({
		queryKey: ["git-branches", { repo: gitRemote, orgId, provider: gitProvider, credential }],
		queryFn: () =>
			wsClient.getBranches({
				repoUrl: gitRemote,
				orgId,
				credRef: gitProvider !== GitProvider.GITHUB ? credential : "",
			}),
		enabled: !!gitRemote && !!gitProvider && (gitProvider !== GitProvider.GITHUB ? !!credential : true),
		refetchOnWindowFocus: true,
	});

	useEffect(() => {
		if (branches?.length > 0 && (!branch || !branches.includes(branch))) {
			if (branches.includes(gitData?.upstream?.name)) {
				setBranch(gitData?.upstream?.name);
			} else if (branches.includes("main")) {
				setBranch("main");
			} else if (branches.includes("master")) {
				setBranch("master");
			} else {
				setBranch(branches[0]);
			}
		}
	}, [branches, gitData]);

	const {
		data: hasDirtyRepo,
		refetch: refetchHasDirtyRepo,
		isFetching: isFetchingHasDirtyRepo,
	} = useQuery({
		queryKey: ["hasDirtyRepo", { gitProvider, workspaceFsPath, gitData }],
		queryFn: () => wsClient.hasDirtyRepo(workspaceFsPath),
		refetchOnWindowFocus: true,
		enabled: !!gitData && !!workspaceFsPath,
	});

	const {
		data: configDriftFiles = [],
		isFetching: isFetchingConfigDrift,
		refetch: refetchConfigDrift,
	} = useQuery({
		queryKey: ["get-config-drift", { directoryFsPath: workspaceFsPath }],
		queryFn: () =>
			wsClient.getConfigFileDrifts({
				type: "",
				repoDir: workspaceFsPath,
				branch: branch,
				repoUrl: gitRemote,
			}),
		refetchOnWindowFocus: true,
		enabled: !!gitRemote && !!branch && !!workspaceFsPath,
	});

	const { mutate: openSourceControl } = useMutation({
		mutationFn: () => wsClient.runCommand({ command: "workbench.scm.focus" }),
		onSuccess: () => refetchGitData(),
	});

	const { mutate: pushChanges } = useMutation({
		mutationFn: () => wsClient.runCommand({ command: "git.push" }),
		onSuccess: () => refetchGitData(),
	});

	// ── Notify parent of data changes ────────────────────────────────────────

	useEffect(() => {
		onGitConfigDataChange({ gitRemote, gitProvider, branch, credential });
	}, [gitRemote, gitProvider, branch, credential]);

	// ── Compute validation / block state ─────────────────────────────────────

	const readiness = sourceReadiness({
		gitData: isLoadingGitData ? undefined : gitData,
		gitRemote,
		gitProvider,
		branch,
		branches: branches ?? [],
		branchesLoading: isLoadingBranches,
		repoAccess: isRepoAuthorizedResp,
		repoAccessLoading: isLoadingRepoAccess,
		configDriftFiles: configDriftFiles ?? [],
		hasDirtyRepo: !!hasDirtyRepo,
	});
	const actionHandlers: Record<SourceReadinessAction, () => void> = {
		sourceControl: () => openSourceControl(),
		pushChanges: () => pushChanges(),
		grantAccess: () => wsClient.triggerGithubInstallFlow(orgId),
		authorize: () => wsClient.triggerGithubAuthFlow(orgId),
		manageCredentials: () => wsClient.openExternal(buildConsoleUrl(consoleUrl, { orgHandle, section: "settings/credentials" })),
	};
	const refreshers: Record<SourceReadinessRefresh, [() => void, boolean]> = {
		gitData: [refetchGitData, false],
		branches: [refetchBranches, isFetchingBranches],
		repoAccess: [refetchRepoAccess, isFetchingRepoAccess],
		configDrift: [refetchConfigDrift, isFetchingConfigDrift],
		dirtyRepo: [refetchHasDirtyRepo, isFetchingHasDirtyRepo],
	};
	const invalidRepoMsg = readiness.message;
	const blockCreation = readiness.blocking;
	const invalidRepoAction = readiness.action ? SOURCE_READINESS_ACTION_LABELS[readiness.action] : "";
	const invalidRepoBannerType = readiness.tone;
	const onInvalidRepoActionClick = readiness.action ? actionHandlers[readiness.action] : undefined;
	const [onInvalidRepoRefreshClick, onInvalidRepoRefreshing] = readiness.refresh ? refreshers[readiness.refresh] : [undefined, false];

	useEffect(() => {
		onBlockCreationChange(blockCreation);
	}, [blockCreation]);

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<>
			<GitConfigSectionStyled>
				<GitConfigLabel>Git Configuration</GitConfigLabel>
				<GitConfigGrid>
					{gitData?.remotes?.length > 0 && (
						<Dropdown
							label="Repository"
							items={gitData?.remotes?.map((remote: string) => ({ value: remote }))}
							placeholder="Select Git Remote"
							id="git-remote"
							required
							value={gitRemote ?? ""}
							onChange={(e) => setGitRemote(e.target.value)}
						/>
					)}
					{gitRemote && ![GitProvider.GITHUB, GitProvider.BITBUCKET].includes(gitProvider as GitProvider) && (
						<Dropdown
							label="Git Provider"
							id="gitProvider"
							required
							name="gitProvider"
							items={[{ value: GitProvider.GITLAB_SERVER, content: "GitLab" }]}
							value={gitProvider ?? ""}
							onChange={(e) => setGitProvider(e.target.value)}
						/>
					)}
					{gitProvider && gitProvider !== GitProvider.GITHUB && gitCredentials?.length > 0 && (
						<Dropdown
							label={`${toSentenceCase(gitProvider).replaceAll("-", " ")} Credential`}
							id="gen-details-cred"
							required
							name="credential"
							items={gitCredentials?.map((item: any) => ({ value: item.id, content: item.name }))}
							value={credential ?? ""}
							onChange={(e) => setCredential(e.target.value)}
						/>
					)}
					{branches?.length > 0 && (
						<Dropdown
							label="Branch"
							id="gen-details-branch"
							required
							name="branch"
							items={branches?.map((item: string) => ({ value: item })) ?? []}
							value={branch ?? ""}
							onChange={(e) => setBranch(e.target.value)}
						/>
					)}
				</GitConfigGrid>
			</GitConfigSectionStyled>

			{(isLoadingGitData || isLoadingGitCred || isLoadingBranches) && (
				<div style={{ position: "relative" }}>
					<ProgressIndicator />
				</div>
			)}

			{invalidRepoMsg && (
				<RepoBanner variant={invalidRepoBannerType}>
					<RepoBannerMessage>{invalidRepoMsg}</RepoBannerMessage>
					<RepoBannerActions>
						{onInvalidRepoActionClick && invalidRepoAction && (
							<RepoBannerButton type="button" onClick={onInvalidRepoActionClick}>
								{invalidRepoAction}
							</RepoBannerButton>
						)}
						{onInvalidRepoRefreshClick && (
							<RepoBannerRefreshButton
								type="button"
								title="Refresh"
								disabled={onInvalidRepoRefreshing}
								onClick={onInvalidRepoRefreshClick}
							>
								<Codicon name="refresh" />
							</RepoBannerRefreshButton>
						)}
					</RepoBannerActions>
				</RepoBanner>
			)}
		</>
	);
};
