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
import { watchContextFiles } from "../../cloud/context-watcher";

type Listener = () => void;

/** File system watchers whose events the test fires by glob. */
function fakeWatchers() {
	const listeners: Record<string, Record<string, Listener[]>> = {};
	let disposed = 0;
	const on = (glob: string, event: string) => (listener: Listener) => {
		((listeners[glob] ??= {})[event] ??= []).push(listener);
		return { dispose: () => disposed++ };
	};
	const createFileSystemWatcher = (glob: string) =>
		({
			onDidCreate: on(glob, "create"),
			onDidChange: on(glob, "change"),
			onDidDelete: on(glob, "delete"),
			dispose: () => disposed++,
		}) as never;
	const fire = (glob: string, event: string) => {
		for (const listener of listeners[glob]?.[event] ?? []) {
			listener();
		}
	};
	return { createFileSystemWatcher, fire, disposed: () => disposed, listeners };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("context file watcher", () => {
	it("reads the context again once a burst of changes settles", async () => {
		const watchers = fakeWatchers();
		let refreshes = 0;
		const watch = watchContextFiles({ ...watchers, isLoggedIn: () => true, refresh: () => refreshes++, delayMs: 10 });
		watchers.fire("**/.wso2/context.yaml", "create");
		watchers.fire("**/.wso2/context.yaml", "change");
		watchers.fire("**/.wso2/context.yaml", "delete");
		await settle();
		assert.strictEqual(refreshes, 1);
		watch.dispose();
	});

	it("reads it again when the whole .wso2 folder is deleted", async () => {
		const watchers = fakeWatchers();
		let refreshes = 0;
		const watch = watchContextFiles({ ...watchers, isLoggedIn: () => true, refresh: () => refreshes++, delayMs: 10 });
		watchers.fire("**/.wso2", "delete");
		await settle();
		assert.strictEqual(refreshes, 1);
		watch.dispose();
	});

	it("leaves the context alone while signed out", async () => {
		const watchers = fakeWatchers();
		let refreshes = 0;
		const watch = watchContextFiles({ ...watchers, isLoggedIn: () => false, refresh: () => refreshes++, delayMs: 10 });
		watchers.fire("**/.wso2/context.yaml", "change");
		await settle();
		assert.strictEqual(refreshes, 0);
		watch.dispose();
	});

	it("stops, pending read included, when disposed", async () => {
		const watchers = fakeWatchers();
		let refreshes = 0;
		const watch = watchContextFiles({ ...watchers, isLoggedIn: () => true, refresh: () => refreshes++, delayMs: 10 });
		watchers.fire("**/.wso2/context.yaml", "change");
		watch.dispose();
		await settle();
		assert.strictEqual(refreshes, 0);
		assert.strictEqual(watchers.disposed(), 6);
	});
});
