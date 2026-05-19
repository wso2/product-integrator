# Changelog

All notable changes to the **WSO2 Integrator** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).


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
