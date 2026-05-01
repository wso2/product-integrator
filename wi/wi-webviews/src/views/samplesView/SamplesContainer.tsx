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

import styled from "@emotion/styled";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { Button, Codicon, Dropdown, SearchBox } from "@wso2/ui-toolkit";
import {
	GettingStartedCategory,
	SampleItem,
	SampleDownloadRequest,
} from "@wso2/wi-core";
import { useEffect, useMemo, useState } from "react";
import { useVisualizerContext } from "../../contexts/WsContext";
import type { SampleSupportedRuntime } from "../shared/runtime";

const ALL_CATEGORY_VALUE = "__all__";

type BrowseItemType = "sample" | "prebuilt";
type CategoryOption = { key: string; content: string; value: string };

interface BrowseItem {
	id: string;
	itemType: BrowseItemType;
	title: string;
	description: string;
	componentType: string;
	categoryValues: string[];
	imageUrl?: string;
	connectorIconUrls?: string[];
	fallbackArtwork?: string;
	searchText: string;
	priority: number;
	prebuiltIntegration?: SampleItem;
}

const SamplesRoot = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
`;

const Toolbar = styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 18px 14px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--wso2-brand-accent) 4%, var(--vscode-editor-background)) 0%,
        var(--vscode-editor-background) 100%
    );
    border-bottom: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 10%, transparent);
`;

const SearchRow = styled.div`
    width: 100%;
`;

const FilterBar = styled.div`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 18px;
`;

const FilterGroup = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
`;

const FilterTitle = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const TypeFilters = styled.div`
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
`;

const TypePill = styled("button", {
	shouldForwardProp: (prop) => prop !== "active",
}) <{ active: boolean }>`
    height: 30px;
    border-radius: 999px;
    border: 1px solid
        ${(props: { active: boolean }) =>
		props.active
			? "var(--vscode-button-background)"
			: "var(--vscode-dropdown-border, var(--vscode-input-border))"};
    background: ${(props: { active: boolean }) =>
		props.active
			? "var(--vscode-button-background)"
			: "var(--vscode-dropdown-background)"};
    color: ${(props: { active: boolean }) =>
		props.active
			? "var(--vscode-button-foreground)"
			: "var(--vscode-dropdown-foreground, var(--vscode-foreground))"};
    padding: 0 14px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;

    &:hover {
        border-color: var(--vscode-focusBorder);
    }
`;

const CategoryFilterWrap = styled.div`
    min-width: 200px;

    @media (max-width: 720px) {
        min-width: 180px;
        width: 100%;
    }
`;

const categoryDropdownContainerSx = {
	position: "relative",
	"& vscode-dropdown": {
		width: "100%",
	},
	"& vscode-dropdown::part(control)": {
		minHeight: "30px",
		borderRadius: "999px",
		border: "1px solid var(--vscode-dropdown-border, var(--vscode-input-border))",
		background: "var(--vscode-dropdown-background)",
		color: "var(--vscode-dropdown-foreground, var(--vscode-foreground))",
	},
	"& vscode-dropdown:hover::part(control), & vscode-dropdown:focus-within::part(control)":
	{
		borderColor: "var(--vscode-focusBorder)",
	},
	"& vscode-dropdown::part(indicator)": {
		color: "var(--vscode-dropdown-foreground, var(--vscode-foreground))",
	},
};

const ClearFiltersButton = styled.button`
    margin-left: auto;
    border: none;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    cursor: pointer;
    padding: 0;

    &:hover:not(:disabled) {
        color: var(--vscode-foreground);
        text-decoration: underline;
    }

    &:disabled {
        cursor: default;
        opacity: 0.5;
    }

    @media (max-width: 720px) {
        margin-left: 0;
    }
`;

const MetaRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

const ResultCount = styled.span`
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
`;

const SamplesViewport = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px;
`;

const ProgressRing = styled(VSCodeProgressRing)`
    height: 40px;
    width: 40px;
    margin-top: 0;
    padding: 4px;
`;

const SampleGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px;
`;

const SampleCard = styled.article`
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 292px;
    border-radius: 14px;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 22%, var(--vscode-input-border));
    background: var(--vscode-editor-background);
    box-shadow: 0 2px 6px color-mix(in srgb, var(--wso2-brand-neutral-900) 14%, transparent);
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;

    &:hover {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--wso2-brand-primary) 40%, transparent);
        box-shadow: 0 8px 18px color-mix(in srgb, var(--wso2-brand-neutral-900) 22%, transparent);
    }
