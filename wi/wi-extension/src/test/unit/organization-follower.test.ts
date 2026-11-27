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

import * as assert from "assert";
import { OrganizationFollower } from "../../cloud/backend/devant/follow-organization";

const foreign = (orgHandle: string) => ({ orgHandle, foreignOrg: true });
const own = (orgHandle: string) => ({ orgHandle, foreignOrg: false });

describe("OrganizationFollower", () => {
	it("moves to the one other organization the workspace is linked to, once for a sign-in", () => {
		const follower = new OrganizationFollower();
		assert.strictEqual(follower.next("acme", { loading: true, items: [] }), undefined);
		assert.strictEqual(follower.next("acme", { loading: false, items: [foreign("beta")] }), "beta");
		assert.strictEqual(follower.next("beta", { loading: true, items: [] }), undefined);
		assert.strictEqual(follower.next("beta", { loading: false, items: [foreign("acme")] }), undefined, "a move away afterwards stays");
	});

	it("reads the state there is when it starts as a finished read", () => {
		const follower = new OrganizationFollower();
		assert.strictEqual(follower.next("acme", { loading: false, items: [foreign("beta")] }), "beta");
	});

	it("stays where a link moved the session before the workspace was read", () => {
		const follower = new OrganizationFollower();
		assert.strictEqual(follower.next("acme", { loading: true, items: [] }), undefined);
		// The link moves to beta while the first read is pending; the read then finds only acme's projects.
		assert.strictEqual(follower.next("beta", { loading: true, items: [] }), undefined);
		assert.strictEqual(follower.next("beta", { loading: false, items: [foreign("acme")] }), undefined);
	});

	it("does not move when a project of the current organization, or of several others, is linked", () => {
		const mixed = new OrganizationFollower();
		assert.strictEqual(mixed.next("acme", { loading: false, items: [own("acme"), foreign("beta")] }), undefined);
		const several = new OrganizationFollower();
		assert.strictEqual(several.next("acme", { loading: false, items: [foreign("beta"), foreign("gamma")] }), undefined);
	});

	it("decides again after a sign-out", () => {
		const follower = new OrganizationFollower();
		assert.strictEqual(follower.next("acme", { loading: false, items: [own("acme")] }), undefined);
		assert.strictEqual(follower.next(undefined, { loading: false, items: [] }), undefined);
		assert.strictEqual(follower.next("acme", { loading: false, items: [foreign("beta")] }), "beta");
	});
});
