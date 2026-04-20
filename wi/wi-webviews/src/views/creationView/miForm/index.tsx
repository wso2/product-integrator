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
import { Button, Dropdown, FormGroup, LocationSelector, OptionProps, TextField, ProgressRing, CheckBox, ParamManager, Tooltip, Icon, ParamConfig } from "@wso2/ui-toolkit";
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup";
import { useForm } from "react-hook-form";
import styled from "@emotion/styled";
import { useVisualizerContext } from "../../../contexts/WsContext";

type InputsFields = {
    name: string;
    directory: string;
    groupID: string;
    artifactID: string;
    version: string;
    miVersion: string;
};

const initialEndpoint: InputsFields = {
    name: '',
    directory: '',
    groupID: 'com.microintegrator.projects',
    artifactID: 'Sample1',
    version: '1.0.0',
    miVersion: '',
};

const DownloadLabel = styled.div`
    margin-top: 10px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const ButtonWrapper = styled.div`
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
`;

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

export function MiProjectWizard() {
    const { wsClient } = useVisualizerContext();
    const [dirContent, setDirContent] = useState([]);
    const [supportedMIVersions, setSupportedMIVersions] = useState<OptionProps[]>([]);
    const [formSaved, setFormSaved] = useState(false);
    
    const [isConsolidatedProject, setIsConsolidatedProject] = useState(false);
    const [isSubProjectsAdded, setIsSubProjectsAdded] = useState(false);
    const subProjectConfigs: ParamConfig = {
        paramValues: [],
        paramFields: [
            {
                id: 0,
                type: "TextField",
                label: "Module Name",
                defaultValue: "",
                isRequired: true
            }]
    }
    const [subProjects, setSubProjects] = useState(subProjectConfigs);
    const consolidatedHelpTip = <Tooltip
                content="A consolidated project allows you to manage multiple related integration projects as a single unit"
                position='right'
            >
                <Icon name="question" isCodicon iconSx={{ fontSize: '18px' }} sx={{ marginLeft: '5px', cursor: 'help' }} />
            </Tooltip>;

    const loweCasedDirContent = dirContent.map((folder: string) => folder.toLowerCase());
    const schema = yup.object({
        name: yup.string().required("Project Name is required").matches(/^[a-zA-Z0-9_-]([a-zA-Z0-9_-]*\.?[a-zA-Z0-9_-])*$/i, "Project name cannot contain spaces or special characters")
            .test('validateFolderName',
                'A subfolder with same name already exists', value => {
                    return !loweCasedDirContent.includes(value.toLowerCase())
                }),
        directory: yup.string().required("Project Path is required"),
        groupID: yup.string().notRequired().default("com.microintegrator.projects").matches(/^[a-zA-Z0-9_-]([a-zA-Z0-9_-]*\.?[a-zA-Z0-9_-])*$/, "Group id cannot contain spaces or special characters"),
        artifactID: yup.string().notRequired().matches(/^[a-zA-Z0-9_-]?([a-zA-Z0-9_-]*\.?[a-zA-Z0-9_-])*$/, "Artifact id cannot contain spaces or special characters"),
        version: yup.string().notRequired().default("1.0.0").matches(/^[a-zA-Z0-9.]*$/, "Version cannot contain spaces or special characters"),
        miVersion: yup.string().required("WSO2 Integrator: MI Runtime version is required").matches(/^[a-zA-Z0-9.]*$/, "WSO2 Integrator: MI Version cannot contain spaces or special characters"),
    });

    const {
        register,
        formState: { errors, isDirty },
        handleSubmit,
        watch,
        getValues,
        setValue,
    } = useForm({
        defaultValues: initialEndpoint,
        resolver: yupResolver(schema),
        mode: "onChange"
    });

    useEffect(() => {
        (async () => {
            const currentDir = await wsClient.getWorkspaceRoot();
            setValue("directory", currentDir.path);
            const supportedVersionsResponse = await wsClient.getSupportedMIVersionsHigherThan('');
            const supportedMIVersions = supportedVersionsResponse.versions.map((version: string) => ({ value: version, content: version }));
            setSupportedMIVersions(supportedMIVersions);
            setValue("miVersion", supportedVersionsResponse.versions[0]); // Set the first supported version as the default, it is the latest version
            const response = await wsClient.getSubFolderNames({ path: currentDir.path });
            setDirContent(response.folders);
        })();
    }, []);

    useEffect(() => {
        setValue("artifactID", getValues("name"));
    }, [watch("name")]);

    const handleSubProjectsOnChange = (params: any) => {
        let i = 1;
        const modifiedParams = {
            ...params, paramValues: params.paramValues.map((param: any) => {
                return {
                    ...param,
                    key: i++,
                    value: param.parameters?.[0]?.value
                }
            })
        };
        setSubProjects(modifiedParams);
        setIsSubProjectsAdded(modifiedParams.paramValues.map((param: any) => param.value).filter(Boolean).length > 0);
    };

    const handleProjecDirSelection = async () => {
        const projectDirectory = await wsClient.askProjectDirPath();
        setValue("directory", projectDirectory.path);
        const response = await wsClient.getSubFolderNames({ path: projectDirectory.path });
        setDirContent(response.folders);
    }

    const handleCreateProject = async (values: any) => {
        setValue("artifactID", getValues("artifactID") ? getValues("artifactID") : getValues("name"))
        const createProjectParams = {
            ...values,
            open: true,
            isConsolidatedProject: isConsolidatedProject,
            subProjects: subProjects.paramValues.map((param: any) => param.value)
        }
        setFormSaved(true);
        const response = await wsClient.createMiProject(createProjectParams);
        if (response.filePath === "Error") {
            setFormSaved(false);
        } else {
            // Project created successfully
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (isDirty) {
                handleSubmit(handleCreateProject)();
            }
        }
    };

    return (
        <div>
            <FieldGroup>
                <TextField
                    id='name'
                    label="Project Name"
                    required
                    errorMsg={errors.name?.message.toString()}
                    {...register("name")}
                    onKeyDown={onKeyDown}
                />
            </FieldGroup>
            <FieldGroup>
                <Dropdown
                    id='miVersion'
                    label="WSO2 Integrator: MI runtime version"
                    isRequired={true}
                    errorMsg={errors.miVersion?.message.toString()}
                    items={supportedMIVersions}
                    {...register("miVersion")}
                />
            </FieldGroup>
            <FieldGroup>
                <LocationSelector
                    label="Select Project Path"
                    selectedFile={watch("directory")}
                    required
                    onSelect={handleProjecDirSelection}
                    btnText="Select Path"
                    {...register("directory")}
                />
            </FieldGroup>
            <FieldGroup>
                <FormGroup title="Advanced Options">
                    <React.Fragment>
                        <FormGroup title="Project Configurations" sx={{ marginBottom: -20 }}>
                            <CheckBox
                                label="Consolidated Project"
                                value="consolidated"
                                checked={isConsolidatedProject}
                                onChange={(isChecked: boolean) => setIsConsolidatedProject(isChecked)}
                                labelAdornment={consolidatedHelpTip}
                            />
                            {isConsolidatedProject &&
                                <ParamManager paramConfigs={subProjects} onChange={handleSubProjectsOnChange} />
                            }
                        </FormGroup>
                        <TextField
                            id='groupID'
                            label="Group Id"
                            required
                            errorMsg={errors.groupID?.message.toString()}
                            {...register("groupID")}
                        />
                        <TextField
                            id='artifactID'
                            label="Artifact Id"
                            required
                            errorMsg={errors.artifactID?.message.toString()}
                            {...register("artifactID")}
                        />
                        <TextField
                            id='version'
                            label="Version"
                            required
                            errorMsg={errors.version?.message.toString()}
                            {...register("version")}
                        />
                    </React.Fragment>
                </FormGroup>
            </FieldGroup>
            <FieldGroup>
                <DownloadLabel>If the necessary WSO2 Integrator: MI profile's runtime and development tools are not available, you will be prompted to download them after project creation.</DownloadLabel>
            </FieldGroup>
            <ButtonWrapper>
                <Button
                    appearance="primary"
                    onClick={handleSubmit(handleCreateProject)}
                    disabled={(!isDirty) || Object.keys(errors).length > 0 || formSaved || !watch("directory") || (isConsolidatedProject && !isSubProjectsAdded)}
                >
                    {formSaved ? (
                        <>
                            <ProgressRing sx={{ height: 16, marginLeft: -5, marginRight: 2 }} color="white" />
                            Creating
                        </>
                    ) : "Create Project"}
                </Button>
            </ButtonWrapper>
        </div>
    );
}
