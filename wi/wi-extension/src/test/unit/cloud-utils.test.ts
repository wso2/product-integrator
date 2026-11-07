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
import { createConnectionConfig, deleteLocalConnectionConfig } from "../../cloud/cloud-utils";

interface ComponentYaml {
	schemaVersion?: string;
	dependencies?: { connectionReferences?: { name: string; resourceRef: string }[] };
}

const readComponentYaml = (dir: string, configDir = ".wso2"): ComponentYaml => yaml.load(readFileSync(join(dir, configDir, "component.yaml"), "utf8")) as ComponentYaml;

describe("local connection references (.wso2/component.yaml)", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "wi-component-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("creates the file at schema 1.2 with the reference", async () => {
		const written = await createConnectionConfig({ componentDir: dir, name: "orders-db", resourceRef: "database:orders-db" });
		assert.strictEqual(written, join(dir, ".wso2", "component.yaml"));
		assert.deepStrictEqual(readComponentYaml(dir), { schemaVersion: "1.2", dependencies: { connectionReferences: [{ name: "orders-db", resourceRef: "database:orders-db" }] } });
	});

	it("keeps the existing file's other content, replaces a same-named reference and removes the old config files", async () => {
		mkdirSync(join(dir, ".wso2"));
		writeFileSync(join(dir, ".wso2", "endpoints.yaml"), "version: 0.1\n");
		writeFileSync(
			join(dir, ".wso2", "component.yaml"),
			yaml.dump({ schemaVersion: "1.1", endpoints: [{ name: "api" }], dependencies: { connectionReferences: [{ name: "orders-db", resourceRef: "old" }] } }),
		);
		await createConnectionConfig({ componentDir: dir, name: "orders-db", resourceRef: "database:orders-db" });
		await createConnectionConfig({ componentDir: dir, name: "inventory", resourceRef: "service:inventory" });
		const content = readComponentYaml(dir) as ComponentYaml & { endpoints: unknown[] };
		assert.strictEqual(content.schemaVersion, "1.2");
		assert.deepStrictEqual(content.endpoints, [{ name: "api" }]);
		assert.deepStrictEqual(content.dependencies?.connectionReferences, [
			{ name: "orders-db", resourceRef: "database:orders-db" },
			{ name: "inventory", resourceRef: "service:inventory" },
		]);
		assert.ok(!existsSync(join(dir, ".wso2", "endpoints.yaml")));
	});

	it("writes into a legacy .choreo directory when that is what the integration has", async () => {
		mkdirSync(join(dir, ".choreo"));
		writeFileSync(join(dir, ".choreo", "component.yaml"), yaml.dump({ schemaVersion: "1.2" }));
		await createConnectionConfig({ componentDir: dir, name: "orders-db", resourceRef: "database:orders-db" });
		assert.ok(!existsSync(join(dir, ".wso2")));
		assert.deepStrictEqual(readComponentYaml(dir, ".choreo").dependencies?.connectionReferences, [{ name: "orders-db", resourceRef: "database:orders-db" }]);
	});

	it("deletes a reference by name and tolerates a missing file", async () => {
		await createConnectionConfig({ componentDir: dir, name: "orders-db", resourceRef: "database:orders-db" });
		await createConnectionConfig({ componentDir: dir, name: "inventory", resourceRef: "service:inventory" });
		deleteLocalConnectionConfig({ componentDir: dir, connectionName: "orders-db" });
		assert.deepStrictEqual(readComponentYaml(dir).dependencies?.connectionReferences, [{ name: "inventory", resourceRef: "service:inventory" }]);
		deleteLocalConnectionConfig({ componentDir: join(dir, "nowhere"), connectionName: "x" });
	});
});
