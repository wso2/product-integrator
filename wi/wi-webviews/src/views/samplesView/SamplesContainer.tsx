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

import React, { useEffect, useMemo, useState } from "react";
import { Button, Codicon, Dropdown, SearchBox } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { useVisualizerContext } from "../../contexts/WsContext";
import { GettingStartedCategory, GettingStartedSample, SampleDownloadRequest } from "@wso2/wi-core";

const SamplesRoot = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
`;

const Toolbar = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 18px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 10%, var(--vscode-panel-border));
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--wso2-brand-accent) 4%, var(--vscode-editor-background)) 0%,
        var(--vscode-editor-background) 100%
    );
`;

const ToolbarTitleRow = styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
`;

const ToolbarTitle = styled.h3`
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const ToolbarSubtitle = styled.p`
    margin: 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const FiltersRow = styled.div`
    display: grid;
    grid-template-columns: minmax(260px, 300px) minmax(260px, 420px);
    gap: 10px;
    align-items: center;

    @media (max-width: 1080px) {
        grid-template-columns: 1fr;
    }
`;

const FilterLabel = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
`;

const SearchContainer = styled.div`
    justify-self: start;
    width: 100%;
`;

const MetaRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

const ResultCount = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 34%, transparent);
    background: color-mix(in srgb, var(--wso2-brand-accent) 12%, transparent);
`;

const ActiveFilter = styled.span`
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 11px;
    font-weight: 500;
    color: var(--vscode-foreground);
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 40%, transparent);
    background: color-mix(in srgb, var(--wso2-brand-primary) 12%, transparent);
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
`;

const CategoryImage = styled.img`
    max-height: 64px;
    max-width: 70%;
    object-fit: contain;
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
    justify-content: space-between;
    gap: 8px;
`;

const Availability = styled.span<{ isAvailable: boolean }>`
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    color: ${(props: { isAvailable: boolean }) =>
        props.isAvailable ? "var(--vscode-foreground)" : "var(--vscode-descriptionForeground)"};
    border: 1px solid
        ${(props: { isAvailable: boolean }) =>
            props.isAvailable
                ? "color-mix(in srgb, var(--wso2-brand-accent) 52%, transparent)"
                : "var(--vscode-input-border)"};
    background:
        ${(props: { isAvailable: boolean }) =>
            props.isAvailable
                ? "color-mix(in srgb, var(--wso2-brand-accent) 24%, transparent)"
                : "color-mix(in srgb, var(--vscode-input-background) 75%, transparent)"};
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
    label: string;
};

