REM Accepts six arguments: ballerina.zip, ballerina-version, integrator.zip, ICP.zip, jre.zip, and version
REM Extracts the zip files to their respective payload directories and applies the version to Package.wxs before building the installer

@echo off
setlocal

REM Check for required arguments
if "%~1"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<ballerina-version^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<path-to-jre.zip^> ^<version^>
    exit /b 1
)
if "%~2"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<ballerina-version^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<path-to-jre.zip^> ^<version^>
    exit /b 1
)

if "%~3"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<ballerina-version^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<path-to-jre.zip^> ^<version^>
    exit /b 1
)

if "%~4"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<ballerina-version^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<path-to-jre.zip^> ^<version^>
    exit /b 1
)

if "%~5"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<ballerina-version^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<path-to-jre.zip^> ^<version^>
    exit /b 1
)

if "%~6"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<ballerina-version^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<path-to-jre.zip^> ^<version^>
    exit /b 1
)


REM Clean up any leftover payload directory from a previous build
if exist ".\WixPackage\payload" rmdir /s /q ".\WixPackage\payload"

REM Clean the WiX intermediate output before each build. The WiX SDK hard-links
REM obj\...\WSO2-Integrator.msi to bin, and build.bat renames the bin entry to the
REM final wso2-integrator-<v>[-update].msi (still the same inode). When the second
REM profile (editor-update) rebuilds, WiX overwrites obj\WSO2-Integrator.msi in place
REM on that shared inode, clobbering the already-renamed full MSI so both profiles end
REM up byte-identical. Removing obj forces a fresh inode per build; the previously
REM renamed *.msi keeps its own inode/content. Only the un-renamed WSO2-Integrator.msi
REM is deleted from bin so a prior profile's renamed output is preserved.
if exist ".\WixPackage\obj" rmdir /s /q ".\WixPackage\obj"
if exist ".\WixPackage\bin\x64\Release\en-US\WSO2-Integrator.msi" del /q ".\WixPackage\bin\x64\Release\en-US\WSO2-Integrator.msi"

@REM REM Extract integrator.zip
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~3', '.\WixPackage\payload\Integrator'); }"
if errorlevel 1 (
    echo Integrator extraction failed
    exit /b 1
)

REM INSTALLER_PROFILE (env): "full" (default) ships the editor + all runtimes; "editor-update"
REM produces the small editor-only update MSI (§D8) by skipping the Ballerina runtime — the
REM client seeds/resolves Ballerina from the per-user data folder, so an editor-only major
REM upgrade never strands it. The WiX payload glob (.\payload\Integrator\**) naturally excludes
REM whatever is not extracted here.
if not defined INSTALLER_PROFILE set "INSTALLER_PROFILE=full"
echo Installer profile: %INSTALLER_PROFILE%

