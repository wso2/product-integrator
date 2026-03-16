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

import { assign, createMachine, interpret } from 'xstate';
import * as vscode from 'vscode';
import { CONTEXT_KEYS, EXTENSION_DEPENDENCIES, ViewType } from '@wso2/wi-core';
import { ext } from './extensionVariables';
import { fetchProjectInfo, fetchExtendedProjectInfo, ProjectInfo } from './bi/utils';
import { activateProjectExplorer } from './bi/project-explorer/activate';
import { ProjectExplorerEntryProvider } from './bi/project-explorer/project-explorer-provider';
import { checkIfMiProject } from './mi/utils';
import { WebviewManager } from './webviewManager';
import { ExtensionAPIs } from './extensionAPIs';
import { registerCommands } from './commands';
import * as fs from 'fs';
import * as path from 'path';

/** The data provider for the BI project explorer, kept for refresh access. */
let biProjectExplorerProvider: ProjectExplorerEntryProvider | undefined;

export enum ProjectType {
    BI_BALLERINA = 'WSO2: BI',
    MI = 'WSO2: MI',
    SI = 'WSO2: SI',
    NONE = 'NONE'
}

interface MachineContext {
    projectUri: string;
    projectType: ProjectType;
    isBI?: boolean;
    isBallerina?: boolean;
    isMultiRoot?: boolean;
    isMI?: boolean;
    extensionAPIs: ExtensionAPIs;
    webviewManager?: WebviewManager;
    configChangeDisposable?: vscode.Disposable;
    mode: ProjectType[];
    currentView: ViewType;
    isInWi: boolean;
}

/**
 * Get the enabled integrator runtimes from configuration.
 */
function getDefaultIntegratorMode(): ProjectType[] {
    const config = vscode.workspace.getConfiguration("integrator");
    const biEnabled = config.get<boolean>("enabledRuntimes.bi", true);
    const miEnabled = config.get<boolean>("enabledRuntimes.mi", false);
    const siEnabled = config.get<boolean>("enabledRuntimes.si", false);

    const enabled: ProjectType[] = [];
    if (biEnabled) { enabled.push(ProjectType.BI_BALLERINA); }
    if (miEnabled) { enabled.push(ProjectType.MI); }
    if (siEnabled) { enabled.push(ProjectType.SI); }

    if (enabled.length === 0) {
        vscode.window.showWarningMessage(
            'WSO2 Integrator: At least one runtime must be enabled. Re-enabling WSO2 BI.',
            'Open Settings'
        ).then((selection) => {
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'integrator.enabledRuntimes'
                );
            }
        });
        // Restore BI in settings so the checkbox reflects reality
        config.update(
            'integrator.enabledRuntimes.bi',
            true,
            vscode.ConfigurationTarget.Global
        );
        return [ProjectType.BI_BALLERINA];
    }

    return enabled;
}

