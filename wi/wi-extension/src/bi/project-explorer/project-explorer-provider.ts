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

import * as vscode from 'vscode';
import { window, Uri, commands } from 'vscode';
import path = require('path');
import {
    DIRECTORY_MAP,
    ProjectStructureArtifactResponse,
    SHARED_COMMANDS,
    BI_COMMANDS,
    VisualizerLocation,
    ProjectStructure,
    MACHINE_VIEW,
    NodePosition,
    ProjectStructureResponse,
} from '../types';
import { ballerinaContext } from '../ballerinaContext';
import { ext } from '../../extensionVariables';

// View ID used for progress indicator
const EXPLORER_VIEW_ID = 'wso2-integrator.explorer';

export class ProjectExplorerEntry extends vscode.TreeItem {
    children: ProjectExplorerEntry[] | undefined;
    info: string | undefined;
    position: NodePosition | undefined;

    constructor(
        public readonly label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        info: string | undefined = undefined,
        icon: string = 'folder',
        isCodicon: boolean = false,
        position: NodePosition | undefined = undefined
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}`;
        this.info = info;
        this.position = position;
        if (icon && isCodicon) {
            this.iconPath = new vscode.ThemeIcon(icon);
        } else if (icon) {
            // Load icon from WI extension's assets folder
            const extensionPath = ext.context.extensionPath;
            this.iconPath = {
                light: vscode.Uri.file(path.join(extensionPath, 'assets', `light-${icon}.svg`)),
                dark: vscode.Uri.file(path.join(extensionPath, 'assets', `dark-${icon}.svg`))
            };
        }
    }
}

export class ProjectExplorerEntryProvider implements vscode.TreeDataProvider<ProjectExplorerEntry> {
    private _data: ProjectExplorerEntry[];
    private _onDidChangeTreeData: vscode.EventEmitter<ProjectExplorerEntry | undefined | null | void>
        = new vscode.EventEmitter<ProjectExplorerEntry | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ProjectExplorerEntry | undefined | null | void>
        = this._onDidChangeTreeData.event;
    private _treeView: vscode.TreeView<ProjectExplorerEntry> | undefined;
    private _isRefreshing: boolean = false;
    private _pendingRefresh: boolean = false;

    setTreeView(treeView: vscode.TreeView<ProjectExplorerEntry>): void {
        this._treeView = treeView;
    }

    refresh(): void {
        // If already refreshing, mark that we need another refresh after current one completes
        if (this._isRefreshing) {
            this._pendingRefresh = true;
            return;
        }

        this._isRefreshing = true;
        this._pendingRefresh = false;

        window.withProgress({
            location: { viewId: EXPLORER_VIEW_ID },
            title: 'Loading project structure'
        }, async () => {
            try {
                this._data = [];
                const { entries, projectName } = await getProjectStructureData();
                this._data = entries;
                if (this._treeView && projectName) {
                    this._treeView.title = projectName;
                }
                commands.executeCommand('setContext', 'BI.project.empty', entries.length === 0);
                this._onDidChangeTreeData.fire();
            } catch (err) {
                console.error('[WI ProjectExplorer] Error during refresh:', err);
                this._data = [];
                this._onDidChangeTreeData.fire();
            } finally {
                this._isRefreshing = false;
                if (this._pendingRefresh) {
                    this._pendingRefresh = false;
                    this.refresh();
                }
            }
        });
    }

    revealInTreeView(
        documentUri: string | undefined,
        projectPath: string | undefined,
        position: NodePosition | undefined,
        view: MACHINE_VIEW | undefined
    ): void {
        if (!this._treeView) {
            return;
        }

        let itemToReveal: ProjectExplorerEntry | undefined;

        if (documentUri) {
            itemToReveal = this.findItemByPathAndPosition(documentUri, position);
        } else if (projectPath && view !== MACHINE_VIEW.WorkspaceOverview) {
            itemToReveal = this.findItemByPathAndPosition(projectPath, position);
        }

        if (itemToReveal && this._treeView.visible) {
            this._treeView.reveal(itemToReveal, {
                select: true,
                focus: false,
                expand: true
            });
        }
    }

    private findItemByPathAndPosition(targetPath: string, targetPosition: NodePosition | undefined): ProjectExplorerEntry | undefined {
        for (const rootItem of this._data) {
            if (this.matchesPathAndPosition(rootItem, targetPath, targetPosition)) {
                return rootItem;
            }
            const found = this.searchChildrenByPathAndPosition(rootItem, targetPath, targetPosition);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    private searchChildrenByPathAndPosition(parent: ProjectExplorerEntry, targetPath: string, targetPosition: NodePosition | undefined): ProjectExplorerEntry | undefined {
        if (!parent.children) {
            return undefined;
        }
        for (const child of parent.children) {
            if (this.matchesPathAndPosition(child, targetPath, targetPosition)) {
                return child;
            }
            const found = this.searchChildrenByPathAndPosition(child, targetPath, targetPosition);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    private matchesPathAndPosition(item: ProjectExplorerEntry, targetPath: string, targetPosition: NodePosition | undefined): boolean {
        if (item.info !== targetPath) {
            return false;
        }
        if (!targetPosition) {
            return true;
        }
        if (!item.position) {
            return true;
        }
        return this.positionsMatch(item.position, targetPosition);
    }

    private positionsMatch(pos1: NodePosition, pos2: NodePosition): boolean {
        return pos1.startLine === pos2.startLine &&
            pos1.startColumn === pos2.startColumn &&
            pos1.endLine === pos2.endLine &&
            pos1.endColumn === pos2.endColumn;
    }

    constructor() {
        this._data = [];
    }

    getTreeItem(element: ProjectExplorerEntry): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: ProjectExplorerEntry | undefined): vscode.ProviderResult<ProjectExplorerEntry[]> {
        if (element === undefined) {
            return this._data;
        }
        return element.children;
    }

    getParent(element: ProjectExplorerEntry): vscode.ProviderResult<ProjectExplorerEntry> {
        if (element.info === undefined) { return undefined; }

        const projects = this._data;
        for (const project of projects) {
            if (project.children?.find(child => child.info === element.info)) {
                return project;
            }
            const fileElement = this.recursiveSearchParent(project, element.info);
            if (fileElement) {
                return fileElement;
            }
        }
        return element;
    }

    recursiveSearchParent(element: ProjectExplorerEntry, path: string): ProjectExplorerEntry | undefined {
        if (!element.children) {
            return undefined;
        }
        for (const child of element.children) {
            if (child.info === path) {
                return element;
            }
            const foundParent = this.recursiveSearchParent(child, path);
            if (foundParent) {
                return foundParent;
            }
        }
        return undefined;
    }
}

async function getProjectStructureData(): Promise<{ entries: ProjectExplorerEntry[]; projectName: string | undefined }> {
    // Guard: Ballerina extension must be active to provide project structure
    const ballerinaExt = vscode.extensions.getExtension('wso2.ballerina');
    if (!ballerinaExt?.isActive) {
        return { entries: [], projectName: undefined };
    }

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const data: ProjectExplorerEntry[] = [];

        const stateContext: VisualizerLocation = await commands.executeCommand(SHARED_COMMANDS.GET_STATE_CONTEXT);
        if (!stateContext) {
            return { entries: [], projectName: undefined };
        }

        const ballerinaWorkspace = stateContext.workspacePath;
        const workspaceFolderOfPackage = vscode.workspace.workspaceFolders
            .find(folder => folder.uri.fsPath === stateContext.projectPath);

        let projectName: string | undefined;

        if (!workspaceFolderOfPackage) {
            if (ballerinaWorkspace) {
                projectName = path.basename(Uri.parse(stateContext.workspacePath).path);
            } else {
                return { entries: [], projectName: undefined };
            }
        } else {
            projectName = workspaceFolderOfPackage.name;
        }

        if (typeof stateContext === 'object' && stateContext !== null && 'projectStructure' in stateContext && stateContext.projectStructure !== null) {
            const projectStructure = stateContext.projectStructure as ProjectStructureResponse;
            const projects = projectStructure.projects;

            if (projectStructure.workspaceTitle || projectStructure.workspaceName) {
                // Multi-project workspace: use workspace-level title
                projectName = projectStructure.workspaceTitle || projectStructure.workspaceName;
            }

            // Filter projects to avoid duplicates - only include unique project paths
            const uniqueProjects = new Map<string, typeof projects[0]>();
            for (const project of projects) {
                if (!uniqueProjects.has(project.projectPath)) {
                    uniqueProjects.set(project.projectPath, project);
                }
            }

            const filteredProjects = Array.from(uniqueProjects.values());
            const isSingleProject = filteredProjects.length === 1;
            for (const project of filteredProjects) {
                const projectTree = generateTreeData(project, isSingleProject);
                if (projectTree) {
                    data.push(projectTree);
                }
            }
        }

        return { entries: data, projectName: projectName };
    }
    return { entries: [], projectName: undefined };
}

function generateTreeData(project: ProjectStructure, isSingleProject: boolean): ProjectExplorerEntry | undefined {
    const packageName = project.projectTitle || project.projectName;
    const packagePath = project.projectPath;
    const isLibrary = project.isLibrary ?? false;
    const icon = isLibrary ? 'library' : 'package';

    const projectRootEntry = new ProjectExplorerEntry(
        `${packageName}${isLibrary ? ' (Library)' : ''}`,
        isSingleProject ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
        packagePath,
        icon,
        true
    );
    projectRootEntry.resourceUri = Uri.parse(`bi-category:${packagePath}`);
    projectRootEntry.contextValue = 'bi-project';
    projectRootEntry.children = getEntriesBI(project);

    return projectRootEntry;
}

function getEntriesBI(project: ProjectStructure): ProjectExplorerEntry[] {
    const entries: ProjectExplorerEntry[] = [];
    const projectPath = project.projectPath;
    const isLibrary = project.isLibrary ?? false;

    // ---------- Entry Points ----------
    if (!isLibrary) {
        const entryPoints = new ProjectExplorerEntry(
            'Entry Points',
            vscode.TreeItemCollapsibleState.Expanded,
            null,
            'start',
            false
        );
        entryPoints.resourceUri = Uri.parse(`bi-category:${projectPath}`);
        entryPoints.contextValue = 'entryPoint';
        entryPoints.children = [];
        if (project.directoryMap[DIRECTORY_MAP.AUTOMATION].length > 0) {
            entryPoints.children.push(...getComponents(project.directoryMap[DIRECTORY_MAP.AUTOMATION], DIRECTORY_MAP.AUTOMATION, projectPath));
        }
        entryPoints.children.push(...getComponents(project.directoryMap[DIRECTORY_MAP.SERVICE], DIRECTORY_MAP.SERVICE, projectPath));
        if (entryPoints.children.length > 0) {
            entryPoints.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
        entries.push(entryPoints);
    }

    // ---------- Listeners ----------
    if (!isLibrary) {
        const listeners = new ProjectExplorerEntry(
            'Listeners',
            vscode.TreeItemCollapsibleState.Expanded,
            null,
            'radio',
            false
        );
        listeners.resourceUri = Uri.parse(`bi-category:${projectPath}`);
        listeners.contextValue = 'listeners';
        listeners.children = getComponents(project.directoryMap[DIRECTORY_MAP.LISTENER], DIRECTORY_MAP.LISTENER, projectPath);
        if (listeners.children.length > 0) {
            listeners.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
        entries.push(listeners);
    }

    // ---------- Connections ----------
    const connections = new ProjectExplorerEntry(
        'Connections',
        vscode.TreeItemCollapsibleState.Expanded,
        null,
        'connection',
        false
    );
    connections.resourceUri = Uri.parse(`bi-category:${projectPath}`);
    connections.contextValue = 'connections';
    connections.children = getComponents(project.directoryMap[DIRECTORY_MAP.CONNECTION], DIRECTORY_MAP.CONNECTION, projectPath);
    if (connections.children.length > 0) {
        connections.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    entries.push(connections);

    // ---------- Types ----------
    const types = new ProjectExplorerEntry(
        'Types',
        vscode.TreeItemCollapsibleState.Expanded,
        null,
        'type',
        false
    );
    types.resourceUri = Uri.parse(`bi-category:${projectPath}`);
    types.contextValue = 'types';
    types.children = getComponents(project.directoryMap[DIRECTORY_MAP.TYPE], DIRECTORY_MAP.TYPE, projectPath);
    if (types.children.length > 0) {
        types.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    entries.push(types);

    // ---------- Functions ----------
    const functions = new ProjectExplorerEntry(
        'Functions',
        vscode.TreeItemCollapsibleState.Expanded,
        null,
        'function',
        false
    );
    functions.resourceUri = Uri.parse(`bi-category:${projectPath}`);
    functions.contextValue = 'functions';
    functions.children = getComponents(project.directoryMap[DIRECTORY_MAP.FUNCTION], DIRECTORY_MAP.FUNCTION, projectPath);
    if (functions.children.length > 0) {
        functions.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    entries.push(functions);

    // ---------- Data Mappers ----------
    const dataMappers = new ProjectExplorerEntry(
        'Data Mappers',
        vscode.TreeItemCollapsibleState.Expanded,
        null,
        'dataMapper',
        false
    );
    dataMappers.resourceUri = Uri.parse(`bi-category:${projectPath}`);
    dataMappers.contextValue = 'dataMappers';
    dataMappers.children = getComponents(project.directoryMap[DIRECTORY_MAP.DATA_MAPPER], DIRECTORY_MAP.DATA_MAPPER, projectPath);
    if (dataMappers.children.length > 0) {
        dataMappers.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    entries.push(dataMappers);

    // ---------- Workflows ----------
    const workflowChildren = getComponents(project.directoryMap[DIRECTORY_MAP.WORKFLOW] ?? [], DIRECTORY_MAP.WORKFLOW, projectPath);
    const workflows = new ProjectExplorerEntry(
        'Workflows',
        workflowChildren.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
        null,
        'workflow',
        false
    );
    workflows.resourceUri = Uri.parse(`bi-category:${projectPath}`);
    workflows.contextValue = 'workflows';
    workflows.children = workflowChildren;
    entries.push(workflows);

    // ---------- Workflow Activities ----------
    const activityChildren = getComponents(project.directoryMap[DIRECTORY_MAP.ACTIVITY] ?? [], DIRECTORY_MAP.ACTIVITY, projectPath);
    const workflowActivities = new ProjectExplorerEntry(
        'Workflow Activities',
        activityChildren.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
        null,
        'task',
        false
    );
    workflowActivities.resourceUri = Uri.parse(`bi-category:${projectPath}`);
    workflowActivities.contextValue = 'workflowActivities';
    workflowActivities.children = activityChildren;
    entries.push(workflowActivities);

    // ---------- Configurations ----------
    const configs = new ProjectExplorerEntry(
        'Configurations',
        vscode.TreeItemCollapsibleState.None,
        null,
        'config',
        false
    );
    configs.resourceUri = Uri.parse(`bi-category:${projectPath}`);
    configs.contextValue = 'configurations';
    entries.push(configs);

    // ---------- Natural Functions ----------
    if (ballerinaContext.isNPSupported) {
        const naturalFunctions = new ProjectExplorerEntry(
            'Natural Functions',
            vscode.TreeItemCollapsibleState.Expanded,
            null,
            'function',
            false
        );
        naturalFunctions.resourceUri = Uri.parse(`bi-category:${projectPath}`);
        naturalFunctions.contextValue = 'naturalFunctions';
        naturalFunctions.children = getComponents(project.directoryMap[DIRECTORY_MAP.NP_FUNCTION], DIRECTORY_MAP.NP_FUNCTION, projectPath);
        if (naturalFunctions.children.length > 0) {
            naturalFunctions.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
        entries.push(naturalFunctions);
    }

    return entries;
}

function getComponents(
    items: ProjectStructureArtifactResponse[],
    itemType: DIRECTORY_MAP,
    projectPath: string
): ProjectExplorerEntry[] {
    if (!items) {
        return [];
    }
    const entries: ProjectExplorerEntry[] = [];
    const resetHistory = true;
    for (const comp of items) {
        if (comp.type !== itemType) {
            continue;
        }
        const fileEntry = new ProjectExplorerEntry(
            comp.name,
            vscode.TreeItemCollapsibleState.None,
            comp.path,
            comp.icon,
            false,
            comp.position
        );
        fileEntry.resourceUri = Uri.parse(`bi-category:${projectPath}`);
        fileEntry.command = {
            title: 'Visualize',
            command: SHARED_COMMANDS.SHOW_VISUALIZER,
            arguments: [comp.path, comp.position, resetHistory, projectPath]
        };
        fileEntry.contextValue = itemType;
        fileEntry.tooltip = comp.context;
        if (itemType === DIRECTORY_MAP.SERVICE) {
            const resourceFunctions = getComponents(comp.resources ?? [], DIRECTORY_MAP.RESOURCE, projectPath);
            const remoteFunctions = getComponents(comp.resources ?? [], DIRECTORY_MAP.REMOTE, projectPath);
            fileEntry.children = [...resourceFunctions, ...remoteFunctions];
            if (fileEntry.children.length > 0) {
                fileEntry.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            }
        }
        entries.push(fileEntry);
    }
    return entries;
}
