---
title: "Refresh one direct-channel video job"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/refresh"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/refresh`

Rechecks current workspace/model/policy access and original pinned account/route. Performs one bounded GET and applies saved status evidence. Missing references require reconciliation and never trigger a new generation. OpenRouter cancelled/expired observations normalize to failed generation while preserving their exact safe query status; they do not establish zero usage or release financial liability. Does not expose private result URLs. Explicit refresh supports personal ownership or the original customer pricing binding. Reported successful customer usage settles the pinned price once; missing/conflicting usage retains liability. Opt-in automatic recovery includes prepaid jobs; successful jobs with missing usage or unposted liability keep recovery active. Saved successful reported usage can settle locally without another upstream query, including after key revocation; new queries still require a current key. Result retrieval and live channel qualification remain pending.

Operation: `refreshDashboardVideoJob`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/refresh" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### key

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### job

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

Rechecks current workspace/model/policy access and original pinned account/route. Performs one bounded GET and applies saved status evidence. Missing references require reconciliation and never trigger a new generation. OpenRouter cancelled/expired observations normalize to failed generation while preserving their exact safe query status; they do not establish zero usage or release financial liability. Does not expose private result URLs. Explicit refresh supports personal ownership or the original customer pricing binding. Reported successful customer usage settles the pinned price once; missing/conflicting usage retains liability. Opt-in automatic recovery includes prepaid jobs; successful jobs with missing usage or unposted liability keep recovery active. Saved successful reported usage can settle locally without another upstream query, including after key revocation; new queries still require a current key. Result retrieval and live channel qualification remain pending.
