---
title: "Explicitly submit or replay an immutable saved video intent"
description: "POST /api/v1/workspaces/{workspace}/video/intents/{intent}/submit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/workspaces/{workspace}/video/intents/{intent}/submit`

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires write permission, matching retained revision and current key/model/source authorization. Uses only the saved request and original rotation lineage. Rechecks configured video admission and rejects a changed owner-funded/customer funding mode before a new dispatch. Concurrent and restarted calls use one original submission identity. Interrupted original preparation is read back, never assumed safe to dispatch again. HTTP 202 can represent unresolved submission and is not a completed generation or settled charge. Fresh submissions use the same 24-hour inspected-request and Niu creation-response Logs capture as direct creation, with x-niu-log-payloads: false opt-out. Capture uses the saved inspected video request, not this revision-only submit body. Replay does not create or restore capture. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `submitVideoSubmissionIntentByWorkspace`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/workspaces/{workspace}/video/intents/{intent}/submit" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### workspace

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### intent

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### x-niu-log-payloads

Location: **header**. Optional. Capture the inspected Niu request and Niu creation response in bounded 24-hour Logs storage. False opts out; repeated or invalid values are rejected. Replay never creates a new capture.

```json
{
  "type": "string",
  "enum": [
    "true",
    "false"
  ],
  "default": "true"
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "expected_revision"
  ],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

## Responses

### HTTP 202

Explicitly submit or replay an immutable saved video intent

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  },
  "x-niu-attempt-id": {
    "description": "Present on fresh creation; identifies the attempt for scoped Logs. Replay does not generate a new capture.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "object",
    "model",
    "status"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "object": {
      "const": "video.job"
    },
    "model": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "submission_unknown",
        "queued",
        "running",
        "succeeded",
        "failed",
        "unknown",
        "reconciliation_required"
      ]
    }
  }
}
```

### HTTP 400

Invalid path, query or request; framework rejections may be plain text.

### HTTP 401

Invalid actor credential or no authorized current key in the original lineage.

### HTTP 402

Insufficient funds or spending allowance before dispatch.

### HTTP 403

Workspace permission or current source policy denied.

### HTTP 404

Intent is not owned by this actor and workspace, or selected model is inaccessible.

### HTTP 409

Immutable identity, request, funding mode, revision or cursor conflict.

### HTTP 429

Current rate or concurrency policy denied admission.

### HTTP 501

Unsupported video capability or saved-reference form.

### HTTP 503

Required storage or route configuration is unavailable.

## Behavior and supported scope

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires write permission, matching retained revision and current key/model/source authorization. Uses only the saved request and original rotation lineage. Rechecks configured video admission and rejects a changed owner-funded/customer funding mode before a new dispatch. Concurrent and restarted calls use one original submission identity. Interrupted original preparation is read back, never assumed safe to dispatch again. HTTP 202 can represent unresolved submission and is not a completed generation or settled charge. Fresh submissions use the same 24-hour inspected-request and Niu creation-response Logs capture as direct creation, with x-niu-log-payloads: false opt-out. Capture uses the saved inspected video request, not this revision-only submit body. Replay does not create or restore capture. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented

**Supported scope:** Durable text and typed Niu material-reference intent persistence with explicit submission. URL, inline data and ingested-image intent drafts remain unsupported; full browser restoration and customer-funded video qualification remain separate.
