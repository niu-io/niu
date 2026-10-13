---
title: "Submit a schema-validated video job"
description: "POST /v1/video/jobs"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/video/jobs`

Personal routes support configured ark-direct-v1 or openrouter-video-v1 channels. Customer-funded video currently requires a qualified ark-direct-v1 route and video_tokens pricing; OpenRouter remains personal-only. Shared routes with a legacy procurement budget are unsupported, while personal routes retain ordinary authorization and key limits. Exactly one upstream submission follows durable dispatch intent. HTTP or transport errors retain submission_unknown and any unresolved liability. Observed non-success HTTP statuses are saved as upstream_http_error in scoped request diagnostics, without upstream bodies or credentials; they do not prove nonexecution or authorize a retry. Fresh creation responses include x-niu-attempt-id. Logs retain the inspected Niu request and delivered Niu creation response for up to 24 hours by default; x-niu-log-payloads: false opts out. Requests larger than the 1 MiB capture bound are not retained. This is not an upstream transport-body capture, and replay does not recreate deleted or expired payloads. Optional workspace-scoped Idempotency-Key supports text and schema-approved upstream URL creation: identical replay returns the original reference and current saved status, including after restart. Changed input conflicts. Unkeyed requests are not idempotent. Configured controls, reference inputs and required inspection remain subject to the selected schema and supported channel. Ordinary public HTTPS image/audio/video URLs are forwarded only when the exact selected upstream schema supports them. Inline image data follows the configured schema. Explicit required image policies still enforce local inspection; unsupported remote inspection fails closed. Short-lived ordinary ingested_image references accept Niu ingestion/readiness IDs with explicit consent_to_reuse. Provider asset URIs remain private and are resolved only for the exact selected Ark route. This does not grant durable library or portrait rights; expired, erased, revoked or unavailable bindings fail closed before dispatch. Durable workspace image references do not reuse Provider readiness or old inspection receipts; they undergo fresh current inspection and atomic local-content authorization. Owned Provider references use content.type provider_asset with provider_asset.id identifying a Niu workspace asset, not a raw upstream URI. Current scope, model, account, acknowledged creation and Active asset state are checked; the same live binding is checked atomically with dispatch. Source model revision is retained as history, while current selected model/schema and tariffs govern the request. Kind, roles and input limits follow backend metadata and the selected schema. Explicit required image inspection refuses these remote assets; ordinary default policy adds no detector. Mixing these references with ingested/workspace material or inline image data is currently unsupported. On creation, idempotency and request captures retain Niu IDs and inspected text, never the resolved asset URI.

Operation: `createOwnerFundedVideoJob`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/video/jobs" \
  -H "Authorization: Bearer $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Idempotency-Key

Location: **header**. Optional. Reuse only with the same JSON document in the same workspace; object field order is ignored.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 128
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
  "required": [
    "model",
    "content"
  ],
  "properties": {
    "model": {
      "type": "string",
      "minLength": 1
    },
    "content": {
      "type": "array",
      "minItems": 1,
      "maxItems": 32,
      "items": {
        "oneOf": [
          {
            "type": "object",
            "required": [
              "type",
              "text"
            ],
            "properties": {
              "type": {
                "const": "text"
              },
              "text": {
                "type": "string",
                "minLength": 1
              },
              "role": {
                "type": "string",
                "description": "Only roles explicitly supported by the selected schema are accepted."
              }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": [
              "type",
              "image_url"
            ],
            "properties": {
              "type": {
                "const": "image_url"
              },
              "image_url": {
                "type": "object",
                "required": [
                  "url"
                ],
                "properties": {
                  "url": {
                    "type": "string",
                    "pattern": "^(https://|data:image/(png|jpeg|webp);base64,)"
                  }
                },
                "additionalProperties": false
              },
              "role": {
                "type": "string",
                "description": "Only roles explicitly supported by the selected schema are accepted."
              }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": [
              "type",
              "audio_url"
            ],
            "properties": {
              "type": {
                "const": "audio_url"
              },
              "audio_url": {
                "type": "object",
                "required": [
                  "url"
                ],
                "properties": {
                  "url": {
                    "type": "string",
                    "pattern": "^https://",
                    "description": "Public HTTPS input, accepted only when the selected upstream channel and exact model schema support this kind."
                  }
                },
                "additionalProperties": false
              },
              "role": {
                "type": "string",
                "description": "Only roles explicitly supported by the selected schema are accepted."
              }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": [
              "type",
              "video_url"
            ],
            "properties": {
              "type": {
                "const": "video_url"
              },
              "video_url": {
                "type": "object",
                "required": [
                  "url"
                ],
                "properties": {
                  "url": {
                    "type": "string",
                    "pattern": "^https://",
                    "description": "Public HTTPS input, accepted only when the selected upstream channel and exact model schema support this kind."
                  }
                },
                "additionalProperties": false
              },
              "role": {
                "type": "string",
                "description": "Only roles explicitly supported by the selected schema are accepted."
              }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "ingested_image"
            ],
            "properties": {
              "type": {
                "const": "ingested_image"
              },
              "role": {
                "type": "string",
                "description": "Only roles declared by the selected image input rule."
              },
              "ingested_image": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "ingestion_id",
                  "readiness_id",
                  "consent_to_reuse"
                ],
                "properties": {
                  "ingestion_id": {
                    "type": "string",
                    "format": "uuid"
                  },
                  "readiness_id": {
                    "type": "string",
                    "format": "uuid"
                  },
                  "consent_to_reuse": {
                    "const": true
                  }
                }
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
              "role": {
                "type": "string",
                "minLength": 1
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
                    "format": "uuid"
                  },
                  "consent_to_process": {
                    "const": true
                  }
                }
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
                "type": "string",
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
                    "format": "uuid"
                  }
                }
              },
              "role": {
                "type": "string"
              }
            }
          }
        ]
      },
      "description": "Ordered model-supported text, image data, public HTTPS image/audio/video URLs or Niu ingested_image IDs. Ingested references require current original-account Active observation, retained inspected content and unexpired original grants/consent; dispatch rechecks all bindings atomically. Ordinary URL inputs require direct Ark and exact schema support; OpenRouter remains text-only. Mixed inline/ingested input and idempotency for ingested or independently inspected inline references are unsupported. Client asset:// URIs are never accepted. Workspace image-library references require explicit processing consent and current workspace ownership; fresh configured inspection is required only when the current policy requires it. Local bytes are resolved privately and deletion/content identity is rechecked atomically before dispatch. Stored audio/video and mixed ingested/library input remain unsupported; canonical idempotency supports ordinary upstream URL requests and durable workspace image references, preserving the original Niu reference identity."
    }
  },
  "additionalProperties": true
}
```

