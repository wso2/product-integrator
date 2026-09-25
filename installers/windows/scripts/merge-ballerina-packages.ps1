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

# Merge a staged Ballerina package overlay into the MSI payload. The Windows counterpart of
# ci/build/merge-ballerina-packages.sh, which the other four installers call; keep the two in step.
#
# The overlay lands in two places:
#   1. the bundled distribution's repo\bala, so a fresh install resolves the packages immediately;
#   2. the editor payload, where the WI extension finds them (vscode.env.appRoot) and repairs
#      whichever Ballerina home is actually active at startup.
# (2) is not redundant: a ballerina-runtime component update installs the STOCK upstream
# distribution over the bundled one, and a runtime already seeded to the user's data folder at the
# same version is never re-seeded. It is also the part an editor-only update replaces, so the
# editor-update MSI -- which ships no bundled Ballerina at all -- still carries the packages.
#
# Standalone rather than an inline `powershell -command` in build.bat for the same reason as
# patch-icp-jre.ps1: the logic needs quotes, parentheses and branching that cmd.exe mangles, and a
# single unreadable line is not reviewable.

[CmdletBinding()]
param(
	# BALLERINA_PACKAGES_DIR: the overlay ROOT, holding bundled-packages.txt and (when anything was
	# staged) bala\.
	[Parameter(Mandatory = $true)][string] $OverlayDir,
	# The bundled distribution in the payload. Absent for the editor-update profile.
	[Parameter(Mandatory = $true)][string] $BallerinaHome,
	# The payload's editor root, i.e. what vscode.env.appRoot resolves to.
	[Parameter(Mandatory = $true)][string] $EditorAppDir
)

$ErrorActionPreference = 'Stop'

# The manifest, not the presence of bala\, is what says whether an overlay arrived: bala\ is absent
# whenever the flavor stages nothing, so treating a missing directory as "nothing to do" would make
# a renamed artifact indistinguishable from an empty flavor -- and ship an MSI that cannot build
# offline, silently, with CI green.
$manifest = Join-Path $OverlayDir 'bundled-packages.txt'
if (-not (Test-Path -LiteralPath $manifest)) {
	Write-Host "ERROR: overlay root '$OverlayDir' has no manifest ($manifest)."
	Write-Host 'The pre-bundled Ballerina package overlay did not arrive. Refusing to ship a distribution that may not build offline.'
	exit 1
}

# Manifest lines are "<org>/<name>:<version>"; every other line is a '#' comment (the flavor header
# and the new/upgrade classification). Counting from the manifest keeps one source of truth.
$packageCount = @(Get-Content -LiteralPath $manifest | Where-Object { $_ -and $_ -notmatch '^#' }).Count
if ($packageCount -eq 0) {
	Write-Host 'No pre-bundled Ballerina packages for this flavor (manifest lists none)'
	exit 0
}

$overlayBala = Join-Path $OverlayDir 'bala'
if (-not (Test-Path -LiteralPath $overlayBala)) {
	Write-Host "ERROR: overlay is incomplete: $manifest lists $packageCount package(s), but $overlayBala is missing."
	exit 1
}

# robocopy rather than Copy-Item: bala trees nest deeply enough that the destination paths under the
# WiX payload pass Windows' 260-character MAX_PATH, where Copy-Item fails outright. robocopy uses
# long-path-aware APIs, the same reason the Windows Installer copies these trees without complaint.
# Its exit code is a bitmask where anything below 8 means success (0 = nothing to copy, 1 = files
# copied, 2 = extra files present, 3 = both); 8 and above are genuine failures.
function Copy-Tree {
	param([string] $Source, [string] $Destination)

	$null = New-Item -ItemType Directory -Force -Path $Destination
	# /NFL /NDL /NJH /NJS /NP: no per-file, per-directory, header, summary or progress output -- the
	# build log wants the outcome, not thousands of copied-file lines.
	& robocopy $Source $Destination /E /NFL /NDL /NJH /NJS /NP | Out-Null
	if ($LASTEXITCODE -ge 8) {
		Write-Host "ERROR: robocopy failed copying '$Source' to '$Destination' (exit $LASTEXITCODE)"
		exit 1
	}
	# robocopy's nonzero success codes would otherwise leak out as this script's own exit status and
	# read as a failure to build.bat's `if errorlevel 1`.
	$global:LASTEXITCODE = 0
}

# Absent for the editor-update profile, which ships no runtime at all. Not an error: the editor
# payload copy below is exactly what that profile relies on.
if (Test-Path -LiteralPath $BallerinaHome) {
	Copy-Tree -Source $overlayBala -Destination (Join-Path $BallerinaHome 'repo\bala')
	Write-Host "Merged $packageCount pre-bundled Ballerina package(s) into the distribution repository"
} else {
	Write-Host 'No bundled Ballerina in this payload; staging for startup repair only'
}

$editorOverlay = Join-Path $EditorAppDir 'ballerina-packages'
Remove-Item -LiteralPath $editorOverlay -Recurse -Force -ErrorAction SilentlyContinue
Copy-Tree -Source $overlayBala -Destination (Join-Path $editorOverlay 'bala')
Copy-Item -LiteralPath $manifest -Destination $editorOverlay -Force
Write-Host "Staged $packageCount pre-bundled Ballerina package(s) in the editor payload for startup repair"
