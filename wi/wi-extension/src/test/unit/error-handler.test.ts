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
import { window } from "vscode";
import { CancelledError, handleCloudError } from "../../cloud/platform/error-handler";

describe("handleCloudError", () => {
	const original = window.showErrorMessage;
	let shown: string[];

	beforeEach(() => {
		shown = [];
		(window as { showErrorMessage: unknown }).showErrorMessage = async (message: string) => {
			shown.push(message);
			return undefined;
		};
	});
	afterEach(() => {
		(window as { showErrorMessage: unknown }).showErrorMessage = original;
	});

	it("shows nothing for a cancelled picker", () => {
		handleCloudError(new CancelledError(), "Failed to create the integration", { prefix: true });
		assert.deepStrictEqual(shown, []);
	});

	it("leads with the action when asked, so the error says what failed", () => {
		handleCloudError(new Error("Selected directory is outside of the workspace."), "Failed to create the integration", { prefix: true });
		assert.deepStrictEqual(shown, ["Failed to create the integration: Selected directory is outside of the workspace."]);
	});

	it("shows the action alone when the error has no message", () => {
		handleCloudError(new Error(""), "Failed to create the integration", { prefix: true });
		assert.deepStrictEqual(shown, ["Failed to create the integration"]);
	});

	it("keeps the error's own message without the prefix option", () => {
		handleCloudError(new Error("Project not found"), "Failed to open the project");
		assert.deepStrictEqual(shown, ["Project not found"]);
	});
});
