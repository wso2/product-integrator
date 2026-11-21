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

import { type StoredSession, decodeJwtPayload } from "@wso2/wso2-cloud-client";

/**
 * The signed-in person's picture URL. WSO2 Cloud's identity provider puts
 * `picture` in the ID token, as the console reads it, and not always in the
 * access token the session's claims come from, so the ID token is read when
 * the access token has none. Only an https URL is taken.
 */
export function profilePictureOf(stored: Pick<StoredSession, "claims" | "tokens">): string | undefined {
	const fromIdToken = stored.tokens.idToken ? decodeJwtPayload(stored.tokens.idToken)?.picture : undefined;
	for (const candidate of [stored.claims.picture, fromIdToken]) {
		if (typeof candidate === "string" && candidate.startsWith("https://")) {
			return candidate;
		}
	}
	return undefined;
}
