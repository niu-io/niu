---
title: "Read Provider-adapter advertised price evidence"
description: "GET /api/v1/providers/{provider}/pricing"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/pricing`

Platform administration required. Uses explicit saved Provider service identity and a bounded official/public source read without forwarding credentials. No tariffs, balances or model routes are changed. Partial native ratios are not money; empty/unqualified feeds are unknown, not free. Source and observation time are returned. Qualified official-page adapters validate their observed schema and preserve conditional or unsupported rates; changed schemas remain unavailable.

Operation: `discoverProviderPricing`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/pricing" \
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

Unified advertised pricing evidence with completeness limits.

### HTTP 502

Source failure; retry the read without mutating configuration.

## Behavior and supported scope

Platform administration required. Uses explicit saved Provider service identity and a bounded official/public source read without forwarding credentials. No tariffs, balances or model routes are changed. Partial native ratios are not money; empty/unqualified feeds are unknown, not free. Source and observation time are returned. Qualified official-page adapters validate their observed schema and preserve conditional or unsupported rates; changed schemas remain unavailable.

**Supported scope:** implemented
