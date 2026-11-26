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
import type { CloudBackend } from "../../cloud/backend/port";
import { CloudBackends } from "../../cloud/backend/registry";
import type { WIPlatform } from "../../cloud/platform/platform-client";

const backend = (platform: string) => ({ platform, label: platform, cacheNamespace: platform === "a" ? "" : `${platform}:` }) as CloudBackend;
const on = (platform: string) => ({ platform }) as WIPlatform;

describe("cloud backends", () => {
	it("hands out the backend of the platform in use, built once", () => {
		let builds = 0;
		const backends = new CloudBackends(
			new Map([
				["a", () => (builds++, backend("a"))],
				["b", () => backend("b")],
			]),
		);
		assert.strictEqual(backends.for(on("b")).platform, "b");
		assert.strictEqual(backends.for(on("a")), backends.for(on("a")));
		assert.strictEqual(builds, 1);
	});

	it("falls back to the first backend for a platform none is registered for", () => {
		const backends = new CloudBackends(new Map([["a", () => backend("a")]]));
		assert.strictEqual(backends.for(on("unknown")).platform, "a");
	});

	it("refuses to be built with none", () => {
		assert.throws(() => new CloudBackends(new Map()));
	});
});
