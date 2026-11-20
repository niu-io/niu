---
title: "Capture an immutable Provider quote version"
description: "POST /api/v1/providers/{provider}/pricing"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/providers/{provider}/pricing`

Platform administration required. Performs bounded price discovery and appends source evidence only if saved Provider adapter identity/revision still matches. Unknown/partial sources remain explicit. Does not change any customer tariff, route, balance or charge. Never blindly replay after uncertainty; retain the returned revision for historical estimates.

Operation: `captureProviderPriceEvidence`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/providers/{provider}/pricing" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Immutable quote revision, capture time, adapter binding and evidence.

### HTTP 409

Adapter identity changed; no snapshot saved.

## Behavior and supported scope

Platform administration required. Performs bounded price discovery and appends source evidence only if saved Provider adapter identity/revision still matches. Unknown/partial sources remain explicit. Does not change any customer tariff, route, balance or charge. Never blindly replay after uncertainty; retain the returned revision for historical estimates.

**Supported scope:** implemented
