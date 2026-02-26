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
import { findBallerinaExtension } from './utils/ballerinaExtension';
import { CONTEXT_KEYS, ViewType } from '@wso2/wi-core';
import { ext } from './extensionVariables';
import { fetchProjectInfo, ProjectInfo } from './bi/utils';
import { checkIfMiProject } from './mi/utils';
import { WebviewManager } from './webviewManager';
import { ExtensionAPIs } from './extensionAPIs';
import { registerCommands } from './commands';

export enum ProjectType {
    BI_BALLERINA = 'WSO2: BI',
    MI = 'WSO2: MI',
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
    mode: ProjectType;
    currentView: ViewType;
}

/**
 * Get the default integrator mode from configuration
 */
function getDefaultIntegratorMode(): ProjectType {
    const configValue = vscode.workspace.getConfiguration("wso2-integrator").get<string>("integrator.defaultRuntime");

    // Map string config values to ProjectType enum
    switch (configValue) {
        case 'WSO2: BI':
            return ProjectType.BI_BALLERINA;
        case 'WSO2: MI':
            return ProjectType.MI;
        default:
            return ProjectType.NONE;
    }
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
        currentView: ViewType.LOADING
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
                ],
                onError: {
                    target: 'disabled'
                }
            }
        },
        activateExtensions: {
            entry: "focusIntegratorViewIfWorkspaceOpen",
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
            entry: "activateBasedOnProjectType",
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
            entry: "showWelcomeScreen",
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
            }
        },
        focusIntegratorViewIfWorkspaceOpen: () => {
            if (!vscode.workspace.workspaceFolders?.length) {
                ext.log('Skipping Integrator explorer focus: no workspace/folder open');
                return;
            }

            void vscode.commands.executeCommand('wso2-integrator.explorer.focus').then(
                () => ext.log('Focused WSO2 Integrator explorer view before extension activation'),
                (error) => ext.logError('Failed to focus WSO2 Integrator explorer view before extension activation', error)
            );
        },
        showWelcomeScreen: (context, event) => {
            if (context.webviewManager) {
                context.webviewManager.showWelcome();
            }
        }
    }
});

async function activateExtensionsBasedOnProjectType(context: MachineContext): Promise<void> {
    ext.log(`Activating extensions for project type: ${context.projectType}`);

    // Initialize extension APIs and activate appropriate extensions based on project type
    if (context.projectType === ProjectType.BI_BALLERINA) {
        // Activate only BI extension for Ballerina projects
        ext.log('Initializing BI extension for Ballerina project');
        await context.extensionAPIs.initialize();
    } else if (context.projectType === ProjectType.MI) {
        // Activate only MI extension for MI projects
        ext.log('Initializing MI extension for MI project');
        await context.extensionAPIs.initialize();
    } else {
        // if a folder/workspace is open but we couldn't detect the project type, we should show an popup warning the user that the extension couldn't detect the project type
        if (vscode.workspace.workspaceFolders?.length) {
            ext.log('Workspace is open but project type is unknown');
            vscode.window.showWarningMessage('We couldn\'t detect the project type. Please ensure you have a valid WSO2 Ballerina or Micro Integrator project open.', { modal: true }, 'Go to Welcome Screen', 'Open another folder').then(selection => {
                if (selection === 'Go to Welcome Screen') {
                    // close workspace
                    vscode.commands.executeCommand('workbench.action.closeFolder');
                } else if (selection === 'Open another folder') {
                    vscode.commands.executeCommand('workbench.action.files.openFolder');
                }
            });
        } else {
            ext.log('No workspace open');
        }
    }

    // Set context keys for available extensions
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.BI_AVAILABLE, context.extensionAPIs.isBIAvailable());
    await vscode.commands.executeCommand("setContext", CONTEXT_KEYS.MI_AVAILABLE, context.extensionAPIs.isMIAvailable());

    // Create webview manager
    context.webviewManager = new WebviewManager(context.projectUri);
    ext.context.subscriptions.push({
        dispose: () => context.webviewManager?.dispose(),
    });

    // Register commands
    registerCommands(ext.context, context.webviewManager, context.extensionAPIs);

    ext.log('Extensions activated successfully');
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

    // Check for BI/Ballerina project
    const projectInfo: ProjectInfo = fetchProjectInfo();
    const ballerinaExt = findBallerinaExtension();

    if (projectInfo.isBallerina && ballerinaExt) {
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
    initialize: () => {
        ext.log('Starting state machine');
        stateService.start();

        // Listen for configuration changes
        const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('wso2-integrator.integrator.defaultRuntime')) {
                const newMode = getDefaultIntegratorMode();
                ext.log(`Configuration changed: defaultRuntime = ${newMode}`);

                // Update the state machine context
                stateService.send({
                    type: 'UPDATE_MODE',
                    mode: newMode
                });
            }
        });

        // Register disposable
        ext.context.subscriptions.push(configChangeDisposable);
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