const stateMachine = createMachine<MachineContext>({
    /** @xstate-layout N4IgpgJg5mDOIC5RilADgGwIYDsAuAdAJY5F5FYZEBeYAxBAPY5jE4BujA1qwMYAWYXlwAKAJ0YArIXgDaABgC6iUGkawyRZipAAPRACZ5ANgLyArABZjADgDMNmwYDsBp3YA0IAJ6IAjBYEAJwhQTZ+xs7GbpE2AL5xXijo2PhsmpQ09GBiEmIEmFh4AGaMYgC2BAJCohLSvHJKOmoa5NpIeoZB8gTGls5+lpaDfnZDds5evggG5s4EdvKjfn4h5qsmlglJqIVpaHUyACJgeDKQdArKHS2a7aD6COYGU4gD893RQQHOzmFW23Au1ShAAMgBlACSpDwDGYrBInB4BGSezBUJhCERjF4RS0OCuV2a6juOB0jzsdiCBBs3QGFgm5lpg1eCGMEQI-WMTMWziWQQMxkBqJBBAh0LIdByeQK2BKZUqItw6IleCxHBxeOYhKaNxJbTJHQpVJpdIC5kZzMsrL51MsBiCAzsfSCdis5mFwOVBDEYCwEG8BHYRDAAHcAEp+gN0ADyIgAogA5AD6ADVIfGAOpEvWtfHkxA2cx2ynOZ3mKwRe2s8x9AiDB1+WnyWkDLaJIEpb2+-2B4NhgCqaAgRXoTBYbCRrCVaR7AaDIdDQ5HZ3VnFxBp111U+vzRsLBj8BGcTICDtdxnk1p8iH6dgIbnkjMsdgMlMsV4SHZwjAgcB0M54MSeb3J0CAALR+PMizrMYQSWI6fLOI4rKQSsD7yM4L4vrMfizPIBiel2aQkBkVC0MBpIFggYymqMtK0valLwayER2jY8jwXMlaCtyRFogUhwNCcZwNJAlEGtRiy9PB9gWARDqHi8N4QW+x6YS+rjyJh2m2B6HaAWKGJkBJe4PP4-RmEWQRwRWd4WsYrJwfeH7RMhxhuieQT6TsxGEHO0w7iBhrmWyZYPosl6eX4cycayDjmMeHEOBMdijJYjj8aKAULmGka9qZoGPK4R5viYT5zDFto1n8D42Oy7KrK43xZd2UZ9ouy6joVIVgeadrctpzrGB5ArKdMFY9JYzz2OYnFNnBzitWkEBELAWAAEYYOJuZUfuTzfMe3lFtNtYEUE8UGJYGGRNYHkce6X5xEAA */
    id: 'wi',
    initial: 'initialize',
    predictableActionArguments: true,
    context: {
        projectUri: 'global',
        projectType: ProjectType.NONE,
        extensionAPIs: new ExtensionAPIs(),
        mode: getDefaultIntegratorMode(),
        currentView: ViewType.LOADING,
        isInWi: process.env.WSO2_INTEGRATOR_RUNTIME === 'true'
    },
    states: {
        initialize: {
            invoke: {
                src: detectProjectType,
                onDone: [
                    {
                        target: 'activateExtensions',
                        actions: assign({
                            projectType: (context, event) => event.data.projectType,
                            isBI: (context, event) => event.data.isBI,
                            isBallerina: (context, event) => event.data.isBallerina,
                            isMultiRoot: (context, event) => event.data.isMultiRoot,
                            isMI: (context, event) => event.data.isMI
                        })
                    },
                    {
                        target: 'disabled',
                        cond: (context, event) => event.data.projectType === ProjectType.NONE
                    }
                ],
                onError: {
                    target: 'disabled'
                }
            }
        },
        activateExtensions: {
            invoke: {
                src: activateExtensionsBasedOnProjectType,
                onDone: {
                    target: 'ready'
                },
                onError: {
                    target: 'disabled'
                }
            }
        },
        ready: {
            entry: ["activateBasedOnProjectType", "registerConfigChangeListener"],
            exit: "disposeConfigChangeListener",
            on: {
                UPDATE_MODE: {
                    actions: assign({
                        mode: (context, event: any) => {
                            ext.log(`Mode updated in context: ${event.mode}`);
                            return event.mode;
                        }
                    })
                },
                UPDATE_VIEW: {
                    actions: assign({
                        currentView: (context, event: any) => {
                            ext.log(`View updated in context: ${event.view}`);
                            return event.view;
                        }
                    })
                }
            }
        },
        disabled: {
            // Project type could not be detected or no known project
            entry: ["registerConfigChangeListener"],
            exit: "disposeConfigChangeListener",
            on: {
                UPDATE_MODE: {
                    actions: assign({
                        mode: (context, event: any) => {
                            ext.log(`Mode updated in context: ${event.mode}`);
                            return event.mode;
                        }
                    })
                },
                UPDATE_VIEW: {
                    actions: assign({
                        currentView: (context, event: any) => {
                            ext.log(`View updated in context: ${event.view}`);
                            return event.view;
                        }
                    })
                }
            }
        },
    }
}, {
    actions: {
        activateBasedOnProjectType: (context, event) => {
            ext.log(`Activating for project type: ${context.projectType}`);

            if (context.projectType === ProjectType.BI_BALLERINA) {
                vscode.commands.executeCommand('setContext', 'WI.projectType', 'bi');
            } else if (context.projectType === ProjectType.MI) {
                ext.log('MI project detected - MI tree view would be activated here');
                vscode.commands.executeCommand('setContext', 'WI.projectType', 'mi');
            } else if (context.projectType === ProjectType.SI) {
                ext.log('SI project detected - SI tree view would be activated here');
                vscode.commands.executeCommand('setContext', 'WI.projectType', 'si');
            } else {
                vscode.commands.executeCommand('setContext', 'WI.projectType', 'none');
            }
        },
        showWelcomeScreen: (context, event) => {
            // On the disabled path (no project), webviewManager hasn't been created yet
            if (context.isInWi) {
                return;
            }

            if (!context.webviewManager) {
                context.webviewManager = new WebviewManager(context.projectUri);
                ext.context.subscriptions.push({
                    dispose: () => context.webviewManager?.dispose(),
                });
            }
            vscode.commands.executeCommand('setContext', 'WI.projectType', 'none');
            context.webviewManager.showWelcome();
            context.currentView = ViewType.WELCOME;
        },
        registerConfigChangeListener: (context) => {
            if (context.configChangeDisposable) {
                return;
            }

            context.configChangeDisposable = vscode.workspace.onDidChangeConfiguration(async (event) => {
                const runtimeSettingChanged =
                    event.affectsConfiguration('integrator.enabledRuntimes.bi') ||
                    event.affectsConfiguration('integrator.enabledRuntimes.mi') ||
                    event.affectsConfiguration('integrator.enabledRuntimes.si');

                if (runtimeSettingChanged) {
                    // get the updated mode from configuration
                    const newMode = getDefaultIntegratorMode();
                    ext.log(`Configuration changed: defaultRuntime = ${newMode}`);

                    if (newMode.includes(ProjectType.BI_BALLERINA)) {
                        context.extensionAPIs.initialize(EXTENSION_DEPENDENCIES.BALLERINA);
                    }
                    if (newMode.includes(ProjectType.MI)) {
                        context.extensionAPIs.initialize(EXTENSION_DEPENDENCIES.MI);
                    }
                    if (newMode.includes(ProjectType.SI)) {
                        context.extensionAPIs.initialize(EXTENSION_DEPENDENCIES.SI);
                    }

                    stateService.send({
                        type: 'UPDATE_MODE',
                        mode: newMode
                    });
                }
            });

            ext.context.subscriptions.push(context.configChangeDisposable);
        },
        disposeConfigChangeListener: (context) => {
            context.configChangeDisposable?.dispose();
            context.configChangeDisposable = undefined;
        }
    }
});

