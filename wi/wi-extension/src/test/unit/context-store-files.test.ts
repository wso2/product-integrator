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
import { join } from "path";
import { pickContextFiles } from "../../cloud/context-file";

describe("pickContextFiles", () => {
	it("keeps one context file per repository, preferring .wso2 over the legacy .choreo", () => {
		const a = join("/repos", "a");
		const b = join("/repos", "b");
		const picked = pickContextFiles([
			join(a, ".choreo", "context.yaml"),
			join(a, ".wso2", "context.yaml"),
			join(b, ".choreo", "context.yaml"),
		]);
		assert.deepStrictEqual(picked.sort(), [join(a, ".wso2", "context.yaml"), join(b, ".choreo", "context.yaml")].sort());
	});

	it("keeps .wso2 whichever order the files come in", () => {
		const a = join("/repos", "a");
		assert.deepStrictEqual(pickContextFiles([join(a, ".wso2", "context.yaml"), join(a, ".choreo", "context.yaml")]), [join(a, ".wso2", "context.yaml")]);
	});
});
