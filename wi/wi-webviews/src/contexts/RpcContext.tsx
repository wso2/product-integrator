/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { ReactNode, useState, useEffect } from 'react';
import { RpcClient } from '@wso2/wi-rpc-client';
import { ViewType, WebviewContext as WIWebviewContext } from '@wso2/wi-core';

export interface VisualizerContext {
    rpcClient: RpcClient;
    webviewContext?: WIWebviewContext;
}

export const Context = React.createContext<VisualizerContext | undefined>(undefined);

export function WebviewContextProvider({ children }: { children: ReactNode }) {
    const [rpcClient] = useState(() => new RpcClient());
    const [webviewContext, setWebviewContext] = useState<WIWebviewContext | undefined>();

    useEffect(() => {
        // Get initial context
        rpcClient.getMainRpcClient().getWebviewContext().then((context) => {
            setWebviewContext(context);
        });

        // Listen to state changes
        rpcClient.onStateChanged((context) => {
            setWebviewContext(context);
        });
    }, [rpcClient]);

    return (
        <Context.Provider value={{ rpcClient, webviewContext }}>
            {children}
        </Context.Provider>
    );
}

export function useVisualizerContext(): VisualizerContext {
    const context = React.useContext(Context);
    if (!context) {
        throw new Error('useVisualizerContext must be used within VisualizerContextProvider');
    }
    return context;
}
