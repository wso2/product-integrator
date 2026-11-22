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

import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import * as path from "path";
import { ProgressLocation, Uri, commands, window, workspace } from "vscode";
import { ext } from "../extensionVariables";
import { initGit } from "./git/main";
import { repositorySubPathOf, repositoryUrlOf } from "./stores/context-store";

/** Where a GitHub repository is read from; the platform binds integrations to no other host. */
const GITHUB_HOST = "github.com";

/**
 * Brings the source of the integration a cloud editor was opened for into the
 * editor.
 *
 * An editor opened for an existing integration boots on the bundled scaffold:
 * the image clones nothing, so the person's own source is not in the workspace
 * and every integration-level action has nothing to act on.
 *
 * Credentials are git's own business here. The clone runs through the
 * extension's askpass helper, so a public repository is cloned without anyone
 * signing in to anything, and a private one asks for GitHub once and keeps that
 * session for the push afterwards.
 */
export async function cloneOpenedIntegration(): Promise<void> {
	const integrationId = process.env.SOURCE_COMPONENT_ID;
	const projectId = process.env.CLOUD_INITIAL_PROJECT_ID;
	if (!ext.isDevantCloudEditor || !integrationId || !projectId || !ext.authProvider?.isLoggedIn) {
		return;
	}
	const folder = workspace.workspaceFolders?.[0];
	if (!folder || (await inGitRepository(folder.uri.fsPath))) {
		// Already cloned: this runs again when the clone below reopens the window.
		return;
	}
	try {
		await cloneIntoEditor(integrationId, projectId, folder.uri.fsPath);
	} catch (error) {
		ext.logError("Failed to clone the integration opened in the cloud editor", error as Error);
		const tryAgain = "Try Again";
		const choice = await window.showErrorMessage(
			`Could not fetch the source of this integration: ${(error as Error).message}. The editor is showing an empty project until it is fetched.`,
			tryAgain,
		);
		if (choice === tryAgain) {
			await cloneOpenedIntegration();
		}
	}
}

async function cloneIntoEditor(integrationId: string, projectId: string, workspacePath: string): Promise<void> {
	const repository = await ext.clients.platform.cloud.components.repository(integrationId, projectId);
	const repositoryUrl = repositoryUrlOf(repository);
	if (!repositoryUrl) {
		ext.log(`The integration ${integrationId} has no repository to clone.`);
		return;
	}
	if (new URL(repositoryUrl).hostname.toLowerCase() !== GITHUB_HOST) {
		// Cloning is as far as the platform's GitHub App reaches; another host would
		// have no credential behind it and would stall on a prompt nobody can answer.
		window.showWarningMessage(`This integration's repository is not on ${GITHUB_HOST}, so the cloud editor cannot fetch its source. Work on it from a local editor.`);
		return;
	}

	const git = await initGit(ext.context);
	if (!git) {
		throw new Error("Git is not available in this editor");
	}
	const parentPath = path.join(workspacePath, "..");
	// Reopening the editor's link starts on the scaffold folder again, which is
	// not a git repository, so the check above does not see the clone made last
	// time. Cloning from here would make a second copy -- Git.clone counts up to
	// <repo>-1 -- and leave the person's unpushed work in the first one.
	const alreadyCloned = await cloneBesideWorkspace(git, parentPath, repositoryUrl);
	if (alreadyCloned) {
		ext.log(`Opening the clone already in this editor at ${alreadyCloned}`);
		await openIntegration(alreadyCloned, repositorySubPathOf(repository), repository, workspacePath);
		return;
	}
	// Only the integration's own directory is checked out: one repository may hold
	// many integrations, and the editor was opened for exactly one of them.
	const subPath = repositorySubPathOf(repository);
	const clonedPath = await window.withProgress(
		{ title: `Fetching the source of this integration from ${repository?.organizationApp}/${repository?.nameApp}`, location: ProgressLocation.Notification },
		(progress, cancellationToken) =>
			git.clone(
				repositoryUrl,
				{
					parentPath,
					ref: repository?.branch || undefined,
					sparsePaths: subPath ? [subPath] : undefined,
					progress: { report: ({ increment, ...rest }: { increment: number }) => progress.report({ increment, ...rest }) },
				},
				cancellationToken,
			),
	);

	await nameTheCommitter(git, clonedPath);
	await openIntegration(clonedPath, subPath, repository, workspacePath);
}

/**
 * Opens the integration's own directory inside `clonedPath`, carrying over the
 * workspace settings the image put in the scaffold.
 *
 * The repository root stays above it, which is where the integration's own
 * directory is matched from and what the push acts on.
 */
