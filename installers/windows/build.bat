REM Accepts three arguments: ballerina.zip and integrator.zip ICP.zip
REM Extracts them to WixPackage\payload\Ballerina and WixPackage\payload\Integrator and WixPackage\payload\ICP respectively

@echo off
setlocal

REM Check for required arguments
if "%~1"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^>
    exit /b 1
)
if "%~2"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^>  
    exit /b 1
)
if "%~3"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^>  
    exit /b 1
)

@REM REM Remove existing Ballerina and Integrator directories if they exist
@REM powershell -Command "if (Test-Path '.\WixPackage\payload\Ballerina') { Remove-Item -Recurse -Force '.\WixPackage\payload\Ballerina' }"
@REM powershell -Command "if (Test-Path '.\WixPackage\payload\Integrator') { Remove-Item -Recurse -Force '.\WixPackage\payload\Integrator' }"
@REM powershell -Command "if (Test-Path '.\WixPackage\payload\ICP') { Remove-Item -Recurse -Force '.\WixPackage\payload\ICP' }"

@REM REM Extract ballerina.zip
@REM powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~1', 'C:\'); }"
@REM move "C:\ballerina-"* ".\WixPackage\payload\Ballerina"

@REM REM Extract integrator.zip
@REM powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~2', '.\WixPackage\payload\Integrator'); }"

@REM REM Extract ICP.zip
@REM powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~3', '.\temp_icp'); Move-Item -Path '.\temp_icp\*' -Destination '.\WixPackage\payload\ICP' -Force; Remove-Item -Recurse -Force '.\temp_icp' }"

dotnet build .\CustomAction1\CustomAction1.csproj
dotnet build .\WixPackage\WixPackage.wixproj -p:Platform=x64
endlocal
