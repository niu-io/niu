---
title: "Save or clear a mutable personal Video composer"
description: "PUT /api/v1/organizations/{organization}/projects/{project}/video/draft"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/projects/{project}/video/draft`

One mutable actor-private Video composer per workspace. Operators are isolated; installation credentials share the installation actor. Read requires workspace Read permission. Absent state returns null payload and revision zero. Retention is 30 days after the last confirmed edit; expired content is hidden immediately and background maintenance erases it. Reads expose the expiry tombstone revision before maintenance. Saved key/model/reference identities are context only, including unavailable historical resources; they confer no current access or readiness. No inference, Provider calls, reservation, media reads or inspection occur. Write requires workspace Write permission and allowed browser Origin. Typed bounded partial composition may omit model/key/session and required model controls. Only the nine existing non-URL VideoSchema scalar control names are accepted; integer edits may remain strings. References use exact provider_asset/workspace_asset shapes, canonical nonnil Niu IDs and explicit workspace processing consent. No raw URL, inline media, short-lived ingestion, credential or billing fields are accepted. Key/reference metadata must belong to the workspace; session context must belong to the actor. Saving does not require an active historical key or grant action access. Full current schema, key/model eligibility, reference binding, consent and inspection remain explicit estimate/submission requirements. Null or omitted payload clears content while retaining the CAS revision. Stale revisions, including revisions predating expiry or clear, return 409. Workspace deletion refuses retained drafts; cleared/expired tombstones alone do not prevent empty-workspace deletion.

Operation: `saveVideoComposerDraft`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/video/draft" \
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
      "minimum": 0,
      "maximum": 9007199254740989
    },
    "payload": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "prompt",
            "controls",
            "references"
          ],
          "properties": {
            "keyId": {
              "oneOf": [
                {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                },
                {
                  "type": "null"
                }
              ]
            },
            "sessionId": {
              "oneOf": [
                {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                },
                {
                  "type": "null"
                }
              ]
            },
            "model": {
              "type": [
                "string",
                "null"
              ],
              "minLength": 1,
              "maxLength": 512
            },
            "prompt": {
              "type": "string",
              "maxLength": 12000
            },
            "controls": {
              "type": "object",
              "additionalProperties": false,
              "required": [],
              "properties": {
                "duration": {
                  "oneOf": [
                    {
                      "type": "integer",
                      "minimum": -9007199254740991,
                      "maximum": 9007199254740991
                    },
                    {
                      "type": "string",
                      "maxLength": 256
                    }
                  ]
                },
                "seed": {
                  "oneOf": [
                    {
                      "type": "integer",
                      "minimum": -9007199254740991,
                      "maximum": 9007199254740991
                    },
                    {
                      "type": "string",
                      "maxLength": 256
                    }
                  ]
                },
                "frames_per_second": {
                  "oneOf": [
                    {
                      "type": "integer",
                      "minimum": -9007199254740991,
                      "maximum": 9007199254740991
                    },
                    {
                      "type": "string",
                      "maxLength": 256
                    }
                  ]
                },
                "resolution": {
                  "type": "string",
                  "maxLength": 256
                },
                "ratio": {
                  "type": "string",
                  "maxLength": 256
                },
                "omni_reference_task_type": {
                  "type": "string",
                  "maxLength": 256
                },
                "watermark": {
                  "type": "boolean"
                },
                "camera_fixed": {
                  "type": "boolean"
                },
                "return_last_frame": {
                  "type": "boolean"
                }
              }
            },
            "references": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "oneOf": [
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
                            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                          }
                        }
                      },
                      "role": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256,
                        "description": "Optional nonempty role matching the existing VideoIntent reference grammar; explicit null is rejected."
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
                            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                          },
                          "consent_to_process": {
                            "const": true
                          }
                        }
                      },
                      "role": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256,
                        "description": "Optional nonempty role matching the existing VideoIntent reference grammar; explicit null is rejected."
                      }
                    }
                  }
                ]
              }
            }
          }
        },
        {
          "type": "null"
        }
      ]
    }
  }
}
```

## Responses

### HTTP 200

