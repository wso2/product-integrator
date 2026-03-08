#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

const PROJECT_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(PROJECT_ROOT, '..', '..', '..');
// Primary location used by the extension
const CLI_RESOURCES_DIR = path.join(PROJECT_ROOT, 'resources', 'choreo-cli');
// Persistent cache that survives 'rush purge'
const CLI_CACHE_DIR = path.join(REPO_ROOT, 'common', 'temp', 'choreo-cli');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');
const GITHUB_REPO_URL = 'https://api.github.com/repos/wso2/choreo-cli';

// Platform/arch mappings: assetSuffix -> { os, arch, ext }
const CLI_PLATFORMS = [
    { assetSuffix: 'darwin-amd64',   os: 'darwin',  arch: 'amd64',  ext: '.zip',    binary: 'choreo' },
    { assetSuffix: 'darwin-arm64',   os: 'darwin',  arch: 'arm64',  ext: '.zip',    binary: 'choreo' },
    { assetSuffix: 'linux-amd64',    os: 'linux',   arch: 'amd64',  ext: '.tar.gz', binary: 'choreo' },
    { assetSuffix: 'linux-arm64',    os: 'linux',   arch: 'arm64',  ext: '.tar.gz', binary: 'choreo' },
    { assetSuffix: 'windows-amd64',  os: 'win32',   arch: 'amd64',  ext: '.zip',    binary: 'choreo.exe' },
];

// ============================================================================
// Version Management
// ============================================================================

function getCliVersion() {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    const cliVersion = packageJson.cliVersion;
    
    if (!cliVersion) {
        throw new Error('cliVersion not found in package.json');
    }
    
    console.log(`Choreo CLI version for WSO2 platform extension: ${cliVersion}`);
    return cliVersion;
}

function getAssetName(version, platform) {
    return `choreo-cli-${version}-${platform.assetSuffix}${platform.ext}`;
}

// resources/choreo-cli/{version}/{os}/{arch}/choreo
function getResourcesBinaryPath(version, platform) {
    return path.join(CLI_RESOURCES_DIR, version, platform.os, platform.arch, platform.binary);
}

// common/temp/choreo-cli/{version}/{os}/{arch}/choreo
function getCacheBinaryPath(version, platform) {
    return path.join(CLI_CACHE_DIR, version, platform.os, platform.arch, platform.binary);
}

// ============================================================================
// File System Utilities
// ============================================================================

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.size;
    } catch (error) {
        return 'unknown';
    }
}

function deleteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.warn(`Failed to delete file ${filePath}:`, error.message);
    }
}

