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

/**
 * Reports that someone is looking at this editor.
 *
 * A Cloud Editor pod is provisioned per user and nothing tells the platform when
 * the user walks away, so the container watches for idleness itself and asks to
 * be suspended. It can see whether a browser is *connected* — code-server's
 * heartbeat says that much — but not whether the tab is in front of anyone: a
 * backgrounded tab holds its websocket open and beats forever.
 *
 * This is the missing half. While the editor window has focus, the file named by
 * EDITOR_ACTIVITY_FILE is refreshed; its age is how long the tab has been
 * ignored. The container's watcher treats an absent file as "no focus signal"
 * and falls back to the heartbeat alone, so an editor running an extension that
 * predates this is never suspended for want of a report it could not make.
 */

/** The environment variable naming the file to refresh; unset outside a Cloud Editor. */
export const ENV_ACTIVITY_FILE = "EDITOR_ACTIVITY_FILE";

/**
 * How often the file is refreshed while focused. Well under any sane idle
 * timeout, so the mark's age reads as "seconds since focus was lost" rather than
 * "seconds since the last write".
 */
export const REFRESH_INTERVAL_MS = 30_000;

export interface ActivityReporterDeps {
	/** Refreshes the mark. Rejections are reported, never thrown at the caller. */
	touch: (path: string) => Promise<void>;
	/** True while the editor window has focus. */
	isFocused: () => boolean;
	/** Subscribes to focus changes; returns an unsubscribe. */
	onFocusChange: (listener: () => void) => () => void;
	setInterval: (handler: () => void, ms: number) => NodeJS.Timeout;
	clearInterval: (handle: NodeJS.Timeout) => void;
	logError: (message: string, error: Error) => void;
}

export interface ActivityReporter {
	stop: () => void;
}

/**
 * Starts refreshing the mark, returning a handle that stops it. Reports once
 * immediately when focused, so an editor that is being used is never a full
 * interval away from having said so.
 */
export function startActivityReporter(path: string, deps: ActivityReporterDeps): ActivityReporter {
	let stopped = false;
	// One failure means the file is unwritable, and it will be unwritable on
	// every tick after it. Reported once rather than every thirty seconds.
	let reportedFailure = false;

	const report = (): void => {
		if (stopped || !deps.isFocused()) {
			return;
		}
		deps.touch(path).catch((error: unknown) => {
			if (!reportedFailure) {
				reportedFailure = true;
				deps.logError(
					`Could not record editor activity at ${path}; this editor may be suspended while it is in use`,
					error as Error,
				);
			}
		});
	};

	report();
	const unsubscribe = deps.onFocusChange(report);
	const timer = deps.setInterval(report, REFRESH_INTERVAL_MS);

	return {
		stop: () => {
			stopped = true;
			unsubscribe();
			deps.clearInterval(timer);
		},
	};
}
