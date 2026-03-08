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

export enum ErrorCode {
	ParseError = -32700,
	InvalidRequest = -32600,
	MethodNotFound = -32601,
	InvalidParams = -32602,
	InternalError = -32603,
	UnauthorizedError = -32000,
	TokenNotFoundError = -32001,
	InvalidTokenError = -32002,
	ForbiddenError = -32003,
	RefreshTokenError = -32004,
	ComponentNotFound = -32005,
	ProjectNotFound = -32006,
	MaxProjectCountError = -32007,
	RepoAccessNeeded = -32008,
	EpYamlNotFound = -32009,
	UserNotFound = -32010,
	MaxComponentCountError = -32011,
	InvalidSubPath = -32012,
	NoOrgsAvailable = -32013,
	NoAccountAvailable = -32014,
}
