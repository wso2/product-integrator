# WSO2 Integrator Installers

This directory contains build scripts for creating platform-specific installers for WSO2 Integrator.

## Installation Locations

### macOS

- App bundle (per-user): `~/Applications/WSO2 Integrator.app`
- ICP: `~/Applications/WSO2 Integrator.app/Contents/Resources/components/icp/<icp-folder>`
- Ballerina: `~/Applications/WSO2 Integrator.app/Contents/Resources/components/ballerina/ballerina-<version>`

### Windows

- Install root (per-user): `%LOCALAPPDATA%\WSO2\Integrator`
- ICP: `%LOCALAPPDATA%\WSO2\Integrator\ICP`
- Ballerina: `%LOCALAPPDATA%\WSO2\Ballerina`

## Notes

- macOS app bundle is moved to the user Applications folder by the postinstall script.
- Windows paths are defined by the WiX directory layout for per-user installs.
