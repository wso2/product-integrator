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

import React, { useMemo, useState } from "react";
import { CheckBox, Typography } from "@wso2/ui-toolkit";
import { type WICloudComponentEntry, type WICloudFormContext } from "@wso2/wi-core";
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
	FooterRow,
	NameButton,
	NameError,
	NameInput,
	NameInputWrapper,
	NameStatic,
	PageContainer,
	SelectionCount,
	Subtitle,
	SubtitleRow,
	SubtitleSeparator,
	SubmitButton,
	TitleRow,
	TypeBadge,
	WarningBanner,
} from "./styles";

// ── Dummy data ────────────────────────────────────────────────────────────────

const DUMMY_CONTEXT: WICloudFormContext = {
	extensionName: "Devant",
	orgName: "Kajendran",
	projectName: "Default Project",
	components: [
		{
			componentName: "order-service",
			directoryName: "order-service",
			directoryFsPath: "/workspace/my-project/order-service",
			buildPackLang: "Ballerina",
			componentType: "Service",
			isService: true,
		},
		{
			componentName: "inventory-api",
			directoryName: "inventory-api",
			directoryFsPath: "/workspace/my-project/inventory-api",
			buildPackLang: "Java",
			componentType: "Service",
			isService: true,
		},
		{
			componentName: "notification-worker",
			directoryName: "notification-worker",
			directoryFsPath: "/workspace/my-project/notification-worker",
			buildPackLang: "NodeJS",
			componentType: "Automation",
			isService: false,
		},
		{
			componentName: "auth-proxy",
			directoryName: "auth-proxy",
			directoryFsPath: "/workspace/my-project/auth-proxy",
			buildPackLang: "Python",
			componentType: "Service",
			isService: true,
		},
	],
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface EntryFormState {
	displayName: string;
	displayNameError?: string;
	selected: boolean;
}

function initEntryState(entry: WICloudComponentEntry): EntryFormState {
	return {
		displayName: entry.componentName,
		selected: true,
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
	const context = DUMMY_CONTEXT;

	const [formState, setFormState] = useState<EntryFormState[]>(() =>
		context.components.map(initEntryState),
	);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

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

	const isBatch = context.components.length > 1;
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

	const handleSubmit = async () => {
		if (!hasSelected || !validate()) { return; }
		setSubmitting(true);
		setSubmitError(null);
		try {
			// TODO: wire up real RPC call
			// const resp = await cloudClient.submitComponents({ ... });
		} catch (err: any) {
			setSubmitError(err?.message ?? "An unexpected error occurred.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<PageContainer>
			{/* Header */}
			<TitleRow>
				<Typography variant="h1">Deploy {isBatch ? "Integrations" : "Integration"}</Typography>
			</TitleRow>

			{/* Submit error */}
			{submitError && (
				<ErrorBanner>
					{submitError.split("\n").map((line, i) => (
						<div key={i}>{line}</div>
					))}
				</ErrorBanner>
			)}

			{/* Component list */}
			<ComponentListSection>
				<ComponentListHeader>
					<ComponentListLabel>{isBatch ? "Select Integrations to Deploy in the cloud" : "Deploy integration in the cloud"}</ComponentListLabel>
					{isBatch && <SelectionCount>{selectedCount} of {context.components.length} selected</SelectionCount>}
				</ComponentListHeader>

				<ComponentListContainer>
					{context.components.map((entry, index) => {
						const state = formState[index];
						const isSelected = state?.selected ?? false;
						const isEditing = editingIndex === index;
						const currentName = state?.displayName ?? entry.componentName;
						const nameError = state?.displayNameError;
						const isLast = index === context.components.length - 1;

						return (
							<ComponentListRow
								key={entry.directoryFsPath}
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

									<DirPath title={entry.directoryFsPath}>
										<span aria-hidden>⊞</span>
										{entry.directoryFsPath}
									</DirPath>
								</ComponentInfo>

								{/* Type badge */}
								<TypeBadge isSelected={isSelected}>
									{entry.buildPackLang}
								</TypeBadge>
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

			{/* Footer */}
			<FooterRow>
				<SubmitButton
					appearance="primary"
					onClick={handleSubmit}
					disabled={submitting || !hasSelected}
				>
					{submitting ? "Deploying..." : selectedCount > 1 ? "Deploy All" : "Deploy"}
				</SubmitButton>
			</FooterRow>
		</PageContainer>
	);
}
