# Feature Release Process

_Authors_: @NipunaRanasinghe \
_Reviewers_: @keizer619, @anupama-pathirage, @samithkavishke \
_Created_: 2026/08/10 \
_Updated_: 2026/08/12

A feature release delivers a new minor version of the WSO2 Integrator product, including new features, improvements, and bug fixes. Breaking changes are not permitted.

> For release types, schedule, and release order, see the [Release Process overview](README.md).

### Step 1: Create the Release Milestone

The release cycle starts when the release manager creates a public release milestone in the `product-integrator` repo (e.g. [5.0.0 milestone](https://github.com/wso2/product-integrator/milestone/7)), if one does not already exist. All features and fixes planned for the release must be tracked against this milestone.

### Step 2: Milestone Releases (Optional)

Milestone releases are pre-release builds published during active feature development to provide early access when a significant development phase is complete or major features are ready for testing. Milestone builds are named `<major>.<minor>.0-m<n>` and are published to GitHub Releases as pre-release artifacts only, not to the VS Code Marketplace. Milestone releases are intended for early feedback and testing, but are not stable enough for production use. There may be multiple milestone releases for a given feature release (e.g., `5.1.0-m1`, `5.1.0-m2`), with each subsequent build addressing issues found in the previous one and incorporating remaining planned features, before code freeze.

Milestone builds go through the same release pipeline as any other release. To trigger one, the release manager runs the release pipeline from `main` with a milestone version (e.g. `5.1.0-m2`). Once the build is published to GitHub Releases, the release manager shares the link with the team and stakeholders for early feedback.

### Step 3: Initiate the Release Thread

The release manager initiates a dedicated thread in the integration team chat with the release version as the topic. The thread must include the planned scope of the release and the target code freeze date. This thread is the primary communication channel between all release stakeholders. Product team members should use it to raise release blockers, flag concerns, and track decisions throughout the release process.

### Step 4: Verify the Release Readiness

Before triggering the release workflow, the release manager should verify:

- [ ] All planned features for this release are completed
- [ ] All issues added in the release milestone are either closed or moved to a future milestone
- [ ] All active patch branches are merged to the main branch (All bug fixes and security patches are merged to the active patch branch. See the [Branching-strategy](../branching-strategy.md#patch-branch-majorminorx) documentation for more details)
- [ ] No critical issues or regressions are found in the latest nightly build and the build is stable enough for release

Once the checklist is satisfied, the release manager must announce a code freeze on `main` and create the release staging branch from the current `main`, named `staging/<release-version>` (e.g., for a `5.1.0` release, create `staging/5.1.0`). From this point, only bug fixes and security fixes are permitted. Contributors must target the staging branch, not `main`, for any such fixes.

Only the release manager and the product leads should have merge access to the staging branch. Feature development continues on `main` for the next release. See the [Branching Strategy](../branching-strategy.md#release-staging-branch-stagingrelease-version) documentation for more details.

### Step 5: Pre-Release Builds

Feature releases progress through the below pre-release stages before the GA build.

Each stage produces one build that is published in two forms under two different version strings. The stage name below (`5.1.0-alpha`, `5.1.0-rc1`) is the **product release** name — the git tag and the GitHub Release, which accept a SemVer pre-release suffix. The VS Code extensions in that same build cannot carry a suffix on the Marketplace, so they go to the pre-release channel under their own numeric version. See [Versioning Strategy](../versioning-strategy.md#vs-code-extension-versioning).

**Alpha:** Alpha builds are the first feature-complete builds from the staging branch, triggered once code freeze is in effect. They are intended for internal testing and early feedback from a broader audience. Alpha builds are named `<major>.<minor>.<patch>-alpha` (e.g., `5.1.0-alpha`) and are published to GitHub Releases as pre-release artifacts and to the VS Code Marketplace pre-release channel. They may contain known issues but should be stable enough for testing.

**Beta:** Beta builds are the broader pre-release testing builds, triggered once alpha blockers are resolved. They are named `<major>.<minor>.<patch>-beta` (e.g., `5.1.0-beta`) and are published to GitHub Releases as pre-release artifacts and to the VS Code Marketplace pre-release channel. Beta builds should be stable with no known critical issues.

**RC:** RC builds are the final release candidates before GA, triggered once beta blockers are resolved. They are named `<major>.<minor>.<patch>-rc<n>` (e.g., `5.1.0-rc1`) and are published to GitHub Releases as pre-release artifacts and to the VS Code Marketplace pre-release channel. No known critical issues are permitted in an RC build; any blocker found during RC verification must be resolved on the staging branch before the release proceeds to GA.

> See the [CI/CD Pipelines](../cicd-pipelines.md#release-pipelines) guide for the detailed steps of the pre-release pipeline.

### Step 6: Create and Share the Release Checklist

The release manager creates a GitHub issue in the `integration-engineering` repo, by listing all PRs included in the release as checkboxes (grouped by component and product team member), and shares the link with the team.

> Refer to the [release checklist example](https://github.com/wso2/product-ballerina-integrator/issues/2534) for the expected format.

### Step 7: Prepare Release Documentation

The release manager initiates two documentation efforts alongside the team verification. Both must be completed before the GA build ships.

**Release notes:** The release manager drafts release notes covering the changes in this release and shares them with the product manager for review. After the product manager approves, the release manager opens a PR against [wso2/docs-integrator](https://github.com/wso2/docs-integrator). The PR must be merged and the release notes published by the time the GA build goes live.

**Documentation updates:** The release manager coordinates with the product team members responsible for each change to update the [Integrator documentation website](https://github.com/wso2/docs-integrator). All documentation PRs must be reviewed, approved, and merged to the docs repo before the GA release is published.

### Step 8: Team Verification

Each product team member should install the pre-release build, verify their changes, and check off their PRs in the checklist issue.

If a blocker-level issue is found during verification:

1. The fix author merges the fix to `staging/<release-version>`.
2. The release manager triggers a new RC build from the staging branch (RC2, RC3, …).
3. The release manager adds a new RC section to the existing checklist issue (e.g. **RC2**) listing the additional PRs, and re-shares the link.
4. The team should verify the new build and check off the new items.

Repeat until no blocker-level issues remain. Non-blocking issues may be deferred to a future release with the release manager's approval. Once all checklist items are verified and no blockers remain, the release manager proceeds to Step 9.

### Step 9: Trigger the Release

The release manager triggers the plugin build workflow for each of the four plugin repos (`ballerina-vscode`, `mi-vscode`, `si-vscode`, and the WSO2 Integrator extension in `product-integrator`), reviews the draft GitHub Releases, then publishes all four to the VS Code Marketplace and OpenVSX Registry. Once all plugins are published, the release manager triggers the IDE release workflow in `product-integrator` to produce and publish the final IDE installers.

> See the [CI/CD Pipelines](../cicd-pipelines.md#release-pipelines) guide for the detailed steps of the release pipeline.

### Step 10: Post-Release Steps

After the GA artifacts are published:

1. **Verify the tag:** confirm `v<major>.<minor>.<patch>` was created on the release commit.
2. **Create the maintenance branch:** create `<major>.<minor>.x` from the GA release commit (e.g. `5.1.x`). The previous maintenance branch stays active until its minor version reaches end of life, so multiple patch branches may be active at once (see [Branching Strategy](../branching-strategy.md#patch-branch-majorminorx)).
3. **Delete the staging branch:** delete `staging/<release-version>` once the maintenance branch is in place. Nightly builds return to `main`.
4. **Merge the release changes back to `main`:** open a PR merging the GA release commit into `main`, so the fixes made during code freeze are not lost.
5. **Bump `main`:** open a PR on `main`, updating the product version to the next minor `-SNAPSHOT` (e.g. `5.1.0-SNAPSHOT` → `5.2.0-SNAPSHOT`) and the WSO2 Integrator extension version two minors ahead (e.g. `1.2.0-SNAPSHOT` → `1.4.0-SNAPSHOT`), since the odd minor between them is the pre-release line. The nightly build asserts this bump, so a missed bump fails the next nightly.
6. **Confirm the GitHub Release:** verify the `product-integrator` bundle is published to [GitHub Releases](https://github.com/wso2/product-integrator/releases) with release notes.
7. **Confirm documentation is live:** verify all documentation update PRs and the release notes PR are merged to [wso2/docs-integrator](https://github.com/wso2/docs-integrator) and published on the website.
8. **Update the milestones:** close the release milestone and create the milestone for the next immediate patch release (e.g. `5.1.1`).
9. **Communicate:** notify the team and any affected stakeholders.
