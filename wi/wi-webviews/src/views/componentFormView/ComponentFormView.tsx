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

import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { CheckBox, Typography, Dropdown, Alert, Button, ProgressIndicator, Codicon } from "@wso2/ui-toolkit";
import { type WICloudFormContext, type ICreateNewIntegrationCmdIntegrations, WICloudSubmitComponentsReq } from "@wso2/wi-core";
import { CreateComponentReq, getTypeOfIntegrationType, GitProvider, makeURLSafe, parseGitURL, toSentenceCase, WICommandIds } from "@wso2/wso2-platform-core";
import { useVisualizerContext } from "../../contexts";
import { useCloudContext } from "../../providers";
import {
	CancelButton,
	CheckboxCell,
	ComponentInfo,
	ComponentListContainer,
	ComponentListHeader,
	ComponentListLabel,
	ComponentListRow,
	ComponentListSection,
	DirPath,
	ErrorBanner,
	FieldGroup,
	FieldLabel,
	FieldSelect,
	FooterRow,
	GitConfigGrid,
	GitConfigLabel,
	GitConfigSection,
	NameButton,
	NameError,
	NameInput,
	NameInputWrapper,
	NameStatic,
	PageContainer,
	RepoBanner,
	RepoBannerActions,
	RepoBannerButton,
	RepoBannerMessage,
	RepoBannerRefreshButton,
	SelectionCount,
	Subtitle,
	SubtitleRow,
	SubtitleSeparator,
	SubmitButton,
	TitleRow,
	TypeBadge,
	WarningBanner,
} from "./styles";
import { useMutation, useQuery } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────
interface EntryFormState {
	displayName: string;
	displayNameError?: string;
	selected: boolean;
	fsPath: string;
	selectedIntegrationType?: string;
}

function initEntryState(entry: ICreateNewIntegrationCmdIntegrations): EntryFormState {
	return {
		displayName: entry.name,
		selected: true,
		fsPath: entry.fsPath,
		selectedIntegrationType: entry.supportedIntegrationTypes?.[0],
	};
}

