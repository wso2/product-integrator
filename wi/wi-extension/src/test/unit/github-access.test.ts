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
import type { GitHubConnectOutcome } from "../../cloud/github-app";
import { endingConnect, untilGitHubConnectEnds } from "../../cloud/github-access";
import { fireWindowState } from "./mocks/vscode";

const quiet: GitHubConnectOutcome = {
	connected: () => undefined,
	noInstallationVisible: () => undefined,
	requested: () => undefined,
	ignored: () => undefined,
	cancelled: () => undefined,
	failed: () => undefined,
};

const settled = async (wait: Thenable<void>) => {
	let done = false;
	void Promise.resolve(wait).then(() => {
		done = true;
	});
	await new Promise((resolve) => setImmediate(resolve));
	return done;
};

describe("untilGitHubConnectEnds", () => {
	afterEach(() => fireWindowState(true));

	it("waits for the connect flow to end here, not for the window's focus", async () => {
		const wait = untilGitHubConnectEnds(true, async () => undefined);
		fireWindowState(false);
		fireWindowState(true);
		assert.strictEqual(await settled(wait), false);
		endingConnect(quiet).connected([]);
		assert.strictEqual(await settled(wait), true);
	});

	it("isn't ended by a GitHub return another window started", async () => {
		const wait = untilGitHubConnectEnds(true, async () => undefined);
		endingConnect(quiet).ignored("not-started");
		assert.strictEqual(await settled(wait), false);
		endingConnect(quiet).ignored("expired");
		assert.strictEqual(await settled(wait), true);
	});

	it("waits for the focus to come back once the page is open when GitHub does not return here", async () => {
		let open!: () => void;
		const wait = untilGitHubConnectEnds(false, () => new Promise<void>((resolve) => (open = resolve)));
		fireWindowState(false);
		fireWindowState(true);
		assert.strictEqual(await settled(wait), false);
		open();
		fireWindowState(false);
		assert.strictEqual(await settled(wait), false);
		fireWindowState(true);
		assert.strictEqual(await settled(wait), true);
	});

	it("ends on a failed browser open even when GitHub does not return here", async () => {
		const wait = untilGitHubConnectEnds(false, async () => undefined);
		endingConnect(quiet).failed("Couldn't open the browser for GitHub.");
		assert.strictEqual(await settled(wait), true);
	});

	it("fails with the start's error", async () => {
		await assert.rejects(Promise.resolve(untilGitHubConnectEnds(true, () => Promise.reject(new Error("lookup failed")))), /lookup failed/);
	});
});
