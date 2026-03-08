# Requirement

I need to migrate the functionalities of wso2-platform to wi. This means moving the functions of wso2-platform one by one wi. The functions of wso2-platform can be found in wso2-platform-extension/src/extension.ts.

## Rules to follow

- do not auto commit changes. Ask from me to commit each stage after completing each stage.
- plan each stage
- update this document on the stages, current stage and whats left to be done

---

## Scope (agreed)

Migrate these three capability areas (other features deferred):

1. **Auth** — `WSO2AuthenticationProvider`, OAuth session storage via VS Code `SecretStorage`
2. **Choreo RPC client** — `ChoreoRPCClient` (gRPC-over-stdio), CLI binary install (`installRPCServer`)
3. **State stores** — `contextStore` and `dataCacheStore` (zustand + persist)

External npm dependency strategy: `@wso2/wso2-platform-core` added as a rush workspace project (local submodule) — same pattern as `@wso2/ui-toolkit`, no token required.
Command IDs renamed from `wso2.wso2-platform.*` → `wso2.wi.*`.

---

## Stages

### Stage 1 — Add external npm dependency + new runtime deps ✅ DONE

- Added `@wso2/wso2-platform-core` to `rush.json` as a workspace project (same pattern as `@wso2/ui-toolkit`),
  pointing to `external/wso2-vscode-extensions/workspaces/wso2-platform/wso2-platform-core`
- Added to `wi-extension/package.json` dependencies:
  - `@wso2/wso2-platform-core: workspace:*` (shared types/enums)
  - `zustand: 5.0.5` (state management for stores)
  - `vscode-jsonrpc: 8.2.1` (JSON-RPC transport for RPC client)
  - `byline: 5.0.0` + `@types/byline`, `@types/js-yaml`, `@types/which` in devDeps
  - `which: 5.0.0` (CLI binary path resolution)
  - `js-yaml: 4.1.1` + `yaml: 2.8.0` (YAML parsing in context-store)
- Built `wso2-platform-core` (`tsc`) to generate `lib/`
- Ran `rush update` — lockfile updated successfully

### Stage 2 — Add logger adapter

- Create `wi-extension/src/logger/logger.ts` — thin shim wrapping `ext.outputChannel` behind the same `getLogger()` / `initLogger()` API used throughout platform code

### Stage 3 — Migrate state stores

- Create `wi-extension/src/stores/` directory
- Copy and adapt `store-utils.ts`, `context-store.ts`, `data-cache-store.ts`

### Stage 4 — Migrate Choreo RPC client

- Copy and adapt `choreo-rpc/` directory (client.ts, connection.ts, constants.ts, cli-install.ts, activate.ts, index.ts, rpc-resolver.ts)

### Stage 5 — Migrate WSO2 Auth Provider

- Copy and adapt `auth/wso2-auth-provider.ts`
- Change `WSO2_AUTH_PROVIDER_ID` from `"wso2-platform"` → `"wso2-wi"` to avoid session collisions
- Replace `CommandIds.SignIn` reference with new `"wso2.wi.sign.in"` command ID

### Stage 6 — Extend extensionVariables.ts + wire extension.ts

- Add `authProvider`, `clients`, `config`, `choreoEnv`, `isChoreoExtInstalled` to `ext`
- Update `extension.ts` to call: `initLogger`, `getChoreoEnv`, rehydrate stores, register auth provider, spin up RPC client, init auth, register pre-init config change handler

---

## Current Stage

**Stage 1** ✅ complete — awaiting commit.

## What's Left

Stages 2 → 6 (see above)
