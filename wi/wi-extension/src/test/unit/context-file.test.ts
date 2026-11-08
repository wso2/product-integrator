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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as yaml from "js-yaml";
import { contextFilePath, findContextFile, legacyContextFilePath, linkContext, localContextEntry, readContextEntries, unlinkContext, writeContextEntries } from "../../cloud/context-file";

describe("context file (.wso2/context.yaml)", () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "wi-context-"));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("reads the legacy .choreo v1 list and writes the v2 document under .wso2, leaving .choreo alone", () => {
		mkdirSync(join(root, ".choreo"));
		const legacy = legacyContextFilePath(root);
		writeFileSync(legacy, yaml.dump([{ org: "acme", project: "orders" }]));
		assert.strictEqual(findContextFile(root), legacy);
		assert.deepStrictEqual(readContextEntries(root), [{ org: "acme", project: "orders" }]);

		linkContext(root, { org: "acme", project: "orders", env: "development" });

		const written = yaml.load(readFileSync(contextFilePath(root), "utf8")) as { version: number; contexts: unknown[] };
		assert.strictEqual(written.version, 2);
		assert.deepStrictEqual(written.contexts, [{ org: "acme", project: "orders", env: "development" }]);
		assert.strictEqual(readFileSync(legacy, "utf8"), yaml.dump([{ org: "acme", project: "orders" }]), "the legacy file is not rewritten");
		assert.strictEqual(findContextFile(root), contextFilePath(root), ".wso2 wins once it exists");
	});

	it("links a second project and unlinks the first", () => {
		linkContext(root, { org: "acme", project: "orders" });
		linkContext(root, { org: "acme", project: "billing" });
		assert.deepStrictEqual(
			readContextEntries(root).map((entry) => entry.project),
			["orders", "billing"],
		);
		unlinkContext([root], { org: "acme", project: "orders" });
		assert.deepStrictEqual(
			readContextEntries(root).map((entry) => entry.project),
			["billing"],
		);
		unlinkContext([root], { org: "acme", project: "billing" });
		assert.ok(!existsSync(contextFilePath(root)), "an empty document is removed");
		assert.ok(!existsSync(join(root, ".wso2")), "and so is the directory it left empty");
	});

	it("unlinks a repository that only has the legacy .choreo file, which an empty document then shadows", () => {
		mkdirSync(join(root, ".choreo"));
		writeFileSync(legacyContextFilePath(root), yaml.dump([{ org: "acme", project: "orders" }]));

		unlinkContext([root], { org: "acme", project: "orders" });

		assert.deepStrictEqual(readContextEntries(root), [], "the legacy entry is not read again");
		assert.strictEqual(findContextFile(root), contextFilePath(root));
		assert.ok(existsSync(legacyContextFilePath(root)), "the legacy file is left alone");
	});

	it("updates an entry in place instead of duplicating it", () => {
		linkContext(root, { org: "acme", project: "orders" });
		linkContext(root, { org: "acme", project: "orders", env: "staging" });
		assert.deepStrictEqual(readContextEntries(root), [{ org: "acme", project: "orders", env: "staging" }]);
	});

	it("finds the entry marked local, which a deploy turns into a project", () => {
		writeContextEntries(root, [
			{ org: "acme", project: "orders" },
			{ org: "acme", project: "new-thing", local: true },
		]);
		assert.deepStrictEqual(localContextEntry(root), { org: "acme", project: "new-thing", local: true });
	});

	it("treats an unreadable file as no context", () => {
		mkdirSync(join(root, ".wso2"));
		writeFileSync(contextFilePath(root), "::: not yaml {");
		assert.deepStrictEqual(readContextEntries(root), []);
	});
});
