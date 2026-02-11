# product-integrator
Open source integration platform offering a powerful low-code development experience with enhanced capabilities.

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

