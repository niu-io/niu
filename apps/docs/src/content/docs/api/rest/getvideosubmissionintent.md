---
title: "Restore a saved video intent and its historical job"
description: "GET /api/v1/organizations/{organization}/projects/{project}/video/intents/{intent}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/video/intents/{intent}`

Accepts an internal UUID alias or permanent input reference. Both preserve existing workspace and actor authorization; mutation endpoints still require internal UUIDs. Current workspace Read permission and the original actor-owned intent are required. Restores saved request and job evidence independently of current inference key lifetime, model grants, source policy or Provider configuration. Original and available rotation-lineage key IDs are context only, never authority to submit, estimate or query upstream. Revoked/expired keys and lost model grants do not hide retained private input; deletion and original/bound-turn expiry still hide content immediately. Unknown submission evidence never grants permission to dispatch again. No upstream request, inference, reservation, settlement or write occurs. Storage failures remain errors.

Operation: `getVideoSubmissionIntent`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/video/intents/{intent}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

### intent

Location: **path**. **Required.**

```json
{
  "type": "string",
  "description": "Internal UUID alias or permanent input reference"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Restore a video intent and resolve its original job

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
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
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "revision",
        "original_key_id",
        "key_id",
        "model",
        "funding_mode",
        "request",
        "content_state",
        "expires_at_ms",
        "submission_state",
        "job",
        "session_binding"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "expires_at_ms": {
          "description": "Immutable original intent deadline. A bound turn may expire or delete content earlier; content_state determines availability.",
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "content_state": {
          "type": "string",
          "enum": [
            "retained",
            "deleted",
            "expired"
          ]
        },
        "original_key_id": {
          "type": "string",
          "format": "uuid"
        },
        "key_id": {
          "type": "string",
          "format": "uuid",
          "description": "Available active rotation-lineage key with the model grant, otherwise the original saved key. Context only; current action authorization remains required and no secret is returned."
        },
        "model": {
          "type": "string"
        },
        "funding_mode": {
          "type": "string",
          "enum": [
            "owner_funded",
            "customer"
          ]
        },
        "request": {
          "anyOf": [
            {
              "type": "object",
              "required": [
                "model",
                "content"
              ],
              "additionalProperties": true,
              "description": "Validated original Niu request with configured defaults materialized at save time, at most 60 KiB JSON. Supports text, Provider-owned image/audio/video IDs, or workspace-owned image IDs with explicit consent. Provider/local reference families cannot be mixed. Only scoped metadata is read at save; no bytes, upload, Provider query, processing readiness or dispatch. No private Provider URI or schema placeholder is persisted. URL, inline data, ingested_image and callbacks are unsupported. Current model schema, policy and funding mode apply; actual live binding, Active readiness and inspection are rechecked only at explicit submit.",
              "properties": {
                "model": {
                  "type": "string"
                },
                "content": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "oneOf": [
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "type",
                          "text"
                        ],
                        "properties": {
                          "type": {
                            "const": "text"
                          },
                          "text": {
                            "type": "string"
                          }
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "type",
                          "provider_asset"
                        ],
                        "properties": {
                          "type": {
                            "const": "provider_asset"
                          },
                          "provider_asset": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "id"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "format": "uuid",
                                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                                "description": "Canonical nonnil Niu reference."
                              }
                            }
                          },
                          "role": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256,
                            "description": "Explicit configured role; null, whitespace padding and control characters are invalid."
                          }
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "type",
                          "workspace_asset"
                        ],
                        "properties": {
                          "type": {
                            "const": "workspace_asset"
                          },
                          "workspace_asset": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "asset_id",
                              "consent_to_process"
                            ],
                            "properties": {
                              "asset_id": {
                                "type": "string",
                                "format": "uuid",
                                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                                "description": "Canonical nonnil Niu reference."
                              },
                              "consent_to_process": {
                                "type": "boolean",
                                "const": true
                              }
                            }
                          },
                          "role": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256,
                            "description": "Explicit configured role; null, whitespace padding and control characters are invalid."
                          }
                        }
                      }
                    ]
                  },
                  "maxItems": 32
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "submission_state": {
          "type": "string",
          "enum": [
            "saved",
            "not_dispatched",
            "dispatched"
          ],
          "description": "Dispatch and job status are read from one bounded read-only database snapshot. not_dispatched means original preparation has no recorded dispatch; it never grants a fresh submission right."
        },
        "job": {
          "anyOf": [
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
            },
            {
              "type": "null"
            }
          ]
        },
        "session_binding": {
          "type": [
            "object",
            "null"
          ],
          "description": "Original actor-private session and turn binding, if any. Internal routing references only; never render these IDs. Remains available after content deletion or expiry and does not authorize inference. Explicit null means no saved binding; older gateways with no field must not be interpreted as confirmed absence.",
          "required": [
            "session_id",
            "turn_id"
          ],
          "additionalProperties": false,
          "properties": {
            "session_id": {
              "type": "string",
              "format": "uuid"
            },
            "turn_id": {
              "type": "string",
              "format": "uuid"
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid path, query or request; framework rejections may be plain text.

### HTTP 401

Invalid actor credential.

### HTTP 403

Current workspace Read permission denied.

### HTTP 404

Intent is not owned by this actor and workspace.

### HTTP 409

Immutable identity, request, funding mode, revision or cursor conflict.

### HTTP 503

Required storage or route configuration is unavailable.

## Behavior and supported scope

Accepts an internal UUID alias or permanent input reference. Both preserve existing workspace and actor authorization; mutation endpoints still require internal UUIDs. Current workspace Read permission and the original actor-owned intent are required. Restores saved request and job evidence independently of current inference key lifetime, model grants, source policy or Provider configuration. Original and available rotation-lineage key IDs are context only, never authority to submit, estimate or query upstream. Revoked/expired keys and lost model grants do not hide retained private input; deletion and original/bound-turn expiry still hide content immediately. Unknown submission evidence never grants permission to dispatch again. No upstream request, inference, reservation, settlement or write occurs. Storage failures remain errors.

**Supported scope:** implemented

**Supported scope:** Durable text and typed Niu material-reference intent persistence with explicit submission. URL, inline data and ingested-image intent drafts remain unsupported; full browser restoration and customer-funded video qualification remain separate.
