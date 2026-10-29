---
title: "Refresh one direct-channel video job"
description: "POST /v1/video/jobs/{id}/refresh"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/video/jobs/{id}/refresh`

Rechecks current workspace/model/policy access and original pinned account/route. Performs one bounded GET and applies saved status evidence. Missing references require reconciliation and never trigger a new generation. Does not expose private result URLs. Explicit refresh supports personal ownership or the original customer pricing binding. Reported successful customer usage settles the pinned price once; missing/conflicting usage retains liability. Opt-in automatic recovery includes prepaid jobs; successful jobs with missing usage or unposted liability keep recovery active. Saved successful reported usage can settle locally without another upstream query, including after key revocation; new queries still require a current key. Result retrieval and live channel qualification remain pending.

Operation: `refreshOwnerFundedVideoJob`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/video/jobs/{id}/refresh" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/video/jobs/{id}/refresh" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
```

## Parameters

### id

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

Refreshed durable scoped state

### HTTP 401

Invalid credential

### HTTP 403

Current policy denies access

### HTTP 404

Missing job or workspace/model access denied

### HTTP 409

Missing reference or original route changed

### HTTP 501

Unsupported recovery channel

### HTTP 502

Query could not be refreshed; original generation is not retried

## Behavior and supported scope

Rechecks current workspace/model/policy access and original pinned account/route. Performs one bounded GET and applies saved status evidence. Missing references require reconciliation and never trigger a new generation. Does not expose private result URLs. Explicit refresh supports personal ownership or the original customer pricing binding. Reported successful customer usage settles the pinned price once; missing/conflicting usage retains liability. Opt-in automatic recovery includes prepaid jobs; successful jobs with missing usage or unposted liability keep recovery active. Saved successful reported usage can settle locally without another upstream query, including after key revocation; new queries still require a current key. Result retrieval and live channel qualification remain pending.