function createTempDirectory(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function deleteDirectory(dirPath) {
    try {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    } catch (error) {
        console.warn(`Failed to delete directory ${dirPath}:`, error.message);
    }
}

// ============================================================================
// CLI File Validation & Cache Management
// ============================================================================

function checkExistingCLI(version) {
    const missingFromResources = [];
    const missingFromCache = [];

    for (const platform of CLI_PLATFORMS) {
        const resourcesPath = getResourcesBinaryPath(version, platform);
        const cachePath = getCacheBinaryPath(version, platform);

        if (!fs.existsSync(resourcesPath)) missingFromResources.push(platform);
        if (!fs.existsSync(cachePath)) missingFromCache.push(platform);
    }

    // All present in both locations
    if (missingFromResources.length === 0 && missingFromCache.length === 0) {
        console.log(`✓ Choreo CLI binaries for version ${version} exist in both resources and cache`);
        return true;
    }

    // Resources complete, restore missing cache entries
    if (missingFromResources.length === 0 && missingFromCache.length > 0) {
        console.log(`✓ CLI binaries exist in resources. Restoring ${missingFromCache.length} missing cache entries...`);
        for (const platform of missingFromCache) {
            const src = getResourcesBinaryPath(version, platform);
            const dest = getCacheBinaryPath(version, platform);
            ensureDirectoryExists(path.dirname(dest));
            fs.copyFileSync(src, dest);
            console.log(`  ✓ Restored cache: ${platform.os}/${platform.arch}`);
        }
        return true;
    }

    // Cache complete, restore missing resources entries
    if (missingFromCache.length === 0 && missingFromResources.length > 0) {
        console.log(`✓ CLI binaries exist in cache. Restoring ${missingFromResources.length} missing resources entries...`);
        for (const platform of missingFromResources) {
            const src = getCacheBinaryPath(version, platform);
            const dest = getResourcesBinaryPath(version, platform);
            ensureDirectoryExists(path.dirname(dest));
            fs.copyFileSync(src, dest);
            console.log(`  ✓ Restored resources: ${platform.os}/${platform.arch}`);
        }
        return true;
    }

    // Partial: some platforms have binaries in at least one location — sync what we can
    const syncedPlatforms = [];
    for (const platform of CLI_PLATFORMS) {
        const resourcesPath = getResourcesBinaryPath(version, platform);
        const cachePath = getCacheBinaryPath(version, platform);
        const resourcesExists = fs.existsSync(resourcesPath);
        const cacheExists = fs.existsSync(cachePath);

        if (resourcesExists && !cacheExists) {
            ensureDirectoryExists(path.dirname(cachePath));
            fs.copyFileSync(resourcesPath, cachePath);
            syncedPlatforms.push(platform);
        } else if (!resourcesExists && cacheExists) {
            ensureDirectoryExists(path.dirname(resourcesPath));
            fs.copyFileSync(cachePath, resourcesPath);
            syncedPlatforms.push(platform);
        }
    }

    // Re-check after sync
    const stillMissing = CLI_PLATFORMS.filter(platform => {
        return !fs.existsSync(getResourcesBinaryPath(version, platform));
    });

    if (stillMissing.length === 0) {
        console.log(`✓ All CLI binaries synced for version ${version}`);
        return true;
    }

    console.log(`CLI binaries for version ${version} not found for: ${stillMissing.map(p => `${p.os}/${p.arch}`).join(', ')}`);
    return false;
}

function cleanupOldFiles(currentVersion) {
    for (const baseDir of [CLI_RESOURCES_DIR, CLI_CACHE_DIR]) {
        if (!fs.existsSync(baseDir)) continue;
        const entries = fs.readdirSync(baseDir);
        for (const entry of entries) {
            if (entry === currentVersion) continue;
            const entryPath = path.join(baseDir, entry);
            console.log(`Removing old entry: ${entry} from ${path.basename(baseDir)}`);
            fs.rmSync(entryPath, { recursive: true, force: true });
        }
    }
}

// ============================================================================
// GitHub API Utilities
// ============================================================================

function getAuthHeaders() {
    const token = process.env.CHOREO_BOT_TOKEN || process.env.GITHUB_TOKEN;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function logRateLimitError(headers) {
    console.error('HTTP 403: Forbidden. This may be due to GitHub API rate limiting.');
    console.error('Set GITHUB_TOKEN environment variable with a personal access token to increase rate limits.');

    if (headers['x-ratelimit-limit']) {
        console.error(`Rate limit: ${headers['x-ratelimit-remaining']}/${headers['x-ratelimit-limit']}`);
        const resetTime = new Date(headers['x-ratelimit-reset'] * 1000).toLocaleString();
        console.error(`Rate limit resets at: ${resetTime}`);
    }
}

function httpsRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            ...options,
            headers: {
                'User-Agent': 'Choreo-CLI-Downloader',
                'Accept': 'application/vnd.github.v3+json',
                ...getAuthHeaders(),
                ...options.headers
            }
        }, (res) => {
            if (res.statusCode === 403) {
                logRateLimitError(res.headers);
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ data, statusCode: res.statusCode, headers: res.headers });
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function getReleaseByTag(tag) {
    console.log(`Fetching release information for tag: ${tag}...`);
    const response = await httpsRequest(`${GITHUB_REPO_URL}/releases/tags/${tag}`);
    return JSON.parse(response.data);
}

// ============================================================================
// File Download
// ============================================================================

function isRedirect(statusCode) {
    return statusCode >= 300 && statusCode < 400;
}

function isSuccess(statusCode) {
    return statusCode >= 200 && statusCode < 300;
}

function downloadFile(url, outputPath, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);

        const cleanupAndReject = (error) => {
            file.close();
            deleteFile(outputPath);
            reject(error);
        };

        const makeRequest = (requestUrl, redirectCount = 0) => {
            const req = https.request(requestUrl, {
                headers: {
                    'User-Agent': 'Choreo-CLI-Downloader',
                    'Accept': 'application/octet-stream',
                    ...getAuthHeaders()
                }
            }, (res) => {
                if (isRedirect(res.statusCode) && res.headers.location) {
                    if (redirectCount >= maxRedirects) {
                        cleanupAndReject(new Error(`Too many redirects (${redirectCount})`));
                        return;
                    }
                    makeRequest(res.headers.location, redirectCount + 1);
                    return;
                }

                if (isSuccess(res.statusCode)) {
                    res.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                    file.on('error', cleanupAndReject);
                } else {
                    cleanupAndReject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });

            req.on('error', cleanupAndReject);
            req.end();
        };

        makeRequest(url);
    });
}

