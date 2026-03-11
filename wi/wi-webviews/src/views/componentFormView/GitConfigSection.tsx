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

import React, { type FC, type ReactNode, useEffect, useState } from "react";
import { Dropdown, ProgressIndicator, Codicon } from "@wso2/ui-toolkit";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GitProvider, parseGitURL, toSentenceCase } from "@wso2/wso2-platform-core";
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
		refetch: refetchGitCred,
		isFetching: isFetchingGitCred,
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

	let invalidRepoMsg: ReactNode = "";
	let blockCreation = false;
	let invalidRepoAction = "";
	let invalidRepoBannerType: "error" | "warning" | "info" | "neutral" = "warning";
	let onInvalidRepoActionClick: (() => void) | undefined;
	let onInvalidRepoRefreshClick: (() => void) | undefined;
	let onInvalidRepoRefreshing = false;

	if (!isLoadingGitData) {
		if (gitData === null) {
			invalidRepoMsg = "Please initialize the selected directory as a Git repository to proceed.";
			invalidRepoAction = "Source Control";
			onInvalidRepoActionClick = openSourceControl;
			onInvalidRepoRefreshClick = refetchGitData;
			blockCreation = true;
		} else if (gitData?.remotes?.length === 0) {
			invalidRepoMsg = "The selected Git repository has no configured remotes. Please add a remote to proceed.";
			invalidRepoAction = "Source Control";
			onInvalidRepoActionClick = openSourceControl;
			onInvalidRepoRefreshClick = refetchGitData;
			blockCreation = true;
		}
	}

	if (!invalidRepoMsg && gitProvider && gitProvider !== GitProvider.GITHUB && !isLoadingGitCred && gitCredentials?.length === 0) {
		onInvalidRepoActionClick = () => wsClient.openExternal(`${consoleUrl}/organizations/${orgHandle}/settings/credentials`);
		invalidRepoMsg = `${toSentenceCase(gitProvider)} credentials needs to be configured.`;
		invalidRepoAction = "Configure Credentials";
		onInvalidRepoRefreshClick = refetchGitCred;
		onInvalidRepoRefreshing = isFetchingGitCred;
		blockCreation = true;
	}

	if (!invalidRepoMsg && !isLoadingRepoAccess && gitRemote && !isRepoAuthorizedResp?.isAccessible && gitProvider) {
		if (gitProvider === GitProvider.GITHUB) {
			if (isRepoAuthorizedResp?.retrievedRepos) {
				invalidRepoMsg = <span>WSO2 lacks access to the selected repository.</span>;
				invalidRepoAction = "Grant Access";
				onInvalidRepoActionClick = () => wsClient.triggerGithubInstallFlow(orgId);
			} else {
				invalidRepoMsg = "Please authorize WSO2 to access your GitHub repositories.";
				invalidRepoAction = "Authorize";
				onInvalidRepoActionClick = () => wsClient.triggerGithubAuthFlow(orgId);
				invalidRepoBannerType = "info";
			}
		} else {
			onInvalidRepoActionClick = () => wsClient.openExternal(`${consoleUrl}/organizations/${orgHandle}/settings/credentials`);
			if (isRepoAuthorizedResp?.retrievedRepos) {
				invalidRepoMsg = <span>Selected Credential does not have sufficient permissions to access the repository.</span>;
				invalidRepoAction = "Manage Credentials";
			} else {
				invalidRepoMsg = `Failed to retrieve ${toSentenceCase(gitProvider)} repositories using the selected credential.`;
				invalidRepoAction = "Manage Credentials";
			}
		}

		onInvalidRepoRefreshClick = refetchRepoAccess;
		onInvalidRepoRefreshing = isFetchingRepoAccess;
		blockCreation = true;
	}

	if (isLoadingGitData) {
		blockCreation = true;
	}

	if (!blockCreation && gitRemote && !branch) {
		blockCreation = true;
	}

	if (!invalidRepoMsg && !!gitRemote && !isLoadingBranches && branches?.length === 0) {
		invalidRepoMsg = "The selected remote repository has no branches. Please publish your local branch to the remote repository.";
		invalidRepoAction = "Push Changes";
		onInvalidRepoActionClick = pushChanges;
		onInvalidRepoRefreshClick = refetchBranches;
		onInvalidRepoRefreshing = isFetchingBranches;
		invalidRepoBannerType = "info";
		blockCreation = true;
	}

	if (!invalidRepoMsg && configDriftFiles?.length > 0) {
		invalidRepoMsg = `Cloud deployment requires the metadata in the ${configDriftFiles.join(",")} ${configDriftFiles?.length > 1 ? "files" : "file"} to be committed and pushed to the selected remote repository for proper functionality.`;
		onInvalidRepoRefreshClick = refetchConfigDrift;
		onInvalidRepoRefreshing = isFetchingConfigDrift;
		invalidRepoBannerType = "warning";
		blockCreation = true;
	}

	if (!invalidRepoMsg && hasDirtyRepo) {
		invalidRepoMsg = "WSO2 cloud builds your integrations from the source code in the selected remote repository. Please commit and push your local changes to the remote Git repository.";
		onInvalidRepoRefreshClick = refetchHasDirtyRepo;
		onInvalidRepoRefreshing = isFetchingHasDirtyRepo;
		invalidRepoBannerType = "neutral";
	}

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
