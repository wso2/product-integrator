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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ProgressIndicator, Typography } from "@wso2/ui-toolkit";
import { type WICloudFormContext, type WICloudSubmitComponentsReq } from "@wso2/wi-core";
import { buildGitURL, type CreateComponentReq, DevantScopes, getTypeOfIntegrationType, type ICreateNewIntegrationCmdIntegrations, makeURLSafe, WICommandIds } from "@wso2/wso2-platform-core";
import { useVisualizerContext } from "../../contexts";
import { useCloudContext } from "../../providers";
import {
	AuthSectionWrap,
	ErrorBanner,
	FooterRow,
	FormBody,
	FormPanel,
	PageBackdrop,
	PageContainer,
	SubmitButton,
	TitleRow,
} from "./styles";
import { useMutation } from "@tanstack/react-query";
import { ComponentList, type EntryFormState } from "./ComponentList";
import { ExistingGitConfigSection, type GitConfigData } from "./GitConfigSection";
import { RepoInitSection, type RepoInitData } from "./RepoInitSection";

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Component ───────────────────────────────────────────────────────────────
export function ComponentFormView() {
	const { authState, authStateLoading } = useCloudContext();
	const { wsClient } = useVisualizerContext();

	if (authStateLoading) {
		return (
			<PageBackdrop>
				<PageContainer>
					<FormPanel>
						<FormBody style={{ justifyContent: "center", alignItems: "center", minHeight: 320 }}>
							<ProgressIndicator />
						</FormBody>
					</FormPanel>
				</PageContainer>
			</PageBackdrop>
		);
	}

	if (!authState?.userInfo) {
		return (
			<PageBackdrop>
				<PageContainer>
					<AuthSectionWrap>
						<div>Your session has expired. Please sign in again to deploy your integration.</div>
						<Button appearance="primary" onClick={() => wsClient.runCommand({ command: WICommandIds.SignIn, args: [] })}>
							Sign In
						</Button>
					</AuthSectionWrap>
				</PageContainer>
			</PageBackdrop>
		);
	}

	return <ComponentForm />;
}
function ComponentForm() {
	const { wsClient } = useVisualizerContext();
	const { consoleUrl } = useCloudContext();
	const [params, setParams] = useState<WICloudFormContext | null>(null);

	const [formState, setFormState] = useState<EntryFormState[]>(() =>
		params?.integrations.map(initEntryState) ?? [],
	);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);

	// ── Git config data (existing repo flow) ─────────────────────────────────
	const gitConfigDataRef = useRef<GitConfigData>({ gitRemote: null, gitProvider: null, branch: null, credential: null });
	const [blockCreation, setBlockCreation] = useState(false);

	// ── Repo init data (new code server component flow) ──────────────────────
	const repoInitDataRef = useRef<RepoInitData | null>(null);
	const [isRepoInitValid, setIsRepoInitValid] = useState(false);

	const isNewCodeServerComp = params?.isNewCodeServerComp ?? false;

	// ── Component list handlers ──────────────────────────────────────────────

	const updateEntry = useCallback((index: number, patch: Partial<EntryFormState>) => {
		setFormState((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
	}, []);

	const handleToggle = useCallback((index: number, checked: boolean) => {
		const entry = params?.integrations[index];
		if (entry?.supportedIntegrationTypes?.includes(DevantScopes.LIBRARY)) { return; }
		if (!checked) { setEditingIndex((prev) => prev === index ? null : prev); }
		updateEntry(index, { selected: checked });
	}, [updateEntry, params]);

	const handleNameChange = useCallback((index: number, value: string) => {
		updateEntry(index, { displayName: value, displayNameError: validateName(value) });
	}, [updateEntry]);

	const handleNameCommit = useCallback(() => setEditingIndex(null), []);

	const handleIntegrationTypeChange = useCallback((index: number, value: string) => {
		updateEntry(index, { selectedIntegrationType: value });
	}, [updateEntry]);

	const isBatch = (params?.integrations.length ?? 0) > 1;
	const selectedCount = useMemo(
		() => formState.filter((e, i) => e.selected && !params?.integrations[i]?.supportedIntegrationTypes?.includes(DevantScopes.LIBRARY)).length,
		[formState, params],
	);
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

	// ── Load context ─────────────────────────────────────────────────────────

	useEffect(() => {
		if (wsClient) {
			wsClient.getCloudFormContext().then((ctx: WICloudFormContext) => {
				setParams(ctx);
				setFormState(ctx.integrations.map(initEntryState));
			});
		}
	}, [wsClient]);

	// ── Submit / Deploy ──────────────────────────────────────────────────────

	const { error: submitError, mutate: submit, isPending: isSubmitting } = useMutation({
		mutationFn: async () => {
			if (!hasSelected || !validate()) { return; }

			let workspaceFsPath = params!.workspaceFsPath;
			let repoUrl: string = gitConfigDataRef?.current?.gitRemote ?? "";
			let branch: string = gitConfigDataRef?.current?.branch ?? "";
			let gitProvider: string = gitConfigDataRef?.current?.gitProvider ?? "";
			let credential: string = gitConfigDataRef?.current?.credential ?? "";

			if (isNewCodeServerComp) {
				const repoInit = repoInitDataRef.current;
				if (!repoInit) { throw new Error("Repo init data is missing"); }

				const repoUrl = buildGitURL(repoInit.orgHandler, repoInit.repo, repoInit.gitProvider, false, repoInit.serverUrl);

				// Validate subpath via getGitRepoMetadata
				const subPath = repoInit.subPath.startsWith("/") ? repoInit.subPath.slice(1) : repoInit.subPath;
				const resp = await wsClient.getGitRepoMetadata({
					branch: repoInit.branch,
					gitOrgName: repoInit.org,
					gitRepoName: repoInit.repo,
					relativePath: subPath,
					orgId: params!.org.id?.toString(),
					secretRef: repoInit.credential || "",
				});
				if (resp?.metadata && !resp.metadata.isSubPathEmpty) {
					throw new Error(`The path "${repoInit.subPath}" is not empty in the remote repository. Please choose an empty path.`);
				}

				const branches = await wsClient.getBranches({
					repoUrl: repoUrl,
					credRef: repoInit.credential,
					orgId: params!.org.id?.toString(),
				})

				// Clone repository and push source
				const newPath = await wsClient.cloneRepositoryIntoCompDir({
					cwd: params!.workspaceFsPath,
					subpath: repoInit.subPath,
					org: params!.org,
					componentName: "", // need to remove this prop from interface
					repo: {
						provider: repoInit.gitProvider,
						orgName: repoInit.org,
						orgHandler: repoInit.orgHandler,
						repo: repoInit.repo,
						serverUrl: repoInit.serverUrl,
						branch: repoInit.branch,
						secretRef: repoInit.credential,
						isBareRepo: !(branches?.length > 0),
					},
				});

				workspaceFsPath = newPath;
				branch = repoInit.branch;
				gitProvider = repoInit.gitProvider;
				credential = repoInit.credential;

				// todo: temporary workaround
				// todo: need to add support for workspace deployments in cloud editor
				formState[0].fsPath = newPath;
			}

			const req: WICloudSubmitComponentsReq = {
				org: params!.org,
				project: params!.project,
				workspaceFsPath,
				createParams: formState
					.map((state, index) => ({ state, integration: params!.integrations[index] }))
					.filter(({ state, integration }) =>
						state.selected && !integration.supportedIntegrationTypes?.includes(DevantScopes.LIBRARY)
					)
					.map(({ state }) => {
						const mappedType = getTypeOfIntegrationType(state.selectedIntegrationType);

						return {
							branch,
							buildPackLang: params!.buildPackLang,
							componentDir: state.fsPath,
							displayName: state.displayName,
							repoUrl,
							projectId: params!.project.id,
							projectHandle: params!.project.handler,
							type: mappedType.type,
							componentSubType: mappedType.subType,
							gitProvider,
							gitCredRef: credential,
							name: makeURLSafe(state.displayName),
							orgId: params!.org.id?.toString(),
							orgUUID: params!.org.uuid,
							originCloud: "devant",
						} as CreateComponentReq;
					}),
			};

			const created = await wsClient.submitComponents(req);
			if (created.failed?.length > 0) {
				console.error("Some components failed to create", created);
			}
			if (created.created?.length > 0) {
				wsClient.closeCloudFormWebview();
			}
		},
		onError: (error) => {
			console.error("Failed to submit components", error);
		},
	});

	// ── Compute deploy button disabled state ─────────────────────────────────

	const isDeployDisabled = isNewCodeServerComp
		? isSubmitting || !hasSelected || !isRepoInitValid
		: isSubmitting || !hasSelected || blockCreation;

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<PageBackdrop>
			<PageContainer>
				<FormPanel>
					<FormBody>
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
						{params?.org && params?.project && (
							<ComponentList
								org={params.org}
								project={params.project}
								integrations={params?.integrations ?? []}
								formState={formState}
								isBatch={isBatch}
								selectedCount={selectedCount}
								editingIndex={editingIndex}
								onToggle={handleToggle}
								onNameChange={handleNameChange}
								onNameCommit={handleNameCommit}
								onIntegrationTypeChange={handleIntegrationTypeChange}
								onEditStart={(index) => setEditingIndex(index)}
							/>
						)}

						{/* Git configuration — switch between existing repo and new repo init */}
						{params && !isNewCodeServerComp && (
							<ExistingGitConfigSection
								wsClient={wsClient}
								workspaceFsPath={params.workspaceFsPath}
								orgId={params?.org?.id?.toString()}
								orgUuid={params?.org?.uuid}
								orgHandle={params?.org?.handle}
								consoleUrl={consoleUrl}
								onBlockCreationChange={setBlockCreation}
								onGitConfigDataChange={(data) => { gitConfigDataRef.current = data; }}
							/>
						)}

						{params && isNewCodeServerComp && (
							<RepoInitSection
								wsClient={wsClient}
								orgId={params?.org?.id?.toString()}
								orgUuid={params?.org?.uuid}
								orgHandle={params?.org?.handle}
								consoleUrl={consoleUrl}
								onValidityChange={setIsRepoInitValid}
								onRepoInitDataChange={(data) => { repoInitDataRef.current = data; }}
							/>
						)}

						{/* Footer */}
						<FooterRow>
							<SubmitButton
								appearance="primary"
								onClick={() => submit()}
								disabled={isDeployDisabled}
							>
								{isSubmitting ? "Deploying..." : selectedCount > 1 ? "Deploy All" : "Deploy"}
							</SubmitButton>
						</FooterRow>
					</FormBody>
				</FormPanel>
			</PageContainer>
		</PageBackdrop>
	);
}
