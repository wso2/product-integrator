# Quality & Security Gates

_Authors_: @NipunaRanasinghe \
_Reviewers_: @keizer619, @anupama-pathirage \
_Created_: 2026/08/10 \
_Updated_: 2026/08/10

This document defines the quality and security gates integrated into the PR pipeline across all WSO2 Integrator repos, the tools used to implement them, and the blocking criteria for each gate.

| Requirement | Tool | Blocks Merge? | Notes |
|---|---|---|---|
| Code quality (duplication, complexity, maintainability) | SonarQube Cloud | **Yes** | GitHub Actions step; posts results to the PR; free tier initially |
| Code coverage | Codecov | **Yes** (configurable threshold) | GitHub Actions step; posts a coverage diff comment to the PR; free for public repos |
| Dependency vulnerability scanning | Trivy | **Yes** (`HIGH`/`CRITICAL`) | GitHub Actions step; already configured in all repos |
| Secret / token detection | GitHub Secret Scanning | **Yes** (push protection) | Enabled at repo level (Settings → Security); no pipeline step needed; free for public repos |

## SonarQube Cloud

SonarQube Cloud analyses each PR for duplication, complexity, and maintainability issues, and posts the result directly to the PR as a status check.

- **Rationale:** Free for public repos, native GitHub PR decoration, and no self-hosted server to operate. The main alternatives (self-managed SonarQube, CodeQL-only) either add infrastructure cost or do not cover code quality metrics.
- **Blocking:** The quality gate status check must pass before merge. Repos start with the default `Sonar way` quality gate; stricter per-repo quality gates (e.g. coverage thresholds) can be configured once a baseline exists.

## Codecov

Codecov collects coverage reports uploaded from the test run in each PR and posts a coverage diff comment showing the coverage change introduced by the PR. Each repo configures a minimum coverage threshold in a `codecov.yml` file; PRs that drop coverage below the threshold fail the status check.

- **Rationale:** Free for public repos, native GitHub integration, and tracks coverage trends per PR. SonarQube Cloud also reports coverage, but Codecov provides per-PR coverage diff visibility and configurable per-repo thresholds independently of the broader quality gate.
- **Blocking:** A PR that drops coverage below the configured threshold fails the Codecov status check and cannot merge. The threshold is set per repo in `codecov.yml` and should be tightened incrementally as coverage improves.

## Trivy

Trivy runs a filesystem scan of the repository on every PR, covering every dependency manifest it finds — npm, Maven, and Gradle.

- **Rationale:** Covers every dependency ecosystem in use across the repos, and runs as a single GitHub Actions step at no cost.
- **Blocking:** A finding of severity `HIGH` or `CRITICAL` fails the PR pipeline. Lower severities are reported in the scan output but do not block; maintainers should review them during routine dependency bumps.
- **Suppressions:** A `HIGH`/`CRITICAL` finding with no released fix may be suppressed (e.g. via a `.trivyignore` entry) only with explicit approval from the repo maintainers, case by case. Each suppression must reference a tracking issue, and the entry must be removed once a fixed version is available.

## GitHub Secret Scanning

GitHub Secret Scanning detects committed credentials (API tokens, keys) at the platform level. It is enabled per repo under **Settings → Security**, with **push protection** turned on, and requires no pipeline step.

- **Rationale:** Native to GitHub, no maintenance overhead, and free for public repos. Push protection rejects the push before the secret reaches the repository history, rather than detecting it after the commit lands.
- **Limits:** Push protection only detects secrets matching a supported provider pattern. Credentials outside those patterns — internal tokens, passwords, private keys in unrecognised formats — are not caught, so this is a safety net rather than a guarantee.
- **Blocking:** Push protection blocks any push containing a detected secret. Contributors with bypass access can push through a block by declaring a reason, unless delegated bypass is configured to require approval; every bypass raises an alert that repo maintainers must triage. Alerts on already-committed secrets must likewise be triaged, and the affected credential must be rotated. Removing it from history alone is not sufficient.