function CategoryArtwork({ imageUrl, label }: CategoryArtworkProps) {
    const [loadError, setLoadError] = useState(false);

    if (!imageUrl || loadError) {
        return <Codicon name="symbol-class" iconSx={{ color: "var(--wso2-brand-accent)", fontSize: 28 }} />;
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
    projectType: "WSO2: BI" | "WSO2: MI" | "WSO2: SI";
}

export function SamplesContainer(props: SamplesContainerProps) {
    const { wsClient, webviewContext } = useVisualizerContext();
    const [samples, setSamples] = useState<GettingStartedSample[]>([]);
    const [categories, setCategories] = useState<GettingStartedCategory[]>([]);
    const [imagesByCategory, setImagesByCategory] = useState<Record<number, string>>({});
    const [searchText, setSearchText] = useState<string>("");
    const [selectedCategory, setSelectedCategory] = useState<string>("All");
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setSearchText("");
        setSelectedCategory("All");

        wsClient
            .fetchSamplesFromGithub({ runtime: props.projectType })
            .then((response) => {
                if (cancelled) {
                    return;
                }

                const nextSamples = response?.samples ?? [];
                const nextCategories = [{ id: 0, title: "All", icon: "" }, ...(response?.categories ?? [])];
                const sampleIconBaseUrl =
                    props.projectType === "WSO2: MI"
                        ? webviewContext?.env?.MI_SAMPLE_ICONS_GITHUB_URL ?? ""
                        : webviewContext?.env?.BI_SAMPLE_ICONS_GITHUB_URL ?? "";

                const nextCategoryImages: Record<number, string> = {};
                for (const category of nextCategories) {
                    if (category.icon) {
                        nextCategoryImages[category.id] = `${sampleIconBaseUrl}${category.icon}`;
                    }
                }

                setSamples(nextSamples);
                setCategories(nextCategories);
                setImagesByCategory(nextCategoryImages);
            })
            .catch((error) => {
                console.warn("Failed to load sample data from GitHub:", error);
                if (!cancelled) {
                    setSamples([]);
                    setCategories([{ id: 0, title: "All", icon: "" }]);
                    setImagesByCategory({});
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
        webviewContext?.env?.BI_SAMPLE_ICONS_GITHUB_URL,
        webviewContext?.env?.MI_SAMPLE_ICONS_GITHUB_URL,
    ]);

    const selectedCategoryId = useMemo(() => {
        return categories.find((category) => category.title === selectedCategory)?.id ?? 0;
    }, [categories, selectedCategory]);

    const categoryTitleById = useMemo(() => {
        const titleMap: Record<number, string> = {};
        for (const category of categories) {
            titleMap[category.id] = category.title;
        }
        return titleMap;
    }, [categories]);

    const filteredSamples = useMemo(() => {
        const categoryScoped =
            selectedCategoryId === 0
                ? samples
                : samples.filter((sample) => sample.category === selectedCategoryId);
        const normalizedSearch = searchText.trim().toLowerCase();
        const searchScoped = normalizedSearch
            ? categoryScoped.filter((sample) => {
                return (
                    sample.title.toLowerCase().includes(normalizedSearch) ||
                    sample.description.toLowerCase().includes(normalizedSearch)
                );
            })
            : categoryScoped;

        return [...searchScoped].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
    }, [samples, selectedCategoryId, searchText]);

    const categoryItems = useMemo(() => {
        return categories.map((category) => ({
            key: category.id,
            text: category.title,
            value: category.title,
        }));
    }, [categories]);

    function downloadSample(sampleName: string) {
        const request: SampleDownloadRequest = {
            zipFileName: sampleName,
            runtime: props.projectType,
        };
        wsClient.downloadSelectedSampleFromGithub(request);
    }

    function getEmptyMessage() {
        if (searchText.trim()) {
            return "Try a different keyword or clear the search filter.";
        }
        if (selectedCategory !== "All") {
            return `No samples available in "${selectedCategory}" right now.`;
        }
        return "No samples are available at the moment.";
    }

    return (
        <SamplesRoot>
            <Toolbar>
                <ToolbarTitleRow>
                    <ToolbarTitle>Samples</ToolbarTitle>
                    <ToolbarSubtitle>Choose a starter project and download it to your workspace.</ToolbarSubtitle>
                </ToolbarTitleRow>
                <FiltersRow>
                    <div>
                        <FilterLabel>Category</FilterLabel>
                        <Dropdown
                            id="drop-down"
                            items={categoryItems}
                            onValueChange={(value: string) => setSelectedCategory(value || "All")}
                            value={selectedCategory}
                            sx={{ width: "100%" }}
                        />
                    </div>
                    <SearchContainer>
                        <FilterLabel>Search</FilterLabel>
                        <SearchBox
                            value={searchText}
                            autoFocus
                            type="text"
                            onChange={(value: string) => setSearchText(value)}
                        />
                    </SearchContainer>
                </FiltersRow>
                <MetaRow>
                    <ResultCount>
                        <Codicon name="list-selection" />
                        Showing {filteredSamples.length} of {samples.length}
                    </ResultCount>
                    {selectedCategory !== "All" && (
                        <ActiveFilter>{selectedCategory}</ActiveFilter>
                    )}
                </MetaRow>
            </Toolbar>
            <SamplesViewport>
                {isLoading ? (
                    <LoaderWrapper>
                        <ProgressRing />
                    </LoaderWrapper>
                ) : filteredSamples.length > 0 ? (
                    <SampleGrid>
                        {filteredSamples.map((sample) => {
                            const isAvailable = sample.isAvailable === true;
                            const categoryName = categoryTitleById[sample.category] || "Sample";
                            return (
                                <SampleCard key={`${sample.category}-${sample.zipFileName}`}>
                                    <CardHeader>
                                        <CardTitle>{sample.title}</CardTitle>
                                        <CategoryLabel>{categoryName}</CategoryLabel>
                                    </CardHeader>
                                    <IconFrame>
                                        <CategoryArtwork
                                            imageUrl={imagesByCategory[sample.category]}
                                            label={categoryName}
                                        />
                                    </IconFrame>
                                    <Description>{sample.description}</Description>
                                    <CardFooter>
                                        <Availability isAvailable={isAvailable}>
                                            {isAvailable ? "Available" : "Coming Soon"}
                                        </Availability>
                                        <Button
                                            appearance={isAvailable ? "primary" : "secondary"}
                                            disabled={!isAvailable}
                                            onClick={() => downloadSample(sample.zipFileName)}
                                        >
                                            {isAvailable ? "Download" : "Unavailable"}
                                        </Button>
                                    </CardFooter>
                                </SampleCard>
                            );
                        })}
                    </SampleGrid>
                ) : (
                    <EmptyState>
                        <div>
                            <EmptyTitle>No matching samples found</EmptyTitle>
                            <EmptyText>{getEmptyMessage()}</EmptyText>
                        </div>
                    </EmptyState>
                )}
            </SamplesViewport>
        </SamplesRoot>
    );
}