Actor-private composer state.

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
        "payload",
        "revision",
        "expires_at_ms",
        "content_state"
      ],
      "properties": {
        "payload": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "prompt",
                "controls",
                "references"
              ],
              "properties": {
                "keyId": {
                  "oneOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "sessionId": {
                  "oneOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "model": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "minLength": 1,
                  "maxLength": 512
                },
                "prompt": {
                  "type": "string",
                  "maxLength": 12000
                },
                "controls": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [],
                  "properties": {
                    "duration": {
                      "oneOf": [
                        {
                          "type": "integer",
                          "minimum": -9007199254740991,
                          "maximum": 9007199254740991
                        },
                        {
                          "type": "string",
                          "maxLength": 256
                        }
                      ]
                    },
                    "seed": {
                      "oneOf": [
                        {
                          "type": "integer",
                          "minimum": -9007199254740991,
                          "maximum": 9007199254740991
                        },
                        {
                          "type": "string",
                          "maxLength": 256
                        }
                      ]
                    },
                    "frames_per_second": {
                      "oneOf": [
                        {
                          "type": "integer",
                          "minimum": -9007199254740991,
                          "maximum": 9007199254740991
                        },
                        {
                          "type": "string",
                          "maxLength": 256
                        }
                      ]
                    },
                    "resolution": {
                      "type": "string",
                      "maxLength": 256
                    },
                    "ratio": {
                      "type": "string",
                      "maxLength": 256
                    },
                    "omni_reference_task_type": {
                      "type": "string",
                      "maxLength": 256
                    },
                    "watermark": {
                      "type": "boolean"
                    },
                    "camera_fixed": {
                      "type": "boolean"
                    },
                    "return_last_frame": {
                      "type": "boolean"
                    }
                  }
                },
                "references": {
                  "type": "array",
                  "maxItems": 32,
                  "items": {
                    "oneOf": [
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
                                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                              }
                            }
                          },
                          "role": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256,
                            "description": "Optional nonempty role matching the existing VideoIntent reference grammar; explicit null is rejected."
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
                                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                              },
                              "consent_to_process": {
                                "const": true
                              }
                            }
                          },
                          "role": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256,
                            "description": "Optional nonempty role matching the existing VideoIntent reference grammar; explicit null is rejected."
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "revision": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "expires_at_ms": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        },
        "content_state": {
          "type": "string",
          "enum": [
            "empty",
            "retained",
            "expired"
          ]
        }
      }
    }
  }
}
```

### HTTP 400

Malformed or unknown fields, invalid bounds, control type, reference role, consent or canonical ID.

### HTTP 401

Missing or invalid administration/member authentication.

### HTTP 403

Insufficient permission, cross-workspace key/reference, unavailable actor session, or missing/disallowed browser Origin.

### HTTP 409

Invalid or stale revision; no overwrite.

### HTTP 413

Body exceeds 64 KiB.

### HTTP 500

Internal storage failure.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

One mutable actor-private Video composer per workspace. Operators are isolated; installation credentials share the installation actor. Read requires workspace Read permission. Absent state returns null payload and revision zero. Retention is 30 days after the last confirmed edit; expired content is hidden immediately and background maintenance erases it. Reads expose the expiry tombstone revision before maintenance. Saved key/model/reference identities are context only, including unavailable historical resources; they confer no current access or readiness. No inference, Provider calls, reservation, media reads or inspection occur. Write requires workspace Write permission and allowed browser Origin. Typed bounded partial composition may omit model/key/session and required model controls. Only the nine existing non-URL VideoSchema scalar control names are accepted; integer edits may remain strings. References use exact provider_asset/workspace_asset shapes, canonical nonnil Niu IDs and explicit workspace processing consent. No raw URL, inline media, short-lived ingestion, credential or billing fields are accepted. Key/reference metadata must belong to the workspace; session context must belong to the actor. Saving does not require an active historical key or grant action access. Full current schema, key/model eligibility, reference binding, consent and inspection remain explicit estimate/submission requirements. Null or omitted payload clears content while retaining the CAS revision. Stale revisions, including revisions predating expiry or clear, return 409. Workspace deletion refuses retained drafts; cleared/expired tombstones alone do not prevent empty-workspace deletion.

**Supported scope:** implemented
