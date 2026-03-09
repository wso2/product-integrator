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

import React, { useEffect, useState } from "react";
import { CheckBox, ProgressIndicator, TextField, Typography } from "@wso2/ui-toolkit";
import { type WICloudComponentEntry, type WICloudFormContext } from "@wso2/wi-core";
import { useVisualizerContext } from "../../contexts";
import {
	BuildpackLabel,
	CancelButton,
	ComponentRow,
	ComponentRowHeader,
	DirLabel,
	ErrorBanner,
	FooterRow,
	PageContainer,
	Subtitle,
	SubmitButton,
	TitleRow,
} from "./styles";

interface EntryFormState {
	displayName: string;
	displayNameError?: string;
	useDefaultEndpoints: boolean;
}

function initEntryState(entry: WICloudComponentEntry): EntryFormState {
	return {
		displayName: entry.componentName,
		useDefaultEndpoints: true,
	};
}

export function ComponentFormView() {
	const { rpcClient } = useVisualizerContext();
	const cloudClient = rpcClient.getCloudRpcClient();

	const [context, setContext] = useState<WICloudFormContext | null>(null);
	const [formState, setFormState] = useState<EntryFormState[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	useEffect(() => {
		cloudClient.getCloudFormContext().then((ctx) => {
			setContext(ctx);
			setFormState(ctx.components.map(initEntryState));
		});
	}, [cloudClient]);

	const updateEntry = (index: number, patch: Partial<EntryFormState>) => {
		setFormState((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
	};

	const validate = (): boolean => {
		let valid = true;
		const next = formState.map((entry) => {
			const trimmed = entry.displayName.trim();
			if (!trimmed) {
				valid = false;
				return { ...entry, displayNameError: "Display name is required." };
			}
			if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(trimmed)) {
				valid = false;
				return { ...entry, displayNameError: "Use letters, numbers, spaces, hyphens or underscores. Must start with a letter or number." };
			}
			return { ...entry, displayNameError: undefined };
		});
		setFormState(next);
		return valid;
	};

	const handleSubmit = async () => {
		if (!validate()) { return; }
		setSubmitting(true);
		setSubmitError(null);
		try {
			const resp = await cloudClient.submitComponents({
				components: formState.map((e, i) => ({
					index: i,
					displayName: e.displayName.trim(),
					useDefaultEndpoints: e.useDefaultEndpoints,
				})),
			});
			if (resp.errors?.length) {
				setSubmitError(
					resp.errors.map((err) => `Component ${err.index + 1}: ${err.message}`).join("\n"),
				);
			} else {
				cloudClient.closeCloudFormWebview();
			}
		} catch (err: any) {
			setSubmitError(err?.message ?? "An unexpected error occurred.");
		} finally {
			setSubmitting(false);
		}
	};

	const handleCancel = () => {
		cloudClient.closeCloudFormWebview();
	};

	if (!context) {
		return (
			<div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100px" }}>
				<ProgressIndicator />
			</div>
		);
	}

	const isBatch = context.components.length > 1;
	const title = isBatch ? "Create Components" : "Create Component";

	return (
		<PageContainer>
			<TitleRow>
				<Typography variant="h2">{title}</Typography>
			</TitleRow>
			<Subtitle variant="body2">
				{context.extensionName} — {context.orgName} / {context.projectName}
			</Subtitle>

			{submitError && (
				<ErrorBanner>
					{submitError.split("\n").map((line, i) => (
						<div key={i}>{line}</div>
					))}
				</ErrorBanner>
			)}

			{context.components.map((entry, index) => (
				<ComponentRow key={entry.directoryFsPath}>
					<ComponentRowHeader>
						<DirLabel>{entry.directoryName}</DirLabel>
						<BuildpackLabel>{entry.buildPackLang}</BuildpackLabel>
					</ComponentRowHeader>

					<TextField
						label="Display Name"
						required
						value={formState[index]?.displayName ?? ""}
						errorMsg={formState[index]?.displayNameError}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							updateEntry(index, { displayName: e.target.value, displayNameError: undefined })
						}
					/>

					{entry.isService && (
						<CheckBox
							label="Use Default Endpoints"
							checked={formState[index]?.useDefaultEndpoints ?? true}
							onChange={(checked: boolean) =>
								updateEntry(index, { useDefaultEndpoints: checked })
							}
						/>
					)}
				</ComponentRow>
			))}

			<FooterRow>
				<CancelButton appearance="secondary" onClick={handleCancel} disabled={submitting}>
					Cancel
				</CancelButton>
				<SubmitButton appearance="primary" onClick={handleSubmit} disabled={submitting}>
					{submitting ? "Creating..." : isBatch ? "Create All" : "Create"}
				</SubmitButton>
			</FooterRow>
		</PageContainer>
	);
}
