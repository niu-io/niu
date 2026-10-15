---
title: "Save an immutable video submission intent with typed Niu references"
description: "PUT /api/v1/organizations/{organization}/projects/{project}/video-intents/{intent}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/projects/{project}/video-intents/{intent}`

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires workspace write permission and an active selected key with model access and allowed source. A fresh client-generated intent UUID binds the exact request, original key and funding mode. Identical retries return the same record; changed input or key under that UUID conflicts. No attempt, upstream call or reservation is created. The internal idempotency identity is server-generated and is never exposed; use the submit operation rather than legacy job creation. Saving reference drafts reads only scoped material metadata and schema constraints. It never resolves private Provider URIs, reads upload bytes, queries upstream, reserves funds, inspects media or grants Active readiness. Original Niu references and explicit consent remain in the canonical request digest; all runtime bindings are revalidated at submit.

Operation: `saveVideoSubmissionIntent`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/video-intents/{intent}" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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
  "format": "uuid"
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
    "key_id",
    "request"
  ],
  "properties": {
    "key_id": {
      "type": "string",
      "format": "uuid"
    },
    "request": {
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
    }
  }
}
```

## Responses

### HTTP 200

Save an immutable video submission intent with typed Niu references

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

Invalid actor credential or no authorized current key in the original lineage.

### HTTP 403

Workspace permission or current source policy denied.

### HTTP 404

Intent is not owned by this actor and workspace, or selected model is inaccessible.

### HTTP 409

Immutable identity, request, funding mode, revision or cursor conflict.

### HTTP 413

Request envelope exceeds 64 KiB.

### HTTP 501

Unsupported video capability or saved-reference form.

### HTTP 503

Required storage or route configuration is unavailable.

## Behavior and supported scope

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires workspace write permission and an active selected key with model access and allowed source. A fresh client-generated intent UUID binds the exact request, original key and funding mode. Identical retries return the same record; changed input or key under that UUID conflicts. No attempt, upstream call or reservation is created. The internal idempotency identity is server-generated and is never exposed; use the submit operation rather than legacy job creation. Saving reference drafts reads only scoped material metadata and schema constraints. It never resolves private Provider URIs, reads upload bytes, queries upstream, reserves funds, inspects media or grants Active readiness. Original Niu references and explicit consent remain in the canonical request digest; all runtime bindings are revalidated at submit.

**Supported scope:** implemented

**Supported scope:** Durable text and typed Niu material-reference intent persistence with explicit submission. URL, inline data and ingested-image intent drafts remain unsupported; full browser restoration and customer-funded video qualification remain separate.
