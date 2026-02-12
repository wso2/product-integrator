@echo off
setlocal enabledelayedexpansion

set COMPILE_ONLY=false
set PACKAGE_ONLY=false
set BUILD_INSTALLER=false
set BALLERINA_VERSION=
set ICP_VERSION=
set INTEGRATOR_VERSION=

:parse
if "%~1"=="" goto after_parse
if /I "%~1"=="--compile-only" set COMPILE_ONLY=true
if /I "%~1"=="--package-only" set PACKAGE_ONLY=true
if /I "%~1"=="--installer" set BUILD_INSTALLER=true
if /I "%~1"=="--ballerina-version" (
  set BALLERINA_VERSION=%~2
  shift
)
if /I "%~1"=="--icp-version" (
  set ICP_VERSION=%~2
  shift
)
if /I "%~1"=="--integrator-version" (
  set INTEGRATOR_VERSION=%~2
  shift
)
shift
goto parse

:after_parse

call :configure
if /I "%PACKAGE_ONLY%"=="true" (
  call :package
  goto after_build
)
if /I "%COMPILE_ONLY%"=="true" (
  call :compile
  goto after_build
)
call :compile
call :package

:after_build
if /I "%BUILD_INSTALLER%"=="true" call :build_installer

echo Build complete!
endlocal
exit /b 0

:configure
call :require_cmd node
call :require_cmd npm
call :require_cmd git
call :require_cmd bash

echo Initializing submodules...
git submodule update --init --recursive
if errorlevel 1 exit /b 1

echo Installing dependencies...
pushd lib\vscode
npm ci
if errorlevel 1 (popd & exit /b 1)

node build\azure-pipelines\distro\mixin-npm || echo mixin-npm failed (ignored)
node build\azure-pipelines\distro\mixin-quality || echo mixin-quality failed (ignored)

npm run download-builtin-extensions
if errorlevel 1 (popd & exit /b 1)

node build\win32\explorer-dll-fetcher .build\win32\appx
if errorlevel 1 (popd & exit /b 1)

popd

call :apply_patches
if errorlevel 1 exit /b 1

call :update_product
if errorlevel 1 exit /b 1

goto :eof

:compile
echo Compiling...
pushd lib\vscode
npm run compile
if errorlevel 1 (popd & exit /b 1)
popd
goto :eof

:package
echo Packaging...
if not defined VSCODE_ARCH (
  if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
    set VSCODE_ARCH=arm64
  ) else (
    set VSCODE_ARCH=x64
  )
)

set TARGET=
if /I "%VSCODE_ARCH%"=="x64" set TARGET=vscode-win32-x64-min-ci
if /I "%VSCODE_ARCH%"=="arm64" set TARGET=vscode-win32-arm64-min-ci

if "%TARGET%"=="" (
  echo Unsupported Windows architecture: %VSCODE_ARCH%
  exit /b 1
)

echo Building target: %TARGET%
pushd lib\vscode
npm run gulp "%TARGET%"
if errorlevel 1 (popd & exit /b 1)
popd
goto :eof

:build_installer
if "%BALLERINA_VERSION%"=="" (
  echo ballerina_version is required to build the installer
  exit /b 1
)
if "%ICP_VERSION%"=="" (
  echo icp_version is required to build the installer
  exit /b 1
)
if "%INTEGRATOR_VERSION%"=="" (
  echo integrator_version is required to build the installer
  exit /b 1
)

echo Building Windows installer...
if not exist installers\windows\VSCode-win32-%VSCODE_ARCH%.zip (
  powershell -nologo -noprofile -command "Compress-Archive -Path 'VSCode-win32-%VSCODE_ARCH%\*' -DestinationPath 'installers\windows\VSCode-win32-%VSCODE_ARCH%.zip' -Force"
  if errorlevel 1 exit /b 1
)

set BALLERINA_URL=https://github.com/ballerina-platform/ballerina-distribution/releases/download/v%BALLERINA_VERSION%/ballerina-%BALLERINA_VERSION%-swan-lake-windows.zip
set ICP_URL=https://github.com/wso2/integration-control-plane/releases/download/v%ICP_VERSION%/wso2-integration-control-plane-%ICP_VERSION%.zip

pushd installers\windows
powershell -nologo -noprofile -command "Invoke-WebRequest -Uri '%BALLERINA_URL%' -OutFile 'ballerina.zip'"
if errorlevel 1 (popd & exit /b 1)

powershell -nologo -noprofile -command "Invoke-WebRequest -Uri '%ICP_URL%' -OutFile 'icp.zip'"
if errorlevel 1 (popd & exit /b 1)

call .\build.bat .\ballerina.zip .\VSCode-win32-%VSCODE_ARCH%.zip .\icp.zip %INTEGRATOR_VERSION%
if errorlevel 1 (popd & exit /b 1)

popd
goto :eof

:apply_patches
for /f "usebackq delims=" %%P in ("patches\series") do (
  if not "%%P"=="" call :apply_patch "patches\%%P"
  if errorlevel 1 exit /b 1
)

goto :eof

:apply_patch
set PATCH=%~1
git apply --reverse --check "%PATCH%" >nul 2>&1
if %ERRORLEVEL%==0 (
  echo Patch already applied: %PATCH%
  goto :eof
)

git apply "%PATCH%"
if errorlevel 1 (
  echo Error applying patch: %PATCH%
  exit /b 1
)

goto :eof

:update_product
echo Updating product branding...
bash -lc "chmod +x ./ci/build/update-product.sh && ./ci/build/update-product.sh"
if errorlevel 1 exit /b 1

goto :eof

:require_cmd
where %~1 >nul 2>&1
if errorlevel 1 (
  echo Error: %~1 is not installed or not on PATH.
  exit /b 1
)

goto :eof