REM Extract ballerina.zip (skipped for the editor-update profile)
if /i "%INSTALLER_PROFILE%"=="editor-update" goto :after_ballerina_extract
echo Extracting Ballerina to payload
REM Extract distributions directory (actual Ballerina runtime) to components\ballerina
REM and remove docs/examples to reduce installer size
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; $extractDir = 'C:\tmp_bal'; Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force -Path $extractDir | Out-Null; [IO.Compression.ZipFile]::ExtractToDirectory('%~1', $extractDir); $unzippedFolder = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName; $ballerinaTarget = '.\WixPackage\payload\Integrator\components\ballerina'; New-Item -ItemType Directory -Force -Path $ballerinaTarget | Out-Null; $distDir = Join-Path $unzippedFolder 'distributions'; if (Test-Path $distDir) { $distFolder = (Get-ChildItem $distDir -Directory | Select-Object -First 1).FullName; if ($distFolder) { Copy-Item -Path \"$distFolder\*\" -Destination $ballerinaTarget -Recurse -Force } }; Remove-Item -Recurse -Force (Join-Path $ballerinaTarget 'docs') -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force (Join-Path $ballerinaTarget 'examples') -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force $extractDir }"
if errorlevel 1 (
    echo Ballerina extraction failed
    exit /b 1
)

REM Pre-bundled Ballerina Central packages, staged by ci/build/bundle-ballerina-packages.sh and
REM handed over in BALLERINA_PACKAGES_DIR. They go into the distribution's own package repository,
REM which the compiler resolves before it reaches Ballerina Central -- that is what lets a fresh
REM install build the projects the product's templates generate without a network round trip.
REM Skipped with the rest of Ballerina for the editor-update profile (the goto above jumps past it).
if not defined BALLERINA_PACKAGES_DIR goto :after_ballerina_packages
if not exist "%BALLERINA_PACKAGES_DIR%" goto :after_ballerina_packages
powershell -nologo -noprofile -command "& { $src = $env:BALLERINA_PACKAGES_DIR; $staged = @(Get-ChildItem -LiteralPath $src -Directory | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory } | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory }); if ($staged.Count -eq 0) { Write-Host 'No pre-bundled Ballerina packages staged; skipping'; exit 0 }; $target = '.\WixPackage\payload\Integrator\components\ballerina\repo\bala'; New-Item -ItemType Directory -Force -Path $target | Out-Null; Copy-Item -Path (Join-Path $src '*') -Destination $target -Recurse -Force; Write-Host ('Bundled ' + $staged.Count + ' pre-pulled Ballerina package(s) into the distribution repository') }"
if errorlevel 1 (
    echo Bundling pre-pulled Ballerina packages failed
    exit /b 1
)
:after_ballerina_packages
:after_ballerina_extract

REM Prune choreo-cli to win32/amd64 and linux/amd64 (WSL) only
powershell -nologo -noprofile -command "& { $choreoCliDir = '.\WixPackage\payload\Integrator\resources\app\extensions\wso2.wso2-integrator\resources\choreo-cli'; if (Test-Path $choreoCliDir) { Get-ChildItem $choreoCliDir -Directory | ForEach-Object { $vDir = $_.FullName; foreach ($target in @((Join-Path $vDir 'darwin'), (Join-Path $vDir 'linux\arm64'))) { if (Test-Path $target) { try { Remove-Item $target -Recurse -Force -ErrorAction Stop } catch [System.Management.Automation.ItemNotFoundException] { } catch { Write-Warning ('choreo-cli prune warning: ' + $_.Exception.Message) } } }; Write-Host ('Pruned choreo-cli in ' + $_.Name) } } else { Write-Host 'choreo-cli directory not found, skipping prune' } }"

REM editor-update (§D8 / W-B): the small update MSI is truly editor-only — skip ICP + JRE too
REM (in addition to Ballerina). The client seeds them to the data folder; ICP requires the MI
REM extension to read WSO2_INTEGRATOR_ICP_HOME before this build is published (go-live gate).
if /i "%INSTALLER_PROFILE%"=="editor-update" goto :after_runtimes

@REM REM Extract ICP.zip
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~4', '.\temp_icp'); $icpDir = (Get-ChildItem '.\temp_icp' -Directory | Select-Object -First 1).FullName; $icpTarget = '.\WixPackage\payload\Integrator\components\icp'; New-Item -ItemType Directory -Force -Path $icpTarget | Out-Null; Copy-Item -Path \"$icpDir\*\" -Destination $icpTarget -Recurse -Force; Remove-Item -Recurse -Force '.\temp_icp' }"
if errorlevel 1 (
    echo ICP extraction failed
    exit /b 1
)

REM Extract JRE zip into shared dependencies directory
echo Extracting JRE to shared dependencies directory
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; $dependenciesTarget = '.\WixPackage\payload\Integrator\components\dependencies'; if (Test-Path $dependenciesTarget) { Remove-Item -Recurse -Force $dependenciesTarget }; New-Item -ItemType Directory -Force -Path $dependenciesTarget | Out-Null; [IO.Compression.ZipFile]::ExtractToDirectory('%~5', $dependenciesTarget); }"
if errorlevel 1 (
    echo JRE extraction failed
    exit /b 1
)

REM Modify icp.bat to use the JRE from shared dependencies directory (§D8): prefer
REM WSO2_INTEGRATOR_JRE_HOME (set by main.ts once ICP/JRE are seeded to the data
REM folder), else the JRE bundled next to ICP. The rewrite lives in a standalone
REM script because its embedded quotes/parens corrupt cmd.exe quote tracking inline.
echo Modifying icp.bat to use JRE from dependencies
powershell -nologo -noprofile -ExecutionPolicy Bypass -File "%~dp0scripts\patch-icp-jre.ps1"
if errorlevel 1 (
    echo ERROR: failed to patch icp.bat for env-aware JRE
    exit /b 1
)
:after_runtimes

REM Copy balscript/bal to ballerina bin directory and replace version placeholder
REM (skipped for editor-update: there is no bundled Ballerina in that payload)
if /i "%INSTALLER_PROFILE%"=="editor-update" goto :after_balbat
set "BAL_SRC=%~dp0WixPackage\balscript\bal.bat"
set "BAL_TARGET=.\WixPackage\payload\Integrator\components\ballerina\bin\bal.bat"
if exist "%BAL_SRC%" (
    if not exist ".\WixPackage\payload\Integrator\components\ballerina\bin" mkdir ".\WixPackage\payload\Integrator\components\ballerina\bin"
    powershell -nologo -noprofile -command "& { (Get-Content '%BAL_SRC%') -replace '@BALLERINA_VERSION@', '%~2' | Set-Content '%BAL_TARGET%' }"
    echo Copied bal.bat to ballerina bin directory with version %~2
) else (
    echo bal.bat not found at %BAL_SRC%
)
:after_balbat



REM Compute WiX ProductVersion. Windows Installer only compares the first THREE fields, so the
REM 4-part integrator.version (a.b.c.d, e.g. 5.0.0.1) would not upgrade on a 4th-field bump.
REM Fold the revision into the build field: a.b.(c*1000+d)  ->  5.0.0.1 becomes 5.0.1 (§D8).
REM Constraint: c<=64 and d<=999 (build field max 65535). Pre-release suffixes (-m1, -09181) are
REM STRIPPED, so every pre-release of one core carries the SAME ProductVersion — that is only
REM sound because Package.wxs sets MajorUpgrade AllowSameVersionUpgrades="yes" (same-version
REM installs replace the registered product instead of stacking a second one). Keep the two in
REM sync; do not fold the suffix in here instead (it would outrank the GA's a.b.c and block the
REM final-release upgrade).
REM Clear first so a failed computation can't inherit a stale value from the environment.
set "WIX_VERSION="
for /f "delims=" %%v in ('powershell -nologo -noprofile -command "$p=(('%~6' -split '-')[0] -split '\.'); while($p.Count -lt 4){$p+='0'}; $a=[int]$p[0]; $b=[int]$p[1]; $c=[int]$p[2]; $d=[int]$p[3]; if($c -gt 64 -or $d -gt 999){[Console]::Error.WriteLine('ProductVersion fold out of range (need c<=64,d<=999): %~6'); exit 1}; '{0}.{1}.{2}' -f $a,$b,($c*1000+$d)"') do set "WIX_VERSION=%%v"
if not defined WIX_VERSION (
    echo ERROR: failed to compute WiX ProductVersion from %~6
    exit /b 1
)
echo WiX ProductVersion: %WIX_VERSION%


REM Update version in Package.wxs
powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '@VERSION@', '%WIX_VERSION%' | Set-Content '.\WixPackage\Package.wxs'"

REM The main executable is named after product.json nameShort, which depends on
REM the product flavor ("WSO2 Integrator" / "WSO2 Agent Builder"). Detect it
REM from the payload and resolve the @PRODUCT_NAME@ placeholders. Placeholder
REM sources are backed up and restored via :restore_name on every exit path.
for /f "delims=" %%p in ('powershell -nologo -noprofile -command "(Get-ChildItem '.\WixPackage\payload\Integrator' -Filter *.exe -File | Select-Object -First 1).BaseName"') do set "PRODUCT_NAME=%%p"
if not defined PRODUCT_NAME set "PRODUCT_NAME=WSO2 Integrator"
echo Product name: %PRODUCT_NAME%

REM Each flavor needs its own MSI UpgradeCode and install folder, otherwise
REM installing one flavor upgrades/replaces the other.
if "%PRODUCT_NAME%"=="WSO2 Agent Builder" (
    set "UPGRADE_CODE=56138e5c-e9ef-499b-8a21-54e2cfc09ba3"
    set "PRODUCT_DIR=Agent Builder"
    set "MSI_BASE=wso2-agent-builder"
) else (
    set "UPGRADE_CODE=344b046a-fa6a-4452-be40-2794f59fe7b0"
    set "PRODUCT_DIR=Integrator"
    set "MSI_BASE=wso2-integrator"
)
copy /y ".\WixPackage\Package.wxs" ".\WixPackage\Package.wxs.bak" >nul
copy /y ".\WixPackage\IntegratorComponents.wxs" ".\WixPackage\IntegratorComponents.wxs.bak" >nul
copy /y ".\WixPackage\Folders.wxs" ".\WixPackage\Folders.wxs.bak" >nul
copy /y ".\CustomAction1\CustomAction.cs" ".\CustomAction1\CustomAction.cs.bak" >nul
powershell -Command "foreach ($f in '.\WixPackage\Package.wxs','.\WixPackage\IntegratorComponents.wxs','.\WixPackage\Folders.wxs','.\CustomAction1\CustomAction.cs') { (Get-Content -Raw $f).Replace('@PRODUCT_NAME@', '%PRODUCT_NAME%').Replace('@UPGRADE_CODE@', '%UPGRADE_CODE%').Replace('@PRODUCT_DIR@', '%PRODUCT_DIR%') | Set-Content $f }"

REM Map build directory to a short drive letter to keep file paths under 260 chars.
REM wixnative.exe lacks a longPathAware manifest, so it crashes on paths > 260 chars.
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Find an unused drive letter (W, X, Y, Z) and map it via subst.
set "BUILD_DRIVE="
for %%L in (W X Y Z) do (
    if not defined BUILD_DRIVE if not exist %%L:\ (
        subst %%L: "%SCRIPT_DIR%" >nul 2>&1
        if not errorlevel 1 set "BUILD_DRIVE=%%L"
    )
)
if not defined BUILD_DRIVE (
    echo ERROR: No available drive letter found ^(W-Z all in use or subst failed^)
    call :restore_name
    powershell -Command "(Get-Content -Raw '.\WixPackage\Package.wxs').Replace('%WIX_VERSION%', '@VERSION@') | Set-Content '.\WixPackage\Package.wxs'"
    if exist ".\WixPackage\payload" rmdir /s /q ".\WixPackage\payload"
    exit /b 1
)
pushd %BUILD_DRIVE%:\
if errorlevel 1 (
    echo ERROR: pushd into %BUILD_DRIVE%:\ failed
    subst %BUILD_DRIVE%: /D >nul 2>&1
    call :restore_name
    powershell -Command "(Get-Content -Raw '.\WixPackage\Package.wxs').Replace('%WIX_VERSION%', '@VERSION@') | Set-Content '.\WixPackage\Package.wxs'"
    if exist ".\WixPackage\payload" rmdir /s /q ".\WixPackage\payload"
    exit /b 1
)

dotnet build .\CustomAction1\CustomAction1.csproj -c Release
if errorlevel 1 (
    echo CustomAction1 build failed
    popd
    subst %BUILD_DRIVE%: /D
    call :restore_name
    powershell -Command "(Get-Content -Raw '.\WixPackage\Package.wxs').Replace('%WIX_VERSION%', '@VERSION@') | Set-Content '.\WixPackage\Package.wxs'"
    exit /b 1
)
dotnet build .\WixPackage\WixPackage.wixproj -p:Platform=x64 -p:Configuration=Release -maxcpucount:1 -v:detailed
if errorlevel 1 (
    echo WixPackage build failed
    popd
    subst %BUILD_DRIVE%: /D
    call :restore_name
    powershell -Command "(Get-Content -Raw '.\WixPackage\Package.wxs').Replace('%WIX_VERSION%', '@VERSION@') | Set-Content '.\WixPackage\Package.wxs'"
    exit /b 1
)

popd
subst %BUILD_DRIVE%: /D

REM Rename MSI output to include version. The editor-update profile gets a "-update" suffix so
REM the small editor-only MSI (published to the update manifest) is distinct from the full
REM first-install MSI. Both share the same UpgradeCode, so -update cleanly upgrades a full install.
set "MSI_SUFFIX="
if /i "%INSTALLER_PROFILE%"=="editor-update" set "MSI_SUFFIX=-update"
set "MSI_ORIG=WixPackage\bin\x64\Release\en-US\WSO2-Integrator.msi"
set "MSI_NEW=WixPackage\bin\x64\Release\en-US\%MSI_BASE%-%~6%MSI_SUFFIX%.msi"
if exist "%MSI_ORIG%" (
    ren "%MSI_ORIG%" "%MSI_BASE%-%~6%MSI_SUFFIX%.msi"
    echo Renamed MSI to %MSI_NEW%
) else (
    echo MSI file not found: %MSI_ORIG%
)

REM Revert product-name and version placeholders
call :restore_name
powershell -Command "(Get-Content -Raw '.\WixPackage\Package.wxs').Replace('%WIX_VERSION%', '@VERSION@') | Set-Content '.\WixPackage\Package.wxs'"
REM Remove payload and resources directories after build
if exist ".\WixPackage\payload" rmdir /s /q ".\WixPackage\payload"
endlocal
exit /b 0

REM Restores the @PRODUCT_NAME@ placeholder sources backed up before substitution.
REM The backups were taken after the @VERSION@ substitution, so the caller's
REM version-restore step still applies afterwards.
:restore_name
if exist ".\WixPackage\Package.wxs.bak" move /y ".\WixPackage\Package.wxs.bak" ".\WixPackage\Package.wxs" >nul
if exist ".\WixPackage\IntegratorComponents.wxs.bak" move /y ".\WixPackage\IntegratorComponents.wxs.bak" ".\WixPackage\IntegratorComponents.wxs" >nul
if exist ".\WixPackage\Folders.wxs.bak" move /y ".\WixPackage\Folders.wxs.bak" ".\WixPackage\Folders.wxs" >nul
if exist ".\CustomAction1\CustomAction.cs.bak" move /y ".\CustomAction1\CustomAction.cs.bak" ".\CustomAction1\CustomAction.cs" >nul
exit /b 0
