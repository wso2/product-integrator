#!/usr/bin/env node
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

// Renders the WSO2 Integrator update SOURCE DOCUMENT (see docs/update-mechanism-design.md §4.2)
// for one channel from ci/build/update-manifest.config.json and
// ci/build/component-versions.properties, computing each artifact's sha256 + size by downloading
// it. The output is uploaded (and cosign-signed) by the publish-update-source CI job.
//
// ONE document covers every platform and arch: each component and app entry carries a `targets`
// map keyed by "<platform>-<arch>" (darwin-arm64, win32-x64, …). Clients never read it — the
// update server does, and composes a per-client answer from it. Restrict which targets are
// rendered with --targets (comma-separated) when a run only built some of them.
//
// A component may declare `variants` to publish several versions of the same id side by side,
// each pinned to a different release line via its own `requires.app`; the server then picks the
// one entry that applies to the client asking. This is how a 5.1.x user keeps getting 5.1-line
// component updates after 5.2 ships.
//
// With --artifacts-base + --mirror-dir, every artifact (components + app installers) is also
// MIRRORED: the downloaded bytes are written under --mirror-dir (components/{id}/{version}/
// and app/{version}/) for the CI job to upload to the update bucket, and the URLs point at
// {artifacts-base}/<that path> (the CDN in front of the bucket) instead of the source.
// Components may declare `sourceFile` (a repo-relative file, e.g. the locally built WI extension
// VSIX) instead of `url`; those require mirroring since they have no public source URL.
//
// Exception: the macOS Squirrel zip is neither hashed nor mirrored here — only its CDN URL is
// composed. The macOS build job uploads the zip to that exact path itself, and Squirrel verifies
// provenance via Apple code signing. Renaming either side breaks the other.
//
// Alongside each artifact the generator writes a SIGNED STATEMENT (<artifact>.statement.json)
// binding {id, version, sha256, sizeBytes, requires} together, so a signature cannot be replayed
// over a different artifact than the one it was issued for.
//
// Usage:
//   node ci/build/generate-update-manifest.mjs \
//     --sequence 42 [--targets darwin-arm64,win32-x64] \
//     --app-version 5.0.1.0 [--app-commit SHA] [--app-release-base URL] \
//     [--app-applies-to '>=5.0.0'] [--app-rollout 25] [--out source.json] \
//     [--artifacts-base https://cdn/artifacts --mirror-dir artifacts-mirror] [--no-download]
//
//   Components-only (ship a component fix without re-releasing the app):
//     ... --components-only --carry-apps-from previous-source.json [--requires-app-version 5.1.5]
//     [--carry-components wso2.wso2-integrator]   components this publish is not changing
//
// --no-download emits placeholder hashes (structure-only; for local validation, not for release).

import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(SCRIPT_DIR, '..', '..');

// The only flags that are legitimately valueless. Everything else takes a value, and a value flag
// left dangling must be an error: `--targets` followed by another flag would otherwise silently
// mean "all targets", and `--app-rollout` alone would coerce to a 1% rollout.
const BOOLEAN_FLAGS = new Set(['components-only', 'no-download']);

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next === undefined || next.startsWith('--')) {
				if (!BOOLEAN_FLAGS.has(key)) {
					throw new Error(`--${key} needs a value`);
				}
				args[key] = true;
			} else {
				args[key] = next;
				i++;
			}
		}
	}
	return args;
}

function readVersions(file) {
	const versions = {};
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}
		const eq = trimmed.indexOf('=');
		if (eq === -1) {
			continue;
		}
		versions[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
	}
	return versions;
}

function substitute(template, vars) {
	return template.replace(/\{(\w+)\}/g, (_m, key) => (vars[key] !== undefined ? String(vars[key]) : `{${key}}`));
}

// Guards every value interpolated into a mirror path / CDN URL segment. Rejects path
// separators, traversal, and URL-hostile characters so a malformed source URL or version
// can never write outside the mirror dir or produce a broken artifact URL.
function safeSegment(value, what) {
	if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(value) || value.includes('..')) {
		throw new Error(`Unsafe ${what} for artifact path: '${value}'`);
	}
	return value;
}

