# Integration Platform backend

A second cloud backend alongside Choreo. Choreo is reached through the bundled
Choreo CLI's JSON-RPC server; the Integration Platform is reached over REST from
this process, by the code in this directory.

## Choosing a backend

`IpaasRpcClient` extends `ChoreoRPCClient`, so only the methods it overrides
change transport. Connections, the marketplace, databases and sign-in still go
to Choreo through the CLI, which stays bundled and unchanged.

Resolution happens once, during activation (`config.ts`):

| `integrator.advanced.cloudBackend` | Result |
| --- | --- |
| `auto` (default) | Integration Platform when a platform token **and** a base URL are both present; Choreo otherwise |
| `ipaas` | Integration Platform. Falls back to Choreo if no base URL is configured |
| `choreo` | Choreo, always |

The base URL comes from `CLOUD_API_BASE_URL`, or from
`integrator.advanced.cloudApiBaseUrl`, which overrides it.

**Both signals are required, not just the token.** The previous platform's cloud
editors inject `CLOUD_STS_TOKEN` too, so keying on the token alone would move
every one of those onto a backend that does not serve them.

Changing either setting prompts for a reload; resolution only runs at activation.

## What the editor supplies

The cloud editor injects these; the deploy path reads the first two.

| Variable | Used for |
| --- | --- |
| `CLOUD_STS_TOKEN` | Bearer token on every request. Also half the backend signal |
| `CLOUD_API_BASE_URL` | API base URL. The other half |
| `CLOUD_INITIAL_ORG_ID`, `CLOUD_INITIAL_PROJECT_ID` | Preselecting org and project |
| `SOURCE_COMPONENT_ID`, `COMMIT_HASH`, `CLOUD_ENV` | Existing flows, unchanged |

The token is a **snapshot** taken when the editor was provisioned. It expires
with the user's session and is refreshed only by an image-change redeploy, so a
long-running editor can hold a dead token; requests then fail with 401 and the
fix is to reload the editor.

## The deploy flow

1. `POST /projects/{project}/components` — created with `autoBuild` and
   `autoDeploy`, so the platform starts a build as part of the create.
2. Find that build. The trigger response does not name the run it starts, so a
   run is this deploy's only if its `{component}-{unixMillis}` stamp is newer
   than the moment before the create.
3. Poll it to `Succeeded` or `Failed`.
4. Wait briefly for a deployment to appear on its own — `autoDeploy` may already
   be acting on the same build. Only if none appears, `POST /deploy`.
5. Poll `GET /deployments` to `ACTIVE`, `SUSPENDED` or `ERROR`.

`SUSPENDED` is settled but not serving, so it is not reported as success.
`ERROR` is terminal because the platform reports an unrecognised condition that
way rather than leaving it pending.

## Things worth knowing

- **Ids are names.** Projects and components are addressed by name; there are no
  UUIDs in any path. A `Project.id` holding anything but the handler produces
  URLs that 404.
- **The org is never a parameter.** It comes from the token's `ouHandle` claim
  on the server side.
- **Component names can change under you.** A name collision is resolved
  server-side by suffixing, so always use the name from the create response.
- **An unknown component type is accepted, not rejected** — and silently treated
  as an automation. `toComponentTypeName` refuses instead of guessing, and a
  test asserts the table covers every integration type the picker offers.
- **Environments are organization-scoped.** `getEnvs` ignores the project it is
  given.
- **The OpenAPI spec is not usable for codegen.** It documents build paths that
  do not exist and no deployment paths at all. These types were written against
  the server's response package.

## Limitations

- **Ballerina only.** The create body always names the Ballerina build workflow.
  MI is refused before anything is created.
- **Public repositories only.** Binding a private repository needs a GitHub App
  installation id, and `CreateComponentReq` carries none. A private repository's
  build will fail to clone.
- **One environment.** Deploys go to the organization's first environment, the
  same one the platform itself picks when nothing selects one.

## Base URLs

The API is behind the platform gateway, on its own host and route — not on the
console's host, and not on the editor's. Read the value for an environment out
of the console's own runtime config rather than assembling one:

```bash
curl -s https://<console-host>/config.json | jq -r .CHOREO_BASE_API_URL
```

Development, verified against that file:

| | |
| --- | --- |
| API (`CLOUD_API_BASE_URL`) | `https://development-wso2cloud.gateway.dev.cloud.wso2.com/ipaas-service-ipaas-api-endpoint` |
| Console | `https://ipaas-console-development.gateway.dev.cloud.wso2.com` |
| IdP | `https://platform-idp-development.gateway.dev.cloud.wso2.com` |

`/integration-platform-api/v1.0` is the **internal** context path the gateway
strips before forwarding (see the comment on `NewHandler`); it is not part of
the URL a client sends to.

The gateway authenticates every route, including `/health`, so an
unauthenticated request answers 401 rather than reaching the service. A
mistyped route prefix answers 404 — which is how to tell "wrong base URL" from
"no token".

## Local development

Point an editor at a different deployment without rebuilding its container:

```jsonc
{
  "integrator.advanced.cloudBackend": "ipaas",
  "integrator.advanced.cloudApiBaseUrl": "https://development-wso2cloud.gateway.dev.cloud.wso2.com/ipaas-service-ipaas-api-endpoint"
}
```

`CLOUD_STS_TOKEN` must still be set in the environment. Reload the window after
changing either setting.

Nothing is derived from the editor's own URL. An editor is served on a
per-component subdomain that differs per user, project and component, so it
identifies no API — which is why the base URL is injected rather than computed.

## Tests

```bash
npm run test:unit
```

Compiles with the project's `tsc` and runs the result under `node --test`. No
test runner dependency. Everything under test is pure or has its transport,
clock and sleep injected, so nothing reaches the network and the twenty-minute
build timeout is exercised in microseconds.
