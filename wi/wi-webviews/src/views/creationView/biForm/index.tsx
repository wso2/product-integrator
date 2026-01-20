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

import { useState } from "react";
import {
    Button,
    ProgressRing,
} from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { ProjectFormFields, ProjectFormData } from "./ProjectFormFields";
import { isFormValid } from "./utils";
import { useVisualizerContext } from "../../../contexts";

const ButtonWrapper = styled.div`
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
`;

const ScrollableContent = styled.div`
    flex: 1;
    overflow-y: auto;
    padding-right: 8px;
    min-height: 0;
    max-height: calc(100vh - 380px);
`;

export function BIProjectForm() {
    const { rpcClient } = useVisualizerContext();
    const [formData, setFormData] = useState<ProjectFormData>({
        integrationName: "",
        packageName: "",
        path: "",
        createDirectory: true,
        orgName: "",
        version: "",
    });
    const [formSaved, setFormSaved] = useState(false);

    const handleFormDataChange = (data: Partial<ProjectFormData>) => {
        setFormData(prev => ({ ...prev, ...data }));
    };

    const handleCreateProject = async () => {
        setFormSaved(true);
        rpcClient.getMainRpcClient().createBIProject({
            projectName: formData.integrationName,
            packageName: formData.packageName,
            projectPath: formData.path,
            createDirectory: formData.createDirectory,
            createAsWorkspace: formData.createAsWorkspace,
            workspaceName: formData.workspaceName,
            orgName: formData.orgName || undefined,
            version: formData.version || undefined,
        });
    };

    return (
        <div style={{ width: '100%' }}>
            <ScrollableContent>
                <ProjectFormFields
                    formData={formData}
                    onFormDataChange={handleFormDataChange}
                />
            </ScrollableContent>
            <ButtonWrapper>
                <Button
                    disabled={!isFormValid(formData) || formSaved}
                    onClick={handleCreateProject}
                    appearance="primary"
                >
                    {formSaved ? (
                        <>
                            <ProgressRing sx={{ height: 16, marginLeft: -5, marginRight: 2 }} color="white" />
                            Creating
                        </>
                    ) : formData.createAsWorkspace ? "Create Workspace" : "Create Integration"}
                </Button>
            </ButtonWrapper>
        </div>
    );
}