`;

const CardHeader = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
	min-height: 45px;
`;

const CardTitle = styled.h3`
    margin: 0;
    font-size: 16px;
    line-height: 1.35;
    color: var(--vscode-foreground);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
`;

const CategoryLabel = styled.span`
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    color: var(--vscode-foreground);
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 36%, transparent);
    background: color-mix(in srgb, var(--wso2-brand-accent) 16%, transparent);
`;

const IconFrame = styled.div`
    height: 88px;
    width: 100%;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 28%, transparent);
    background: color-mix(in srgb, var(--wso2-brand-accent) 8%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
`;

const CategoryImage = styled.img`
    max-height: 64px;
    max-width: 70%;
    object-fit: contain;
`;

const ConnectorIconGroup = styled.div`
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	width: 100%;
`;

const ConnectorFlowArrow = styled.div`
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--vscode-descriptionForeground);
`;

const ConnectorIconTile = styled.div`
	display: flex;
	align-items: center;
	justify-content: center;
	width: 52px;
	height: 52px;
	border-radius: 14px;
	border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border));
	background: var(--vscode-editor-background);
	box-shadow: 0 1px 4px color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
`;

const ConnectorIconImage = styled.img`
	width: 30px;
	height: 30px;
	object-fit: contain;
`;

const ArtworkText = styled.span`
    text-align: center;
    font-size: 12px;
    line-height: 1.4;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
`;

const Description = styled.p`
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--vscode-descriptionForeground);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 68px;
`;

const CardFooter = styled.div`
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
`;

const DownloadAction = styled.div`
    width: 100%;
    opacity: 0;
    transform: translateY(4px);
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease;

    .sample-card:hover & {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
    }

    @media (hover: none) {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
    }
`;

const LoaderWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 320px;
`;

const EmptyState = styled.div`
    min-height: 320px;
    border-radius: 14px;
    border: 1px dashed color-mix(in srgb, var(--wso2-brand-accent) 36%, transparent);
    background: color-mix(in srgb, var(--wso2-brand-accent) 6%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
`;

const EmptyTitle = styled.h3`
    margin: 0 0 8px 0;
    font-size: 16px;
    color: var(--vscode-foreground);
`;

const EmptyText = styled.p`
    margin: 0;
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
`;

type CategoryArtworkProps = {
	imageUrl?: string;
	iconUrls?: string[];
	label: string;
	fallbackText?: string;
};

function CategoryArtwork({
	imageUrl,
	iconUrls,
	label,
	fallbackText,
}: CategoryArtworkProps) {
	const [loadError, setLoadError] = useState(false);
	const [failedIconUrls, setFailedIconUrls] = useState<string[]>([]);

	const visibleIconUrls = (iconUrls ?? []).filter(
		(iconUrl) => !failedIconUrls.includes(iconUrl),
	);

	if (visibleIconUrls.length > 0) {
		return (
			<ConnectorIconGroup>
				{visibleIconUrls.map((iconUrl, index) => (
					<div
						key={iconUrl}
						style={{ display: "flex", alignItems: "center", gap: "10px" }}
					>
						{index > 0 && (
							<ConnectorFlowArrow>
								<Codicon name="arrow-right" iconSx={{ fontSize: 16 }} />
							</ConnectorFlowArrow>
						)}
						<ConnectorIconTile>
							<ConnectorIconImage
								src={iconUrl}
								alt={`${label} connector ${index + 1}`}
								onError={() =>
									setFailedIconUrls((currentUrls) =>
										currentUrls.includes(iconUrl)
											? currentUrls
											: [...currentUrls, iconUrl],
									)
								}
							/>
						</ConnectorIconTile>
					</div>
				))}
			</ConnectorIconGroup>
		);
	}

	if (!imageUrl || loadError) {
		if (fallbackText) {
			return <ArtworkText>{fallbackText}</ArtworkText>;
		}		
		return (
			<Codicon
				name="symbol-class"
				iconSx={{ color: "var(--wso2-brand-accent)", fontSize: 28 }}
			/>
		);
	}

	return (
		<CategoryImage
			src={imageUrl}
			alt={`${label} sample icon`}
			onError={() => setLoadError(true)}
		/>
	);
}

export interface SamplesContainerProps {
	projectType: SampleSupportedRuntime;
}

const CONNECTOR_ICON_BASE_URL =
	"https://devant-cdn.wso2.com/console/connector-icons/v1";

const CONNECTOR_ICON_NAMES: Record<string, string> = {
	googlechat: "GoogleChat",
	googlesheets: "GoogleSheets",
	stripe: "Stripe",
	shopify: "Shopify",
	quickbooks: "QuickBooks",
	jira: "Jira",
	salesforce: "Salesforce",
	mailchimp: "Mailchimp",
	slack: "Slack",
	github: "GitHub",
};

function normalizeCategoryValue(value: string): string {
	return value.trim();
}

function normalizeConnectorName(value: string): string {
	return value.replace(/[\s_-]+/g, "").toLowerCase();
}

function getPrebuiltCategoryValues(prebuiltIntegration: SampleItem): string[] {
	const values = [
		prebuiltIntegration.componentType,
		...(prebuiltIntegration.tags ?? []).map((tag) =>
			normalizeCategoryValue(tag),
		),
	].filter(Boolean);

	return Array.from(new Set(values));
}

function getPrebuiltArtworkText(
	prebuiltIntegration: SampleItem,
): string | undefined {
	const applications = (prebuiltIntegration.applications ?? [])
		.filter(Boolean)
		.slice(0, 2);
	return applications.length > 0 ? applications.join(" + ") : undefined;
}

function getPrebuiltConnectorIconUrls(
	prebuiltIntegration: SampleItem,
): string[] {
	return (prebuiltIntegration.applications ?? [])
		.map((application) => CONNECTOR_ICON_NAMES[normalizeConnectorName(application)])
		.filter(Boolean)
		.slice(0, 2)
		.map((iconName) => `${CONNECTOR_ICON_BASE_URL}/${iconName}.svg`);
}

function getImageUrl( thumbnailPath: string ): string | undefined {
	const trimmedPath = thumbnailPath?.trim();
	return trimmedPath && /^https?:\/\//.test(trimmedPath)
		? trimmedPath
		: undefined;
}

function compareBrowseItems(left: BrowseItem, right: BrowseItem): number {
	if (left.itemType !== right.itemType) {
		return left.itemType === "sample" ? -1 : 1;
	}

	if (left.itemType === "sample" && right.itemType === "sample") {
		return (
			left.priority - right.priority || left.title.localeCompare(right.title)
		);
	}

	return left.title.localeCompare(right.title);
}

function createPrebuiltItem(
	prebuiltIntegration: SampleItem,
): BrowseItem {
	const categoryValues = getPrebuiltCategoryValues(prebuiltIntegration);

	return {
		id: `prebuilt:${prebuiltIntegration.branch ?? ""}:${prebuiltIntegration.componentPath}`,
		itemType: "prebuilt",
		title: prebuiltIntegration.displayName,
		description: prebuiltIntegration.description,
		componentType: prebuiltIntegration.componentType || "Integration",
		categoryValues,
		imageUrl: getImageUrl(prebuiltIntegration.thumbnailPath),
		connectorIconUrls: getPrebuiltConnectorIconUrls(prebuiltIntegration),
		fallbackArtwork: getPrebuiltArtworkText(prebuiltIntegration),
		searchText: [
			prebuiltIntegration.displayName,
			prebuiltIntegration.description,
			prebuiltIntegration.componentType,
			...categoryValues,
			...(prebuiltIntegration.applications ?? []),
		]
			.join(" ")
			.toLowerCase(),
		priority: Number.MAX_SAFE_INTEGER,
		prebuiltIntegration,
	};
}

function createSampleItem(
	prebuiltIntegration: SampleItem,
): BrowseItem {
	const categoryValues = getPrebuiltCategoryValues(prebuiltIntegration);

	return {
		id: `sample:${prebuiltIntegration.componentPath}`,
		itemType: "sample",
		title: prebuiltIntegration.displayName,
		description: prebuiltIntegration.description,
		componentType: prebuiltIntegration.componentType || "Integration",
		categoryValues,
		imageUrl: getImageUrl(prebuiltIntegration.thumbnailPath),
		connectorIconUrls: getPrebuiltConnectorIconUrls(prebuiltIntegration),
		fallbackArtwork: getPrebuiltArtworkText(prebuiltIntegration),
		searchText: [
			prebuiltIntegration.displayName,
			prebuiltIntegration.description,
			prebuiltIntegration.componentType,
			...categoryValues,
		]
			.join(" ")
			.toLowerCase(),
		priority: Number.MAX_SAFE_INTEGER,
		prebuiltIntegration,
	};
}

function createCategoryOptions(
	categories: GettingStartedCategory[],
	samples: SampleItem[],
	prebuiltIntegrations: SampleItem[],
	includePrebuiltCategories: boolean,
): CategoryOption[] {
	const options: CategoryOption[] = [
		{ key: ALL_CATEGORY_VALUE, content: "All", value: ALL_CATEGORY_VALUE },
	];
	const addedCategoryValues = new Set<string>([ALL_CATEGORY_VALUE]);

	for (const category of categories) {
		if (category.id === 0 || addedCategoryValues.has(category.title)) {
			continue;
		}

		addedCategoryValues.add(category.title);
		options.push({
			key: category.title,
			content: category.title,
			value: category.title,
		});
	}

	for (const sample of samples) {
		const categoryValue = sample.componentType;
		if (categoryValue && !addedCategoryValues.has(categoryValue)) {
			addedCategoryValues.add(categoryValue);
			options.push({ key: categoryValue, content: categoryValue, value: categoryValue });
		}
	}

	if (!includePrebuiltCategories) {
		return options;
	}

	for (const prebuiltIntegration of prebuiltIntegrations) {
		const categoryValue = prebuiltIntegration.componentType;
		if (categoryValue && !addedCategoryValues.has(categoryValue)) {
			addedCategoryValues.add(categoryValue);
			options.push({ key: categoryValue, content: categoryValue, value: categoryValue });
		}
	}

	return options;
}

function matchesFilters(
	item: BrowseItem,
	selectedType: BrowseItemType | "all",
	selectedCategory: string,
	searchText: string,
): boolean {
	const normalizedSearch = searchText.trim().toLowerCase();
	const matchesType = selectedType === "all" || item.itemType === selectedType;
	const matchesCategory =
		selectedCategory === ALL_CATEGORY_VALUE ||
		item.categoryValues.includes(selectedCategory);
	const matchesSearch =
		!normalizedSearch || item.searchText.includes(normalizedSearch);

	return matchesType && matchesCategory && matchesSearch;
}

export function SamplesContainer(props: SamplesContainerProps) {
	const { wsClient, webviewContext } = useVisualizerContext();
	const [samples, setSamples] = useState<SampleItem[]>([]);
	const [categories, setCategories] = useState<GettingStartedCategory[]>([]);
	const [prebuiltIntegrations, setPrebuiltIntegrations] = useState<SampleItem[]>([]);
	const [searchText, setSearchText] = useState<string>("");
	const [selectedCategory, setSelectedCategory] =useState<string>(ALL_CATEGORY_VALUE);
	const [selectedType, setSelectedType] = useState<BrowseItemType | "all">(
		props.projectType === "WSO2: BI" ? "all" : "sample",
	);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const showsTypeFilter = props.projectType === "WSO2: BI";

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setSearchText("");
		setSelectedCategory(ALL_CATEGORY_VALUE);
		setSelectedType(props.projectType === "WSO2: BI" ? "all" : "sample");

		wsClient
			.fetchSamplesFromGithub({ runtime: props.projectType })
			.then((response) => {
				if (cancelled) {
					return;
				}

				const nextSamples = (response?.samples ?? []) as SampleItem[];
				const nextCategories = [{ id: 0, title: "All", icon: "" }, ...(response?.categories ?? [])];
				const nextPrebuiltIntegrations =
					props.projectType === "WSO2: BI"
						? (response?.prebuiltIntegrations ?? [])
						: [];

				setSamples(nextSamples);
				setCategories(nextCategories);
				setPrebuiltIntegrations(nextPrebuiltIntegrations);
			})
			.catch((error) => {
				console.warn("Failed to load sample data from GitHub:", error);
				if (!cancelled) {
					setSamples([]);
					setCategories([{ id: 0, title: "All", icon: "" }]);
					setPrebuiltIntegrations([]);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [
		props.projectType,
		wsClient,
	]);

	const allItems = useMemo(() => {
		const items = samples.map((sample) => createSampleItem(sample));

		if (showsTypeFilter) {
			items.push(
				...prebuiltIntegrations.map((prebuiltIntegration) =>
					createPrebuiltItem(prebuiltIntegration),
				),
			);
		}

		return items.sort(compareBrowseItems);
	}, [prebuiltIntegrations, samples, showsTypeFilter]);

	const categoryItems = useMemo(() => {
		return createCategoryOptions(
			categories,
			samples,
			prebuiltIntegrations,
			showsTypeFilter,
		);
	}, [categories, samples, prebuiltIntegrations, showsTypeFilter]);

	const filteredItems = useMemo(() => {
		return allItems.filter((item) =>
			matchesFilters(item, selectedType, selectedCategory, searchText),
		);
	}, [allItems, searchText, selectedCategory, selectedType]);

	const hasActiveFilters =
		searchText.trim().length > 0 ||
		selectedCategory !== ALL_CATEGORY_VALUE ||
		(showsTypeFilter && selectedType !== "all");

	function resetFilters() {
		setSearchText("");
		setSelectedCategory(ALL_CATEGORY_VALUE);
		setSelectedType(showsTypeFilter ? "all" : "sample");
	}

	function downloadItem(item: BrowseItem) {
		if (!item.prebuiltIntegration) {
			return;
		}

		const request: SampleDownloadRequest = {
			runtime: props.projectType,
			itemType: item.itemType,
			sampleItem: item.prebuiltIntegration,
		};

		wsClient.downloadSelectedSampleFromGithub(request);
	}

	function getEmptyMessage() {
		if (hasActiveFilters) {
			return "Try a different keyword or clear the active filters.";
		}

		return showsTypeFilter
			? "No samples or pre-built integrations are available at the moment."
			: "No samples are available at the moment.";
	}

	return (
		<SamplesRoot>
			<Toolbar>
				<SearchRow>
					<SearchBox
						value={searchText}
						autoFocus
						type="text"
						placeholder="Search by name, description, application, or category"
						onChange={(value: string) => setSearchText(value)}
					/>
				</SearchRow>
				<FilterBar>
					{showsTypeFilter && (
						<FilterGroup>
							<FilterTitle>Type</FilterTitle>
							<TypeFilters>
								<TypePill
									type="button"
									active={selectedType === "all"}
									onClick={() => setSelectedType("all")}
								>
									All
								</TypePill>
								<TypePill
									type="button"
									active={selectedType === "sample"}
									onClick={() => setSelectedType("sample")}
								>
									Sample
								</TypePill>
								<TypePill
									type="button"
									active={selectedType === "prebuilt"}
									onClick={() => setSelectedType("prebuilt")}
								>
									Pre-built Integrations
								</TypePill>
							</TypeFilters>
						</FilterGroup>
					)}
					<FilterGroup>
						<FilterTitle>Category</FilterTitle>
						<CategoryFilterWrap>
							<Dropdown
								id="sample-category-filter"
								items={categoryItems}
								onValueChange={(value: string) =>
									setSelectedCategory(value || ALL_CATEGORY_VALUE)
								}
								value={selectedCategory}
								sx={{ width: "100%" }}
								dropdownContainerSx={categoryDropdownContainerSx}
							/>
						</CategoryFilterWrap>
					</FilterGroup>
					<ClearFiltersButton
						type="button"
						onClick={resetFilters}
						disabled={!hasActiveFilters}
					>
						clear all filters
					</ClearFiltersButton>
				</FilterBar>
				<MetaRow>
					<ResultCount>
						{filteredItems.length} result{filteredItems.length === 1 ? "" : "s"}
					</ResultCount>
				</MetaRow>
			</Toolbar>
			<SamplesViewport>
				{isLoading ? (
					<LoaderWrapper>
						<ProgressRing />
					</LoaderWrapper>
				) : filteredItems.length > 0 ? (
					<SampleGrid>
						{filteredItems.map((item) => (
							<SampleCard key={item.id} className="sample-card">
								<CardHeader>
									<CardTitle>{item.title}</CardTitle>
									<CategoryLabel>{item.componentType}</CategoryLabel>
								</CardHeader>
								<IconFrame>
									<CategoryArtwork
										imageUrl={item.imageUrl}
										iconUrls={item.connectorIconUrls}
										label={item.componentType}
										fallbackText={item.fallbackArtwork}

									/>
								</IconFrame>
								<Description>{item.description}</Description>
								<CardFooter>
									<DownloadAction>
										<Button
											appearance="primary"
											sx={{ width: "100%" }}
											onClick={() => downloadItem(item)}
											buttonSx={{ width: "100%" }}
										>
											Use this
										</Button>
									</DownloadAction>
								</CardFooter>
							</SampleCard>
						))}
					</SampleGrid>
				) : (
					<EmptyState>
						<div>
							<EmptyTitle>No matching results found</EmptyTitle>
							<EmptyText>{getEmptyMessage()}</EmptyText>
						</div>
					</EmptyState>
				)}
			</SamplesViewport>
		</SamplesRoot>
	);
}
