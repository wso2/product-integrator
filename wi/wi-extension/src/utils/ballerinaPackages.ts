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

import { cpSync, existsSync, readdirSync } from "fs";
import * as path from "path";
import { env } from "vscode";

/**
 * Repairs the active Ballerina distribution with the packages this product pre-bundles.
 *
 * The build stages a set of Ballerina Central packages so that a fresh install can compile the
 * projects the product's own templates generate without reaching Ballerina Central. The installers
 * put them in the bundled distribution AND in the editor payload (`<appRoot>/ballerina-packages`),
 * because the bundled distribution is frequently not the one actually in use — a component update
 * or an already-seeded copy can leave the active one without the packages. This reads the editor
 * payload and tops up whichever distribution ended up active.
 *
 * What is bundled, and the full argument for the second copy:
 * ci/build/ballerina-packages.properties, "How they reach a user".
 *
 * Cheap and idempotent: an existence check per package, and a copy only for what is missing. It
 * never overwrites a package the distribution already has — a version present upstream is left
 * exactly as the distribution shipped it.
 */

/** One `<org>/<name>/<version>` package directory inside a `bala` repository. */
interface StagedPackage {
	org: string;
	name: string;
	version: string;
	sourceDir: string;
}

const OVERLAY_DIR_NAME = "ballerina-packages";

/**
 * `vscode.env.appRoot` is the editor payload root — `<app>/Contents/Resources/app` on macOS and
 * `<install>/resources/app` elsewhere. Using it rather than deriving paths per platform keeps this
 * in step with wherever the installers put the payload, and it is the part of the install that an
 * editor-only update replaces, so the overlay travels with it.
 */
function getOverlayRoot(): string {
	return path.join(env.appRoot, OVERLAY_DIR_NAME);
}

/** Lists `<org>/<name>/<version>` triples under a `bala` repository root. */
function listStagedPackages(balaRoot: string): StagedPackage[] {
	const packages: StagedPackage[] = [];
	for (const org of readdirSync(balaRoot, { withFileTypes: true })) {
		if (!org.isDirectory()) {
			continue;
		}
		const orgDir = path.join(balaRoot, org.name);
		for (const name of readdirSync(orgDir, { withFileTypes: true })) {
			if (!name.isDirectory()) {
				continue;
			}
			const nameDir = path.join(orgDir, name.name);
			for (const version of readdirSync(nameDir, { withFileTypes: true })) {
				if (!version.isDirectory()) {
					continue;
				}
				packages.push({
					org: org.name,
					name: name.name,
					version: version.name,
					sourceDir: path.join(nameDir, version.name),
				});
			}
		}
	}
	return packages;
}

/**
 * Copies every pre-bundled package missing from `ballerinaHome`'s package repository into it.
 *
 * @param ballerinaHome the active Ballerina distribution (WSO2_INTEGRATOR_BALLERINA_HOME)
 * @param log           progress sink; this is best-effort repair, so nothing here throws
 * @param logError      failure sink
 * @returns the packages it added, empty when there was nothing to do
 */
export function applyBundledBallerinaPackages(
	ballerinaHome: string | undefined,
	log: (message: string) => void,
	logError: (message: string, error?: Error) => void,
): StagedPackage[] {
	const added: StagedPackage[] = [];
	try {
		if (!ballerinaHome || !existsSync(ballerinaHome)) {
			// No resolved distribution (extension development host, or a broken install). Nothing
			// to repair, and guessing at a path would be worse than doing nothing.
			return added;
		}

		const overlayBala = path.join(getOverlayRoot(), "bala");
		if (!existsSync(overlayBala)) {
			// The Integrator flavor stages no packages, so this is the normal path there.
			return added;
		}

		const targetBala = path.join(ballerinaHome, "repo", "bala");
		for (const pkg of listStagedPackages(overlayBala)) {
			const target = path.join(targetBala, pkg.org, pkg.name, pkg.version);
			if (existsSync(target)) {
				continue;
			}
			// Copy to the final path directly rather than staging and renaming: a partial copy here
			// is self-correcting (the next startup sees the directory and would skip it, but the
			// Ballerina resolver treats an incomplete bala as absent and falls back to Central),
			// whereas a rename across the data folder can cross a device boundary and fail outright.
			//
			// toNamespacedPath: bala trees nest deeply enough to pass Windows' 260-character MAX_PATH,
			// where fs calls throw without the \\?\ extended-length prefix. The bundled-component
			// seeding in the app shell hits the same limit and handles it the same way.
			cpSync(path.toNamespacedPath(pkg.sourceDir), path.toNamespacedPath(target), { recursive: true });
			added.push(pkg);
		}

		if (added.length > 0) {
			const names = added.map((p) => `${p.org}/${p.name}:${p.version}`).join(", ");
			log(`Added ${added.length} pre-bundled Ballerina package(s) to ${ballerinaHome}: ${names}`);
		}
	} catch (error) {
		// Never fail activation over this. The product still works; the first build of a project
		// using these packages falls back to pulling them from Ballerina Central.
		logError("Failed to apply pre-bundled Ballerina packages", error as Error);
	}
	return added;
}
