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

export type ProxyEnvelope =
  | { channel: 'ws-proxy.connect' }
  | { channel: 'ws-proxy.disconnect' }
  | { channel: 'ws-proxy.send'; payload: string }
  | { channel: 'ws-proxy.open' }
  | { channel: 'ws-proxy.close' }
  | { channel: 'ws-proxy.message'; payload: string }
  | { channel: 'ws-proxy.error'; message: string };

/** Connection lifecycle state emitted by adapters. */
export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

/** Transport mode used by webview and extension bridge layers. */
export type TransportMode = 'proxy' | 'websocket';

/**
 * Bidirectional adapter contract used by webview clients.
 *
 * - `send` for fire-and-forget messages
 * - `request` for correlated request/response flows
 * - `subscribe` for push events and connection status updates
 */
export type SocketAdapter<TRequest, TResponse> = {
  send: (message: TRequest) => void;
  request: (message: TRequest) => Promise<TResponse>;
  close: () => void;
  subscribe: (
    listener: (message: TResponse) => void,
    onStatus: (status: ConnectionStatus) => void
  ) => () => void;
};
