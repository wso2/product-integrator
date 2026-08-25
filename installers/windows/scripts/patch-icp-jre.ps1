# Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied. See the License for the
# specific language governing permissions and limitations
# under the License.

# Rewrite the bundled ICP icp.bat so it resolves the JVM env-aware (§D8):
# prefer WSO2_INTEGRATOR_JRE_HOME (set by main.ts once ICP/JRE are seeded to the
# per-user data folder), else fall back to the JRE bundled next to ICP.
#
# This lives in a standalone script (rather than an inline `powershell -command`
# in build.bat) because the command embeds double quotes and parentheses that
# corrupt cmd.exe's quote tracking and prematurely close build.bat's `if (...)`
# block ("... was unexpected at this time").
#
# Run from installers/windows (build.bat's working directory); paths are relative
# to that, matching the other steps in build.bat.

$ErrorActionPreference = 'Stop'

$icpScript = '.\WixPackage\payload\Integrator\components\icp\bin\icp.bat'
$depsDir = '.\WixPackage\payload\Integrator\components\dependencies'

# This script only runs in the full profile, right after ICP + JRE extraction — missing
# inputs mean a broken payload, so fail the build rather than publish an unpatched MSI.
if (-not (Test-Path $icpScript)) {
    Write-Error 'icp.bat not found in ICP bin directory'
    exit 1
}

$jreDir = (Get-ChildItem $depsDir -Directory -ErrorAction SilentlyContinue | Select-Object -First 1).Name
if (-not $jreDir) {
    Write-Error 'JRE folder not found in dependencies'
    exit 1
}

$content = Get-Content $icpScript -Raw
# Replace icp's bare `java` invocations with the resolved %WSO2_ICP_JAVA% variable.
$content = $content -replace '\bjava\b', '"%WSO2_ICP_JAVA%"'
# Prepend an @-prefixed resolver line AFTER the replace, so its own `bin\java` is
# not itself rewritten. Backward-compatible: falls back to the bundled JRE.
# Default to the bundled JRE, then override only when the advertised JRE actually has a java.exe:
# a stale or half-removed component env var must not point icp.bat at a nonexistent executable.
$block = '@set "WSO2_ICP_JAVA=%~dp0..\..\dependencies\' + $jreDir + '\bin\java"' + [Environment]::NewLine +
         '@if defined WSO2_INTEGRATOR_JRE_HOME if exist "%WSO2_INTEGRATOR_JRE_HOME%\bin\java.exe" set "WSO2_ICP_JAVA=%WSO2_INTEGRATOR_JRE_HOME%\bin\java"' + [Environment]::NewLine
Set-Content -Path $icpScript -Value ($block + $content) -NoNewline
Write-Host "Updated icp.bat (env-aware JRE, fallback $jreDir)"
