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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
	Disposable,
	type ExtensionContext,
	Uri,
	type WorkspaceFolder,
	commands,
	env,
	l10n,
	version as vscodeVersion,
	window,
	workspace,
} from "vscode";
import { ext } from "../extensionVariables";
import { Askpass } from "./askpass";
import { Git, type IGit, findGit } from "./git";
import { GithubCredentialProviderManager } from "./github/credentialProvider";
import { type IPCServer, createIPCServer } from "./ipc/ipcServer";

async function _init(context: ExtensionContext, disposables: Disposable[]): Promise<Git | undefined> {
	const pathValue = workspace.getConfiguration("git").get<string | string[]>("path");
	let pathHints = Array.isArray(pathValue) ? pathValue : pathValue ? [pathValue] : [];

	const { isTrusted, workspaceFolders = [] } = workspace;
	const excludes = isTrusted ? [] : workspaceFolders.map((f) => path.normalize(f.uri.fsPath).replace(/[\r\n]+$/, ""));

	if (!isTrusted && pathHints.length !== 0) {
		// Filter out any non-absolute paths
		pathHints = pathHints.filter((p) => path.isAbsolute(p));
	}

	const info = await findGit(pathHints, (gitPath) => {
		ext.log(l10n.t('Validating found git in: "{0}"', gitPath));
		if (excludes.length === 0) {
			return true;
		}

		const normalized = path.normalize(gitPath).replace(/[\r\n]+$/, "");
		const skip = excludes.some((e) => normalized.startsWith(e));
		if (skip) {
			ext.log(l10n.t('Skipped found git in: "{0}"', gitPath));
		}
		return !skip;
	});

	let ipcServer: IPCServer | undefined = undefined;

	try {
		ipcServer = await createIPCServer(context.storagePath);
	} catch (error: any) {
		ext.logError(`Failed to create git IPC: ${error?.message}${error?.cause ? `\nCause: ${error.cause.message}` : ""}`);
	}

	const askpass = new Askpass(ipcServer);
	disposables.push(askpass);
	const credentialsManager = new GithubCredentialProviderManager(askpass);
	disposables.push(credentialsManager);

	const environment = { ...askpass.getEnv(), ...ipcServer?.getEnv() };
	ext.log(l10n.t('Using git "{0}" from "{1}"', info.version, info.path));

	const git = new Git({
		gitPath: info.path,
		userAgent: `git/${info.version} (${(os as any).version?.() ?? os.type()} ${os.release()}; ${os.platform()} ${os.arch()}) vscode/${vscodeVersion} (${env.appName})`,
		version: info.version,
		env: environment,
	});

	checkGitVersion(info);
	commands.executeCommand("setContext", "gitVersion2.35", git.compareGitVersionTo("2.35") >= 0);

	return git;
}

async function isGitRepository(folder: WorkspaceFolder): Promise<boolean> {
	if (folder.uri.scheme !== "file") {
		return false;
	}

	const dotGit = path.join(folder.uri.fsPath, ".git");

	try {
		const dotGitStat = await new Promise<fs.Stats>((c, e) => fs.stat(dotGit, (err, stat) => (err ? e(err) : c(stat))));
		return dotGitStat.isDirectory();
	} catch (err) {
		return false;
	}
}

async function warnAboutMissingGit(): Promise<void> {
	const download = l10n.t("Download Git");
	const installLater = l10n.t("Install Later");
	const choice = await window.showWarningMessage(
		l10n.t('Git not found. Install it or configure it using the "git.path" setting.'),
		download,
		installLater,
	);

	if (choice === download) {
		commands.executeCommand("vscode.open", Uri.parse("https://aka.ms/vscode-download-git"));
	}
}

export async function initGit(context: ExtensionContext): Promise<Git | undefined> {
	const disposables: Disposable[] = [];
	context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));
	let git: Git | undefined;
	try {
		git = await _init(context, disposables);
	} catch (err: any) {
		if (!/Git installation not found/.test(err.message || "")) {
			ext.logError(`Error initializing git. ${err?.message}${err?.cause ? `\nCause: ${err.cause.message}` : ""}`);
			window.showErrorMessage(err.message);
			return;
		}
		console.warn(err.message);
		commands.executeCommand("setContext", "git.missing", true);
		const shownGitNotInstalled = context.workspaceState.get("SHOWN_GIT_NOT_INSTALLED");
		if(!shownGitNotInstalled){
			context.workspaceState.update("SHOWN_GIT_NOT_INSTALLED", true);
			warnAboutMissingGit();
		}
	}
	return git;
}

async function checkGitv1(info: IGit): Promise<void> {
	const config = workspace.getConfiguration("git");
	const shouldIgnore = config.get<boolean>("ignoreLegacyWarning") === true;

	if (shouldIgnore) {
		return;
	}

	if (!/^[01]/.test(info.version)) {
		return;
	}

	const update = l10n.t("Update Git");
	const neverShowAgain = l10n.t("Don't Show Again");

	const choice = await window.showWarningMessage(
		l10n.t('You seem to have git "{0}" installed. Code works best with git >= 2', info.version),
		update,
		neverShowAgain,
	);

	if (choice === update) {
		commands.executeCommand("vscode.open", Uri.parse("https://aka.ms/vscode-download-git"));
	} else if (choice === neverShowAgain) {
		await config.update("ignoreLegacyWarning", true, true);
	}
}

async function checkGitWindows(info: IGit): Promise<void> {
	if (!/^2\.(25|26)\./.test(info.version)) {
		return;
	}

	const config = workspace.getConfiguration("git");
	const shouldIgnore = config.get<boolean>("ignoreWindowsGit27Warning") === true;

	if (shouldIgnore) {
		return;
	}

	const update = l10n.t("Update Git");
	const neverShowAgain = l10n.t("Don't Show Again");
	const choice = await window.showWarningMessage(
		l10n.t('There are known issues with the installed Git "{0}". Please update to Git >= 2.27 for the git features to work correctly.', info.version),
		update,
		neverShowAgain,
	);

	if (choice === update) {
		commands.executeCommand("vscode.open", Uri.parse("https://aka.ms/vscode-download-git"));
	} else if (choice === neverShowAgain) {
		await config.update("ignoreWindowsGit27Warning", true, true);
	}
}

async function checkGitVersion(info: IGit): Promise<void> {
	await checkGitv1(info);

	if (process.platform === "win32") {
		await checkGitWindows(info);
	}
}
