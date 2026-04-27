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

@REM REM Extract integrator.zip
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~3', '.\WixPackage\payload\Integrator'); }"
if errorlevel 1 (
    echo Integrator extraction failed
    exit /b 1
)

REM Extract ballerina.zip
echo Extracting Ballerina to payload
REM Extract distributions directory (actual Ballerina runtime) to components\ballerina
REM and remove docs/examples to reduce installer size
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; $extractDir = 'C:\tmp_bal'; Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force -Path $extractDir | Out-Null; [IO.Compression.ZipFile]::ExtractToDirectory('%~1', $extractDir); $unzippedFolder = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName; $ballerinaTarget = '.\WixPackage\payload\Integrator\components\ballerina'; New-Item -ItemType Directory -Force -Path $ballerinaTarget | Out-Null; $distDir = Join-Path $unzippedFolder 'distributions'; if (Test-Path $distDir) { $distFolder = (Get-ChildItem $distDir -Directory | Select-Object -First 1).FullName; if ($distFolder) { Copy-Item -Path \"$distFolder\*\" -Destination $ballerinaTarget -Recurse -Force } }; Remove-Item -Recurse -Force (Join-Path $ballerinaTarget 'docs') -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force (Join-Path $ballerinaTarget 'examples') -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force $extractDir }"
if errorlevel 1 (
    echo Ballerina extraction failed
    exit /b 1
)

REM Prune choreo-cli to win32/amd64 and linux/amd64 (WSL) only
powershell -nologo -noprofile -command "& { $choreoCliDir = '.\WixPackage\payload\Integrator\resources\app\extensions\wso2.wso2-integrator\resources\choreo-cli'; if (Test-Path $choreoCliDir) { Get-ChildItem $choreoCliDir -Directory | ForEach-Object { $vDir = $_.FullName; foreach ($target in @((Join-Path $vDir 'darwin'), (Join-Path $vDir 'linux\arm64'))) { if (Test-Path $target) { try { Remove-Item $target -Recurse -Force -ErrorAction Stop } catch [System.Management.Automation.ItemNotFoundException] { } catch { Write-Warning ('choreo-cli prune warning: ' + $_.Exception.Message) } } }; Write-Host ('Pruned choreo-cli in ' + $_.Name) } } else { Write-Host 'choreo-cli directory not found, skipping prune' } }"

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

REM Modify icp.bat to use the JRE from shared dependencies directory
echo Modifying icp.bat to use JRE from dependencies
if exist ".\WixPackage\payload\Integrator\components\icp\bin\icp.bat" (
    powershell -nologo -noprofile -command "& { $icpScript = '.\WixPackage\payload\Integrator\components\icp\bin\icp.bat'; $jreDir = (Get-ChildItem '.\WixPackage\payload\Integrator\components\dependencies' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1).Name; if ($jreDir) { $content = Get-Content $icpScript -Raw; $javaReplacement = '!SCRIPT_DIR!../../dependencies/' + $jreDir + '/bin/java'; $newContent = $content -replace '\bjava\b', $javaReplacement; Set-Content -Path $icpScript -Value $newContent -NoNewline; Write-Host \"Updated icp.bat to use JRE: $jreDir\" } else { Write-Host 'Warning: JRE folder not found in dependencies' } }"
) else (
    echo Warning: icp.bat not found in ICP bin directory
)

REM Copy balscript/bal to ballerina bin directory and replace version placeholder
set "BAL_SRC=%~dp0WixPackage\balscript\bal.bat"
set "BAL_TARGET=.\WixPackage\payload\Integrator\components\ballerina\bin\bal.bat"
if exist "%BAL_SRC%" (
    if not exist ".\WixPackage\payload\Integrator\components\ballerina\bin" mkdir ".\WixPackage\payload\Integrator\components\ballerina\bin"
    powershell -nologo -noprofile -command "& { (Get-Content '%BAL_SRC%') -replace '@BALLERINA_VERSION@', '%~2' | Set-Content '%BAL_TARGET%' }"
    echo Copied bal.bat to ballerina bin directory with version %~2
) else (
    echo bal.bat not found at %BAL_SRC%
)



REM Extract numeric-only version for WiX ProductVersion (strip pre-release suffix like -m1, -beta1)
for /f "delims=" %%v in ('powershell -nologo -noprofile -command "('%~6' -split '-')[0]"') do set "WIX_VERSION=%%v"


REM Update version in Package.wxs
powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '@VERSION@', '%WIX_VERSION%' | Set-Content '.\WixPackage\Package.wxs'"

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
    powershell -Command "(Get-Content -Raw '.\WixPackage\Package.wxs').Replace('%WIX_VERSION%', '@VERSION@') | Set-Content '.\WixPackage\Package.wxs'"
    if exist ".\WixPackage\payload" rmdir /s /q ".\WixPackage\payload"
    exit /b 1
)
pushd %BUILD_DRIVE%:\
if errorlevel 1 (
    echo ERROR: pushd into %BUILD_DRIVE%:\ failed
    subst %BUILD_DRIVE%: /D >nul 2>&1
    powershell -Command "(Get-Content -Raw '.\WixPackage\Package.wxs').Replace('%WIX_VERSION%', '@VERSION@') | Set-Content '.\WixPackage\Package.wxs'"
    if exist ".\WixPackage\payload" rmdir /s /q ".\WixPackage\payload"
    exit /b 1
)

dotnet build .\CustomAction1\CustomAction1.csproj -c Release
if errorlevel 1 (
    echo CustomAction1 build failed
    popd
    subst %BUILD_DRIVE%: /D
    powershell -Command "(Get-Content -Raw '.\WixPackage\Package.wxs').Replace('%WIX_VERSION%', '@VERSION@') | Set-Content '.\WixPackage\Package.wxs'"
    exit /b 1
)
dotnet build .\WixPackage\WixPackage.wixproj -p:Platform=x64 -p:Configuration=Release -maxcpucount:1 -v:detailed
if errorlevel 1 (
    echo WixPackage build failed
    popd
    subst %BUILD_DRIVE%: /D
    powershell -Command "(Get-Content -Raw '.\WixPackage\Package.wxs').Replace('%WIX_VERSION%', '@VERSION@') | Set-Content '.\WixPackage\Package.wxs'"
    exit /b 1
)

popd
subst %BUILD_DRIVE%: /D

REM Rename MSI output to include version
set "MSI_ORIG=WixPackage\bin\x64\Release\en-US\WSO2-Integrator.msi"
set "MSI_NEW=WixPackage\bin\x64\Release\en-US\wso2-integrator-%~6.msi"
if exist "%MSI_ORIG%" (
    ren "%MSI_ORIG%" "wso2-integrator-%~6.msi"
    echo Renamed MSI to %MSI_NEW%
) else (
    echo MSI file not found: %MSI_ORIG%
)

REM Revert version placeholder in Package.wxs
powershell -Command "(Get-Content -Raw '.\WixPackage\Package.wxs').Replace('%WIX_VERSION%', '@VERSION@') | Set-Content '.\WixPackage\Package.wxs'"
REM Remove payload and resources directories after build
if exist ".\WixPackage\payload" rmdir /s /q ".\WixPackage\payload"
endlocal
