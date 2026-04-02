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

import type { ConnectionStatus, ProxyEnvelope, SocketAdapter, TransportMode } from './types';
import type { VSCodeCssVariables } from './vscodeCssVariables';
import { VSCODE_DARK_PLUS_CSS_VARIABLES, VSCODE_LIGHT_PLUS_CSS_VARIABLES } from './vscodeCssVariables';

export type { ConnectionStatus, ProxyEnvelope, SocketAdapter, TransportMode } from './types';
export {
  VSCODE_DARK_PLUS_CSS_VARIABLES,
  VSCODE_LIGHT_PLUS_CSS_VARIABLES
} from './vscodeCssVariables';
export type { VSCodeCssVariableName, VSCodeCssVariables } from './vscodeCssVariables';

const DEFAULT_WS_SERVER = '127.0.0.1';
const DEFAULT_WS_PORT = 8787;
const VS_CODE_API_UNAVAILABLE_ERROR = 'VS Code API is not available.';
const DEFAULT_SCROLLBAR_STYLE_ID = 'vscode-css-vars-scrollbar-style';

export const DEFAULT_VSCODE_CSS_VARIABLES: VSCodeCssVariables = {
  ...VSCODE_DARK_PLUS_CSS_VARIABLES
};

export type VSCodeCssTheme = 'dark' | 'light';

type ScrollbarStyleOptions = {
  styleId?: string;
  targetDocument?: Document;
};

const VSCODE_SCROLLBAR_STYLE_CSS = `
html {
  scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar,
*::-webkit-scrollbar {
  width: 12px;
  height: 12px;
  background: var(--vscode-scrollbar-background, transparent);
}

html::-webkit-scrollbar-track,
body::-webkit-scrollbar-track,
*::-webkit-scrollbar-track {
  background: var(--vscode-scrollbar-background, transparent);
}

html::-webkit-scrollbar-thumb,
body::-webkit-scrollbar-thumb,
*::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background);
  border-radius: 10px;
  border: 3px solid transparent;
  background-clip: content-box;
}

html::-webkit-scrollbar-thumb:hover,
body::-webkit-scrollbar-thumb:hover,
*::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-hoverBackground);
  background-clip: content-box;
}

html::-webkit-scrollbar-thumb:active,
body::-webkit-scrollbar-thumb:active,
*::-webkit-scrollbar-thumb:active {
  background: var(--vscode-scrollbarSlider-activeBackground);
  background-clip: content-box;
}
`;

export function injectVSCodeScrollbarStyles(options: ScrollbarStyleOptions = {}) {
  const targetDocument = options.targetDocument ?? document;
  const styleId = options.styleId ?? DEFAULT_SCROLLBAR_STYLE_ID;
  const existing = targetDocument.getElementById(styleId);
  if (existing instanceof HTMLStyleElement) {
    return existing;
  }

  const styleElement = targetDocument.createElement('style');
  styleElement.id = styleId;
  styleElement.textContent = VSCODE_SCROLLBAR_STYLE_CSS;
  targetDocument.head.appendChild(styleElement);
  return styleElement;
}

/**
 * Injects VS Code-style CSS custom properties into the current document.
 *
 * Useful when rendering the same webview app in a plain browser where VS Code
 * does not auto-inject `--vscode-*` variables.
 */
export function injectVSCodeCssVariables(
  overrides: VSCodeCssVariables = {},
  target: HTMLElement = document.documentElement,
  theme: VSCodeCssTheme = 'dark',
  injectScrollbarStyles = true
) {
  const themeDefaults = theme === 'light' ? VSCODE_LIGHT_PLUS_CSS_VARIABLES : VSCODE_DARK_PLUS_CSS_VARIABLES;

  const variables = {
    ...themeDefaults,
    ...overrides
  };

  for (const [name, value] of Object.entries(variables)) {
    if (value === undefined) {
      continue;
    }

    target.style.setProperty(name, value);
  }

  if (injectScrollbarStyles) {
    injectVSCodeScrollbarStyles({ targetDocument: target.ownerDocument ?? document });
  }

  return variables;
}

type WebSocketClientAdapterOptions<TRequest, TResponse> = {
  serialize?: (message: TRequest) => string;
  deserialize?: (payload: string) => TResponse;
  WebSocketImpl?: typeof WebSocket;
};

type VSCodeApi = {
  postMessage: (message: ProxyEnvelope) => void;
};

type ProxyMessageAdapterOptions<TRequest, TResponse> = {
  vscodeApi?: VSCodeApi;
  acquireVsCodeApi?: () => VSCodeApi | undefined;
  serialize?: (message: TRequest) => string;
  deserialize?: (payload: string) => TResponse;
  mapProxyError?: (message: string) => TResponse;
};

