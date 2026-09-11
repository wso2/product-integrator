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

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type DeployDeps,
	describeOutcome,
	isBuildSuccess,
	isBuildTerminal,
	isDeploymentSuccess,
	isDeploymentTerminal,
	watchDeployment,
} from "./deploy";
import type { IpaasComponentDeployment, IpaasWorkflowRun } from "./types";

const COMPONENT = "my-int";
const ENVIRONMENT = "development";

/**
 * A platform that answers from scripted sequences, with a clock that only
 * advances when the code under test sleeps. Nothing here waits in real time, so
 * a twenty-minute timeout is exercised in microseconds.
 */
function harness(script: {
	builds?: IpaasWorkflowRun[][];
	buildPolls?: IpaasWorkflowRun[];
	deployments?: Array<IpaasComponentDeployment | null>;
	isCancelled?: () => boolean;
}) {
	let clock = 1_000_000;
	const reports: string[] = [];
	const calls = { deploy: 0, listBuilds: 0, getBuild: 0, getDeployment: 0 };
	let buildIndex = 0;
	let pollIndex = 0;
	let deploymentIndex = 0;

	const nextOf = <T>(
		sequence: T[] | undefined,
		index: number,
	): T | undefined =>
		sequence && sequence.length > 0
			? sequence[Math.min(index, sequence.length - 1)]
			: undefined;

	const deps: DeployDeps = {
		async listBuilds() {
			calls.listBuilds++;
			return nextOf(script.builds, buildIndex++) ?? [];
		},
		async getBuild(_component, buildName) {
			calls.getBuild++;
			return nextOf(script.buildPolls, pollIndex++) ?? { name: buildName };
		},
		async getDeployment() {
			calls.getDeployment++;
			return nextOf(script.deployments, deploymentIndex++) ?? null;
		},
		async deploy() {
			calls.deploy++;
		},
		async sleep(ms) {
			clock += ms;
		},
		now: () => clock,
		report: (message) => reports.push(message),
		isCancelled: script.isCancelled,
	};
	return { deps, reports, calls };
}

const run = (name: string, status?: string): IpaasWorkflowRun => ({
	name,
	componentName: COMPONENT,
	status,
});

const options = {
	componentName: COMPONENT,
	environment: ENVIRONMENT,
	startedAt: 0,
	pollIntervalMs: 1_000,
};

describe("status predicates", () => {
	it("treats only Succeeded and Failed as a finished build", () => {
		assert.equal(isBuildTerminal("Succeeded"), true);
		assert.equal(isBuildTerminal("Failed"), true);
		assert.equal(isBuildTerminal("Running"), false);
		assert.equal(isBuildTerminal("Pending"), false);
		assert.equal(isBuildTerminal(undefined), false);
	});

	// IN_PROGRESS is the only non-terminal deployment state. ERROR is terminal
	// because the platform reports an unrecognised condition that way rather
	// than leaving it pending, so waiting on it would never end.
	it("treats every deployment state but IN_PROGRESS as settled", () => {
		assert.equal(isDeploymentTerminal("ACTIVE"), true);
		assert.equal(isDeploymentTerminal("SUSPENDED"), true);
		assert.equal(isDeploymentTerminal("ERROR"), true);
		assert.equal(isDeploymentTerminal("IN_PROGRESS"), false);
	});

	// Settled is not the same as running: a suspended deployment finished
	// converging and is still not serving.
	it("counts only ACTIVE as a successful deployment", () => {
		assert.equal(isDeploymentSuccess("ACTIVE"), true);
		assert.equal(isDeploymentSuccess("SUSPENDED"), false);
		assert.equal(isDeploymentSuccess("ERROR"), false);
	});

	it("reports an unexpected status as itself rather than guessing", () => {
		assert.match(describeOutcome("deploying", "WEIRD"), /WEIRD/);
		assert.match(describeOutcome("building", "WEIRD"), /WEIRD/);
		assert.equal(isBuildSuccess("succeeded"), false);
	});
});

