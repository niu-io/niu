---
title: "Check Enterprise module readiness"
description: "GET /enterprise/readyz"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /enterprise/readyz`

In an Enterprise distribution, reports whether the core database and all required private modules are healthy within a three-second deadline. Community builds without a release manifest report disabled readiness. This endpoint does not affect Niu core readiness.

Operation: `getEnterpriseReadiness`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/enterprise/readyz"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Enterprise modules are ready, or no Enterprise modules are configured.

### HTTP 503

At least one required Enterprise module is unavailable or incompatible.

## Behavior and supported scope

In an Enterprise distribution, reports whether the core database and all required private modules are healthy within a three-second deadline. Community builds without a release manifest report disabled readiness. This endpoint does not affect Niu core readiness.
