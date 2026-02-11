# product-integrator
Open source integration platform offering a powerful low-code development experience with enhanced capabilities.

## Installers

| OS | Format | Description |
|----|--------|-------------|
| **macOS** | `.pkg` | Universal installer. Supports both System-wide (Admin) and User-local (No Admin) installations. |
| **Windows** | `.msi` | Installs to User's Local AppData. No Admin privileges required. |
| **Linux (Debian/Ubuntu)** | `.deb` | Standard package. Requires `sudo` to install (System-wide). |
| **Linux (RedHat/CentOS)** | `.rpm` | Standard package. Requires `sudo` to install (System-wide). |
| **Linux (General)** | `.tar.gz` | Portable archive. Can be extracted and run anywhere **without root privileges**. |

## Build from Source

### Prerequisites
- Node.js (v18+)
- NPM
- Quilt (for applying patches)
  - macOS: `brew install quilt`
  - Linux: `sudo apt-get install quilt`

### Build Command
You can use the `build.sh` script to build the project. This script handles patching, compiling, and packaging.

```bash
./build.sh
```

### Build Options
- `--compile-only`: Only prepares the environment (patches) and compiles the source code.
- `--package-only`: Only packages the built artifacts. Ensure the environment is prepared first.