describe("watchDeployment", () => {
	it("watches the build the create started, then the deployment", async () => {
		const { deps, calls } = harness({
			builds: [[run("my-int-100", "Running")]],
			buildPolls: [
				run("my-int-100", "Running"),
				run("my-int-100", "Succeeded"),
			],
			deployments: [
				{
					releaseId: "rel-1",
					cron: "",
					cronTimezone: "",
					configCount: 0,
					deploymentStatusV2: "IN_PROGRESS",
				},
				{
					releaseId: "rel-1",
					cron: "",
					cronTimezone: "",
					configCount: 0,
					deploymentStatusV2: "ACTIVE",
				},
			],
		});

		const outcome = await watchDeployment(deps, options);
		assert.equal(outcome.ok, true);
		assert.equal(outcome.status, "ACTIVE");
		assert.equal(outcome.buildName, "my-int-100");
		assert.equal(outcome.releaseId, "rel-1");
		// autoDeploy already produced one, so asking again would snapshot a
		// second release for the same build.
		assert.equal(calls.deploy, 0);
	});

	it("asks for a deployment when none appears on its own", async () => {
		const { deps, calls } = harness({
			builds: [[run("my-int-100", "Succeeded")]],
			buildPolls: [run("my-int-100", "Succeeded")],
			deployments: [
				null,
				null,
				null,
				{
					releaseId: "rel-2",
					cron: "",
					cronTimezone: "",
					configCount: 0,
					deploymentStatusV2: "ACTIVE",
				},
			],
		});

		const outcome = await watchDeployment(deps, {
			...options,
			autoDeployGraceMs: 2_000,
		});
		assert.equal(calls.deploy, 1);
		assert.equal(outcome.ok, true);
		assert.equal(outcome.releaseId, "rel-2");
	});

	it("stops at a failed build without deploying", async () => {
		const { deps, calls } = harness({
			builds: [[run("my-int-100", "Failed")]],
			buildPolls: [run("my-int-100", "Failed")],
		});

		const outcome = await watchDeployment(deps, options);
		assert.equal(outcome.ok, false);
		assert.equal(outcome.stage, "building");
		assert.equal(outcome.status, "Failed");
		assert.match(outcome.message, /Build failed/);
		assert.equal(calls.deploy, 0);
		assert.equal(calls.getDeployment, 0);
	});

	it("reports a settled but not running deployment as unsuccessful", async () => {
		const { deps } = harness({
			builds: [[run("my-int-100", "Succeeded")]],
			buildPolls: [run("my-int-100", "Succeeded")],
			deployments: [
				{
					releaseId: "r",
					cron: "",
					cronTimezone: "",
					configCount: 0,
					deploymentStatusV2: "SUSPENDED",
				},
			],
		});

		const outcome = await watchDeployment(deps, options);
		assert.equal(outcome.ok, false);
		assert.equal(outcome.status, "SUSPENDED");
		assert.match(outcome.message, /suspended/i);
	});

	it("reports a failed deployment", async () => {
		const { deps } = harness({
			builds: [[run("my-int-100", "Succeeded")]],
			buildPolls: [run("my-int-100", "Succeeded")],
			deployments: [
				{
					releaseId: "r",
					cron: "",
					cronTimezone: "",
					configCount: 0,
					deploymentStatusV2: "ERROR",
				},
			],
		});

		const outcome = await watchDeployment(deps, options);
		assert.equal(outcome.ok, false);
		assert.equal(outcome.status, "ERROR");
	});

	// A build that never starts must not hang the command forever.
	it("gives up when no build ever appears", async () => {
		const { deps } = harness({ builds: [[]] });
		const outcome = await watchDeployment(deps, {
			...options,
			buildTimeoutMs: 5_000,
		});
		assert.equal(outcome.ok, false);
		assert.equal(outcome.stage, "building");
		assert.match(outcome.message, /has not built/);
	});

	it("gives up on a build that never finishes, naming it", async () => {
		const { deps } = harness({
			builds: [[run("my-int-100", "Running")]],
			buildPolls: [run("my-int-100", "Running")],
		});
		const outcome = await watchDeployment(deps, {
			...options,
			buildTimeoutMs: 5_000,
		});
		assert.equal(outcome.ok, false);
		assert.match(outcome.message, /my-int-100/);
	});

	it("gives up on a deployment stuck in progress", async () => {
		const { deps } = harness({
			builds: [[run("my-int-100", "Succeeded")]],
			buildPolls: [run("my-int-100", "Succeeded")],
			deployments: [
				{
					releaseId: "r",
					cron: "",
					cronTimezone: "",
					configCount: 0,
					deploymentStatusV2: "IN_PROGRESS",
				},
			],
		});
		const outcome = await watchDeployment(deps, {
			...options,
			deployTimeoutMs: 5_000,
		});
		assert.equal(outcome.ok, false);
		assert.equal(outcome.stage, "deploying");
		assert.match(outcome.message, /Timed out/);
	});

	// A build older than the create belongs to a previous deploy of the same
	// component and must not be reported as this one.
	it("ignores builds that predate the deploy", async () => {
		const { deps } = harness({
			builds: [[run("my-int-50", "Succeeded")]],
		});
		const outcome = await watchDeployment(deps, {
			...options,
			startedAt: 100,
			buildTimeoutMs: 5_000,
		});
		assert.equal(outcome.ok, false);
		assert.match(outcome.message, /has not built/);
	});

	it("stops when cancelled and says the work continues", async () => {
		let polls = 0;
		const { deps } = harness({
			builds: [[run("my-int-100", "Running")]],
			buildPolls: [run("my-int-100", "Running")],
			isCancelled: () => ++polls > 2,
		});
		const outcome = await watchDeployment(deps, options);
		assert.equal(outcome.ok, false);
		assert.equal(outcome.status, "cancelled");
		assert.match(outcome.message, /continue on the platform/);
	});

	it("reports progress as the status changes", async () => {
		const { deps, reports } = harness({
			builds: [[run("my-int-100", "Running")]],
			buildPolls: [
				run("my-int-100", "Running"),
				run("my-int-100", "Succeeded"),
			],
			deployments: [
				{
					releaseId: "r",
					cron: "",
					cronTimezone: "",
					configCount: 0,
					deploymentStatusV2: "ACTIVE",
				},
			],
		});
		await watchDeployment(deps, options);
		assert.ok(reports.some((r) => r.includes("my-int-100")));
		assert.ok(reports.some((r) => /build succeeded/i.test(r)));
	});
});
