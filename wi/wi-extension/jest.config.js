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

// Fast unit tests: pure logic only, no VSCode and no extension host. The `test` script
// beside this one still runs the VSCode-hosted suite; these run in milliseconds and need
// nothing installed, so they are safe to gate every PR on.
//
// `vscode` is not a real package — it only exists inside the extension host — so any module
// that reaches it is mocked per test file rather than globally, which keeps each test honest
// about what it actually depends on.

module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            isolatedModules: true,
            tsconfig: { esModuleInterop: true, resolveJsonModule: true, strictNullChecks: false },
        }],
    },
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    moduleNameMapper: {
        // Resolve the sibling package from its SOURCE, not its built lib/ (which is
        // gitignored). Without this a fresh checkout would have to build wi-core before it
        // could run a unit test, which is a lot of ceremony for a pure constants package.
        '^@wso2/wi-core$': '<rootDir>/../wi-core/src/index.ts',
    },
    testMatch: ['**/?(*.)+(spec|test).ts'],
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
};