async function activateExtensionsBasedOnProjectType(context: MachineContext): Promise<void> {
    ext.log(`Activating extensions for project type: ${context.projectType}`);

    // Create webview manager
    context.webviewManager = new WebviewManager(context.projectUri);
    ext.context.subscriptions.push({
        dispose: () => context.webviewManager?.dispose(),
    });

    // Register commands
    registerCommands(ext.context, context.webviewManager, context.extensionAPIs);

    // Initialize extension APIs and activate appropriate extensions based on project type
    if (context.projectType === ProjectType.BI_BALLERINA) {
        // WI always handles BI treeview and webview activation directly,
        // regardless of whether the BI extension is installed.
        ext.log('Initializing BI extension for BI/Ballerina project');
        await context.extensionAPIs.initialize(EXTENSION_DEPENDENCIES.BALLERINA, true);

        ext.log('Activating BI project explorer within WI');
        await activateBIWithinWI();

    } else if (context.projectType === ProjectType.MI) {
        // Activate only MI extension for MI projects
        ext.log('Initializing MI extension for MI project');
        await context.extensionAPIs.initialize(EXTENSION_DEPENDENCIES.MI, true);

    } else if (context.projectType === ProjectType.SI) {
        // Activate only SI extension for SI projects
        ext.log('Initializing SI extension for SI project');
        await context.extensionAPIs.initialize(EXTENSION_DEPENDENCIES.SI, true);

    } else if (context.projectType === ProjectType.NONE) {
        // if a folder/workspace is open but we couldn't detect the project type, we should show an popup warning the user that the extension couldn't detect the project type
        if (vscode.workspace.workspaceFolders?.length && context.isInWi) {
            ext.log('Workspace is open but project type is unknown');
            vscode.window.showWarningMessage('We couldn\'t detect the project type. Please ensure you have a valid WSO2 Ballerina, Micro Integrator, or Streaming Integrator project open.', { modal: true }, 'Go to Welcome Screen', 'Open another folder').then(selection => {
                if (selection === 'Go to Welcome Screen') {
                    // close workspace
                    vscode.commands.executeCommand('workbench.action.closeFolder');
                } else if (selection === 'Open another folder') {
                    vscode.commands.executeCommand('workbench.action.files.openFolder');
                }
            });
        } else {
            ext.log('No workspace open');
            vscode.commands.executeCommand('setContext', 'WI.projectType', 'none');
            throw new Error('No workspace open - cannot activate extensions without a project');
        }
    }

    // Set context keys for available extensions
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.BALLERINA_AVAILABLE, context.extensionAPIs.isBIAvailable());
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.MI_AVAILABLE, context.extensionAPIs.isMIAvailable());

    // focus avtivated extension view if a workspace is open
    await vscode.commands.executeCommand('wso2-integrator.explorer.focus');

    ext.log('Extensions activated successfully');
}

