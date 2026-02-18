# Quick Reference - WSO2 Integrator DMG Build

## Build Commands

### Build DMG (Recommended)
```bash
./build-dmg.sh ballerina.zip 1.0.0 wso2-integrator.zip icp.zip 1.0.0 x64
```

### Build PKG Only
```bash
./build.sh ballerina.zip 1.0.0 wso2-integrator.zip icp.zip 1.0.0 x64
```

### Generate Background Image
```bash
./create-dmg-background.sh dmg-background.png
```

### Advanced Tools
```bash
./dmg-advanced.sh verify wso2-integrator-1.0.0-x64.dmg
./dmg-advanced.sh info wso2-integrator-1.0.0-x64.dmg
./dmg-advanced.sh compress wso2-integrator-1.0.0-x64.dmg
```

## Output Files

After building:
- `wso2-integrator-1.0.0-x64.pkg` - Package installer (~250 MB)
- `wso2-integrator-1.0.0-x64.dmg` - Disk image (~200 MB)

## Key Files

| File | Purpose |
|------|---------|
| `build-dmg.sh` | Main DMG builder |
| `build.sh` | PKG builder |
| `dmg-config.sh` | Configuration template |
| `DMG_README.md` | User documentation |
| `Distribution.xml` | Installer config |

## Customization

Edit these files to customize:
- `dmg-config.sh` - Window size, icon positions
- `DMG_README.md` - User-facing documentation
- `Distribution.xml` - System requirements, messages
- `welcome.html`, `license.txt`, `conclusion.html` - Installer UI

## System Requirements

- macOS 10.13 or later
- 2-3 GB disk space
- ImageMagick for background generation (optional)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Device already in use" | `hdiutil detach /Volumes/"WSO2 Integrator"` |
| Build fails | Check disk space: `df -h` |
| No icons in DMG | AppleScript failed (non-critical) |
| Large file size | Already max compressed |

## File Sizes

| Format | Size |
|--------|------|
| PKG | ~250 MB |
| DMG | ~200 MB |
| Compression ratio | 40% reduction |
