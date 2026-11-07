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
import type { ExtensionContext } from "vscode";
import { STORE_NAMES, clearPreviousStoreVersions, storeKey, storeVersionInt } from "../../cloud/stores/store-utils";

class FakeMemento {
	public readonly values = new Map<string, unknown>();
	get(key: string) {
		return this.values.get(key);
	}
	async update(key: string, value: unknown) {
		if (value === undefined) {
			this.values.delete(key);
		} else {
			this.values.set(key, value);
		}
	}
	keys() {
		return Array.from(this.values.keys());
	}
}

describe("persisted store versions", () => {
	it("moved to version 6 with the platform client", () => {
		assert.strictEqual(storeVersionInt, 6);
		assert.strictEqual(storeKey("data-cache-zustand-storage"), "data-cache-zustand-storage-v6");
	});

	it("forgets every earlier version of every store, in both scopes, and keeps the current one", async () => {
		const globalState = new FakeMemento();
		const workspaceState = new FakeMemento();
		for (const name of STORE_NAMES) {
			for (const version of [4, 5, 6]) {
				await globalState.update(storeKey(name, version), `{"version":${version}}`);
				await workspaceState.update(storeKey(name, version), `{"version":${version}}`);
			}
		}
		await globalState.update("unrelated", "kept");

		await clearPreviousStoreVersions({ globalState, workspaceState } as unknown as ExtensionContext);

		assert.deepStrictEqual(globalState.keys().sort(), [...STORE_NAMES.map((name) => storeKey(name, 6)), "unrelated"].sort());
		assert.deepStrictEqual(workspaceState.keys().sort(), STORE_NAMES.map((name) => storeKey(name, 6)).sort());
	});
});
