# Requirement

I need to migrate the functionalities of wso2-platform to wi. This means moving the functions of wso2-platform one by one wi. The functions of wso2-platform can be found in wso2-platform-extension/src/extension.ts.

## Rules to follow

- do not auto commit changes. Ask from me to commit each stage after completing each stage.
- plan each stage
- update this document on the stages, current stage and whats left to be done

---

## Conventions (must be respected by all future agents)

When copying or adapting source files from `wso2-platform-extension` into `wi-extension`, always apply these substitutions:

| Platform source pattern | wi-extension replacement | Notes |
|---|---|---|
| `getLogger().info(...)` | `ext.log(...)` | OutputChannel-backed logger |
| `getLogger().debug(...)` | `ext.log(...)` | |
| `getLogger().warn(...)` | `ext.log(...)` | |
| `getLogger().error(msg)` | `ext.logError(msg)` | |
| `getLogger().error(msg, err)` | `ext.logError(msg, err as Error)` | |
| `import { getLogger } from "../logger/logger"` | `import { ext } from "../extensionVariables"` | Remove logger import |
| `import * as byline from "byline"` | `import byline from "byline"` | Default import required with esModuleInterop |
| `import * as which from "which"` | `import which from "which"` | Default import required with esModuleInterop |
| `ext.choreoEnv` | `ext.cloudEnv` | Property is named `cloudEnv` on `ExtensionVariables` |
| `choreoEnv` (property name) | `cloudEnv` | Same rename wherever this prop is referenced |
| `String.replaceAll(...)` | `String.replace(/pattern/g, ...)` | tsconfig targets ES2020 — `replaceAll` not available |

make sure following copyright header is there in newly added untracked files
```
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
 ```

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

### Stage 2 — Add logger adapter ~~ELIMINATED~~

- `wi-extension` already has `ext.log()` / `ext.logError()` backed by a VS Code OutputChannel.
- Instead of a shim, migrated code uses `ext.log()` / `ext.logError()` directly (replacing all `getLogger().*` call sites as each file is copied).

### Stage 3 — Migrate state stores ✅ DONE

- Created `wi-extension/src/stores/store-utils.ts` — verbatim copy (zustand persist helpers)
- Created `wi-extension/src/stores/data-cache-store.ts` — verbatim copy (org/project/component cache)
- Created `wi-extension/src/stores/context-store.ts` — copy with:
  - `locationStore` import and its call removed (location-store not in scope)
  - git utilities (`getGitRoot`, `getGitRemotes`) imported from stub `src/git/util.ts`
  - `isSamePath` / `isSubpath` imported from new `src/utils.ts`
- Created `wi-extension/src/git/util.ts` — stub returning `undefined`/`[]` (git module deferred)
- Created `wi-extension/src/utils.ts` — `isSamePath`, `isSubpath`, `getNormalizedPath`
- Updated `wi-extension/src/extensionVariables.ts` — added stub properties:
  `authProvider?`, `clients!`, `choreoEnv`, `isDevantCloudEditor`, `isChoreoExtInstalled`
- `tsc --noEmit` passes with zero errors

### Stage 3b — Proper typing for platform stubs ✅ DONE

- Replaced `any` types with proper interfaces:
  - `IAuthProvider` (local interface in `extensionVariables.ts`) for auth provider
  - `IChoreoRPCClient` (from `@wso2/wso2-platform-core`) for RPC client
- `tsc --noEmit` passes with zero errors

### Stage 3c — Migrate git module ✅ DONE

- Added missing npm deps to `wi-extension/package.json`: `@vscode/iconv-lite-umd ^0.7.0`, `file-type ^18.2.1`, `jschardet ^3.1.4`
- Updated `webpack.config.js` — added second entry point `askpass-main`, CopyPlugin for shell scripts, PermissionsOutputPlugin, and `.mjs` module rule
- Created all git source files (verbatim copy + logger replacement):
  - `src/git/api/git.ts` — all git types/interfaces/enums
  - `src/git/git.d.ts` — ambient declarations
  - `src/git/git.ts` — core `Git` class + `Repository` class (2684 lines; replaceAll→replace, getLogger→ext.log/logError, default imports for byline/which)
  - `src/git/encoding.ts` — buffer encoding detection (jschardet)
  - `src/git/ipc/ipcClient.ts`, `src/git/ipc/ipcServer.ts` — Unix socket IPC
  - `src/git/terminal.ts` — terminal environment variable manager
  - `src/git/askpass.ts` — git credential askpass handler
  - `src/git/askpass-main.ts` — standalone Node.js IPC client for git askpass
  - `src/git/github/session.ts`, `src/git/github/credentialProvider.ts` — GitHub OAuth integration
  - `src/git/main.ts` — `initGit()` entry point (getLogger→ext.log/logError)
  - `src/git/util.ts` — **replaced stub** with full implementation; 622 lines; exports `getGitRemotes`, `getGitRoot`, `getGitHead`, `hasDirtyRepo` and all utility functions
