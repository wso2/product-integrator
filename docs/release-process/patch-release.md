# Patch Release Process

_Authors_: @NipunaRanasinghe \
_Reviewers_: \
_Created_: 2026/06/10 \
_Updated_: 2026/06/17

> For release types, schedule, and release order, see the [Release Process overview](README.md).

A patch release targets the `<major>.<minor>.x` maintenance branch, not `main`.

### Step 1: Create the Release Milestone

Confirm the dedicated milestone for this patch release exists in the `product-integrator` repo (e.g. [WSO2 Integrator 5.0.1](https://github.com/wso2/product-integrator/milestone/8)), and create it if it does not. All changes shipping in the release are tracked against this milestone.

### Step 2: Initiate the Release Thread

The release manager initiates a dedicated thread in the integration team chat with the release version as the topic. The thread must include the planned scope of the release and the target release date. This thread is the primary communication channel between all release stakeholders. Product team members should use it to raise release blockers and flag concerns throughout the release process.

### Step 3: Qualify the Fixes

The release manager confirms every change qualifies. The release includes bug fixes and security patches only; no new features.

### Step 4: Create the Pre-Release Build

The release manager triggers a pre-release build from the target commit on `<major>.<minor>.x`. This publishes to the VS Code Marketplace pre-release channel and creates a pre-release tag on GitHub Releases. The team installs and verifies this build.

> See the [CI/CD Pipelines](../cicd-pipelines.md#release-pipelines) guide for the detailed steps of the pre-release pipeline.

### Step 5: Create and Share the Release Checklist

The release manager creates a GitHub issue in the `integration-engineering` repo, listing all PRs included in the release as checkboxes (grouped by repo and product team member), and shares the link with the team.

> Refer to the [release checklist example](https://github.com/wso2/product-ballerina-integrator/issues/2534) for the expected format.

### Step 6: Prepare Release Notes

The release manager drafts release notes for the patch and shares them with the product manager for review. After the product manager approves, the release manager opens a PR against [wso2/docs-integrator](https://github.com/wso2/docs-integrator) and ensures it is merged and published before the GA build ships. If any fixes affect documented behavior, the corresponding documentation updates should be included in the same PR.

### Step 7: Team Verification

Each product team member should install the pre-release build, verify their changes, and check off their PRs in the checklist issue. If a blocker-level issue is found, the fix author merges the fix to `<major>.<minor>.x`; the release manager triggers a new pre-release build and adds a new RC section to the checklist issue. Repeat until no blockers remain.

### Step 8: Trigger the Release Workflow

The release manager triggers the plugin build workflow for each of the four plugin repos targeting `<major>.<minor>.x`, reviews the draft GitHub Releases, publishes all four to the VS Code Marketplace and OpenVSX Registry, then triggers the IDE release workflow in `product-integrator` to produce and publish the final IDE installers.

> See the [CI/CD Pipelines](../cicd-pipelines.md#release-pipelines) guide for the detailed steps of the release pipeline.

### Step 9: Post-Release Steps

1. **Verify the tag** — confirm `v<major>.<minor>.<patch>` was created on the release commit.
2. **Confirm the GitHub Release** — verify artifacts and release notes are published.
3. **Confirm documentation is live** — verify the release notes PR is merged to [wso2/docs-integrator](https://github.com/wso2/docs-integrator) and published.
4. **Merge to `main`** — merge the maintenance branch into `main` so the fixes are included in the next feature release.
5. **Update the milestones** — close the release milestone and create the milestone for the next immediate patch release (e.g. `5.0.2`).
6. **Communicate** — notify the team; for security fixes, describe the fix without exposing exploit details.
