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

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ActivityReporterDeps, startActivityReporter } from "./activity";

/** Collects what was reported and lets a test drive focus and the clock. */
function harness(options: { focused?: boolean; touch?: (path: string) => Promise<void> } = {}) {
	const state = {
		focused: options.focused ?? true,
		touched: [] as string[],
		errors: [] as string[],
		listeners: [] as (() => void)[],
		intervals: [] as (() => void)[],
		cleared: 0,
	};
	const deps: ActivityReporterDeps = {
		touch: async (path) => {
			state.touched.push(path);
			if (options.touch) {
				await options.touch(path);
			}
		},
		isFocused: () => state.focused,
		onFocusChange: (listener) => {
			state.listeners.push(listener);
			return () => {
				state.listeners = state.listeners.filter((item) => item !== listener);
			};
		},
		setInterval: (handler) => {
			state.intervals.push(handler);
			return 1 as unknown as NodeJS.Timeout;
		},
		clearInterval: () => {
			state.cleared += 1;
		},
		logError: (message) => {
			state.errors.push(message);
		},
	};
	return { state, deps, tick: () => state.intervals.forEach((h) => h()), focusChanged: () => state.listeners.forEach((l) => l()) };
}

describe("startActivityReporter", () => {
	it("reports immediately when the window already has focus", () => {
		const h = harness({ focused: true });
		startActivityReporter("/tmp/mark", h.deps);
		assert.deepEqual(h.state.touched, ["/tmp/mark"]);
	});

	// The mark's age is read as "how long since the tab was looked at", so writing
	// it while the window is in the background would report a user who is not there.
	it("does not report while the window is unfocused", () => {
		const h = harness({ focused: false });
		startActivityReporter("/tmp/mark", h.deps);
		h.tick();
		h.tick();
		assert.deepEqual(h.state.touched, []);
	});

	it("reports as soon as focus returns, without waiting for the interval", () => {
		const h = harness({ focused: false });
		startActivityReporter("/tmp/mark", h.deps);
		h.state.focused = true;
		h.focusChanged();
		assert.deepEqual(h.state.touched, ["/tmp/mark"]);
	});

	it("keeps reporting on each interval while focused", () => {
		const h = harness({ focused: true });
		startActivityReporter("/tmp/mark", h.deps);
		h.tick();
		h.tick();
		assert.equal(h.state.touched.length, 3);
	});

	// An unwritable path stays unwritable, and the interval is short enough that
	// logging every failure would bury the rest of the editor's output.
	it("reports a write failure once, not on every tick", async () => {
		const h = harness({
			focused: true,
			touch: async () => {
				throw new Error("read-only file system");
			},
		});
		startActivityReporter("/tmp/mark", h.deps);
		h.tick();
		h.tick();
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(h.state.errors.length, 1);
	});

	it("stops reporting and releases its subscriptions once stopped", () => {
		const h = harness({ focused: true });
		const reporter = startActivityReporter("/tmp/mark", h.deps);
		reporter.stop();
		h.tick();
		h.focusChanged();
		assert.deepEqual(h.state.touched, ["/tmp/mark"]);
		assert.equal(h.state.cleared, 1);
		assert.equal(h.state.listeners.length, 0);
	});
});
