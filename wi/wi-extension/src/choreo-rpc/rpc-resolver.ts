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

import {
	type BuildPackReq,
	type CancelApprovalReq,
	type CheckWorkflowStatusReq,
	ChoreoRpcCancelWorkflowApproval,
	ChoreoRpcCheckWorkflowStatus,
	ChoreoRpcCreateBuildRequest,
	ChoreoRpcCreateComponentConnection,
	ChoreoRpcCreateComponentRequest,
	ChoreoRpcCreateDeploymentRequest,
	ChoreoRpcCreateProjectRequest,
	ChoreoRpcDeleteComponentRequest,
	ChoreoRpcDeleteConnection,
	ChoreoRpcDisableAutoBuild,
	ChoreoRpcEnableAutoBuild,
	ChoreoRpcGetAuthorizedGitOrgsRequest,
	ChoreoRpcGetAutoBuildStatus,
	ChoreoRpcGetBranchesRequest,
	ChoreoRpcGetBuildLogs,
	ChoreoRpcGetBuildLogsForType,
	ChoreoRpcGetBuildPacksRequest,
	ChoreoRpcGetBuildsRequest,
	ChoreoRpcGetCommitsRequest,
	ChoreoRpcGetComponentItemRequest,
	ChoreoRpcGetComponentsRequest,
	ChoreoRpcGetConnectionGuide,
	ChoreoRpcGetConnectionItem,
	ChoreoRpcGetConnections,
	ChoreoRpcGetCredentialDetailsRequest,
	ChoreoRpcGetCredentialsRequest,
	ChoreoRpcGetDeploymentStatusRequest,
	ChoreoRpcGetDeploymentTracksRequest,
	ChoreoRpcGetEndpointsRequest,
	ChoreoRpcGetEnvsRequest,
	ChoreoRpcGetGitRepoMetadata,
	ChoreoRpcGetGitTokenForRepository,
	ChoreoRpcGetMarketplaceItemIdl,
	ChoreoRpcGetMarketplaceItems,
	ChoreoRpcGetProjectsRequest,
	ChoreoRpcGetProxyDeploymentInfo,
	ChoreoRpcGetSubscriptions,
	ChoreoRpcGetSwaggerRequest,
	ChoreoRpcGetTestKeyRequest,
	ChoreoRpcIsRepoAuthorizedRequest,
	ChoreoRpcPromoteProxyDeployment,
	ChoreoRpcRequestPromoteApproval,
	type GetAuthorizedGitOrgsReq,
	type GetAutoBuildStatusReq,
	type GetBranchesReq,
	type GetBuildLogsForTypeReq,
	type GetBuildLogsReq,
	type GetBuildsReq,
	type GetCommitsReq,
	type GetComponentEndpointsReq,
	type GetComponentItemReq,
	type GetComponentsReq,
	type GetConnectionGuideReq,
	type GetConnectionItemReq,
	type GetConnectionsReq,
	type GetCredentialDetailsReq,
	type GetCredentialsReq,
	type GetDeploymentStatusReq,
	type GetDeploymentTracksReq,
	type GetGitMetadataReq,
	type GetGitTokenForRepositoryReq,
	type GetMarketplaceIdlReq,
	type GetMarketplaceListReq,
	type GetProjectEnvsReq,
	type GetProxyDeploymentInfoReq,
	type GetSubscriptionsReq,
	type GetSwaggerSpecReq,
	type GetTestKeyReq,
	type IChoreoRPCClient,
	type IsRepoAuthorizedReq,
	type ToggleAutoBuildReq,
} from "@wso2/wso2-platform-core";
import { ProgressLocation, window } from "vscode";
import type { Messenger } from "vscode-messenger";
import { webviewStateStore } from "../stores/webview-state-store";