/**
 * Activate the BI project explorer directly within WI, without relying on the BI extension.
 */
async function activateBIWithinWI(): Promise<void> {
    // Gather detailed project info (package vs workspace, empty workspace)
    const extInfo = await fetchExtendedProjectInfo();
    ext.log(`ExtendedProjectInfo: isBallerinaPackage=${extInfo.isBallerinaPackage}, isBallerinaWorkspace=${extInfo.isBallerinaWorkspace}, isEmptyWorkspace=${extInfo.isEmptyWorkspace}`);

    biProjectExplorerProvider = activateProjectExplorer({
        context: ext.context,
        isBallerinaPackage: extInfo.isBallerinaPackage,
        isBallerinaWorkspace: extInfo.isBallerinaWorkspace,
        isEmptyWorkspace: extInfo.isEmptyWorkspace,
    });
}

/** Expose the internal BI provider so commands can trigger a refresh on it. */
export function getBIProjectExplorerProvider(): ProjectExplorerEntryProvider | undefined {
    return biProjectExplorerProvider;
}

async function detectProjectType(): Promise<{
    projectType: ProjectType;
}> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    // Check if it's an MI project
    const isMiProject = workspaceRoot ? await checkIfMiProject(workspaceRoot) : false;

    if (isMiProject) {
        ext.log('Detected MI project');
        return {
            projectType: ProjectType.MI
        };
    }

    // Check if it's an SI project (default scaffold contains main.siddhi)
    const isSiProject = workspaceRoot ? fs.existsSync(path.join(workspaceRoot, 'main.siddhi')) : false;

    if (isSiProject) {
        ext.log('Detected SI project');
        return {
            projectType: ProjectType.SI
        };
    }

    // Check for BI/Ballerina project
    const projectInfo: ProjectInfo = fetchProjectInfo();

    if (projectInfo.isBallerina) {
        ext.log('Detected BI/Ballerina project');

        return {
            projectType: ProjectType.BI_BALLERINA,
        };
    }

    ext.log('No known project type detected');
    return {
        projectType: ProjectType.NONE
    };
}

// Create a service to interpret the machine
export const stateService = interpret(stateMachine);

// Define your API as functions
export const StateMachine = {
    initialize: async () => {
        ext.log('Starting state machine');
        stateService.start();
    },
    getContext: () => stateService.getSnapshot().context,
    openWebview: (view: ViewType) => {
        ext.log(`Opening webview with view: ${view}`);

        // Update the current view in state machine
        stateService.send({
            type: 'UPDATE_VIEW',
            view: view
        });

        // Get the webview manager from context and show the view
        const context = stateService.getSnapshot().context;
        if (context.webviewManager) {
            context.webviewManager.show(view);
        } else {
            ext.log('WebviewManager not available in state machine context');
        }
    },
    subscribe: (callback: () => void) => {
        return stateService.subscribe(callback);
    }
};
