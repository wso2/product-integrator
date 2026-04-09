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

// ---------------------------------------------------------------------------
// BI-related constants and types
// ---------------------------------------------------------------------------

export const SHARED_COMMANDS = {
    FORCE_UPDATE_PROJECT_ARTIFACTS: 'ballerina.force.update.artifacts',
    SHOW_VISUALIZER: 'ballerina.showVisualizer',
    GET_STATE_CONTEXT: 'ballerina.get.stateContext'
};

export const BI_COMMANDS = {
    REFRESH_COMMAND: 'BI.project-explorer.refresh',
    PROJECT_EXPLORER: 'BI.project-explorer',
    SHOW_OVERVIEW: 'BI.project-explorer.overview',
    ADD_DATA_MAPPER: 'BI.project-explorer.add-data-mapper',
    ADD_NATURAL_FUNCTION: 'BI.project-explorer.add-natural-function',
    ADD_WORKFLOW: 'BI.project-explorer.add-workflow',
    ADD_WORKFLOW_ACTIVITY: 'BI.project-explorer.add-workflow-activity',
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