async function openIntegration(
	clonedPath: string,
	subPath: string | undefined,
	repository: { organizationApp?: string; nameApp?: string; branch?: string } | undefined,
	scaffoldPath: string,
): Promise<void> {
	const openPath = subPath ? path.join(clonedPath, subPath) : clonedPath;
	if (!existsSync(openPath)) {
		throw new Error(`${subPath} is not in ${repository?.organizationApp}/${repository?.nameApp} on ${repository?.branch}`);
	}
	carryEditorSettings(scaffoldPath, openPath, clonedPath);
	// Which integration this editor is for is carried by the environment, which outlives
	// the reopen; workspace state does not, since the folder opened here is another one.
	await commands.executeCommand("vscode.openFolder", Uri.file(openPath), { forceNewWindow: false });
}

/**
 * Names the person on the commits they make here, from the WSO2 Cloud session.
 * A container has no git identity of its own, and without one `git commit`
 * refuses the first commit of the session with nothing the person can act on.
 */
async function nameTheCommitter(git: NonNullable<Awaited<ReturnType<typeof initGit>>>, repositoryPath: string): Promise<void> {
	const user = ext.authProvider?.session?.user;
	if (!user?.email) {
		return;
	}
	try {
		const repo = git.open(await git.getRepositoryRoot(repositoryPath), await git.getRepositoryDotGit(repositoryPath));
		await repo.exec(["config", "user.email", user.email]);
		await repo.exec(["config", "user.name", user.displayName || user.email]);
	} catch (error) {
		// Only the first commit is affected, and git says plainly what to set.
		ext.logError("Could not set the committer on the cloned repository", error as Error);
	}
}

/** The workspace files the image puts in the scaffold and keeps out of git. */
const EDITOR_LOCAL_FILES = [path.join(".vscode", "settings.json"), path.join(".vscode", "launch.json")];

/**
 * Copies the editor's own workspace settings from the scaffold into the clone.
 *
 * `setup.sh` writes these into the project it scaffolds (`ballerina.isBI`,
 * `ballerina.enableRunFast`) and hides them from `git status`. A clone arrives
 * with neither, so the integration can open outside the integrator view. A file
 * the repository carries itself is left alone.
 */
function carryEditorSettings(scaffoldPath: string, openPath: string, repositoryRoot: string): void {
	for (const relativePath of EDITOR_LOCAL_FILES) {
		const from = path.join(scaffoldPath, relativePath);
		const to = path.join(openPath, relativePath);
		if (!existsSync(from) || existsSync(to)) {
			continue;
		}
		try {
			mkdirSync(path.dirname(to), { recursive: true });
			copyFileSync(from, to);
			excludeFromGit(repositoryRoot, path.relative(repositoryRoot, to));
		} catch (error) {
			// The integration still opens; only the editor's own defaults are missing.
			ext.logError(`Could not carry ${relativePath} into the clone`, error as Error);
		}
	}
}

/** Keeps a path out of `git status` without touching a tracked .gitignore. */
function excludeFromGit(repositoryRoot: string, relativePath: string): void {
	const excludeFile = path.join(repositoryRoot, ".git", "info", "exclude");
	const entry = relativePath.split(path.sep).join("/");
	if (existsSync(excludeFile) && readFileSync(excludeFile, "utf8").split(/\r?\n/).includes(entry)) {
		return;
	}
	mkdirSync(path.dirname(excludeFile), { recursive: true });
	appendFileSync(excludeFile, `\n${entry}\n`);
}

/**
 * The clone of `repositoryUrl` already sitting beside the workspace, if there is
 * one. Only a directory that is its own repository root counts, so a directory
 * inside an existing clone is never mistaken for one.
 */
async function cloneBesideWorkspace(
	git: NonNullable<Awaited<ReturnType<typeof initGit>>>,
	parentPath: string,
	repositoryUrl: string,
): Promise<string | undefined> {
	let entries: string[];
	try {
		entries = readdirSync(parentPath, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(parentPath, entry.name));
	} catch {
		return undefined;
	}
	for (const candidate of entries) {
		try {
			const root = await git.getRepositoryRoot(candidate);
			if (path.resolve(root) !== path.resolve(candidate)) {
				continue;
			}
			if (remotesPointAt(await git.getRemotes(root), repositoryUrl)) {
				return root;
			}
		} catch {
			// Not a repository, or git cannot read it; neither is the clone.
		}
	}
	return undefined;
}

/** Whether any remote of a repository is `repositoryUrl`, ignoring how it is spelled. */
function remotesPointAt(remotes: string, repositoryUrl: string): boolean {
	const normalise = (value: string) => value.trim().toLowerCase().replace(/\.git$/, "").replace(/\/+$/, "");
	const wanted = normalise(repositoryUrl);
	return remotes
		.split(/\s+/)
		.some((token) => token.includes("/") && normalise(token.replace(/^https?:\/\/[^@/]*@/, "https://")) === wanted);
}

/** Whether `directoryPath` is inside a git repository; `getGitRoot` throws when it is not. */
async function inGitRepository(directoryPath: string): Promise<boolean> {
	try {
		const git = await initGit(ext.context);
		return !!(await git?.getRepositoryRoot(directoryPath));
	} catch {
		return false;
	}
}
