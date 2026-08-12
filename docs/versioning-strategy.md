# Versioning Strategy

_Authors_: @NipunaRanasinghe \
_Reviewers_: @keizer619, @anupama-pathirage, @nipunayf, @samithkavishke \
_Created_: 2026/08/10 \
_Updated_: 2026/08/12

This document defines the versioning scheme applied across all WSO2 Integrator repos. The common rule (SemVer) is stated first, followed by how each versioned unit applies it: shared UI library, language server, VS Code extension, and product distribution.

## SemVer

All the versioned components should follow the 
[Semantic Versioning (SemVer)](https://semver.org/) standards.

> Given a version number MAJOR.MINOR.PATCH, increment the:
>
> - MAJOR version when you make incompatible API changes
> - MINOR version when you add functionality in a backward compatible manner
> - PATCH version when you make backward compatible bug fixes

How each versioned unit interprets and applies SemVer is described below.

## Shared UI Library Versioning

The shared UI libraries have no independent version line and are never released as a package. Consumers pin them as a git submodule commit and build them from source. The version a product consumes is the submodule commit it points at.

## Language Server Versioning

Language servers are versioned and released together with their parent extension. Each product version includes a specific language server build, so the extension and its language server are tested together and ship as one unit. 

In addition to being bundled into the extension, each language server is published as a standalone artifact on every release: the JAR is attached to the extension's GitHub Release, and the same build is published as a Maven package. This allows external consumers to download and run the language server directly, without installing the VS Code extension.

## VS Code Extension Versioning

Each product tooling repo carries its own SemVer line, applied at the **extension** level. The extension is the unit published to the VS Code Marketplace, and it bundles a matched [language server](#language-server-versioning) build. Extensions publish on two Marketplace channels, each with its own versioning rule.

**Stable:** A plain SemVer `major.minor.patch` version published to the Marketplace stable channel. Stable releases use even minor numbers (e.g. `5.14.0`), leaving the odd minor immediately below for the pre-release channel.

**Pre-release:** The Marketplace does not support SemVer pre-release suffixes (`5.14.0-nightly.20260609` is rejected); every published version must be `major.minor.patch`. Nightly and other pre-release builds share a single pre-release channel that uses the odd minor version immediately below the upcoming stable release, with the build timestamp encoded in the patch segment as `<yymmddHH>` so each build sorts strictly above the previous one. For example, while preparing the `5.14.x` stable release, pre-release builds are versioned `5.13.<yymmddHH>` (e.g. `5.13.26080710`). This follows VS Code's [even-minor/odd-minor convention](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions), which keeps the stable and pre-release channels from sharing a version number.

## Product Distribution Versioning

The `product-integrator` artifacts (the WSO2 Integrator VS Code Extension and the WSO2 Integrator IDE) are versioned with the **WSO2 Integrator product version** (`5.0.0` for the first consolidated release).

The product version is managed at the WSO2 Integrator product level. Component versions evolve independently, and users upgrade WSO2 Integrator as a single product. In the repo, the product version is pinned alongside the component versions in its [properties file](https://github.com/wso2/product-integrator/blob/main/ci/build/component-versions.properties).
