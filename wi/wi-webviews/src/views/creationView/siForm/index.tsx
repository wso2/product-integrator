/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { Button, LocationSelector, ProgressRing, TextField } from "@wso2/ui-toolkit";
import { useForm } from "react-hook-form";
import styled from "@emotion/styled";
import { useVisualizerContext } from "../../../contexts/WsContext";

type SIFormInputs = {
    name: string;
    directory: string;
};

const initialValues: SIFormInputs = {
    name: "",
    directory: "",
};

const ButtonWrapper = styled.div`
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
`;

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

export function SiProjectWizard() {
    const { wsClient } = useVisualizerContext();
    const [dirContent, setDirContent] = useState<string[]>([]);
    const [formSaved, setFormSaved] = useState(false);

    const lowerCasedDirContent = dirContent.map((folder) => folder.toLowerCase());

    const {
        register,
        formState: { errors, isDirty },
        handleSubmit,
        watch,
        setValue,
    } = useForm<SIFormInputs>({
        defaultValues: initialValues,
        mode: "onChange",
    });

    useEffect(() => {
        (async () => {
            const currentDir = await wsClient.getWorkspaceRoot();
            setValue("directory", currentDir.path);

            const subFolderResponse = await wsClient.getSubFolderNames({ path: currentDir.path });
            setDirContent(subFolderResponse.folders);
        })();
    }, [setValue, wsClient]);

    const handleProjectDirSelection = async () => {
        const projectDirectory = await wsClient.askProjectDirPath();
        setValue("directory", projectDirectory.path);
        const response = await wsClient.getSubFolderNames({ path: projectDirectory.path });
        setDirContent(response.folders);
    };

    const handleCreateProject = async (values: SIFormInputs) => {
        setFormSaved(true);
        const response = await wsClient.createSiProject({
            ...values,
            open: true,
        });

        if (response.filePath === "Error") {
            setFormSaved(false);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (isDirty) {
                handleSubmit(handleCreateProject)();
            }
        }
    };

    return (
        <div style={{ width: '100%' }}>
            <FieldGroup>
                <TextField
                    id="name"
                    label="Integration Name"
                    required
                    errorMsg={errors.name?.message?.toString()}
                    {...register("name", {
                        required: "Integration Name is required",
                        pattern: {
                            value: /^[a-zA-Z0-9_-]([a-zA-Z0-9_-]*\.?[a-zA-Z0-9_-])*$/i,
                            message: "Integration name cannot contain spaces or special characters",
                        },
                        validate: (value) => {
                            if (lowerCasedDirContent.includes(value.toLowerCase())) {
                                return "A subfolder with same name already exists";
                            }

                            return true;
                        },
                    })}
                    onKeyDown={onKeyDown}
                />
            </FieldGroup>
            <FieldGroup>
                <LocationSelector
                    label="Path"
                    selectedFile={watch("directory")}
                    required
                    onSelect={handleProjectDirSelection}
                    btnText="Select Path"
                    {...register("directory", { required: "Path is required" })}
                />
            </FieldGroup>
            <ButtonWrapper>
                <Button
                    appearance="primary"
                    onClick={handleSubmit(handleCreateProject)}
                    disabled={
                        !isDirty ||
                        Object.keys(errors).length > 0 ||
                        formSaved ||
                        !watch("directory")
                    }
                >
                    {formSaved ? (
                        <>
                            <ProgressRing sx={{ height: 16, marginLeft: -5, marginRight: 2 }} color="white" />
                            Creating
                        </>
                    ) : (
                        "Create Integration"
                    )}
                </Button>
            </ButtonWrapper>
        </div>
    );
}