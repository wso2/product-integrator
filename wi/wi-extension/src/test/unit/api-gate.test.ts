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

import * as assert from "assert";
import { type IWso2PlatformExtensionAPI, isCloudError } from "@wso2/wso2-cloud-client";
import { createExtensionGate, gateByKey } from "../../cloud/api-gate";

/** Whether `error` is the refusal a stale or wrong key gets. */
const keyRefused = (error: unknown) => isCloudError(error) && error.code === "unauthenticated" && error.details.reason === "api_key_invalid";

/** A key holder: `rotate` replaces the key, as the provider does on sign-in, sign-out or an org switch. */
function keys() {
	let current = "key-1";
	return { verify: (candidate: unknown) => candidate === current, rotate: () => (current = `${current}+`) };
}

/** Enough of the API to show the gate's behaviour: a top-level call, a namespace, a subscription. */
function fakeApi() {
	const listeners = new Set<(loggedIn: boolean) => void>();
	const api = {
		apiVersion: 3,
		isActive: () => true,
		isLoggedIn: () => true,
		getPlatformConfig: () => ({ name: "prod" }),
		getAuthState: () => ({ status: "signed-in" }),
		projects: {
			calls: 0,
			list() {
				this.calls++;
				return ["shop"];
			},
		},
		subscribeIsLoggedIn: (callback: (loggedIn: boolean) => void) => {
			listeners.add(callback);
			return () => listeners.delete(callback);
		},
	};
	return { api, emit: (value: boolean) => [...listeners].forEach((listener) => listener(value)), listeners };
}

describe("cloud API key gate", () => {
	it("answers the open questions without a key", () => {
		const { api } = fakeApi();
		const gate = createExtensionGate(api as unknown as IWso2PlatformExtensionAPI, () => false);
		assert.strictEqual(gate.apiVersion, 3);
		assert.strictEqual(gate.isActive(), true);
		assert.strictEqual(gate.isLoggedIn(), true);
		assert.deepStrictEqual(gate.getPlatformConfig(), { name: "prod" });
	});

	it("refuses to connect with a wrong key", () => {
		const { api } = fakeApi();
		const gate = createExtensionGate(api as unknown as IWso2PlatformExtensionAPI, keys().verify);
		assert.throws(() => gate.connect("not-the-key"), keyRefused);
		assert.throws(() => gate.connect(undefined as unknown as string), keyRefused);
	});

	it("cannot be changed by the extensions that share it", () => {
		const { api } = fakeApi();
		const gate = createExtensionGate(api as unknown as IWso2PlatformExtensionAPI, keys().verify);
		assert.throws(() => {
			(gate as { connect: unknown }).connect = () => api;
		}, TypeError);
	});

	it("refuses a call once the key has changed", () => {
		const { api } = fakeApi();
		const key = keys();
		const connected = createExtensionGate(api as unknown as IWso2PlatformExtensionAPI, key.verify).connect("key-1");
		assert.deepStrictEqual(connected.getAuthState(), { status: "signed-in" });
		key.rotate();
		assert.throws(() => connected.getAuthState(), keyRefused);
	});

	it("gates the calls inside a namespace, on the namespace itself", () => {
		const { api } = fakeApi();
		const key = keys();
		const connected = gateByKey(api, () => key.verify("key-1"));
		const projects = connected.projects;
		assert.deepStrictEqual(projects.list(), ["shop"]);
		assert.strictEqual(api.projects.calls, 1, "`this` is the namespace");
		key.rotate();
		assert.throws(() => projects.list(), keyRefused);
		assert.throws(() => connected.projects.list(), keyRefused);
		assert.strictEqual(api.projects.calls, 1);
	});

	it("stops a subscription's callbacks once the key has changed, and ends it", () => {
		const { api, emit, listeners } = fakeApi();
		const key = keys();
		const connected = gateByKey(api, () => key.verify("key-1"));
		const seen: boolean[] = [];
		connected.subscribeIsLoggedIn((loggedIn) => seen.push(loggedIn));
		emit(true);
		key.rotate();
		emit(false);
		assert.deepStrictEqual(seen, [true]);
		assert.strictEqual(listeners.size, 0);
	});

	it("writes nothing through to the shared API", () => {
		const { api } = fakeApi();
		const connected = gateByKey(api, () => true);
		assert.throws(() => {
			(connected as { getAuthState: unknown }).getAuthState = () => "stolen";
		}, TypeError);
		assert.throws(() => {
			(connected.projects as { list: unknown }).list = (): string[] => [];
		}, TypeError);
		assert.deepStrictEqual(api.getAuthState(), { status: "signed-in" });
	});
});
