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
 * Utility functions for WSO2 Integrator Core
 */

/**
 * Check if a value is defined and not null
 */
export function isDefined<T>(value: T | undefined | null): value is T {
	return value !== undefined && value !== null;
}

/**
 * Safely get a property from an object
 */
export function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] | undefined {
	return obj?.[key];
}

/**
 * Format error message
 */
export function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