- Copied 4 shell scripts: `askpass.sh`, `askpass-empty.sh`, `ssh-askpass.sh`, `ssh-askpass-empty.sh`
- Ran `rush update` — succeeded
- `tsc --noEmit` passes with zero errors

### Stage 4 — Migrate Choreo RPC client ✅ DONE

- Created `wi-extension/src/choreo-rpc/constants.ts` — verbatim copy (ErrorCode enum)
- Created `wi-extension/src/choreo-rpc/cli-install.ts` — copy with `getLogger()` → `ext.log/logError`
- Created `wi-extension/src/choreo-rpc/connection.ts` — copy with logger replacements + `ext.choreoEnv` → `ext.cloudEnv`
- Created `wi-extension/src/choreo-rpc/client.ts` — copy with `getLogger()` → `ext.log/logError`
- Created `wi-extension/src/choreo-rpc/activate.ts` — copy with logger replacements
- Created `wi-extension/src/choreo-rpc/rpc-resolver.ts` — verbatim copy (imports from local webview-state-store)
- Created `wi-extension/src/choreo-rpc/index.ts` — verbatim copy
- Created `wi-extension/src/stores/webview-state-store.ts` — full copy (needed by rpc-resolver)
- Created `wi-extension/src/error-utils.ts` — copy with logger replacements; uses `ext.config?` for console URLs
- Updated `wi-extension/src/utils.ts` — added `withTimeout` and `parseJwt` helper functions
- Updated `wi-extension/src/extensionVariables.ts` — added `config?` stub (`billingConsoleUrl`, `devantConsoleUrl`, `choreoConsoleUrl`)
- `tsc --noEmit` passes with zero errors

### Stage 5 — Migrate WSO2 Auth Provider ✅ DONE

- Created `wi-extension/src/auth/wso2-auth-provider.ts` — adapted from platform:
  - `WSO2_AUTH_PROVIDER_ID` = `"wso2-wi"` (avoids session collisions with wso2-platform extension)
  - `CommandIds.SignIn` → `"wso2.wi.sign.in"` (wi-specific command ID)
  - `getLogger().*` → `ext.log/logError` (logger migration)
  - `contextStore` + `dataCacheStore` imports retained (same stores as platform)
- Fixed `extensionVariables.ts` — changed `clients.rpcClient` type from `IChoreoRPCClient` → `ChoreoRPCClient`
  (concrete class needed so auth methods `signOut`, `getUserInfo`, `getCurrentRegion`, `changeOrgContext` resolve)
- `tsc --noEmit` passes with zero errors

### Stage 6 — Wire activation in extension.ts ✅ DONE

- Added `getExtVersion(context)` to `src/utils.ts`
- Created `src/stores/location-store.ts` — verbatim copy from platform (persisted zustand store for project/component filesystem locations)
- Updated `src/stores/context-store.ts`:
  - Added `import { locationStore } from "./location-store"`
  - Restored `locationStore.getState().setLocation(selected, components)` call in `refreshState`
- Updated `src/extension.ts`:
  - Added `activateCloudFunctionality(context)` — mirrors platform boot sequence:
    1. `ext.cloudEnv` from env vars / VS Code config `WSO2.WSO2-Platform.Advanced.ChoreoEnvironment`
    2. Logs extension + CLI version
    3. Rehydrates `contextStore`, `dataCacheStore`, and `locationStore`
    4. Subscribes to `contextStore` → sets `isLoadingContextDirs` + `hasSelectedProject` VS Code context keys
    5. Registers `WSO2AuthenticationProvider` (`WSO2_AUTH_PROVIDER_ID = "wso2-wi"`)
    6. Subscribes to auth state → sets `isLoggedIn` VS Code context key
    7. Calls `installRPCServer()`
    8. Instantiates `ChoreoRPCClient`, awaits `waitUntilActive()`, sets `ext.clients`
    9. Calls `authProvider.getState().initAuth()`
    10. Fetches `ext.config = await ext.clients.rpcClient.getConfigFromCli()`
    11. Calls `registerPreInitHandlers()` — prompts VS Code restart on Advanced config changes
  - Added `registerPreInitHandlers()` — watches `ChoreoEnvironment` + `RpcPath` config keys
  - Wired `activateCloudFunctionality(context)` call from `activate()`
- `tsc --noEmit` passes with zero errors

