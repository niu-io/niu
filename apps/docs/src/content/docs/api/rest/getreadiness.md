---
title: "Check gateway readiness"
description: "GET /readyz"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /readyz`

Reports Niu core readiness only. Private Enterprise module failures are reported by /enterprise/readyz and do not make healthy core routes unready.

Operation: `getReadiness`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/readyz"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

The gateway loaded its configuration and can accept requests.

## Behavior and supported scope

Reports Niu core readiness only. Private Enterprise module failures are reported by /enterprise/readyz and do not make healthy core routes unready.