type WebviewTransportOptions<TRequest, TResponse> = {
  /** Transport mode. Defaults to `proxy`. */
  mode?: TransportMode;
  /** WebSocket host when `mode` is `websocket`. */
  server?: string;
  /** WebSocket port when `mode` is `websocket`. */
  port?: number;
  /** WebSocket protocol when `mode` is `websocket`. */
  protocol?: 'ws' | 'wss';
  /** Optional VS Code API accessor override (useful for tests). */
  acquireVsCodeApi?: () => VSCodeApi | undefined;
  /** Request serializer override. */
  serialize?: (message: TRequest) => string;
  /** Response deserializer override. */
  deserialize?: (payload: string) => TResponse;
  /** Maps proxy transport errors into typed response messages. */
  mapProxyError?: (message: string) => TResponse;
  /** Optional WebSocket implementation override (useful for tests). */
  WebSocketImpl?: typeof WebSocket;
};

type WebviewTransportAdapter<TRequest, TResponse> = SocketAdapter<TRequest, TResponse> & {
  getMode: () => TransportMode;
  switchMode: (mode: TransportMode) => void;
};

type RpcRequestEnvelope = {
  kind: 'rpc.request';
  id: string;
  payload: string;
};

type RpcResponseEnvelope = {
  kind: 'rpc.response';
  id: string;
  payload: string;
};

let cachedVSCodeApi: VSCodeApi | undefined;
let rpcCounter = 0;

function nextRpcId() {
  rpcCounter += 1;
  return `rpc-${Date.now()}-${rpcCounter}`;
}

