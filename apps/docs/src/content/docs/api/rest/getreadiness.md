---
title: "Check gateway readiness"
description: "GET /readyz"
tableOfContents: false
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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

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
