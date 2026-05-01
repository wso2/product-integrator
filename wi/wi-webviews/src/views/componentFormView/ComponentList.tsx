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

import React from "react";
import { CheckBox } from "@wso2/ui-toolkit";
import { DevantScopes, getIntegrationScopeText, ICreateNewIntegrationCmdIntegrations, Project } from "@wso2/wso2-platform-core";
import {
	CheckboxCell,
	ComponentInfo,
	ComponentListContainer,
	ComponentListHeader,
	ComponentListLabel,
	ComponentListRow,
	ComponentListSection,
	DirPath,
	NameButton,
	NameError,
	NameInput,
	NameInputWrapper,
	NameStatic,
	SelectionCount,
	TypeBadge,
	VSCodeLinkForeground,
	WarningBanner,
} from "./styles";
import { useCloudContext } from "../../providers";
import { useVisualizerContext } from "../../contexts";
import { Organization } from "../creationView/biForm/components/AdvancedConfigurationSection";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EntryFormState {
	displayName: string;
	displayNameError?: string;
	selected: boolean;
	fsPath: string;
	selectedIntegrationType?: string;
}

interface ComponentListProps {
	org: Organization;
	project: Project;
	integrations: ICreateNewIntegrationCmdIntegrations[];
	formState: EntryFormState[];
	isBatch: boolean;
	selectedCount: number;
	editingIndex: number | null;
	onToggle: (index: number, checked: boolean) => void;
	onNameChange: (index: number, value: string) => void;
	onNameCommit: () => void;
	onIntegrationTypeChange: (index: number, value: string) => void;
	onEditStart: (index: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ComponentList({
	org,
	project,
	integrations,
	formState,
	isBatch,
	selectedCount,
	editingIndex,
	onToggle,
	onNameChange,
	onNameCommit,
	onIntegrationTypeChange,
	onEditStart,
}: ComponentListProps) {
	const hasSelected = selectedCount > 0;
	const deployableCount = integrations.filter((e) => !e.supportedIntegrationTypes?.includes(DevantScopes.LIBRARY)).length;
	const { wsClient } = useVisualizerContext();
	const { consoleUrl } = useCloudContext();

	const projectLink = <VSCodeLinkForeground title="View project in console" onClick={() => {
		wsClient.openExternal(`${consoleUrl}/organizations/${org?.handle}/projects/${project?.handler}`)
	}}>{project?.name}</VSCodeLinkForeground>

	return (
		<ComponentListSection>
			<ComponentListHeader>
				<ComponentListLabel>{isBatch ? <>Select Integrations to Deploy to {projectLink} in WSO2 Cloud</> : <>Deploy integration to {projectLink} in WSO2 Cloud</>}</ComponentListLabel>
				{isBatch && <SelectionCount>{selectedCount} of {deployableCount} selected</SelectionCount>}
			</ComponentListHeader>

			<ComponentListContainer>
				{integrations.map((entry, index) => {
					const state = formState[index];
					const isSelected = state?.selected ?? false;
					const isEditing = editingIndex === index;
					const currentName = state?.displayName ?? entry.name;
					const nameError = state?.displayNameError;
					const isLast = index === integrations.length - 1;
					const isLibrary = entry.supportedIntegrationTypes?.includes(DevantScopes.LIBRARY) ?? false;

					return (
						<ComponentListRow
							key={entry.fsPath}
							isSelected={isSelected}
							isLast={isLast}
						>
							{/* Checkbox — shown for all entries in batch; always shown for libraries (locked) */}
							{(isBatch || isLibrary) && (
								<CheckboxCell>
									<CheckBox
										label=""
										checked={isSelected}
										disabled={isLibrary}
										onChange={(checked: boolean) => onToggle(index, checked)}
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
											onChange={(e) => onNameChange(index, e.target.value)}
											onBlur={onNameCommit}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === "Escape") {
													onNameCommit();
												}
											}}
										/>
										{nameError && <NameError>{nameError}</NameError>}
									</NameInputWrapper>
								) : isSelected ? (
									<NameButton
										type="button"
										title={nameError ?? "Click to edit name"}
										onClick={() => onEditStart(index)}
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
										<span>{getIntegrationScopeText(entry.supportedIntegrationTypes[0])}</span>
									) : (
										<select
											value={state?.selectedIntegrationType ?? ""}
											onChange={(e) => onIntegrationTypeChange(index, e.target.value)}
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
												<option key={type} value={type}>{getIntegrationScopeText(type)}</option>
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
	);
}