// Streams the artifact once: hashes it, and (when mirrorPath is set) writes the same bytes to
// disk for the CI job to upload to the update bucket.
// Fetch an artifact, coping with release assets on a PRIVATE GitHub repo (the enterprise mirror
// we build test releases on). A token on the /releases/download/ browser URL is not enough there —
// GitHub returns 404 for it regardless — so resolve the asset through the API and fetch it by id
// with an octet-stream Accept header. The API then redirects to object storage, which rejects a
// request carrying a second auth mechanism, so authenticate the first hop only and follow bare.
async function fetchArtifact(url) {
	const token = process.env['GITHUB_TOKEN'];
	const parsed = new URL(url);
	const release = token && parsed.hostname === 'github.com'
		? /^\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/(.+)$/.exec(parsed.pathname)
		: undefined;
	if (!release) {
		return fetch(url, { redirect: 'follow' });
	}
	const [, owner, repo, tag, file] = release;
	const meta = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
	});
	if (!meta.ok) {
		throw new Error(`Failed to look up release ${tag} in ${owner}/${repo}: HTTP ${meta.status}`);
	}
	const wanted = decodeURIComponent(file);
	const asset = ((await meta.json()).assets ?? []).find(a => a.name === wanted);
	if (!asset) {
		throw new Error(`Release ${tag} in ${owner}/${repo} has no asset named '${wanted}'`);
	}
	const res = await fetch(asset.url, {
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream' },
		redirect: 'manual'
	});
	const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : undefined;
	return location ? fetch(location, { redirect: 'follow' }) : res;
}

async function hashAndSize(url, mirrorPath) {
	const res = await fetchArtifact(url);
	if (!res.ok || !res.body) {
		throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
	}
	const hash = createHash('sha256');
	let size = 0;
	let out;
	let outError;
	if (mirrorPath) {
		mkdirSync(path.dirname(mirrorPath), { recursive: true });
		out = createWriteStream(mirrorPath);
		// Attached BEFORE the write loop: a stream that errors mid-download (disk full while
		// mirroring a multi-hundred-MB runtime) would otherwise raise an uncaught 'error' event —
		// or, if a write had just returned false, leave the loop awaiting a 'drain' that will
		// never come.
		out.on('error', err => { outError = err; });
	}
	for await (const chunk of Readable.fromWeb(res.body)) {
		if (outError) {
			throw new Error(`Failed to mirror ${url} to ${mirrorPath}: ${outError.message}`);
		}
		hash.update(chunk);
		size += chunk.length;
		if (out && !out.write(chunk)) {
			await new Promise(resolve => out.once('drain', () => resolve()).once('error', () => resolve()));
		}
	}
	if (out) {
		await new Promise((resolve, reject) => out.end(() => outError ? reject(outError) : resolve()));
	}
	return { sha256: hash.digest('hex'), sizeBytes: size };
}

async function hashLocalFile(filePath, mirrorPath) {
	const hash = createHash('sha256');
	let size = 0;
	for await (const chunk of createReadStream(filePath)) {
		hash.update(chunk);
		size += chunk.length;
	}
	if (mirrorPath) {
		mkdirSync(path.dirname(mirrorPath), { recursive: true });
		copyFileSync(filePath, mirrorPath);
	}
	return { sha256: hash.digest('hex'), sizeBytes: size };
}