const validateName = (name: string): string | undefined => {
	const trimmed = name.trim();
	if (!trimmed) { return "Display name is required."; }
	if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(trimmed)) {
		return "Use letters, numbers, spaces, hyphens or underscores. Must start with a letter or number.";
	}
	return undefined;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ComponentFormView() {
	const { wsClient } = useVisualizerContext();
	const { contextState, consoleUrl } = useCloudContext();
	const [params, setParams] = useState<WICloudFormContext | null>(null);

	const [formState, setFormState] = useState<EntryFormState[]>(() =>
		params?.integrations.map(initEntryState) ?? [],
	);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);

	// form inputs
	const [gitRemote, setGitRemote] = useState<string | null>(null);
	const [gitProvider, setGitProvider] = useState<string | null>(null);
	const [branch, setBranch] = useState<string | null>(null);
	const [credential, setCredential] = useState<string | null>(null);
	const [gitRoot, setGitRoot] = useState<string | null>(null);

	const updateEntry = (index: number, patch: Partial<EntryFormState>) => {
		setFormState((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
	};

	const handleToggle = (index: number, checked: boolean) => {
		if (!checked && editingIndex === index) { setEditingIndex(null); }
		updateEntry(index, { selected: checked });
	};

	const handleNameChange = (index: number, value: string) => {
		updateEntry(index, { displayName: value, displayNameError: validateName(value) });
	};

	const handleNameCommit = () => setEditingIndex(null);

	const handleIntegrationTypeChange = (index: number, value: string) => {
		updateEntry(index, { selectedIntegrationType: value });
	};

	const isBatch = params?.integrations.length > 1;
	const selectedCount = useMemo(() => formState.filter((e) => e.selected).length, [formState]);
	const hasSelected = selectedCount > 0;

	const validate = (): boolean => {
		let valid = true;
		const next = formState.map((entry) => {
			if (!entry.selected) { return entry; }
			const error = validateName(entry.displayName);
			if (error) { valid = false; }
			return { ...entry, displayNameError: error };
		});
		setFormState(next);
		return valid;
	};

	const { error: submitError, mutate: submit, isPending: isSubmitting } = useMutation({
		mutationFn: async () => {
			if (!hasSelected || !validate()) { return; }
			const req: WICloudSubmitComponentsReq = {
				org: params!.org,
				project: params!.project,
				workspaceFsPath: params!.workspaceFsPath, // todo: need to change in cloud editor
				createParams: formState.filter((state) => state.selected).map((state, index) => {
					// Map DevantScopes (e.g., "AUTOMATION") to ChoreoComponentType (e.g., "ScheduledTask")
					const mappedType = getTypeOfIntegrationType(state.selectedIntegrationType);

					return {
						branch,
						buildPackLang: params!.buildPackLang,
						componentDir: state.fsPath,
						displayName: state.displayName,
						repoUrl: gitRemote,
						projectId: params!.project.id,
						projectHandle: params!.project.handler,
						type: mappedType.type,
						componentSubType: mappedType.subType,
						gitProvider: gitProvider,
						gitCredRef: credential,
						name: makeURLSafe(state.displayName),
						orgId: params!.org.id?.toString(),
						orgUUID: params!.org.uuid,
						originCloud: "devant",
						// langVersion: "", // todo: check if needed?
					} as CreateComponentReq
				})
			}

			const created = await wsClient.submitComponents(req);
			if (created.created?.length === created.total) {
				wsClient.closeCloudFormWebview();
			} else {
				console.error("Some components failed to create", created);
			}
		},
		onError: (error) => {
			console.error("Failed to submit components", error);
		}
	})

	useEffect(() => {
		if (wsClient) {
			wsClient.getCloudFormContext().then((ctx) => {
				setParams(ctx);
				setFormState(ctx.integrations.map(initEntryState));
			})
		}
	}, [wsClient])

	const {
		data: gitData,
		isLoading: isLoadingGitData,
		refetch: refetchGitData,
	} = useQuery({
		queryKey: ["git-data", { directoryFsPath: params?.workspaceFsPath }],
		queryFn: async () => {
			const gitData = await wsClient.getLocalGitData(params?.workspaceFsPath ?? "");
			return gitData ?? null;
		},
		enabled: !!params,
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
		if (gitData?.gitRoot) {
			setGitRoot(gitData?.gitRoot);
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
		queryKey: ["git-creds", { gitProvider }],
		queryFn: () =>
			wsClient.getCredentials({ orgId: contextState?.selected?.org?.id?.toString(), orgUuid: contextState?.selected?.org?.uuid }),
		select: (gitData) => gitData?.filter((item) => item.type === gitProvider),
		refetchOnWindowFocus: true,
		enabled: !!gitProvider && gitProvider !== GitProvider.GITHUB,
	});

	useEffect(() => {
		if (gitCredentials.length > 0 && (credential || !gitCredentials.some((item) => item.id === credential))) {
			setCredential(gitCredentials[0]?.id);
		}
	}, [gitCredentials]);

	const {
		isFetching: isFetchingRepoAccess,
		isLoading: isLoadingRepoAccess,
		data: isRepoAuthorizedResp,
		refetch: refetchRepoAccess,
	} = useQuery({
		queryKey: ["git-repo-access", { repo: gitRemote, orgId: contextState?.selected?.org?.id, provider: gitProvider }],
		queryFn: () =>
			wsClient.isRepoAuthorized({
				repoUrl: gitRemote,
				orgId: contextState?.selected?.org?.id?.toString(),
				credRef: gitProvider !== GitProvider.GITHUB ? credential : "",
			}),
		enabled: !!gitRemote && !!gitProvider && (gitProvider !== GitProvider.GITHUB ? !!credential : true),
		refetchOnWindowFocus: true,
	});

	const {
		isFetching: isLoadingBranches,
		data: branches = [],
		refetch: refetchBranches,
		isFetching: isFetchingBranches,
	} = useQuery({
		queryKey: ["git-branches", { repo: gitRemote, orgId: contextState?.selected?.org?.id, provider: gitProvider }],
		queryFn: () =>
			wsClient.getBranches({
				repoUrl: gitRemote,
				orgId: contextState?.selected?.org?.id?.toString(),
				credRef: gitProvider !== GitProvider.GITHUB ? credential : "",
			}),
		enabled: !!gitRemote && !!gitProvider && (gitProvider !== GitProvider.GITHUB ? !!credential : true),
		refetchOnWindowFocus: true,
	});

	useEffect(() => {
		if (branches?.length > 0 && (!branch || !branches.includes(branch))) {
			if (branches.includes(gitData.upstream?.name)) {
				setBranch(gitData.upstream?.name);
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
		queryKey: ["hasDirtyRepo", { gitProvider, workspaceFsPath: params?.workspaceFsPath, gitData }],
		queryFn: () => wsClient.hasDirtyRepo(params?.workspaceFsPath ?? ""),
		refetchOnWindowFocus: true,
		enabled: !!gitData && !!params?.workspaceFsPath,
	});

	const {
		data: configDriftFiles = [],
		isLoading: isLoadingConfigDriftFiles,
		isFetching: isFetchingConfigDrift,
		refetch: refetchConfigDrift,
	} = useQuery({
		queryKey: ["get-config-drift", { directoryFsPath: params?.workspaceFsPath }],
		queryFn: () =>
			wsClient.getConfigFileDrifts({
				type: "",
				repoDir: params?.workspaceFsPath,
				branch: branch,
				repoUrl: gitRemote,
			}),
		refetchOnWindowFocus: true,
		enabled: !!gitRemote && !!branch && !!params?.workspaceFsPath,
	});

	const { mutate: openSourceControl } = useMutation({
		mutationFn: () => wsClient.runCommand({ command: "workbench.scm.focus" }),
		onSuccess: () => refetchGitData(),
	});

	const { mutate: pushChanges } = useMutation({
		mutationFn: () => wsClient.runCommand({ command: "git.push" }),
		onSuccess: () => refetchGitData(),
	});

	let invalidRepoMsg: ReactNode = "";
	let blockCreation: boolean = false;
	let invalidRepoAction = "";
	let invalidRepoBannerType: "error" | "warning" | "info" | "neutral" = "warning";
	let onInvalidRepoActionClick: () => void;
	let onInvalidRepoRefreshClick: () => void;
	let onInvalidRepoRefreshing: boolean;

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
		onInvalidRepoActionClick = () => wsClient.openExternal(`${consoleUrl}/organizations/${contextState?.selected?.org?.handle}/settings/credentials`);
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
				onInvalidRepoActionClick = () => wsClient.triggerGithubInstallFlow(contextState?.selected?.org?.id?.toString());
			} else {
				invalidRepoMsg = `Please authorize WSO2 to access your GitHub repositories.`;
				invalidRepoAction = "Authorize";
				onInvalidRepoActionClick = () => wsClient.triggerGithubAuthFlow(contextState?.selected?.org?.id?.toString());
				invalidRepoBannerType = "info";
			}
		} else {
			onInvalidRepoActionClick = () => wsClient.openExternal(`${consoleUrl}/organizations/${contextState?.selected?.org?.handle}/settings/credentials`);
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

	if (!invalidRepoMsg && !isLoadingBranches && branches?.length === 0) {
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
		invalidRepoMsg = `WSO2 cloud builds your integrations from the source code in the selected remote repository. Please commit and push your local changes to the remote Git repository.`;
		onInvalidRepoRefreshClick = refetchHasDirtyRepo;
		onInvalidRepoRefreshing = isFetchingHasDirtyRepo;
		invalidRepoBannerType = "neutral";
	}

	return (
		<PageContainer>
			{/* Header */}
			<TitleRow>
				<Typography variant="h1">Deploy {isBatch ? "Integrations" : "Integration"}</Typography>
			</TitleRow>

			{/* Submit error */}
			{submitError && (
				<ErrorBanner>
					{submitError?.message.split("\n").map((line, i) => (
						<div key={i}>{line}</div>
					))}
				</ErrorBanner>
			)}

			{/* Component list */}
			<ComponentListSection>
				<ComponentListHeader>
					<ComponentListLabel>{isBatch ? "Select Integrations to Deploy in the cloud" : "Deploy integration in the cloud"}</ComponentListLabel>
					{isBatch && <SelectionCount>{selectedCount} of {params?.integrations.length} selected</SelectionCount>}
				</ComponentListHeader>

				<ComponentListContainer>
					{params?.integrations.map((entry, index) => {
						const state = formState[index];
						const isSelected = state?.selected ?? false;
						const isEditing = editingIndex === index;
						const currentName = state?.displayName ?? entry.name;
						const nameError = state?.displayNameError;
						const isLast = index === params?.integrations.length - 1;

						return (
							<ComponentListRow
								key={entry.fsPath}
								isSelected={isSelected}
								isLast={isLast}
							>
								{/* Checkbox — only shown when multiple components */}
								{isBatch && (
									<CheckboxCell>
										<CheckBox
											label=""
											checked={isSelected}
											onChange={(checked: boolean) => handleToggle(index, checked)}
										/>
									</CheckboxCell>
								)}

								{/* Name + directory */}
								<ComponentInfo>
									{isEditing && isSelected ? (
										<NameInputWrapper>
											<NameInput
												hasError={!!nameError}
												value={currentName}
												autoFocus
												spellCheck={false}
												onChange={(e) => handleNameChange(index, e.target.value)}
												onBlur={handleNameCommit}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === "Escape") {
														handleNameCommit();
													}
												}}
											/>
											{nameError && <NameError>{nameError}</NameError>}
										</NameInputWrapper>
									) : isSelected ? (
										<NameButton
											type="button"
											title={nameError ?? "Click to edit name"}
											onClick={() => setEditingIndex(index)}
										>
											<span>{currentName}</span>
											{nameError && <span style={{ color: "var(--vscode-errorForeground)", fontSize: 11 }}>⚠</span>}
											<span className="edit-icon" aria-hidden>✎</span>
										</NameButton>
									) : (
										<NameStatic>{currentName}</NameStatic>
									)}

									<DirPath title={entry.fsPath}>
										<span aria-hidden>⊞</span>
										<span className="path-text">{entry.fsPath}</span>
									</DirPath>
								</ComponentInfo>

								{/* Type badge */}
								{entry.supportedIntegrationTypes?.length > 0 && (
									<TypeBadge isSelected={isSelected}>
										{entry.supportedIntegrationTypes.length === 1 ? (
											<span>{entry.supportedIntegrationTypes[0]}</span>
										) : (
											<select
												value={state?.selectedIntegrationType ?? ""}
												onChange={(e) => handleIntegrationTypeChange(index, e.target.value)}
												style={{
													background: "transparent",
													border: "none",
													color: "inherit",
													font: "inherit",
													fontSize: "inherit",
													cursor: "pointer",
													outline: "none",
													padding: 0,
												}}
											>
												{entry.supportedIntegrationTypes.map((type) => (
													<option key={type} value={type}>{type}</option>
												))}
											</select>
										)}
									</TypeBadge>
								)}
							</ComponentListRow>
						);
					})}
				</ComponentListContainer>

				{isBatch && !hasSelected && (
					<WarningBanner>
						⚠ Please select at least one integration to proceed.
					</WarningBanner>
				)}
			</ComponentListSection>

			{/* Git configuration */}
			<GitConfigSection>
				<GitConfigLabel>Git Configuration</GitConfigLabel>
				<GitConfigGrid>
					<Dropdown
						label="Repository"
						items={gitData?.remotes?.map(remote => ({ value: remote }))}
						placeholder="Select Git Remote"
						id="git-remote"
						required
						value={gitRemote ?? ""}
						onChange={(e) => setGitRemote(e.target.value)}
					/>
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
							items={gitCredentials?.map((item) => ({ value: item.id, content: item.name }))}
							value={credential ?? ""}
							onChange={(e) => setCredential(e.target.value)}
						/>
					)}
					<Dropdown
						label="Branch"
						id="gen-details-branch"
						required
						name="branch"
						items={branches?.map(item => ({ value: item })) ?? []}
						disabled={branches?.length === 0}
						value={branch ?? ""}
						onChange={(e) => setBranch(e.target.value)}
					/>
				</GitConfigGrid>
			</GitConfigSection>

			{(isLoadingGitData || isLoadingGitCred) && (
				<div style={{ position: "relative" }}>
					<ProgressIndicator />
				</div>
			)}

			{/* Repo access / git validation banner */}
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

			{/* Footer */}
			<FooterRow>
				<SubmitButton
					appearance="primary"
					onClick={() => submit()}
					disabled={isSubmitting || !hasSelected || blockCreation}
				>
					{isSubmitting ? "Deploying..." : selectedCount > 1 ? "Deploy All" : "Deploy"}
				</SubmitButton>
			</FooterRow>
		</PageContainer>
	);
}