export function registerChoreoRpcResolver(messenger: Messenger, rpcClient: IChoreoRPCClient) {
	messenger.onRequest(ChoreoRpcGetProjectsRequest, (orgID: string) => rpcClient.getProjects(orgID));
	messenger.onRequest(ChoreoRpcGetComponentItemRequest, (params: GetComponentItemReq) => rpcClient.getComponentItem(params));
	messenger.onRequest(ChoreoRpcGetComponentsRequest, (params: GetComponentsReq) => rpcClient.getComponentList(params));
	messenger.onRequest(ChoreoRpcCreateProjectRequest, async (params: Parameters<IChoreoRPCClient["createProject"]>[0]) => {
		return window.withProgress({ title: `Creating project ${params.projectName}`, location: ProgressLocation.Notification }, () =>
			rpcClient.createProject(params),
		);
	});
	messenger.onRequest(ChoreoRpcCreateComponentRequest, async (params: Parameters<IChoreoRPCClient["createComponent"]>[0]) => {
		const extName = webviewStateStore.getState().state.extensionName;
		return window.withProgress(
			{ title: `Creating ${extName === "Devant" ? "integration" : "component"} ${params.name}...`, location: ProgressLocation.Notification },
			() => rpcClient.createComponent(params),
		);
	});
	messenger.onRequest(ChoreoRpcGetBuildPacksRequest, (params: BuildPackReq) => rpcClient.getBuildPacks(params));
	messenger.onRequest(ChoreoRpcGetBranchesRequest, (params: GetBranchesReq) => rpcClient.getRepoBranches(params));
	messenger.onRequest(ChoreoRpcIsRepoAuthorizedRequest, (params: IsRepoAuthorizedReq) => rpcClient.isRepoAuthorized(params));
	messenger.onRequest(ChoreoRpcGetAuthorizedGitOrgsRequest, (params: GetAuthorizedGitOrgsReq) => rpcClient.getAuthorizedGitOrgs(params));
	messenger.onRequest(ChoreoRpcGetCredentialsRequest, (params: GetCredentialsReq) => rpcClient.getCredentials(params));
	messenger.onRequest(ChoreoRpcGetCredentialDetailsRequest, (params: GetCredentialDetailsReq) => rpcClient.getCredentialDetails(params));
	messenger.onRequest(ChoreoRpcDeleteComponentRequest, async (params: Parameters<IChoreoRPCClient["deleteComponent"]>[0]) => {
		const extName = webviewStateStore.getState().state.extensionName;
		return window.withProgress(
			{ title: `Deleting ${extName === "Devant" ? "integration" : "component"} ${params.componentName}...`, location: ProgressLocation.Notification },
			() => rpcClient.deleteComponent(params),
		);
	});
	messenger.onRequest(ChoreoRpcCreateBuildRequest, async (params: Parameters<IChoreoRPCClient["createBuild"]>[0]) => {
		return window.withProgress({ title: `Triggering build for ${params.componentName}...`, location: ProgressLocation.Notification }, () =>
			rpcClient.createBuild(params),
		);
	});
	messenger.onRequest(ChoreoRpcGetDeploymentTracksRequest, (params: GetDeploymentTracksReq) => rpcClient.getDeploymentTracks(params));
	messenger.onRequest(ChoreoRpcGetBuildsRequest, (params: GetBuildsReq) => rpcClient.getBuilds(params));
	messenger.onRequest(ChoreoRpcGetCommitsRequest, (params: GetCommitsReq) => rpcClient.getCommits(params));
	messenger.onRequest(ChoreoRpcGetEnvsRequest, (params: GetProjectEnvsReq) => rpcClient.getEnvs(params));
	messenger.onRequest(ChoreoRpcGetEndpointsRequest, (params: GetComponentEndpointsReq) => rpcClient.getComponentEndpoints(params));
	messenger.onRequest(ChoreoRpcGetDeploymentStatusRequest, (params: GetDeploymentStatusReq) => rpcClient.getDeploymentStatus(params));
	messenger.onRequest(ChoreoRpcGetProxyDeploymentInfo, (params: GetProxyDeploymentInfoReq) => rpcClient.getProxyDeploymentInfo(params));
	messenger.onRequest(ChoreoRpcCreateDeploymentRequest, async (params: Parameters<IChoreoRPCClient["createDeployment"]>[0]) => {
		const extName = webviewStateStore.getState().state.extensionName;
		return window.withProgress(
			{
				title: `Deploying ${extName === "Devant" ? "integration" : "component"} ${params.componentName} in ${params.envName} environment...`,
				location: ProgressLocation.Notification,
			},
			() => rpcClient.createDeployment(params),
		);
	});
	messenger.onRequest(ChoreoRpcGetTestKeyRequest, (params: GetTestKeyReq) => rpcClient.getTestKey(params));
	messenger.onRequest(ChoreoRpcGetSwaggerRequest, (params: GetSwaggerSpecReq) => rpcClient.getSwaggerSpec(params));
	messenger.onRequest(ChoreoRpcGetMarketplaceItems, (params: GetMarketplaceListReq) => rpcClient.getMarketplaceItems(params));
	messenger.onRequest(ChoreoRpcGetMarketplaceItemIdl, (params: GetMarketplaceIdlReq) => rpcClient.getMarketplaceIdl(params));
	messenger.onRequest(ChoreoRpcGetConnections, (params: GetConnectionsReq) => rpcClient.getConnections(params));
	messenger.onRequest(ChoreoRpcGetConnectionItem, (params: GetConnectionItemReq) => rpcClient.getConnectionItem(params));
	messenger.onRequest(ChoreoRpcCreateComponentConnection, async (params: Parameters<IChoreoRPCClient["createComponentConnection"]>[0]) => {
		return window.withProgress({ title: `Creating connection ${params.name}...`, location: ProgressLocation.Notification }, () =>
			rpcClient.createComponentConnection(params),
		);
	});
	messenger.onRequest(ChoreoRpcDeleteConnection, async (params: Parameters<IChoreoRPCClient["deleteConnection"]>[0]) => {
		return window.withProgress({ title: `Deleting connection ${params.connectionName}...`, location: ProgressLocation.Notification }, () =>
			rpcClient.deleteConnection(params),
		);
	});
	messenger.onRequest(ChoreoRpcGetConnectionGuide, (params: GetConnectionGuideReq) => rpcClient.getConnectionGuide(params));
	messenger.onRequest(ChoreoRpcGetAutoBuildStatus, (params: GetAutoBuildStatusReq) => rpcClient.getAutoBuildStatus(params));
	messenger.onRequest(ChoreoRpcEnableAutoBuild, (params: ToggleAutoBuildReq) => rpcClient.enableAutoBuildOnCommit(params));
	messenger.onRequest(ChoreoRpcDisableAutoBuild, (params: ToggleAutoBuildReq) => rpcClient.disableAutoBuildOnCommit(params));
	messenger.onRequest(ChoreoRpcGetBuildLogs, (params: GetBuildLogsReq) => rpcClient.getBuildLogs(params));
	messenger.onRequest(ChoreoRpcGetBuildLogsForType, (params: GetBuildLogsForTypeReq) => rpcClient.getBuildLogsForType(params));
	messenger.onRequest(ChoreoRpcCheckWorkflowStatus, (params: CheckWorkflowStatusReq) => rpcClient.checkWorkflowStatus(params));
	messenger.onRequest(ChoreoRpcCancelWorkflowApproval, async (params: CancelApprovalReq) => {
		return window.withProgress({ title: "Cancelling approval request...", location: ProgressLocation.Notification }, () =>
			rpcClient.cancelApprovalRequest(params),
		);
	});
	messenger.onRequest(ChoreoRpcRequestPromoteApproval, async (params: Parameters<IChoreoRPCClient["requestPromoteApproval"]>[0]) => {
		return window.withProgress(
			{ title: `Requesting approval to promote to ${params.envName} environment...`, location: ProgressLocation.Notification },
			() => rpcClient.requestPromoteApproval(params),
		);
	});
	messenger.onRequest(ChoreoRpcPromoteProxyDeployment, async (params: Parameters<IChoreoRPCClient["promoteProxyDeployment"]>[0]) => {
		return window.withProgress({ title: "Promoting proxy deployment...", location: ProgressLocation.Notification }, () =>
			rpcClient.promoteProxyDeployment(params),
		);
	});
	messenger.onRequest(ChoreoRpcGetSubscriptions, (params: GetSubscriptionsReq) => rpcClient.getSubscriptions(params));
	messenger.onRequest(ChoreoRpcGetGitTokenForRepository, (params: GetGitTokenForRepositoryReq) => rpcClient.getGitTokenForRepository(params));
	messenger.onRequest(ChoreoRpcGetGitRepoMetadata, async (params: GetGitMetadataReq) => {
		return window.withProgress({ title: "Fetching repo metadata...", location: ProgressLocation.Notification }, () =>
			rpcClient.getGitRepoMetadata(params),
		);
	});
}