### Stage 7 — Migrate VS Code commands ✅ DONE

Migrating all commands from `wso2-platform-extension/src/cmds/` to `wi-extension/src/cmds/`.

**Skipped (out of scope):** `create-comp-dependency-cmd`, `create-project-workspace-cmd`, `view-comp-dependency-cmd`, `view-component-cmd`

**Key substitutions on top of standard conventions:**
- `CommandIds` → `WICommandIds` (all command ID references)
- URI scheme: `"wso2.wso2-platform"` → `"wso2.wi"` (sign-in callback URL)
- `closeComponentDetailsView(...)` — removed (no webview in wi)
- `create-component-cmd.ts`: `openComponentForm`/`showComponentFormInWorkspace`/`ComponentFormView` calls → deferred (replaced with TODO stubs)
- `cloneOrOpenDir` — moved inline into new `wi-extension/src/uri-handlers.ts` (adapted with WICommandIds)

**Files created:**
- `src/uri-handlers.ts` — adapted from platform: `activateURIHandlers`, `cloneOrOpenDir`, `openClonedDir`, helpers
- `src/cmds/cmd-utils.ts` — `WICommandIds.SignIn` in `getUserInfoForCmd`
- `src/cmds/sign-in-cmd.ts` — `WICommandIds.SignIn/CancelSignIn`, URI scheme `wso2.wi`
- `src/cmds/sign-in-with-code-cmd.ts` — `WICommandIds.SignInWithAuthCode`
- `src/cmds/sign-out-cmd.ts` — `WICommandIds.SignOut`
- `src/cmds/refresh-directory-context-cmd.ts` — `WICommandIds.RefreshDirectoryContext`
- `src/cmds/delete-component-cmd.ts` — `WICommandIds.DeleteComponent`, removed `closeComponentDetailsView`
- `src/cmds/open-in-console-cmd.ts` — `WICommandIds.OpenInConsole/CreateNewComponent`
- `src/cmds/manage-dir-context-cmd.ts` — `WICommandIds.ManageDirectoryContext/OpenInConsole/CreateDirectoryContext/SignOut`
- `src/cmds/create-directory-context-cmd.ts` — `WICommandIds.CreateDirectoryContext`
- `src/cmds/clone-project-cmd.ts` — `WICommandIds.CloneProject`, `replaceAll→replace(/g,...)`
- `src/cmds/commit-and-push-to-git-cmd.ts` — `WICommandIds.CommitAndPushToGit`, logger migration
- `src/cmds/create-component-cmd.ts` — `WICommandIds.CreateNewComponent/CreateMultipleNewComponents`, webview calls deferred
- `src/cmds/open-comp-src-cmd.ts` — `WICommandIds.OpenCompSrcDir`, imports `cloneOrOpenDir` from `../uri-handlers`
- `src/cmds/index.ts` — `activateCmds(context)` wiring all non-skipped commands
- `src/utils.ts` — added `convertFsPathToUriPath`, `openDirectory`, `createDirectory`, `delay`
- `src/extension.ts` — wired `activateCmds(context)` and `activateURIHandlers()` in `activateCloudFunctionality`

**Status of each file:**
| File | Status |
|---|---|
| `src/utils.ts` (additions) | ✅ Done |
| `src/uri-handlers.ts` | ✅ Done |
| `src/cmds/cmd-utils.ts` | ✅ Done |
| `src/cmds/sign-in-cmd.ts` | ✅ Done |
| `src/cmds/sign-in-with-code-cmd.ts` | ✅ Done |
| `src/cmds/sign-out-cmd.ts` | ✅ Done |
| `src/cmds/refresh-directory-context-cmd.ts` | ✅ Done |
| `src/cmds/delete-component-cmd.ts` | ✅ Done |
| `src/cmds/open-in-console-cmd.ts` | ✅ Done |
| `src/cmds/manage-dir-context-cmd.ts` | ✅ Done |
| `src/cmds/create-directory-context-cmd.ts` | ✅ Done |
| `src/cmds/clone-project-cmd.ts` | ✅ Done |
| `src/cmds/commit-and-push-to-git-cmd.ts` | ✅ Done |
| `src/cmds/create-component-cmd.ts` | ✅ Done (webview deferred Stage 8) |
| `src/cmds/open-comp-src-cmd.ts` | ✅ Done |
| `src/cmds/index.ts` | ✅ Done |
| `src/extension.ts` (wire cmds) | ✅ Done |
| `tsc --noEmit` passes | ✅ Done |

**Additional fixes applied during Stage 7:**
- `extensionVariables.ts`: exported `ExtensionVariables` class, added `cancelPendingSessionCreation()` to `IAuthProvider`, added `loginSuccess` to `IAuthProvider.getState()` return type