async function downloadAsset(asset, tempDir) {
    const finalPath = path.join(tempDir, asset.name);
    const tempPath = `${finalPath}.tmp`;
    const downloadUrl = `${GITHUB_REPO_URL}/releases/assets/${asset.id}`;
    
    console.log(`Downloading ${asset.name}...`);
    
    try {
        await downloadFile(downloadUrl, tempPath);
        fs.renameSync(tempPath, finalPath); // Atomic operation
        
        const fileSize = getFileSize(finalPath);
        console.log(`✓ Downloaded ${asset.name} (${fileSize} bytes)`);
    } catch (error) {
        deleteFile(tempPath);
        console.error(`✗ Failed to download ${asset.name}: ${error.message}`);
        throw error;
    }
}

// ============================================================================
// Extraction
// ============================================================================

function extractBinary(archivePath, platform, destDir) {
    ensureDirectoryExists(destDir);
    const tmpExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), `choreo-extract-`));

    try {
        if (platform.ext === '.tar.gz') {
            execSync(`tar -xzf '${archivePath}' -C '${tmpExtractDir}'`, { stdio: 'inherit' });
        } else if (platform.ext === '.zip') {
            if (os.platform() === 'win32') {
                execSync(`powershell.exe -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tmpExtractDir}' -Force"`, { stdio: 'inherit' });
            } else {
                execSync(`unzip -q '${archivePath}' -d '${tmpExtractDir}'`);
            }
        }

        // Find the binary recursively (it may be inside a subdirectory)
        const binaryPath = findFile(tmpExtractDir, platform.binary);
        if (!binaryPath) {
            throw new Error(`Binary '${platform.binary}' not found after extracting ${archivePath}`);
        }

        const destPath = path.join(destDir, platform.binary);
        fs.copyFileSync(binaryPath, destPath);
        if (platform.binary !== 'choreo.exe') {
            fs.chmodSync(destPath, 0o755);
        }
        console.log(`  ✓ Extracted ${platform.os}/${platform.arch} binary`);
    } finally {
        fs.rmSync(tmpExtractDir, { recursive: true, force: true });
    }
}

function findFile(dir, filename) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const found = findFile(fullPath, filename);
            if (found) return found;
        } else if (entry.name === filename) {
            return fullPath;
        }
    }
    return null;
}

// ============================================================================
// Main Download Logic
// ============================================================================

async function downloadAndExtractCLI(version) {
    const tempDir = createTempDirectory(`choreo-cli-${version}-`);

    try {
        const releaseData = await getReleaseByTag(version);

        for (const platform of CLI_PLATFORMS) {
            const assetName = getAssetName(version, platform);
            const asset = releaseData.assets?.find(a => a.name === assetName);

            if (!asset) {
                console.warn(`Warning: Asset not found: ${assetName}`);
                continue;
            }

            const archivePath = path.join(tempDir, assetName);
            await downloadAsset(asset, tempDir);

            const resourcesDir = path.dirname(getResourcesBinaryPath(version, platform));
            const cacheDir = path.dirname(getCacheBinaryPath(version, platform));

            console.log(`Extracting ${platform.os}/${platform.arch}...`);
            extractBinary(archivePath, platform, resourcesDir);

            // Copy binary to cache
            ensureDirectoryExists(cacheDir);
            fs.copyFileSync(
                path.join(resourcesDir, platform.binary),
                path.join(cacheDir, platform.binary)
            );
            console.log(`  ✓ Cached ${platform.os}/${platform.arch} binary`);
        }
    } finally {
        console.log('Cleaning up temporary directory...');
        deleteDirectory(tempDir);
    }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
    try {
        const cliVersion = getCliVersion();

        // Always clean up old versions first, regardless of whether we need to download
        cleanupOldFiles(cliVersion);

        // Check if binaries already exist
        if (checkExistingCLI(cliVersion)) {
            console.log('✓ Choreo CLI binaries are already present');
            process.exit(0);
        }

        console.log(`\nDownloading Choreo CLI version ${cliVersion}...`);

        // Download, extract and place binaries
        await downloadAndExtractCLI(cliVersion);

        console.log(`\n✓ Successfully extracted Choreo CLI binaries for version ${cliVersion}`);

    } catch (error) {
        console.error('\n✗ Error:', error.message);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { main, checkExistingCLI };