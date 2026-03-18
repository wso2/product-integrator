# product-integrator
Open source integration platform offering a powerful low-code development experience with enhanced capabilities.

## Product update checks

This repository includes a standalone update checker that can notify you when a newer WSO2 Integrator version is available, even when the product is not open.

Run it manually with:

```bash
npm run check-product-updates
```

Useful environment variables:

- `WSO2_INTEGRATOR_CURRENT_VERSION`: currently installed product version to compare against
- `WSO2_INTEGRATOR_RELEASE_API_URL`: override the release metadata endpoint
- `WSO2_INTEGRATOR_TAGS_API_URL`: override the fallback tags endpoint
- `WSO2_INTEGRATOR_RELEASES_PAGE_URL`: override the release notes URL
- `WSO2_INTEGRATOR_STATE_DIR`: override where last-notified state is stored

By default, the script stores its state under `~/.wso2-integrator-update-check/` so it only alerts once per newly detected version for the same installed version.
