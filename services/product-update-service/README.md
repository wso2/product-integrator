# Product Update Service

This service provides hosted update-check APIs used by WSO2 Integrator.

## Endpoints

- `GET /healthz`
- `POST /api/v1/product-updates/check`

## Request

```json
{
  "installedVersion": "0.0.1"
}
```

## Response

```json
{
  "status": "update-available",
  "message": "WSO2 Integrator 5.0.0 is available. Current version: 0.0.1.",
  "installedVersion": "0.0.1",
  "latestVersion": "5.0.0",
  "releaseUrl": "https://github.com/wso2/product-integrator/releases/tag/v5.0.0"
}
```

## Run locally

```bash
cd services/product-update-service
bal run
```
