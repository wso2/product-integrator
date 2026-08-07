# WSO2 Integrator - Architecture & Process Guides

These guides define the product architecture and engineering processes for WSO2 Integrator and its components. They establish a consistent set of conventions and development practices across the WSO2 Integrator product. Each guide is authored by the WSO2 Integrator team and reviewed by relevant stakeholders.

## Objectives

These guides serve several goals:

- **Visible architecture:** Make the product architecture and its component boundaries clear to contributors and stakeholders.
- **Common practices:** Align teams across all repos on a consistent set of engineering conventions.
- **Clear ownership:** Clarify ownership and responsibilities among the teams and stakeholders involved.
- **Faster onboarding:** Reduce the time it takes a new contributor to understand the product and start contributing.

## Scope

- These guides currently focus on the editor and tooling components of the WSO2 Integrator product, and are expected to expand to cover other components in the future.
- These guides are intended for contributors and maintainers of the WSO2 Integrator product. They are not intended for end users of the product, who should refer to the [WSO2 Integrator documentation](https://wso2.com/integration-platform/docs/).
- These guides only cover the public aspects of the product architecture and engineering processes. All internal/customer-specific processes (e.g. private release process) are out of scope.

## Guides

Refer to the individual guides for detailed information on each topic:

| Document | Summary |
|---|---|
| [Component Architecture](component-architecture.md) | Repo and component inventory, dependency diagrams, and build constraints |
| [Branching Strategy](branching-strategy.md) | Branch model, naming conventions, and per-branch merge rules |
| [CI/CD Pipelines](cicd-pipelines.md) | PR, custom build, nightly, and release pipeline structures |
| [Quality & Security Gates](quality-and-security-gates.md) | Quality and security gates applied across the product distribution |
| [Versioning Strategy](versioning-strategy.md) | Versioning rules per component type and how version changes propagate across repos |
| [Release Process](release-process/) | Feature, patch, and hotfix release procedures; release schedule, ownership, and release order across repos |
