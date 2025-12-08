REM Accepts four arguments: ballerina.zip, integrator.zip, ICP.zip, and version
REM Extracts the zip files to their respective payload directories and applies the version to Package.wxs before building the installer

@echo off
setlocal

REM Check for required arguments
if "%~1"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<version^>
    exit /b 1
)
if "%~2"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<version^>
    exit /b 1
)

if "%~3"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<version^>
    exit /b 1
)

if "%~4"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<version^>
    exit /b 1
)


@REM REM Extract ballerina.zip
set "TEMP_BAL_DIR=C:\temp_ballerina_%RANDOM%_%TIME:~6,2%"
if exist "%TEMP_BAL_DIR%" rmdir /s /q "%TEMP_BAL_DIR%"
mkdir "%TEMP_BAL_DIR%"
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~1', '%TEMP_BAL_DIR%'); }"
mkdir ".\WixPackage\payload\Ballerina"
REM Move the ballerina-* directory from temp to payload
REM Move all contents from ballerina-xxxx to payload
for /d %%D in ("%TEMP_BAL_DIR%\ballerina-*") do xcopy "%%D\*" ".\WixPackage\payload\Ballerina" /E /H /Y
if exist "%TEMP_BAL_DIR%" rmdir /s /q "%TEMP_BAL_DIR%"
if errorlevel 1 (
    echo Ballerina extraction failed
    exit /b 1
)

@REM REM Extract integrator.zip
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~2', '.\WixPackage\payload\Integrator'); }"
if errorlevel 1 (
    echo Integrator extraction failed
    exit /b 1
)

@REM REM Extract ICP.zip
powershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~3', '.\temp_icp'); Move-Item -Path '.\temp_icp\*' -Destination '.\WixPackage\payload\ICP' -Force; Remove-Item -Recurse -Force '.\temp_icp' }"
if errorlevel 1 (
    echo ICP extraction failed
    exit /b 1
)

REM Update version in Package.wxs
powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '@VERSION@', '%~4' | Set-Content '.\WixPackage\Package.wxs'"


dotnet build .\CustomAction1\CustomAction1.csproj -c Release
if errorlevel 1 (
    echo CustomAction1 build failed
    powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '%~4', '@VERSION@' | Set-Content '.\WixPackage\Package.wxs'"
    exit /b 1
)
dotnet build .\WixPackage\WixPackage.wixproj -p:Platform=x64 -p:Configuration=Release
if errorlevel 1 (
    echo WixPackage build failed
    powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '%~4', '@VERSION@' | Set-Content '.\WixPackage\Package.wxs'"
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
powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '%~4', '@VERSION@' | Set-Content '.\WixPackage\Package.wxs'"
REM Remove payload directory after build
if exist ".\WixPackage\payload" rmdir /s /q ".\WixPackage\payload"
endlocal
