# Branching Strategy

_Authors_: @NipunaRanasinghe \
_Reviewers_: @isudana, @keizer619, @anupama-pathirage, @dulajdilshan \
_Created_: 2026/08/10 \
_Updated_: 2026/08/12

This document defines the branching model for all WSO2 Integrator repos: the shared UI libraries, product tooling, and product distribution layers.

## Rationale

The WSO2 Integrator tooling spans multiple repos with contributors of varying experience levels and an increasing use of agentic development workflows. The branching model must be simple enough to apply consistently across all repos while still supporting parallel patch maintenance on stable releases.

### Considered Options

- **Trunk-Based Development** — All commits go directly (or via very short branches) to `main`.
- **GitFlow** — Parallel `main`/`develop` branches with dedicated release branches.
- **GitHub Flow with Maintenance Branches** — A single `main` branch for features and dedicated `<major>.<minor>.x` branches for patches.

### Selected Option: GitHub Flow with Maintenance Branches

- Avoids the overhead of managing multiple long-lived branches (e.g. `develop`) and complex merge patterns.
- Keeps feature development separate from patch maintenance.
- Matches the release tracks defined in [Release Process](release-process/) and the version lines defined in [Versioning Strategy](versioning-strategy.md).

## Branches

The selected branching model consists of the following branch types:

### The `main` Branch

The primary integration branch. `main` must always be in a releasable state and serves as the base for:

- The next feature release (often a minor version bump)
- Nightly builds
- Milestone releases (e.g. `5.1.0-m1`) ahead of the next feature release

### Feature Branches

All feature development must happen on a dedicated feature branch. Branch names must follow the `feat/<description>` convention (e.g. `feat/workflow-support`).

- Feature branches must be merged to `main` only when the feature is stable and release-ready.
- Feature branches must be deleted after merging.

### Patch Branch (`<major>.<minor>.x`)

A patch branch tracks all bug fixes and security patches for a specific released minor version. Each patch branch must always be release-ready and serves as the base for all patch releases in that version line (e.g. `5.0.1`, `5.0.2`). The number of active patch branches differs by repo type.

**Product tooling repos** (`ballerina-vscode`, `mi-vscode`, `si-vscode`): Only one active patch branch exists at any given time — the branch for the latest stable minor version (e.g. `1.2.x`). VS Code extensions do not backport fixes to older minor version lines. When a new minor GA is released, the previous patch branch is retired and a new one is created from the new GA tag.

**Product distribution repo** (`product-integrator`): Multiple patch branches may be active simultaneously, one per supported minor version (e.g. `5.0.x` and `5.1.x`). Because the WSO2 Integrator IDE follows product EoL policies, critical fixes may need to be backported to older minor versions that are still within their support window. A patch branch is retired when its minor version reaches end of life.

Across all repos:

- Bug fixes and security patches must be submitted to the relevant active patch branch, not to `main`.
- Repo maintainers should merge each active patch branch into `main` promptly after releases.

### Hotfix Branches

A hotfix branch collects one or more critical fixes that require an immediate patch release and cannot wait for the normal bug fix cycle.

- Hotfix branches must be created from the latest stable release tag and follow the `hotfix/<description>` naming convention (e.g. `hotfix/critical-auth-bypass`).
- Once the fix is released, hotfix branches must be merged back into the active patch branch.
- Repo maintainers should ensure hotfixes are also merged into `main` if they apply to the current development version.

### Release Staging Branch (`staging/<release-version>`)

A release staging branch controls change intake while a feature release stabilizes. The release manager creates it from `main` on the code freeze date and names it after the release version (e.g. `staging/5.1.0` for the `5.1.0` release), then produces all pre-release and GA builds for that release from it.

- Only blocker-level issues and security fixes may be merged to a staging branch. Contributors must target the staging branch rather than `main` for such fixes.
- Feature development continues on `main` while the release stabilizes.
- Nightly builds switch to the staging branch for as long as it exists. See [CI/CD Pipelines](cicd-pipelines.md#nightly-pipeline).
