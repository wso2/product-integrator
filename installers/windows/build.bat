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
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<version^>
    exit /b 1
)

if "%~4"=="" (
    echo Usage: build.bat ^<path-to-ballerina.zip^> ^<path-to-integrator.zip^> ^<path-to-ICP.zip^> ^<version^>
    exit /b 1
)


@REM REM Extract ballerina.zip
ppowershell -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%~1', '.\temp_ballerina'); }"
move ".\temp_ballerina\ballerina-*" ".\WixPackage\payload\Ballerina"
if exist ".\temp_ballerina" rmdir /s /q ".\temp_ballerina"
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

REM Revert version placeholder in Package.wxs
powershell -Command "(Get-Content '.\WixPackage\Package.wxs') -replace '%~4', '@VERSION@' | Set-Content '.\WixPackage\Package.wxs'"
endlocal
