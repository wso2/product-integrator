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

/**
 * BI-related constants and types, mirrored from @wso2/ballerina-core
 * to keep the WI extension independent of the BI extension.
 */

// ---------------------------------------------------------------------------
// Command constants (mirrors BI_COMMANDS and SHARED_COMMANDS in ballerina-core)
// ---------------------------------------------------------------------------

export const SHARED_COMMANDS = {
    FORCE_UPDATE_PROJECT_ARTIFACTS: 'ballerina.force.update.artifacts',
    SHOW_VISUALIZER: 'ballerina.showVisualizer',
    GET_STATE_CONTEXT: 'ballerina.get.stateContext',
    OPEN_BI_WELCOME: 'ballerina.open.bi.welcome',
    OPEN_BI_NEW_PROJECT: 'ballerina.open.bi.new',
};

export const BI_COMMANDS = {
    REFRESH_COMMAND: 'BI.project-explorer.refresh',
    PROJECT_EXPLORER: 'BI.project-explorer',
    ADD_CONNECTIONS: 'BI.project-explorer.add-connection',
    DELETE_COMPONENT: 'BI.project-explorer.delete',
    ADD_ENTRY_POINT: 'BI.project-explorer.add-entry-point',
    ADD_TYPE: 'BI.project-explorer.add-type',
    VIEW_TYPE_DIAGRAM: 'BI.project-explorer.view-type-diagram',
    ADD_FUNCTION: 'BI.project-explorer.add-function',
    ADD_CONFIGURATION: 'BI.project-explorer.add-configuration',
    VIEW_CONFIGURATION: 'BI.project-explorer.view-configuration',
    ADD_PROJECT: 'BI.project-explorer.add',
    SHOW_OVERVIEW: 'BI.project-explorer.overview',
    ADD_DATA_MAPPER: 'BI.project-explorer.add-data-mapper',
    ADD_NATURAL_FUNCTION: 'BI.project-explorer.add-natural-function',
    NOTIFY_PROJECT_EXPLORER: 'BI.project-explorer.notify',
};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum DIRECTORY_MAP {
    SERVICE = 'SERVICE',
    AUTOMATION = 'AUTOMATION',
    LISTENER = 'LISTENER',
    CONNECTION = 'CONNECTION',
    FUNCTION = 'FUNCTION',
    TYPE = 'TYPE',
    CONFIGURABLE = 'CONFIGURABLE',
    DATA_MAPPER = 'DATA_MAPPER',
    NP_FUNCTION = 'NP_FUNCTION',
    LOCAL_CONNECTORS = 'LOCAL_CONNECTORS',
    CONNECTOR = 'CONNECTOR',
    RESOURCE = 'RESOURCE',
    REMOTE = 'REMOTE',
    WORKFLOW = 'WORKFLOW',
    ACTIVITY = 'ACTIVITY',
}

export enum MACHINE_VIEW {
    PackageOverview = 'Overview',
    WorkspaceOverview = 'Workspace Overview',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface NodePosition {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}

export interface ProjectStructureArtifactResponse {
    name: string;
    type: DIRECTORY_MAP;
    path: string;
    icon: string;
    position?: NodePosition;
    context?: string;
    resources?: ProjectStructureArtifactResponse[];
}

export interface ProjectStructure {
    projectName: string;
    projectTitle?: string;
    projectPath: string;
    isLibrary?: boolean;
    directoryMap: {
        [key in DIRECTORY_MAP]: ProjectStructureArtifactResponse[];
    };
}

export interface ProjectStructureResponse {
    workspaceName?: string;
    workspaceTitle?: string;
    workspacePath?: string;
    projects: ProjectStructure[];
}

export interface VisualizerLocation {
    projectPath: string;
    workspacePath?: string;
    projectStructure?: ProjectStructureResponse;
}
