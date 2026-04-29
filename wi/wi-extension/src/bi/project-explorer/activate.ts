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

import { ExtensionContext, TreeView, commands, window, workspace, extensions } from 'vscode';
import { ProjectExplorerEntry, ProjectExplorerEntryProvider } from './project-explorer-provider';
import { SHARED_COMMANDS, BI_COMMANDS, MACHINE_VIEW, NodePosition } from '../types';
import { ballerinaContext } from '../ballerinaContext';
import { COMMANDS } from '@wso2/wi-core';

const WI_PROJECT_EXPLORER_VIEW_ID = 'wso2-integrator.explorer';

export interface ExplorerActivationConfig {
    context: ExtensionContext;
    isBallerinaPackage?: boolean;
    isBallerinaWorkspace?: boolean;
    isEmptyWorkspace?: boolean;
}

/**
 * Activate the BI project explorer treeview within the WI extension.
 * Only called when the BI extension is NOT installed, so WI handles everything directly.
 */
export function activateProjectExplorer(config: ExplorerActivationConfig): ProjectExplorerEntryProvider {
    const { context, isBallerinaPackage, isBallerinaWorkspace, isEmptyWorkspace } = config;

    if (ballerinaContext.biSupported) {
        commands.executeCommand('setContext', 'BI.status', 'loading');
    }

    const projectExplorerDataProvider = new ProjectExplorerEntryProvider();
    const projectTree = window.createTreeView(WI_PROJECT_EXPLORER_VIEW_ID, {
        treeDataProvider: projectExplorerDataProvider
    });

    projectExplorerDataProvider.setTreeView(projectTree);
    context.subscriptions.push(projectTree);

    registerCoreCommands(context, projectExplorerDataProvider);

    if (isBallerinaPackage || isBallerinaWorkspace) {
        registerBallerinaCommands(isBallerinaWorkspace, isEmptyWorkspace);
    }

    handleVisibilityChangeEvents(
        projectTree,
        projectExplorerDataProvider,
        isBallerinaPackage,
        isBallerinaWorkspace,
        isEmptyWorkspace
    );

    context.subscriptions.push(workspace.onDidDeleteFiles(() => projectExplorerDataProvider.refresh()));

    return projectExplorerDataProvider;
}

function registerCoreCommands(context: ExtensionContext, dataProvider: ProjectExplorerEntryProvider): void {
    // Register the notify command called by the Ballerina extension to reveal tree items
    context.subscriptions.push(
        commands.registerCommand(
            BI_COMMANDS.NOTIFY_PROJECT_EXPLORER,
            (event: {
                projectPath: string;
                documentUri: string;
                position: NodePosition;
                view: MACHINE_VIEW;
            }) => {
                dataProvider.revealInTreeView(event.documentUri, event.projectPath, event.position, event.view);
            }
        )
    );

    // Register the BI refresh command so the Ballerina extension can trigger refreshes
    context.subscriptions.push(
        commands.registerCommand(BI_COMMANDS.REFRESH_COMMAND, () => {
            if (!isDebugSessionActive()) {
                dataProvider.refresh();
            }
        })
    );
}

function registerBallerinaCommands(isBallerinaWorkspace?: boolean, isEmptyWorkspace?: boolean): void {
    commands.executeCommand('setContext', 'BI.isWorkspaceSupported', ballerinaContext.isWorkspaceSupported ?? false);

    if (isBallerinaWorkspace) {
        commands.executeCommand('setContext', 'BI.isBallerinaWorkspace', true);
        if (isEmptyWorkspace) {
            commands.executeCommand('setContext', 'BI.project.empty', true);
        }
    }
    // Focus tree and show visualizer for BI projects
    commands.executeCommand(`${WI_PROJECT_EXPLORER_VIEW_ID}.focus`);
    commands.executeCommand(SHARED_COMMANDS.SHOW_VISUALIZER);
    commands.executeCommand('setContext', 'BI.project', true);
}

function handleVisibilityChangeEvents(
    tree: TreeView<ProjectExplorerEntry>,
    dataProvider: ProjectExplorerEntryProvider,
    isBallerinaPackage?: boolean,
    isBallerinaWorkspace?: boolean,
    isEmptyWorkspace?: boolean
): void {
    tree.onDidChangeVisibility(async res => {
        if (res.visible) {
            if ((isBallerinaPackage || isBallerinaWorkspace) && ballerinaContext.biSupported) {
                const isVisualizerActive = isBalVisualizerWebviewActive();
                if (!isVisualizerActive) {
                    if (isBallerinaPackage) {
                        commands.executeCommand(SHARED_COMMANDS.SHOW_VISUALIZER);
                    }
                }

                if (!isEmptyWorkspace) {
                    const isDebugActive = isDebugSessionActive();
                    if (!isDebugActive) {
                        await commands.executeCommand(SHARED_COMMANDS.FORCE_UPDATE_PROJECT_ARTIFACTS);
                        dataProvider.refresh();
                    }
                    if (isBallerinaWorkspace) {
                        commands.executeCommand(BI_COMMANDS.SHOW_OVERVIEW);
                    }
                }
            } else {
                handleNonBallerinaVisibility();
            }
        }
    });
}

function isBalVisualizerWebviewActive(): boolean {
    const ballerinaExt = extensions.getExtension('wso2.ballerina');
    if (ballerinaExt?.isActive && ballerinaExt.exports?.VisualizerWebview) {
        return ballerinaExt.exports.VisualizerWebview.isVisualizerActive();
    }
    return false;
}

function isDebugSessionActive(): boolean {
    const ballerinaExt = extensions.getExtension('wso2.ballerina');
    if (ballerinaExt?.isActive && ballerinaExt.exports?.BallerinaExtensionState) {
        return ballerinaExt.exports.BallerinaExtensionState.isDebugSessionActive();
    }
    return false;
}

function handleNonBallerinaVisibility(): void {
    if (!ballerinaContext.biSupported) {
        commands.executeCommand('setContext', 'BI.status', 'updateNeed');
    } else {
        commands.executeCommand('setContext', 'BI.status', 'unknownProject');
    }
    commands.executeCommand(COMMANDS.OPEN_WELCOME);
}
