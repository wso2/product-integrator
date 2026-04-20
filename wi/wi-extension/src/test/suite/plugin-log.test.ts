import * as assert from "assert";
import { formatInstalledPluginLogLines } from "../../cloud/plugin-log";

describe("plugin log formatting", () => {
	it("logs only WSO2 extensions using the old About-popup names", () => {
		const lines = formatInstalledPluginLogLines([
			{ id: "wso2.integrator", packageJSON: { version: "0.2.2" } },
			{ id: "ms-python.python", packageJSON: { version: "2026.1.0" } },
			{ id: "redhat.java", packageJSON: { version: "1.42.0" } },
			{ id: "wso2.wso2-platform", packageJSON: { version: "1.0.23" } },
			{ id: "wso2.micro-integrator", packageJSON: { version: "3.1.526041009" } },
		]);

		assert.deepStrictEqual(lines, [
			"Installed plugins:",
			"integrator: 0.2.2",
			"micro-integrator: 3.1.526041009",
			"wso2-platform: 1.0.23",
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
