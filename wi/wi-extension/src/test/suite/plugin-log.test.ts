import * as assert from "assert";
import { formatInstalledPluginLogLines } from "../../cloud/plugin-log";

describe("plugin log formatting", () => {
	it("sorts installed plugins by id and includes versions", () => {
		const lines = formatInstalledPluginLogLines([
			{ id: "wso2.integrator", packageJSON: { version: "0.2.2" } },
			{ id: "ms-python.python", packageJSON: { version: "2026.1.0" } },
			{ id: "redhat.java", packageJSON: { version: "1.42.0" } },
		]);

		assert.deepStrictEqual(lines, [
			"Installed plugins:",
			"ms-python.python: 2026.1.0",
			"redhat.java: 1.42.0",
			"wso2.integrator: 0.2.2",
		]);
	});

	it("handles an empty plugin list", () => {
		const lines = formatInstalledPluginLogLines([]);

		assert.deepStrictEqual(lines, [
			"Installed plugins:",
			"(none)",
		]);
	});
});
