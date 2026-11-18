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

import { type Disposable, EventEmitter, ProgressLocation, window } from "vscode";
import { ext } from "../extensionVariables";
import { type GitHubConnectOutcome, type GitHubRepoAccess, sharedGitHubAccess } from "./github-app";

/** What the person is told when the WSO2 Cloud sign-in changed before an action about GitHub went on. */
export const SIGN_IN_CHANGED_MESSAGE = "Your Choreo Cloud sign-in changed, so connecting GitHub was stopped. Start again from the form.";

/** Who is signed in to WSO2 Cloud, and to which organization; undefined when no one is. */
export function signedInScope(): string | undefined {
	const session = ext.authProvider?.session;
	return session ? `${session.user.userId}/${session.org.handle}` : undefined;
}

/** How WSO2 Cloud can read `owner/repo`, shared for a few seconds by the checks of one repository. */
export function gitHubAccessFor(owner: string, repo: string): Promise<GitHubRepoAccess> {
	const scope = signedInScope();
	return sharedGitHubAccess(ext.clients.platform.cloud, scope ?? "", owner, repo, { log: ext.log.bind(ext), isCurrent: () => signedInScope() === scope });
}

const connectEnded = new EventEmitter<void>();

/** The outcome callbacks, each also ending the wait of {@link untilGitHubConnectEnds}. */
export function endingConnect(outcome: GitHubConnectOutcome): GitHubConnectOutcome {
	const ending =
		<A extends unknown[]>(callback: (...args: A) => void) =>
		(...args: A) => {
			callback(...args);
			connectEnded.fire();
		};
	return {
		connected: ending(outcome.connected),
		noInstallationVisible: ending(outcome.noInstallationVisible),
		requested: ending(outcome.requested),
		// A return this window didn't start belongs to no wait here.
		ignored: (reason) => (reason === "not-started" ? outcome.ignored(reason) : ending(outcome.ignored)(reason)),
		cancelled: ending(outcome.cancelled),
		failed: ending(outcome.failed),
	};
}

/**
 * Starts connecting GitHub and resolves once it ends in this window or, when GitHub cannot return
 * here, once the window has its focus back after the page opened.
 * The person can stop waiting.
 */
export function untilGitHubConnectEnds(returnsHere: boolean, start: () => Promise<void>): Thenable<void> {
	return window.withProgress({ location: ProgressLocation.Notification, title: "Waiting for GitHub", cancellable: true }, (_progress, token) => {
		return new Promise<void>((resolve, reject) => {
			let done = false;
			const subscriptions: Disposable[] = [token.onCancellationRequested(() => end()), connectEnded.event(() => end())];
			function end(error?: unknown) {
				done = true;
				for (const subscription of subscriptions) {
					subscription.dispose();
				}
				error === undefined ? resolve() : reject(error);
			}
			start().then(
				() => !returnsHere && !done && subscriptions.push(untilFocusBack(() => end())),
				(error: unknown) => end(error ?? new Error("Connecting GitHub failed")),
			);
		});
	});
}

/** Calls `back` once the window has lost its focus, as to the browser, and got it back. */
function untilFocusBack(back: () => void): Disposable {
	let left = !window.state.focused;
	return window.onDidChangeWindowState((state) => {
		left ||= !state.focused;
		if (left && state.focused) {
			back();
		}
	});
}
