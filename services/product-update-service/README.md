# Product Update Service

Hosted Go service for checking the latest WSO2 Integrator and Ballerina versions from GitHub.

## Run locally

```bash
cd services/product-update-service
go run .
```

## API

`POST /api/v1/product-updates/check`

`POST /api/v1/ballerina-updates/check`

`POST /api/v1/bi-updates/check`

`POST /api/v1/mi-updates/check`

`POST /api/v1/icp-updates/check`

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

## Environment variables

- `PORT`
- `RELEASE_API_URL`
- `TAGS_API_URL`
- `RELEASES_PAGE_URL`
- `BALLERINA_RELEASE_API_URL`
- `BALLERINA_TAGS_API_URL`
- `BALLERINA_RELEASES_PAGE_URL`
- `BI_RELEASE_API_URL`
- `BI_TAGS_API_URL`
- `BI_RELEASES_PAGE_URL`
- `MI_RELEASE_API_URL`
- `MI_TAGS_API_URL`
- `MI_RELEASES_PAGE_URL`
- `ICP_RELEASE_API_URL`
- `ICP_TAGS_API_URL`
- `ICP_RELEASES_PAGE_URL`