## Responses

### HTTP 202

Durable Niu reference; acceptance alone does not establish upstream execution or billing.

Response headers:

```json
{
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
        "unknown",
        "submission_unknown",
        "queued",
        "running",
        "succeeded",
        "failed",
        "reconciliation_required"
      ]
    }
  }
}
```

### HTTP 400

Invalid request/schema or idempotency header.

### HTTP 401

Invalid, expired or revoked key.

### HTTP 402

Customer capacity or spending limit denied before submission.

### HTTP 403

Current workspace/model policy cannot be satisfied.

### HTTP 404

Model or original job is unavailable to this scope.

### HTTP 409

Changed idempotent input or conflicting route/key/policy/offer revision.

### HTTP 429

Current key request/concurrency limit exceeded.

### HTTP 501

Unsupported video channel, notification contract, mixed inline/ingested inputs or unsupported ingested/inspected-inline idempotency; no upstream dispatch.

### HTTP 503

Qualified offer, original route or storage unavailable.

## Behavior and supported scope

Personal routes support configured ark-direct-v1 or openrouter-video-v1 channels. Customer-funded video currently requires a qualified ark-direct-v1 route and video_tokens pricing; OpenRouter remains personal-only. Shared routes with a legacy procurement budget are unsupported, while personal routes retain ordinary authorization and key limits. Exactly one upstream submission follows durable dispatch intent. HTTP or transport errors retain submission_unknown and any unresolved liability. Observed non-success HTTP statuses are saved as upstream_http_error in scoped request diagnostics, without upstream bodies or credentials; they do not prove nonexecution or authorize a retry. Fresh creation responses include x-niu-attempt-id. Logs retain the inspected Niu request and delivered Niu creation response for up to 24 hours by default; x-niu-log-payloads: false opts out. Requests larger than the 1 MiB capture bound are not retained. This is not an upstream transport-body capture, and replay does not recreate deleted or expired payloads. Optional workspace-scoped Idempotency-Key supports text and schema-approved upstream URL creation: identical replay returns the original reference and current saved status, including after restart. Changed input conflicts. Unkeyed requests are not idempotent. Configured controls, reference inputs and required inspection remain subject to the selected schema and supported channel. Ordinary public HTTPS image/audio/video URLs are forwarded only when the exact selected upstream schema supports them. Inline image data follows the configured schema. Explicit required image policies still enforce local inspection; unsupported remote inspection fails closed. Short-lived ordinary ingested_image references accept Niu ingestion/readiness IDs with explicit consent_to_reuse. Provider asset URIs remain private and are resolved only for the exact selected Ark route. This does not grant durable library or portrait rights; expired, erased, revoked or unavailable bindings fail closed before dispatch. Durable workspace image references do not reuse Provider readiness or old inspection receipts; they undergo fresh current inspection and atomic local-content authorization. Owned Provider references use content.type provider_asset with provider_asset.id identifying a Niu workspace asset, not a raw upstream URI. Current scope, model, account, acknowledged creation and Active asset state are checked; the same live binding is checked atomically with dispatch. Source model revision is retained as history, while current selected model/schema and tariffs govern the request. Kind, roles and input limits follow backend metadata and the selected schema. Explicit required image inspection refuses these remote assets; ordinary default policy adds no detector. Mixing these references with ingested/workspace material or inline image data is currently unsupported. On creation, idempotency and request captures retain Niu IDs and inspected text, never the resolved asset URI.

**Supported scope:** implemented
