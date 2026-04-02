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

type ActionRequest = { action: string };

type MaybePromise<T> = T | Promise<T>;
type MaybeResponse<T> = T | void;

type RequestHandler<TRequest extends ActionRequest, TResponse, TAction extends TRequest['action']> = (
  request: Extract<TRequest, { action: TAction }>
) => MaybePromise<MaybeResponse<TResponse>>;

type RouterOptions<TRequest extends ActionRequest, TResponse> = {
  /** Optional fallback invoked when no handler is registered for `request.action`. */
  onUnknownAction?: (request: TRequest) => MaybePromise<MaybeResponse<TResponse>>;
};

/**
 * Creates a typed action router for request dispatch.
 *
 * This utility is useful for keeping extension-side request handling modular,
 * especially as action counts grow.
 */
export function createRequestRouter<TRequest extends ActionRequest, TResponse>(
  options: RouterOptions<TRequest, TResponse> = {}
) {
  const handlers = new Map<TRequest['action'], (request: TRequest) => MaybePromise<MaybeResponse<TResponse>>>();

  return {
    register<TAction extends TRequest['action']>(
      action: TAction,
      handler: RequestHandler<TRequest, TResponse, TAction>
    ) {
      handlers.set(action, (request: TRequest) => handler(request as Extract<TRequest, { action: TAction }>));
    },
    handle(request: TRequest): MaybePromise<MaybeResponse<TResponse>> {
      const handler = handlers.get(request.action);
      if (!handler) {
        if (options.onUnknownAction) {
          return options.onUnknownAction(request);
        }

        throw new Error(`No handler registered for action: ${request.action}`);
      }

      return handler(request);
    }
  };
}
