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

/**
 * Claims carried by the platform token.
 *
 * The extension's identity and organization come from here rather than from a
 * call: the platform has no "current user" endpoint, and it derives the
 * organization from these same claims on every request it serves.
 */
export interface PlatformClaims {
	/** End-user id. Also the key an editor instance is derived from. */
	sub?: string;
	/** Organization slug. Every request is scoped to it. */
	ouHandle?: string;
	/** Organization UUID. */
	ouId?: string;
	ouName?: string;
	email?: string;
	name?: string;
	/** Expiry, seconds since the epoch. */
	exp?: number;
}

/**
 * Read a JWT's payload.
 *
 * The signature is not checked, and must not be relied on here: the gateway
 * validates the token before the platform ever sees it, and this process holds
 * no key to verify it with. Returns null for anything unreadable rather than
 * throwing, so a malformed token degrades to "no session" instead of breaking
 * activation.
 */
export function decodeClaims(token: string): PlatformClaims | null {
	try {
		const payload = token.split(".")[1];
		if (!payload) {
			return null;
		}
		// base64url, not base64: a JWT payload may carry - and _, and the
		// padding is stripped.
		const decoded = Buffer.from(payload, "base64url").toString("utf8");
		const claims = JSON.parse(decoded);
		return claims && typeof claims === "object"
			? (claims as PlatformClaims)
			: null;
	} catch {
		return null;
	}
}

/** Seconds of remaining validity, or null when the token carries no expiry. */
export function secondsUntilExpiry(
	claims: PlatformClaims | null,
	nowMs: number,
): number | null {
	if (!claims?.exp) {
		return null;
	}
	return Math.floor((claims.exp * 1000 - nowMs) / 1000);
}
