---
title: "Read in-process request and token counters"
description: "GET /api/v1/metrics"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/metrics`



Operation: `adminGetMetrics`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/metrics" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Process-local counters keyed by instance_id and started_at_ms so multi-instance scrapers can distinguish replicas and detect counter resets on process restart. Token totals cover only complete provider-reported usage. Unknown attempts include missing or invalid usage, failures, cancellations, native adapter calls without usage provenance, and streams without trustworthy usage/termination evidence. Durable attempt evidence is stored separately; this metrics endpoint is process-local.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "instance_id": {
      "type": "string",
      "description": "Unique process/replica identifier (configured via NIU_INSTANCE_ID or generated per process startup)."
    },
    "started_at_ms": {
      "type": "integer",
      "format": "int64",
      "description": "Process startup timestamp in Unix milliseconds for counter-reset detection."
    },
    "requests_total": {
      "type": "integer"
    },
    "requests_failed": {
      "type": "integer"
    },
    "prompt_tokens": {
      "type": "integer"
    },
    "completion_tokens": {
      "type": "integer"
    },
    "usage": {
      "type": "object",
      "properties": {
        "attempts_total": {
          "type": "integer"
        },
        "attempts_unknown": {
          "type": "integer"
        },
        "attempts_provider_reported": {
          "type": "integer"
        },
        "prompt_tokens": {
          "type": "integer"
        },
        "completion_tokens": {
          "type": "integer"
        }
      }
    }
  }
}
```

## Behavior and supported scope