---

## Structural Refactor (post-Stage 7)

All cloud-related source files were moved into a `src/cloud/` subdirectory and utilities were split. **Future agents must follow these rules precisely.**

### New directory layout

```
src/
├── cloud/
│   ├── auth/              (was src/auth/)
│   ├── choreo-cli-rpc/    (was src/choreo-rpc/ — see notes below)
│   ├── cmds/              (was src/cmds/)
│   ├── git/               (was src/git/)
│   ├── stores/            (was src/stores/)
│   ├── activate.ts        (activateCloudFunctionality + registerPreInitHandlers — extracted from extension.ts)
│   ├── cloud-uri-handlers.ts  (was src/uri-handlers.ts)
│   └── error-utils.ts     (was src/error-utils.ts)
├── utils/
│   ├── commonUtils.ts  (withTimeout, parseJwt, getExtVersion, delay)
│   ├── pathUtils.ts    (isSamePath, isSubpath, getNormalizedPath, convertFsPathToUriPath,
│   │                    createDirectory, openDirectory)
│   └── index.ts        (barrel — re-exports both files above)
├── extension.ts        (thin: activate() + deactivate() only — imports activateCloudFunctionality from ./cloud/activate)
├── extensionVariables.ts
└── uri-handlers.ts
```

### choreo-cli-rpc internal structure

`activate.ts` and `constants.ts` were deleted during refactoring:
- `installRPCServer()` merged into `cli-install.ts` (also exported from there — import directly, not via index)
- `ErrorCode` enum merged into `error-utils.ts`
- `installCLI` renamed to private `choreoCliBinaryExists` (not exported)

Current files: `cli-install.ts`, `client.ts`, `connection.ts`, `error-utils.ts`, `index.ts`, `rpc-resolver.ts`

**Import `ErrorCode` from `error-utils`, NOT from `constants` (deleted).**

### Import depth rules — CRITICAL

The depth change from `src/x/` → `src/cloud/x/` shifts all cross-module references by one level.

| File location | To reach `src/` root modules | Example |
|---|---|---|
| `src/cloud/cmds/*.ts` | `../../` | `from "../../extensionVariables"` |
| `src/cloud/stores/*.ts` | `../../` | `from "../../utils"` |
| `src/cloud/git/*.ts` | `../../` | `from "../../choreo-cli-rpc/..."` |
| `src/cloud/auth/*.ts` | `../../` | `from "../../extensionVariables"` |
| `src/cloud/choreo-cli-rpc/*.ts` | `../../` | `from "../../extensionVariables"` |
| `src/cloud/error-utils.ts`, `src/cloud/cloud-uri-handlers.ts` | `../` | `from "../extensionVariables"` (depth 2, one level up) |

**Intra-cloud sibling imports remain single `../`** (they stay within `src/cloud/`):
- `src/cloud/cmds/*.ts` → `from "../stores/..."` ✅
- `src/cloud/stores/*.ts` → `from "../git/..."` ✅
- `src/cloud/cmds/*.ts` → `from "../git/..."` ✅
- `src/cloud/choreo-cli-rpc/*.ts` → `from "../stores/..."` ✅ (note: NOT `../cloud/stores/`)

### Utils barrel

All utils exports are available via the barrel:
```ts
import { isSamePath, delay, parseJwt } from "../../utils";  // from src/cloud/*/
import { isSamePath, delay, parseJwt } from "../utils";     // from src/cloud/
import { isSamePath, delay, parseJwt } from "./utils";      // from src/
```
`isSamePath`, `isSubpath`, `openDirectory`, `convertFsPathToUriPath`, `createDirectory`, `getNormalizedPath` live in `pathUtils.ts`.
`withTimeout`, `parseJwt`, `getExtVersion`, `delay` live in `commonUtils.ts`.
**Do not import `isSamePath` or `openDirectory` from `commonUtils` — they are in `pathUtils`.**

### Webpack config (already updated)

- `askpass-main` entry: `./src/cloud/git/askpass-main.ts`
- Shell scripts: `{ from: "src/cloud/git/*.sh", to: "[name][ext]" }`
- Output: `filename: "[name].js"` (was `"extension.js"` — caused chunk conflict)

---

## Current Stage

**Stage 7 + Structural Refactor + activation extraction** ✅ complete — all commands migrated, `cloud/` reorganisation done, `activateCloudFunctionality` extracted to `src/cloud/activate.ts`, `tsc --noEmit` passes with zero import errors.

## What's Left

- Commit Stage 7 + refactor (ask user)
- Stage 8 — wire ComponentFormView webview in `create-component-cmd.ts` (currently deferred with TODO stubs)
