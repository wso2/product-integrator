# WSO2 Integrator Extension

A unified Visual Studio Code extension for developing WSO2 integration solutions, providing a single activity bar view for both Ballerina Integrator (BI) and Micro Integrator (MI) projects.

## Features

- **Unified Integration View**: Access both BI and MI integrations from a single sidebar activity
- **Welcome Dashboard**: Interactive welcome page showing available integration types
- **Seamless Integration**: Works alongside existing BI and MI extensions
- **Quick Navigation**: Easy access to BI and MI project explorer items
- **Extension Bridge**: Automatically detects and integrates with installed BI/MI extensions

## Requirements

This extension provides a unified interface for:
- **WSO2 Integrator: BI** (`wso2.ballerina-integrator`)
- **WSO2 Integrator: MI** (`wso2.micro-integrator`)

Install one or both of these extensions to enable their respective functionality.

## Installation

1. Install the WSO2 Integrator extension from the VS Code marketplace
2. Install WSO2 Integrator: BI and/or WSO2 Integrator: MI extensions
3. Open the WSO2 Integrator activity bar icon to get started

## Usage

### Welcome Page

Click on the home icon in the WSO2 Integrator sidebar to open the welcome page, which provides:
- Status of installed BI/MI extensions
- Quick links to open BI or MI integrations
- Documentation and resource links

### Integration Explorer

The integration explorer shows:
- Ballerina Integrator (BI) projects (if extension is installed)
- Micro Integrator (MI) projects (if extension is installed)
- Tree view items from respective extensions

### Commands

- **WSO2 Integrator: Open Welcome Page** - Open the welcome dashboard
- **WSO2 Integrator: Refresh** - Refresh the integration explorer
- **WSO2 Integrator: Open BI Integration** - Switch to BI extension view
- **WSO2 Integrator: Open MI Integration** - Switch to MI extension view

## Extension Settings

This extension works with the settings of the underlying BI and MI extensions.

## Known Issues

None at this time.

## Release Notes

### 1.0.0

Initial release of WSO2 Integrator extension with:
- Unified sidebar view for BI and MI integrations
- Welcome page with integration status
- Extension bridge for BI and MI extensions
- Tree data provider for project exploration

## Contributing

We welcome contributions! Please see our [contributing guidelines](CONTRIBUTING.md) for more information.

## License

Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com)

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

## Support

- [Documentation](https://wso2.com/integration/)
- [GitHub Issues](https://github.com/wso2/ballerina-plugin-vscode/issues)
- [Community Discord](https://discord.gg/wso2)
