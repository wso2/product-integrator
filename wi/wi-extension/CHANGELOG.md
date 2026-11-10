# Changelog

All notable changes to the **WSO2 Integrator** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).


## [Unreleased]

### Changed

- **WSO2 Cloud without the CLI** — The extension signs in to WSO2 Cloud itself (ThunderID, through the `wso2-cloud` authentication provider other extensions can use) and calls the WSO2 Cloud Integration Platform API directly. The bundled Choreo CLI, its download at build time and its RPC bridge are gone.
- **Deploy to WSO2 Cloud** — Creating an integration turns auto build on and follows the first build; where the platform does not auto deploy (Ballerina), the extension deploys the first build to the pipeline's entry environment itself.
- **Project context** — Repositories are linked to WSO2 Cloud projects in `.wso2/context.yaml` (version 2). Links to Choreo projects in `.choreo/context.yaml` and in the earlier `.wso2/context.yaml` list are no longer read.
- **Sign in again** — Sessions from earlier versions are not carried over: after updating, sign in to WSO2 Cloud once more. The organization is chosen at sign-in; switching it signs in again.
- **Connections to WSO2 Cloud services** — Integrations of every project in the organization can be connected to. A connection links the connection's configurables to the endpoint, and WSO2 Cloud fills them in every environment from the next deploy: the endpoint's address inside the project, and across projects the gateway URL and an API key from the project's connection to the endpoint. Nothing has to be deployed first.
- **Cloud API for other extensions** — Other extensions reach WSO2 Integrator's cloud API (`cloudAPIs`) with the key in their `wso2-cloud` session, which VS Code gives only to extensions the person allowed; WSO2 Integrator trusts WSO2's own extensions with it. The WSO2 Cloud token is no longer handed to other extensions: calls, and the Copilot token exchange, are made with it inside WSO2 Integrator.
- **Overrides for the WSO2 Cloud team** — `WSO2_CLOUD_ENV` picks the environment (`prod`, `stage` or `dev`, ahead of the `integrator.advanced.cloudEnv` setting); `WSO2_CLOUD_API_URL`, `WSO2_CLOUD_ISSUER`, `WSO2_CLOUD_CLIENT_ID`, `WSO2_CLOUD_CONSOLE_URL` and `WSO2_CLOUD_OBSERVABILITY_URL` point an environment at other hosts.

### Removed

- Settings `integrator.advanced.cloudRpcPath`, `integrator.advanced.cloudRpcArchitecture`, `integrator.advanced.skipKeyring` and `integrator.advanced.cloudDirectConnection`: there is no CLI to point at. `integrator.advanced.cloudEnv` stays; `integrator.advanced.cloudClientId` and `integrator.advanced.cloudApiBaseUrl` are new, machine-scoped overrides for the WSO2 Cloud team.
- Environment variables `CHOREO_ENV`, `CLOUD_REGION`, `SKIP_KEYRING`, `CHOREO_DIRECT` and `CLOUD_STS_TOKEN`; the cloud editor hands in `WSO2_CLOUD_TOKEN` or `WSO2_CLOUD_TOKEN_FILE`.
- Deploying from Bitbucket or GitLab, and deploying from the cloud editor without a repository: WSO2 Cloud builds from GitHub repositories only for now.

## [1.0.0](https://github.com/wso2/product-integrator/compare/v5.0.0-alpha...v5.0.0-rc1) - 2026-05-18

### Added

- **Unified Activity Bar** — Introduced a unified sidebar entry point that bridges the Ballerina extension and WSO2 Integrator: MI extension, providing a single, consistent place to access all integration tooling.
- **Visual Designer** — Added a visual integration designer that lets developers build complex flows with a graphical interface, with real-time synchronization to the underlying source code.
- **Low-Code / Pro-Code Parity** — Enabled seamless switching between the visual designer and source code editor, giving developers full control without leaving the extension.
- **AI-Assisted Development** — Integrated AI assistance and natural language support to automatically generate components, map data, and improve integration flows.
- **Local Execution & Debugging** — Added support for running, testing, and debugging integration solutions directly within VS Code before deployment.
- **Integrated Deployment** — Enabled one-click deployment of integration solutions directly to WSO2 Cloud from within the extension.
- **Profile Selection** — Added support for runtime profile selection (Default, WSO2 Integrator: MI, and WSO2 Integrator: SI) via configuration and settings to match different integration architectures.
- **Welcome Experience** — Added a welcome page with integration status indicators and quick-access links to help developers get started quickly.
- **Extension Bridge** — Implemented an extension bridge layer to consume and coordinate Ballerina extension and WSO2 Integrator: MI extension APIs, enabling seamless cross-extension communication.
- **Integration Project Explorer** — Added a tree data provider for navigating integration projects, giving developers a structured view of their workspace artifacts.
- **Navigation Commands** — Introduced commands for switching between Default profile, WSO2 Integrator: MI profile and WSO2 Integrator: SI profile directly from the activity bar and command palette.
- **Extension Auto-Detection** — Added automatic detection of installed Ballerina, WSO2 Integrator: MI and WSO2 Integrator: SI extensions, with guided setup assistance when required dependencies are missing.