// Writes the signed statement next to a mirrored artifact. CI signs this, not the artifact: binding
// id + version + digest (+ requires) stops a signature being replayed over a different artifact.
function writeStatement(mirrorPath, { id, version, sha256, sizeBytes, requires }) {
	const statement = { schemaVersion: 1, id, version, sha256, sizeBytes };
	if (requires && Object.keys(requires).length > 0) {
		statement.requires = requires;
	}
	const statementPath = `${mirrorPath}.statement.json`;
	writeFileSync(statementPath, JSON.stringify(statement, null, 2) + '\n');
	return statementPath;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const sequence = Number(args.sequence ?? 0);
	if (!Number.isInteger(sequence) || sequence < 0) {
		throw new Error(`--sequence must be a non-negative integer, got '${args.sequence}'. `
			+ `A non-numeric value would serialize as null and break the next publish that reads it.`);
	}
	const noDownload = !!args['no-download'];

	const configPath = args.config || path.join(SCRIPT_DIR, 'update-manifest.config.json');
	const versionsPath = args.versions || path.join(SCRIPT_DIR, 'component-versions.properties');
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	const versions = readVersions(versionsPath);

	const configuredTargets = config.targets;
	if (!Array.isArray(configuredTargets) || configuredTargets.length === 0) {
		throw new Error('config.targets must list the platform-arch pairs to publish');
	}
	// A release may build only some platforms. Publishing a document that describes targets this
	// run did not produce would point clients at release assets that never existed, so CI passes
	// the ones it actually built and anything else is left out entirely.
	const requestedTargets = typeof args.targets === 'string' && args.targets
		? args.targets.split(',').map(t => t.trim()).filter(Boolean)
		: configuredTargets;
	const unknown = requestedTargets.filter(t => !configuredTargets.includes(t));
	if (unknown.length > 0) {
		throw new Error(`--targets names targets missing from config.targets: ${unknown.join(', ')}`);
	}
	const targets = requestedTargets;

	// Mirror mode: artifacts are re-hosted on the update bucket/CDN and the source points there.
	const artifactsBase = typeof args['artifacts-base'] === 'string' ? args['artifacts-base'].replace(/\/+$/, '') : '';
	const mirrorDir = typeof args['mirror-dir'] === 'string' ? args['mirror-dir'] : '';
	if (artifactsBase && !mirrorDir && !noDownload) {
		// A CDN URL with no mirrored bytes to upload would 404 for every client.
		throw new Error('--artifacts-base requires --mirror-dir (or --no-download for structure checks)');
	}

	// Per-component source flavor overrides ("id=flavor,..."): mirror from the SAME source the
	// build bundled, so the published artifact can never diverge from the packed one.
	const sourceFlavors = {};
	if (typeof args['source-flavors'] === 'string' && args['source-flavors']) {
		for (const pair of args['source-flavors'].split(',')) {
			const [id, flavor] = pair.split('=').map(s => s.trim());
			if (id && flavor) {
				sourceFlavors[id] = flavor;
			}
		}
	}

	const appVersion = args['app-version'] || versions['integrator.version'];

	// A components-only publish ships component updates without a new app.
	const componentsOnly = !!args['components-only'];

	// A components-only document REPLACES the one the index serves for its line, so an empty apps[]
	// would withdraw the app update that line was offering. The previous entries are carried verbatim;
	// they describe artifacts that are already uploaded, hashed and signed.
	const carryAppsFrom = typeof args['carry-apps-from'] === 'string' ? args['carry-apps-from'] : '';
	let carriedDocument;
	let carriedApps = [];
	if (carryAppsFrom) {
		carriedDocument = JSON.parse(readFileSync(carryAppsFrom, 'utf8'));
		const previous = carriedDocument;
		if (!Array.isArray(previous.apps)) {
			throw new Error(`--carry-apps-from ${carryAppsFrom} has no apps array; it is not a source document.`);
		}
		carriedApps = previous.apps;
		console.log(`carrying ${carriedApps.length} app entr${carriedApps.length === 1 ? 'y' : 'ies'} `
			+ `from ${carryAppsFrom}: ${carriedApps.map(a => a.version).join(', ') || '(none)'}`);
	}

	// Components this publish is not changing are copied from the previous document rather than
	// re-resolved and re-mirrored. The entry is copied whole, so the document still describes the full set.
	const carryComponentIds = new Set(
		(typeof args['carry-components'] === 'string' ? args['carry-components'] : '')
			.split(',').map(id => id.trim()).filter(Boolean));
	if (carryComponentIds.size > 0 && !carryAppsFrom) {
		throw new Error('--carry-components needs --carry-apps-from: the document to copy those entries from.');
	}

	// The app version the components require. It must not default to the version being built: the config
	// declares ">={appVersion}", so that would demand a version nobody runs and withhold every component.
	// The carried document names the app actually released for this line; an explicit value still wins.
	if (carryComponentIds.size > 0) {
		const available = new Set((carriedDocument.components ?? []).map(c => c.id));
		const configured = new Set(config.components.map(c => c.id));
		for (const id of carryComponentIds) {
			// Both checks catch a typo, which would otherwise drop the component from the document
			// silently — and the document REPLACES the one clients are served, so a dropped
			// component simply stops being offered.
			if (!configured.has(id)) {
				throw new Error(`--carry-components names '${id}', which is not a component in the config.`);
			}
			if (!available.has(id)) {
				throw new Error(`--carry-components names '${id}', which the previous document does not `
					+ `offer, so there is no entry to copy. Publish it normally instead.`);
			}
		}
	}

	if (carryAppsFrom && !componentsOnly) {
		throw new Error('--carry-apps-from is for --components-only runs. A run that builds an app '
			+ 'generates its own entry, so carrying the previous one too would describe two app '
			+ 'versions for the same line in one document.');
	}

	let requiresAppVersion = typeof args['requires-app-version'] === 'string' ? args['requires-app-version'] : undefined;
	if (componentsOnly && !requiresAppVersion) {
		if (carriedApps.length === 1 && typeof carriedApps[0].version === 'string' && carriedApps[0].version.length > 0) {
			requiresAppVersion = carriedApps[0].version;
			console.log(`requires.app defaulted to the carried app version ${requiresAppVersion}`);
		} else {
			throw new Error('--components-only needs --requires-app-version: the app version these '
				+ 'components support. Without it, requires.app would name the version being built, '
				+ 'which no client is running, and every component would be withheld. It can be '
				+ 'defaulted only from a carried document with exactly one app entry'
				+ (carryAppsFrom ? ` (${carryAppsFrom} has ${carriedApps.length}).` : '; none was given.'));
		}
	}

	const commonVars = {
		appVersion: requiresAppVersion ?? appVersion,
		ballerinaVersion: versions['ballerina.version'],
		icpVersion: versions['icp.version'],
		jreVersion: versions['ballerina.jre.version']
	};
	const varsFor = target => ({
		...commonVars,
		ballerinaPlatform: config.platformTokens?.ballerina?.[target],
		jrePlatform: config.platformTokens?.jre?.[target]
	});

	// A component's version comes from component-versions.properties (versionKey) or, for
	// components built in this repo (e.g. the WI extension), from their own package.json.
	const resolveVersion = component => {
		if (component.versionKey) {
			return versions[component.versionKey];
		}
		if (component.versionFromPackageJson) {
			return JSON.parse(readFileSync(path.join(REPO_ROOT, component.versionFromPackageJson), 'utf8')).version;
		}
		return undefined;
	};

	// Download, hash, mirror and describe each DISTINCT artifact exactly once. Platform-independent
	// artifacts (a VSIX) resolve to the same URL for every target, and re-fetching them per target
	// would multiply a release's CI time and bandwidth for identical bytes.
	const resolved = new Map();
	const resolveArtifact = async ({ relPath, sourceUrl, sourceFile, statement }) => {
		const existing = resolved.get(relPath);
		if (existing) {
			return existing;
		}
		const entry = { url: artifactsBase ? `${artifactsBase}/${relPath}` : sourceUrl };
		if (!entry.url) {
			throw new Error(`Cannot render ${statement.id}: no public source URL; --artifacts-base is required`);
		}
		if (noDownload) {
			entry.sha256 = 'PLACEHOLDER_NO_DOWNLOAD';
			entry.sizeBytes = 0;
		} else {
			const mirrorPath = artifactsBase ? path.join(mirrorDir, relPath) : undefined;
			const { sha256, sizeBytes } = sourceFile
				? await hashLocalFile(sourceFile, mirrorPath)
				: await hashAndSize(sourceUrl, mirrorPath);
			entry.sha256 = sha256;
			entry.sizeBytes = sizeBytes;
		}
		// Only a MIRRORED artifact can carry a statement of ours: CI cosigns everything under the
		// mirror dir. A third-party source URL has none, so promising one would make the client
		// reject an artifact it could never verify.
		if (artifactsBase) {
			entry.signature = {
				statementUrl: `${artifactsBase}/${relPath}.statement.json`,
				sigUrl: `${artifactsBase}/${relPath}.statement.json.sig`
			};
			if (!noDownload) {
				writeStatement(path.join(mirrorDir, relPath), {
					...statement,
					sha256: entry.sha256,
					sizeBytes: entry.sizeBytes
				});
			}
		}
		resolved.set(relPath, entry);
		return entry;
	};

	// A component may ship a different version per release line. `variants` expands one config entry
	// into several document entries that differ in version and in `requires.app`, which is what the
	// server uses to tell them apart — so 5.1.x clients can keep getting 5.12.x while 5.2.x moves on.
	// The base entry is the current line; each variant inherits everything it does not override.
	const declared = [];
	for (const component of config.components) {
		declared.push(component);
		for (const variant of component.variants ?? []) {
			declared.push({ ...component, ...variant, variants: undefined, isVariant: true });
		}
	}

	const components = [];
	if (carryComponentIds.size > 0) {
		// Every entry for the id, so a component published as several variants keeps all of them.
		for (const entry of carriedDocument.components ?? []) {
			if (carryComponentIds.has(entry.id)) {
				components.push(entry);
				console.log(`carrying component ${entry.id} ${entry.version} from the previous document`);
			}
		}
	}
	for (const component of declared) {
		if (carryComponentIds.has(component.id)) {
			continue; // carried above, not rebuilt or re-mirrored
		}
		// Components that only exist as a repo-local build artifact (no public source URL) can only
		// be published when mirroring is on. Skip LOUDLY rather than failing the whole document.
		if (component.sourceFile && !artifactsBase) {
			process.stderr.write(`SKIPPING ${component.id}: needs --artifacts-base (no public source URL); it will not be offered as an update\n`);
			continue;
		}
		const version = resolveVersion(component);
		// Fail rather than skip: a declared component that cannot be rendered would otherwise
		// produce a signed-but-incomplete document, which the server would serve as authoritative.
		if (!version) {
			// A VARIANT with no version is a retired line: skip it loudly. Retiring a line should be
			// deleting its version, not editing every component that mentions it.
			if (component.isVariant) {
				process.stderr.write(`SKIPPING variant of ${component.id}: no version (key '${component.versionKey}'); that line will not be offered\n`);
				continue;
			}
			throw new Error(`Cannot render ${component.id}: no version (key '${component.versionKey ?? component.versionFromPackageJson}')`);
		}
		const requires = component.requires
			? Object.fromEntries(Object.entries(component.requires).map(([k, v]) => [k, substitute(v, commonVars)]))
			: undefined;

		const perTarget = {};
		for (const target of targets) {
			// Some upstreams tag a pre-release with a suffix but name the assets inside it after the
			// base version — Ballerina's v2201.13.6-alpha2 ships ballerina-2201.13.6-swan-lake-*.zip.
			// {versionBase} keeps the full version in the tag and drops the suffix in the filename.
			const versionBase = typeof version === 'string' ? version.split('-')[0] : version;
			const vars = { ...varsFor(target), version, versionBase };
			let sourceUrl;
			let sourceFile;
			if (component.sourceFile) {
				sourceFile = path.join(REPO_ROOT, substitute(component.sourceFile, vars));
			} else {
				// 'marketplace' (or no flavor) is the default `url`; other flavors must be declared
				// in `sources` — fail loudly rather than publishing a different source than was built.
				const flavor = sourceFlavors[component.id];
				let urlTemplate = component.url;
				if (flavor && flavor !== 'marketplace') {
					urlTemplate = component.sources?.[flavor];
					if (!urlTemplate) {
						throw new Error(`Cannot render ${component.id}: no source URL for flavor '${flavor}'`);
					}
				}
				sourceUrl = substitute(urlTemplate, vars);
				if (sourceUrl.includes('{')) {
					throw new Error(`Cannot render ${component.id} for ${target}: unresolved URL placeholder in '${sourceUrl}'`);
				}
			}
			// Decode BEFORE basename: an encoded separator (..%2F) would otherwise survive basename
			// and decode into a traversal that escapes the mirror dir.
			const fileName = safeSegment(sourceFile
				? path.basename(sourceFile)
				: path.posix.basename(decodeURIComponent(new URL(sourceUrl).pathname)), 'file name');
			const relPath = `components/${safeSegment(component.id, 'component id')}/${safeSegment(version, 'version')}/${fileName}`;
			perTarget[target] = await resolveArtifact({
				relPath,
				sourceUrl,
				sourceFile,
				statement: { id: component.id, version, requires }
			});
		}

		components.push({
			id: component.id,
			kind: component.kind,
			version,
			...(requires ? { requires } : {}),
			rollout: { percentage: Number(component.rolloutPercentage ?? 100) },
			recommended: !!component.recommended,
			targets: perTarget
		});
	}

	// Core-app entry. `appliesTo` is a range over the CLIENT's CURRENT version, which is how one
	// document serves several release lines: publish 5.1.z with appliesTo ">=5.1.0 <5.2.0" and a
	// 5.2.x client is simply not matched by it.
	const apps = [...carriedApps];
	const releaseBase = typeof args['app-release-base'] === 'string' ? args['app-release-base'].replace(/\/+$/, '') : '';
	if (componentsOnly) {
		console.log(`components-only publish: no app entry generated, ${apps.length} carried, `
			+ `requires.app pinned to ${requiresAppVersion}`);
	}
	if (!componentsOnly && artifactsBase && !releaseBase) {
		// The CDN base satisfies the URL the document points clients at, but the installer BYTES
		// still have to come from somewhere to be hashed and mirrored. Without this the failure is
		// a bare "Invalid URL" from deep inside the fetch.
		throw new Error('an app entry needs --app-release-base: the release URL the installers are fetched from for hashing and mirroring');
	}
	if (!componentsOnly && (releaseBase || artifactsBase)) {
		const installerNames = config.app?.installers ?? {};
		const squirrelNames = config.app?.squirrel ?? {};
		const perTarget = {};
		for (const target of targets) {
			const installerName = installerNames[target];
			if (!installerName) {
				continue; // no core-app installer published for this target
			}
			const fileName = safeSegment(substitute(installerName, { version: appVersion, appVersion }), 'installer file name');
			const relPath = `app/${safeSegment(appVersion, 'app version')}/${fileName}`;
			const entry = {
				installer: await resolveArtifact({
					relPath,
					sourceUrl: releaseBase ? `${releaseBase}/${fileName}` : undefined,
					statement: { id: 'app', version: appVersion }
				})
			};
			// Squirrel.Mac payload: the editor-only .app zip. Its provenance is macOS code signing,
			// which Squirrel enforces itself, so it carries a URL only.
			const squirrelName = squirrelNames[target];
			if (squirrelName) {
				const zip = safeSegment(substitute(squirrelName, { version: appVersion, appVersion }), 'squirrel file name');
				entry.squirrel = { url: `${artifactsBase || releaseBase}/${artifactsBase ? `app/${appVersion}/${zip}` : zip}` };
			}
			perTarget[target] = entry;
		}
		if (Object.keys(perTarget).length > 0) {
			apps.push({
				version: appVersion,
				...(args['app-commit'] ? { commit: args['app-commit'] } : {}),
				...(args['app-applies-to'] ? { appliesTo: args['app-applies-to'] } : {}),
				rollout: { percentage: Number(args['app-rollout'] ?? 100) },
				targets: perTarget
			});
		}
	}

	const publishedAt = args['published-at'] || new Date().toISOString();

	// No channel field: a document's channel is the prefix it is stored under, and promotion copies
	// documents between channels. No expiry either — withdrawal is explicit: repoint the index, or revoke.
	const source = {
		schemaVersion: 1,
		sequence,
		publishedAt,
		apps,
		components
	};

	const json = JSON.stringify(source, null, 2);
	if (args.out) {
		writeFileSync(args.out, json + '\n', 'utf8');
		process.stderr.write(`Wrote ${args.out} (${components.length} components x ${targets.length} targets, ${apps.length} app entries)\n`);
	} else {
		process.stdout.write(json + '\n');
	}
}

main().catch(err => {
	process.stderr.write(`generate-update-source failed: ${err.message}\n`);
	process.exit(1);
});
