REM Accepts four arguments: integrator dist zip, integrator.zip, ICP.zip, and version
REM Extracts the zip files to their respective payload directories and applies the version to Package.wxs before building the installer

@echo off
setlocal

REM Check for required arguments
if "%~1"=="" (
    echo Usage: build.bat ^<path-to-integrator-dist.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<version^>
    exit /b 1
)
if "%~2"=="" (
    echo Usage: build.bat ^<path-to-integrator-dist.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<version^>
    exit /b 1
)

if "%~3"=="" (
    echo Usage: build.bat ^<path-to-integrator-dist.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<version^>
    exit /b 1
)

if "%~4"=="" (
    echo Usage: build.bat ^<path-to-integrator-dist.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<version^>
    exit /b 1
)


@REM REM Extract integrator.zip
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~2', '.\WixPackage\payload\Integrator'); }"
if errorlevel 1 (
    echo Integrator extraction failed
    exit /b 1
)

REM Extract integrator dist zip and detect Ballerina version
echo Extracting Ballerina to payload
REM Support both the legacy split layout and the newer flat distro layout
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; $extractDir = 'C:\tmp_bal'; Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force -Path $extractDir | Out-Null; [IO.Compression.ZipFile]::ExtractToDirectory('%~1', $extractDir); $unzippedFolder = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName; $ballerinaTarget = '.\WixPackage\payload\Integrator\components\ballerina'; New-Item -ItemType Directory -Force -Path $ballerinaTarget | Out-Null; $distDir = Join-Path $unzippedFolder 'distributions'; if (Test-Path $distDir) { $distFolder = (Get-ChildItem $distDir -Directory | Select-Object -First 1).FullName; if ($distFolder) { Copy-Item -Path \"$distFolder\*\" -Destination $ballerinaTarget -Recurse -Force } } else { Copy-Item -Path \"$unzippedFolder\*\" -Destination $ballerinaTarget -Recurse -Force }; $depsDir = Join-Path $unzippedFolder 'dependencies'; if (Test-Path $depsDir) { $dependenciesTarget = '.\WixPackage\payload\Integrator\components\dependencies'; New-Item -ItemType Directory -Force -Path $dependenciesTarget | Out-Null; Get-ChildItem $depsDir -Directory | ForEach-Object { Copy-Item -Path $_.FullName -Destination $dependenciesTarget -Recurse -Force } }; Remove-Item -Recurse -Force $extractDir }"
if errorlevel 1 (
    echo Ballerina extraction failed
    exit /b 1
)

for /f "delims=" %%v in ('powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; $extractDir = 'C:\tmp_bal_version'; Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force -Path $extractDir | Out-Null; [IO.Compression.ZipFile]::ExtractToDirectory('%~1', $extractDir); $unzippedFolder = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName; $distDir = Join-Path $unzippedFolder 'distributions'; $version = $null; if (Test-Path $distDir) { $distFolder = Get-ChildItem $distDir -Directory | Select-Object -First 1; if ($distFolder) { $version = $distFolder.Name -replace '^ballerina-', '' } }; if (-not $version) { $jar = Get-ChildItem (Join-Path $unzippedFolder 'bre\lib') -Filter 'ballerina-lang-*.jar' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($jar) { $version = $jar.BaseName -replace '^ballerina-lang-', '' } }; Remove-Item -Recurse -Force $extractDir; if (-not $version) { throw 'Failed to detect Ballerina version from Integrator distribution' }; Write-Output $version }"') do set "BALLERINA_VERSION=%%v"
if "%BALLERINA_VERSION%"=="" (
    echo Failed to detect Ballerina version from Integrator distribution
    exit /b 1
)
echo Detected Ballerina version %BALLERINA_VERSION%

@REM REM Extract ICP.zip
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~3', '.\temp_icp'); $icpDir = (Get-ChildItem '.\temp_icp' -Directory | Select-Object -First 1).FullName; $icpTarget = '.\WixPackage\payload\Integrator\components\icp'; New-Item -ItemType Directory -Force -Path $icpTarget | Out-Null; Copy-Item -Path \"$icpDir\*\" -Destination $icpTarget -Recurse -Force; Remove-Item -Recurse -Force '.\temp_icp' }"
if errorlevel 1 (
    echo ICP extraction failed
    exit /b 1
)

REM Modify icp.bat to use the JDK from shared dependencies directory
echo Modifying icp.bat to use JDK from dependencies
if exist ".\WixPackage\payload\Integrator\components\icp\bin\icp.bat" (
    powershell -nologo -noprofile -command "& { $icpScript = '.\WixPackage\payload\Integrator\components\icp\bin\icp.bat'; $jdkDir = (Get-ChildItem '.\WixPackage\payload\Integrator\components\dependencies' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1).Name; if ($jdkDir) { $content = Get-Content $icpScript -Raw; $javaReplacement = '!SCRIPT_DIR!../../dependencies/' + $jdkDir + '/bin/java'; $newContent = $content -replace '\bjava\b', $javaReplacement; Set-Content -Path $icpScript -Value $newContent -NoNewline; Write-Host \"Updated icp.bat to use JDK: $jdkDir\" } else { Write-Host 'Warning: JDK folder not found in dependencies' } }"
) else (
    echo Warning: icp.bat not found in ICP bin directory
)

REM Copy balscript/bal to ballerina bin directory and replace version placeholder
set "BAL_SRC=%~dp0WixPackage\balscript\bal.bat"
set "BAL_TARGET=.\WixPackage\payload\Integrator\components\ballerina\bin\bal.bat"
if exist "%BAL_SRC%" (
    if not exist ".\WixPackage\payload\Integrator\components\ballerina\bin" mkdir ".\WixPackage\payload\Integrator\components\ballerina\bin"
    powershell -nologo -noprofile -command "& { (Get-Content '%BAL_SRC%') -replace '@BALLERINA_VERSION@', '%BALLERINA_VERSION%' | Set-Content '%BAL_TARGET%' }"
    echo Copied bal.bat to ballerina bin directory with version %BALLERINA_VERSION%
) else (
    echo bal.bat not found at %BAL_SRC%
)



REM Extract numeric-only version for WiX ProductVersion (strip pre-release suffix like -m1, -beta1)
for /f "delims=" %%v in ('powershell -nologo -noprofile -command "('%~4' -split '-')[0]"') do set "WIX_VERSION=%%v"

REM Update version in Package.wxs
powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '@VERSION@', '%WIX_VERSION%' | Set-Content '.\WixPackage\Package.wxs'"


dotnet build .\CustomAction1\CustomAction1.csproj -c Release
if errorlevel 1 (
    echo CustomAction1 build failed
    powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '%WIX_VERSION%', '@VERSION@' | Set-Content '.\WixPackage\Package.wxs'"
    exit /b 1
)
dotnet build .\WixPackage\WixPackage.wixproj -p:Platform=x64 -p:Configuration=Release
if errorlevel 1 (
    echo WixPackage build failed
    powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '%WIX_VERSION%', '@VERSION@' | Set-Content '.\WixPackage\Package.wxs'"
    exit /b 1
)

REM Rename MSI output to include version
set "MSI_ORIG=WixPackage\bin\x64\Release\en-US\WSO2-Integrator.msi"
set "MSI_NEW=WixPackage\bin\x64\Release\en-US\wso2-integrator-%~4.msi"
if exist "%MSI_ORIG%" (
    ren "%MSI_ORIG%" "wso2-integrator-%~4.msi"
    echo Renamed MSI to %MSI_NEW%
) else (
    echo MSI file not found: %MSI_ORIG%
)

REM Revert version placeholder in Package.wxs
powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '%WIX_VERSION%', '@VERSION@' | Set-Content '.\WixPackage\Package.wxs'"
REM Remove payload and resources directories after build
if exist ".\WixPackage\payload" rmdir /s /q ".\WixPackage\payload"
endlocal
