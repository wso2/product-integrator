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

import * as os from "os";
import * as path from "path";

export const getNormalizedPath = (filePath: string): string => {
    if (os.platform() === "win32") {
        return filePath.replace(/^\//, "").replace(/\//g, "\\");
    }
    return path.normalize(filePath);
};

export const isSamePath = (parent: string, sub: string): boolean => {
    let normalizedParent = getNormalizedPath(parent).toLowerCase();
    if (normalizedParent.endsWith("/")) {
        normalizedParent = normalizedParent.slice(0, -1);
    }

    let normalizedSub = getNormalizedPath(sub).toLowerCase();
    if (normalizedSub.endsWith("/")) {
        normalizedSub = normalizedSub.slice(0, -1);
    }

    return normalizedParent === normalizedSub;
};

export const isSubpath = (parent: string, sub: string): boolean => {
    let normalizedParent = getNormalizedPath(parent).toLowerCase();
    if (normalizedParent.endsWith("/")) {
        normalizedParent = normalizedParent.slice(0, -1);
    }

    let normalizedSub = getNormalizedPath(sub).toLowerCase();
    if (normalizedSub.endsWith("/")) {
        normalizedSub = normalizedSub.slice(0, -1);
    }

    if (normalizedParent === normalizedSub) {
        return true;
    }

    const relative = path.relative(normalizedParent, normalizedSub);
    return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};

export function withTimeout<T>(fn: () => Promise<T>, functionName: string, timeout: number): Promise<T> {
    return Promise.race([fn(), new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Function ${functionName} timed out`)), timeout))]);
}

export const parseJwt = (token: string): { iss: string } | null => {
    try {
        return JSON.parse(atob(token.split(".")[1]));
    } catch (e) {
        return null;
    }
};
