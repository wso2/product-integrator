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

// L1 / U01 + U02: product-mode selection in this extension. The same WSO2_PRODUCT_MODE
// variable also drives the Ballerina extension, and the two MUST agree — a window where one
// side thinks it is Agent Builder and the other does not shows a mixed UI. The rule pinned
// here is the same one asserted on the Ballerina side: ONLY the exact `agent-builder` value
// selects Agent Builder, and every other value leaves the Integrator flavour.
//
// @wso2/wi-core is pure constants and enums, so this runs with no mocks.

import { PRODUCT_NAMES, ProductMode, VIEWS } from "@wso2/wi-core";
import { getExplorerViewId, getProductMode, getProductName, isAgentBuilderMode } from "./productMode";

const MODE = "WSO2_PRODUCT_MODE";
const NAME = "WSO2_PRODUCT_NAME";

function setEnv(key: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
}

describe("getProductMode", () => {
    const declaredMode = process.env[MODE];
    const declaredName = process.env[NAME];

    afterEach(() => {
        setEnv(MODE, declaredMode);
        setEnv(NAME, declaredName);
    });

    it("selects Agent Builder for the exact agent-builder value", () => {
        setEnv(MODE, "agent-builder");

        expect(getProductMode()).toBe(ProductMode.AGENT_BUILDER);
        expect(isAgentBuilderMode()).toBe(true);
    });

    it.each<[string, string | undefined]>([
        ["unset", undefined],
        ["empty", ""],
        ["the integrator value", "integrator"],
        ["upper-cased", "AGENT-BUILDER"],
        ["mixed-case", "Agent-Builder"],
        ["padded with whitespace", " agent-builder "],
        ["underscored", "agent_builder"],
        ["a prefix of the value", "agent"],
        ["the value with a suffix", "agent-builder-v2"],
        ["a boolean-looking value", "true"],
    ])("stays in the Integrator flavour when the variable is %s", (_label, value) => {
        setEnv(MODE, value);

        expect(getProductMode()).toBe(ProductMode.INTEGRATOR);
        expect(isAgentBuilderMode()).toBe(false);
    });

    // The variable is read on every call rather than captured at module load, so a value that
    // arrives late is still honoured.
    it("re-reads the variable on each call", () => {
        setEnv(MODE, "agent-builder");
        expect(isAgentBuilderMode()).toBe(true);

        setEnv(MODE, "integrator");
        expect(isAgentBuilderMode()).toBe(false);
    });

    describe("getProductName", () => {
        it.each<[string, string | undefined, string]>([
            ["Agent Builder", "agent-builder", PRODUCT_NAMES[ProductMode.AGENT_BUILDER]],
            ["the Integrator", undefined, PRODUCT_NAMES[ProductMode.INTEGRATOR]],
        ])("names %s after the active flavour", (_label, mode, expected) => {
            setEnv(MODE, mode);
            setEnv(NAME, undefined);

            expect(getProductName()).toBe(expected);
        });

        // The packaged product can rebrand itself without a code change, so an explicit name
        // wins over the one derived from the mode.
        it("prefers a name supplied by the product over the derived one", () => {
            setEnv(MODE, "agent-builder");
            setEnv(NAME, "WSO2 Something Else");

            expect(getProductName()).toBe("WSO2 Something Else");
        });

        it("falls back to the derived name when the supplied one is empty", () => {
            setEnv(MODE, "agent-builder");
            setEnv(NAME, "");

            expect(getProductName()).toBe(PRODUCT_NAMES[ProductMode.AGENT_BUILDER]);
        });
    });

    // L1 / U08 (explorer half). The project explorer is contributed once per activity-bar
    // container and only the active flavour's view is visible, so focusing the wrong id
    // silently focuses a hidden view and the tree never appears.
    describe("getExplorerViewId", () => {
        it.each<[string, string | undefined, string]>([
            ["Agent Builder's explorer", "agent-builder", VIEWS.AGENT_BUILDER_EXPLORER],
            ["the Integrator's explorer", undefined, VIEWS.INTEGRATOR_EXPLORER],
        ])("selects %s", (_label, mode, expected) => {
            setEnv(MODE, mode);

            expect(getExplorerViewId()).toBe(expected);
        });

        it("never returns the same id for both flavours", () => {
            expect(VIEWS.AGENT_BUILDER_EXPLORER).not.toBe(VIEWS.INTEGRATOR_EXPLORER);
        });
    });
});
