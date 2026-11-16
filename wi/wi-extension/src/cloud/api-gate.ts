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

import { type IWso2PlatformExtensionAPI, type IWso2PlatformExtensionGate, UnauthenticatedError } from "@wso2/wso2-cloud-client";

/**
 * What this extension exports as `cloudAPIs`. Exports carry no caller
 * identity, so only facts that are not the person's (whether the API is up,
 * whether someone is signed in, the deployment's hosts) are open; the API
 * itself answers to the key a `wso2-cloud` session carries, which VS Code
 * hands only to extensions the person allowed. `verify` is the provider's
 * check of the current key.
 *
 * Frozen: every consumer shares this object, and one that replaced
 * `connect` would see the keys the others pass to it.
 */
export function createExtensionGate(api: IWso2PlatformExtensionAPI, verify: (apiKey: unknown) => boolean): IWso2PlatformExtensionGate {
	return Object.freeze({
		apiVersion: api.apiVersion,
		isActive: () => api.isActive(),
		isLoggedIn: () => api.isLoggedIn(),
		getPlatformConfig: () => api.getPlatformConfig(),
		connect: (apiKey: string): IWso2PlatformExtensionAPI => {
			if (!verify(apiKey)) {
				throw new UnauthenticatedError("api_key_invalid");
			}
			return gateByKey(api, () => verify(apiKey));
		},
	});
}

/**
 * `target` as seen by the holder of one key: every function reached through
 * it, at any depth, first checks `isCurrent` and throws an
 * `UnauthenticatedError` (`api_key_invalid`) once the key has been replaced,
 * and a `subscribe*` method's callbacks stop being called then. The check is
 * made on every call, not once at connect, because the key changes with the
 * person, the organization and the window while the object is held.
 *
 * Nothing can be written through it: the object underneath is every
 * consumer's.
 */
export function gateByKey<T extends object>(target: T, isCurrent: () => boolean): T {
	const refuse = (): never => {
		throw new UnauthenticatedError("api_key_invalid");
	};
	return new Proxy(target, {
		get(object, property) {
			const value: unknown = Reflect.get(object, property, object);
			if (typeof value === "function") {
				const method = value as (...args: unknown[]) => unknown;
				const name = typeof property === "string" ? property : "";
				return (...args: unknown[]) => {
					if (!isCurrent()) {
						refuse();
					}
					return name.startsWith("subscribe") ? subscribeWhileCurrent(object, method, args, isCurrent) : Reflect.apply(method, object, args);
				};
			}
			return typeof value === "object" && value !== null ? gateByKey(value, isCurrent) : value;
		},
		set: () => false,
		defineProperty: () => false,
		deleteProperty: () => false,
		setPrototypeOf: () => false,
	});
}

/**
 * Subscribes with callbacks that are dropped, and the subscription ended,
 * the first time they would be called after the key changed: the holder has
 * been told through the session change and reconnects with the new key.
 */
function subscribeWhileCurrent(object: object, subscribe: (...args: unknown[]) => unknown, args: unknown[], isCurrent: () => boolean): unknown {
	let unsubscribe: (() => void) | undefined;
	let ended = false;
	const end = () => {
		ended = true;
		unsubscribe?.();
	};
	const wrapped = args.map((arg) =>
		typeof arg === "function"
			? (...values: unknown[]) => {
					if (isCurrent()) {
						return arg(...values);
					}
					end();
				}
			: arg,
	);
	const result = Reflect.apply(subscribe, object, wrapped);
	if (typeof result === "function") {
		unsubscribe = result as () => void;
		// A callback delivered while subscribing, after the key changed, ended it before this could.
		if (ended) {
			unsubscribe();
		}
	}
	return result;
}
