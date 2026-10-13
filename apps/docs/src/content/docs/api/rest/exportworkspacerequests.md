---
title: "Export filtered customer-safe request metadata as CSV"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/requests/export"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/requests/export`

Requires workspace read access. Uses one database statement for the filtered range, newest first by default, with the requested sort applied to the whole range. Excludes internal identifiers, payloads, credentials and Supplier costs. Unknown values remain empty, exact quantities remain decimal text, and formula-like text is neutralized. Pagination parameters are rejected; more than 10000 matched requests fails without a partial download.

Operation: `exportWorkspaceRequests`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/requests/export" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### http_status

Location: **query**. Optional. Recorded delivery HTTP status, or unknown when absent; independent of Provider execution.

```json
{
  "type": "string",
  "pattern": "^(unknown|[1-5][0-9]{2})$"
}
```

### sort

Location: **query**. Optional. Full-range order. Known latency/token values precede unknown values; time and ID break ties. Live traversal is not a cross-page snapshot.

```json
{
  "type": "string",
  "enum": [
    "time_desc",
    "time_asc",
    "latency_desc",
    "input_desc",
    "output_desc"
  ],
  "default": "time_desc"
}
```

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

### from_ms

Location: **query**. Optional.

```json
{
  "type": "integer",
  "format": "int64"
}
```

### to_ms

Location: **query**. Optional.

```json
{
  "type": "integer",
  "format": "int64"
}
```

### model_alias

Location: **query**. Optional.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200
}
```

### operation_id

Location: **query**. Optional. Restrict to one operation within the authorized workspace.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### key_id

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### status

Location: **query**. Optional. recorded_failure selects persisted failure observations, including SSE errors under HTTP 200; delivery_failed retains HTTP-error semantics.

```json
{
  "type": "string",
  "enum": [
    "not_sent",
    "may_have_executed",
    "confirmed_completed",
    "confirmed_not_executed",
    "output_withheld",
    "delivery_failed",
    "recorded_failure"
  ]
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

CSV attachment with no-store caching and meaningful customer fields only. Appended Cached input tokens and Reasoning output tokens columns contain exact reported subset counts; unknown counts are blank and explicit zero remains zero. Category counts do not establish billing rates or savings.

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  },
  "Content-Disposition": {
    "schema": {
      "type": "string"
    }
  }
}
```

Content type: `text/csv`.

```json
{
  "type": "string"
}
```

### HTTP 400

Invalid filters or pagination parameters.

### HTTP 401

Missing, invalid or inference-only credentials.

### HTTP 403

Administration credential cannot read this workspace.

### HTTP 413

More than 10000 requests match; narrow the filters.

## Behavior and supported scope

Requires workspace read access. Uses one database statement for the filtered range, newest first by default, with the requested sort applied to the whole range. Excludes internal identifiers, payloads, credentials and Supplier costs. Unknown values remain empty, exact quantities remain decimal text, and formula-like text is neutralized. Pagination parameters are rejected; more than 10000 matched requests fails without a partial download.
