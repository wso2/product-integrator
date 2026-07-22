/* eslint-disable @typescript-eslint/no-explicit-any */

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

// Webpack Module Federation runtime globals, injected by ModuleFederationPlugin.
declare const __webpack_init_sharing__: (scope: string) => Promise<void>;
declare const __webpack_share_scopes__: { default: unknown };

interface FederationContainer {
    init: (shareScope: unknown) => Promise<void>;
    get: (module: string) => Promise<() => any>;
}

const scriptPromises = new Map<string, Promise<void>>();
const initializedContainers = new Map<string, Promise<FederationContainer>>();
let sharingInitialized: Promise<void> | undefined;

function loadScript(url: string): Promise<void> {
    let existing = scriptPromises.get(url);
    if (existing) {
        return existing;
    }
    existing = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.type = "text/javascript";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            scriptPromises.delete(url);
            reject(new Error(`Failed to load remote script: ${url}`));
        };
        document.head.appendChild(script);
    });
    scriptPromises.set(url, existing);
    return existing;
}

async function getContainer(remoteUrl: string, globalName: string): Promise<FederationContainer> {
    let existing = initializedContainers.get(globalName);
    if (existing) {
        return existing;
    }
    existing = (async () => {
        await loadScript(remoteUrl);
        if (!sharingInitialized) {
            sharingInitialized = __webpack_init_sharing__("default");
        }
        await sharingInitialized;
        const container = (window as any)[globalName] as FederationContainer | undefined;
        if (!container) {
            throw new Error(`Remote container "${globalName}" was not found after loading ${remoteUrl}.`);
        }
        // Wire the remote to the host's shared scope so React stays a singleton.
        await container.init(__webpack_share_scopes__.default);
        return container;
    })();
    initializedContainers.set(globalName, existing);
    return existing;
}

/**
 * Dynamically loads an exposed module from a federated remote served at runtime.
 *
 * @param remoteUrl  Absolute URL of the remote's `remoteEntry.js`.
 * @param globalName Federation container name (the remote's `name`).
 * @param moduleName Exposed module key, e.g. `"./EmbeddedBIProjectForm"`.
 */
export async function loadRemoteModule<T = any>(
    remoteUrl: string,
    globalName: string,
    moduleName: string,
): Promise<T> {
    const container = await getContainer(remoteUrl, globalName);
    const factory = await container.get(moduleName);
    return factory() as T;
}