function tryParseRpcResponse(payload: string): RpcResponseEnvelope | undefined {
  try {
    const parsed = JSON.parse(payload) as Partial<RpcResponseEnvelope>;
    if (parsed.kind === 'rpc.response' && typeof parsed.id === 'string' && typeof parsed.payload === 'string') {
      return parsed as RpcResponseEnvelope;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function buildWebSocketUrl(options: WebviewTransportOptions<unknown, unknown>) {
  const protocol = options.protocol ?? 'ws';
  const server = options.server ?? DEFAULT_WS_SERVER;
  const port = options.port ?? DEFAULT_WS_PORT;
  return `${protocol}://${server}:${port}`;
}

function resolveVSCodeApi(acquire: (() => VSCodeApi | undefined) | undefined) {
  if (cachedVSCodeApi) {
    return cachedVSCodeApi;
  }

  const api = acquire?.();
  if (api) {
    cachedVSCodeApi = api;
  }

  return api;
}

function createWebSocketClientAdapter<TRequest, TResponse>(
  url: string,
  options: WebSocketClientAdapterOptions<TRequest, TResponse> = {}
): SocketAdapter<TRequest, TResponse> {
  const serialize = options.serialize ?? ((message: TRequest) => JSON.stringify(message));
  const deserialize = options.deserialize ?? ((payload: string) => JSON.parse(payload) as TResponse);
  const WebSocketCtor = options.WebSocketImpl ?? WebSocket;
  const listeners = new Set<(message: TResponse) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const pendingRequests = new Map<string, {
    resolve: (response: TResponse) => void;
    reject: (error: Error) => void;
    state: 'queued' | 'sent';
  }>();
  const outboundQueue: Array<{ payload: string; requestId?: string }> = [];
  const reconnectBaseDelayMs = 1000;
  const reconnectMaxDelayMs = 10000;

  let ws: InstanceType<typeof WebSocketCtor> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempts = 0;
  let disposed = false;
  let currentStatus: ConnectionStatus = 'connecting';

  const emitStatus = (status: ConnectionStatus) => {
    currentStatus = status;
    statusListeners.forEach((listener) => listener(status));
  };

  const rejectSentRequests = (message: string) => {
    for (const [id, pending] of pendingRequests) {
      if (pending.state === 'sent') {
        pending.reject(new Error(message));
        pendingRequests.delete(id);
      }
    }
  };

  const flushOutboundQueue = () => {
    if (!ws || ws.readyState !== WebSocketCtor.OPEN) {
      return;
    }

    while (outboundQueue.length > 0) {
      const next = outboundQueue.shift();
      if (!next) {
        break;
      }

      if (next.requestId) {
        const pending = pendingRequests.get(next.requestId);
        if (!pending) {
          continue;
        }
        pending.state = 'sent';
      }

      ws.send(next.payload);
    }
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer !== undefined) {
      return;
    }

    const delay = Math.min(reconnectBaseDelayMs * Math.pow(2, reconnectAttempts), reconnectMaxDelayMs);
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
  };

  const connect = () => {
    if (disposed) {
      return;
    }

    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }

    if (ws && (ws.readyState === WebSocketCtor.CONNECTING || ws.readyState === WebSocketCtor.OPEN)) {
      return;
    }

    emitStatus('connecting');
    const nextSocket = new WebSocketCtor(url);
    ws = nextSocket;

    nextSocket.addEventListener('open', () => {
      if (ws !== nextSocket || disposed) {
        nextSocket.close();
        return;
      }

      reconnectAttempts = 0;
      emitStatus('open');
      flushOutboundQueue();
    });

    nextSocket.addEventListener('close', () => {
      if (ws !== nextSocket) {
        return;
      }

      ws = undefined;
      emitStatus('closed');
      rejectSentRequests('WebSocket connection closed before a response was received.');
      scheduleReconnect();
    });

    nextSocket.addEventListener('error', () => {
      if (ws !== nextSocket) {
        return;
      }

      emitStatus('error');
    });

    nextSocket.addEventListener('message', (event) => {
      if (ws !== nextSocket) {
        return;
      }

      const payload = typeof event.data === 'string' ? event.data : String(event.data);
      const rpcResponse = tryParseRpcResponse(payload);
      if (rpcResponse) {
        const resolvePending = pendingRequests.get(rpcResponse.id);
        if (resolvePending) {
          pendingRequests.delete(rpcResponse.id);
          resolvePending.resolve(deserialize(rpcResponse.payload));
        }
        return;
      }

      const parsed = deserialize(payload);
      listeners.forEach((listener) => listener(parsed));
    });
  };

  const queueOrSend = (payload: string, requestId?: string) => {
    if (disposed) {
      return;
    }

    if (ws && ws.readyState === WebSocketCtor.OPEN) {
      if (requestId) {
        const pending = pendingRequests.get(requestId);
        if (pending) {
          pending.state = 'sent';
        }
      }
      ws.send(payload);
      return;
    }

    outboundQueue.push({ payload, requestId });

    if (!ws || ws.readyState === WebSocketCtor.CLOSING || ws.readyState === WebSocketCtor.CLOSED) {
      connect();
    }
  };

  connect();

  return {
    send(message) {
      queueOrSend(serialize(message));
    },
    request(message) {
      return new Promise<TResponse>((resolve, reject) => {
        const id = nextRpcId();
        pendingRequests.set(id, { resolve, reject, state: 'queued' });

        const envelope: RpcRequestEnvelope = {
          kind: 'rpc.request',
          id,
          payload: serialize(message)
        };

        queueOrSend(JSON.stringify(envelope), id);
      });
    },
    close() {
      disposed = true;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      outboundQueue.length = 0;
      rejectSentRequests('WebSocket transport was closed.');
      for (const [, pending] of pendingRequests) {
        pending.reject(new Error('WebSocket transport was closed.'));
      }
      pendingRequests.clear();
      ws?.close();
      ws = undefined;
    },
    subscribe(listener, onStatus) {
      listeners.add(listener);
      statusListeners.add(onStatus);
      onStatus(currentStatus);
      return () => {
        listeners.delete(listener);
        statusListeners.delete(onStatus);
      };
    }
  };
}

function createProxyMessageAdapter<TRequest, TResponse>(
  options: ProxyMessageAdapterOptions<TRequest, TResponse> = {}
): SocketAdapter<TRequest, TResponse> {
  const globalApi = globalThis as { acquireVsCodeApi?: () => VSCodeApi | undefined };
  const acquireVsCodeApi = options.acquireVsCodeApi ?? globalApi.acquireVsCodeApi;
  const vscode = options.vscodeApi ?? resolveVSCodeApi(acquireVsCodeApi);

  if (!vscode) {
    throw new Error(VS_CODE_API_UNAVAILABLE_ERROR);
  }

  const serialize = options.serialize ?? ((message: TRequest) => JSON.stringify(message));
  const deserialize = options.deserialize ?? ((payload: string) => JSON.parse(payload) as TResponse);

  const listeners = new Set<(message: TResponse) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const pendingRequests = new Map<string, (response: TResponse) => void>();
  const emitStatus = (status: ConnectionStatus) => statusListeners.forEach((listener) => listener(status));

  const handler = (event: MessageEvent<ProxyEnvelope>) => {
    const message = event.data;

    switch (message.channel) {
      case 'ws-proxy.open':
        emitStatus('open');
        break;
      case 'ws-proxy.close':
        emitStatus('closed');
        break;
      case 'ws-proxy.error':
        emitStatus('error');
        if (options.mapProxyError) {
          const mapped = options.mapProxyError(message.message);
          listeners.forEach((listener) => listener(mapped));
        }
        break;
      case 'ws-proxy.message':
        {
          const rpcResponse = tryParseRpcResponse(message.payload);
          if (rpcResponse) {
            const resolvePending = pendingRequests.get(rpcResponse.id);
            if (resolvePending) {
              pendingRequests.delete(rpcResponse.id);
              resolvePending(deserialize(rpcResponse.payload));
            }
            break;
          }

          listeners.forEach((listener) => listener(deserialize(message.payload)));
        }
        break;
      default:
        break;
    }
  };

  window.addEventListener('message', handler);
  vscode.postMessage({ channel: 'ws-proxy.connect' });

  return {
    send(message) {
      vscode.postMessage({ channel: 'ws-proxy.send', payload: serialize(message) });
    },
    request(message) {
      return new Promise<TResponse>((resolve) => {
        const id = nextRpcId();
        pendingRequests.set(id, resolve);
        const envelope: RpcRequestEnvelope = {
          kind: 'rpc.request',
          id,
          payload: serialize(message)
        };

        vscode.postMessage({
          channel: 'ws-proxy.send',
          payload: JSON.stringify(envelope)
        });
      });
    },
    close() {
      pendingRequests.clear();
      vscode.postMessage({ channel: 'ws-proxy.disconnect' });
      window.removeEventListener('message', handler);
    },
    subscribe(listener, onStatus) {
      listeners.add(listener);
      statusListeners.add(onStatus);
      onStatus('connecting');
      return () => {
        listeners.delete(listener);
        statusListeners.delete(onStatus);
      };
    }
  };
}

function createAdapterForMode<TRequest, TResponse>(
  options: WebviewTransportOptions<TRequest, TResponse>,
  mode: TransportMode
): SocketAdapter<TRequest, TResponse> {
  const globalApi = globalThis as { acquireVsCodeApi?: () => VSCodeApi | undefined };
  const acquireVsCodeApi = options.acquireVsCodeApi ?? globalApi.acquireVsCodeApi;
  const vscodeApi = mode !== 'websocket' ? resolveVSCodeApi(acquireVsCodeApi) : undefined;

  if (mode === 'proxy') {
    return createProxyMessageAdapter<TRequest, TResponse>({
      vscodeApi,
      acquireVsCodeApi,
      serialize: options.serialize,
      deserialize: options.deserialize,
      mapProxyError: options.mapProxyError
    });
  }

  const resolvedUrl = buildWebSocketUrl(options as WebviewTransportOptions<unknown, unknown>);

  return createWebSocketClientAdapter<TRequest, TResponse>(resolvedUrl, {
    serialize: options.serialize,
    deserialize: options.deserialize,
    WebSocketImpl: options.WebSocketImpl
  });
}

/**
 * Creates the webview transport adapter.
 *
 * The returned adapter supports:
 * - `send` for fire-and-forget messages
 * - `request` for correlated request/response
 * - `subscribe` for pushed messages and status updates
 * - `getMode` / `switchMode` for runtime transport mode switching
 */
export function createWebviewTransportAdapter<TRequest, TResponse>(
  options: WebviewTransportOptions<TRequest, TResponse> = {}
): WebviewTransportAdapter<TRequest, TResponse> {
  // Track the currently active transport so callers can switch modes at runtime
  // without changing consumer code.
  let currentMode: TransportMode = options.mode ?? 'proxy';
  const listeners = new Set<(message: TResponse) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();

  let adapter = createAdapterForMode<TRequest, TResponse>(options, currentMode);
  let unsubscribe = adapter.subscribe(
    (message) => {
      listeners.forEach((listener) => listener(message));
    },
    (status) => {
      statusListeners.forEach((listener) => listener(status));
    }
  );

  return {
    send(message) {
      adapter.send(message);
    },
    request(message) {
      return adapter.request(message);
    },
    close() {
      unsubscribe();
      adapter.close();
      listeners.clear();
      statusListeners.clear();
    },
    subscribe(listener, onStatus) {
      listeners.add(listener);
      statusListeners.add(onStatus);
      return () => {
        listeners.delete(listener);
        statusListeners.delete(onStatus);
      };
    },
    getMode() {
      return currentMode;
    },
    switchMode(mode) {
      if (mode === currentMode) {
        return;
      }

      unsubscribe();
      adapter.close();
      currentMode = mode;
      adapter = createAdapterForMode<TRequest, TResponse>(options, currentMode);
      unsubscribe = adapter.subscribe(
        (message) => {
          listeners.forEach((listener) => listener(message));
        },
        (status) => {
          statusListeners.forEach((listener) => listener(status));
        }
      );
    }
  };
}
