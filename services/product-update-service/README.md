# Product Update Service

Hosted Ballerina service for checking the latest WSO2 Integrator version.

## Run locally

```bash
cd services/product-update-service
bal run
```

## API

`POST /api/v1/product-updates/check`

Request:

```json
{
  "installedVersion": "0.0.1"
}
```

Response:

```json
{
  "status": "update-available",
  "message": "A newer WSO2 Integrator version is available.",
  "installedVersion": "0.0.1",
  "latestVersion": "5.0.0",
  "releaseUrl": "https://github.com/wso2/product-integrator/releases/tag/v5.0.0-alpha2"
}
```

## Notes

- The service currently returns a hardcoded latest version.
- Default listener port is `8080`.
