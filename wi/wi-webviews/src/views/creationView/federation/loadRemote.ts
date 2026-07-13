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

// Webpack Module Federation runtime globals (provided by ModuleFederationPlugin
// in this host build).
declare const __webpack_init_sharing__: (scope: string) => Promise<void>;
declare const __webpack_share_scopes__: { default: unknown };

interface FederationContainer {
    init(shareScope: unknown): Promise<void>;
    get(module: string): Promise<() => unknown>;
}

/** remoteEntry URL → loaded-and-initialized container. */
const containerPromises = new Map<string, Promise<FederationContainer>>();

function injectRemoteEntry(remoteUrl: string, containerName: string): Promise<FederationContainer> {
    return new Promise<FederationContainer>((resolve, reject) => {
        const existing = (globalThis as Record<string, unknown>)[containerName] as FederationContainer | undefined;
        if (existing) {
            resolve(existing);
            return;
        }
        const script = document.createElement("script");
        script.src = remoteUrl;
        script.async = true;
        script.onload = () => {
            const container = (globalThis as Record<string, unknown>)[containerName] as FederationContainer | undefined;
            if (container) {
                resolve(container);
            } else {
                reject(new Error(`Remote container "${containerName}" was not defined by ${remoteUrl}`));
            }
        };
        script.onerror = () => reject(new Error(`Failed to load remote entry: ${remoteUrl}`));
        document.head.appendChild(script);
    });
}

/**
 * Dynamically loads a Module Federation remote and returns one of its exposed
 * modules. The container is initialized against this host's default share
 * scope, so `singleton` shared deps (react/react-dom) resolve to the host copy.
 */
export async function loadRemoteModule<T>(remoteUrl: string, containerName: string, exposedModule: string): Promise<T> {
    let containerPromise = containerPromises.get(remoteUrl);
    if (!containerPromise) {
        containerPromise = (async () => {
            const container = await injectRemoteEntry(remoteUrl, containerName);
            await __webpack_init_sharing__("default");
            await container.init(__webpack_share_scopes__.default);
            return container;
        })();
        containerPromises.set(remoteUrl, containerPromise);
    }
    const container = await containerPromise;
    const factory = await container.get(exposedModule);
    return factory() as T;
}
