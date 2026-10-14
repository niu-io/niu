---
title: "Discover authorized model-specific native Provider tools"
description: "GET /v1/media/capabilities"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/media/capabilities`

Requires a current workspace API key or a workspace session with X-Niu-Key-Id. Reuses current video discovery and native module admission: current key/model grants, composed workspace/key model and Provider policy, eligible exact route, ownership, selectable credential and current configuration identity. Optional model is an exact alias, never a Provider inference hint. With no model, returns all eligible admitted contexts without picking the first. With an authorized video model that has no supported native module (including OpenRouter), returns complete:true and modules:[]. Unknown or unauthorized model returns 404. Admission, storage or configuration failures are errors, never successful empty discovery. No upstream request, inventory probe, material mutation, verification creation or generation is issued. Volcengine requires explicitly configured fastrouter-actions-v1 management plus a validated matching ark-direct-v1 video schema and valid management endpoint. Materials support is independent of generation reference support; reference_inputs describes configured schema only, and use still requires acknowledged Active materials, exact account/model/channel binding, current policy and dispatch authorization. Mutation endpoints additionally require Write permission. Human verification support is not a verification outcome. Contains no credentials, API base, upstream model, Provider resource references or internal account identifiers. Successful responses carry Cache-Control:no-store.

Operation: `discoverNativeProviderCapabilities`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/media/capabilities" \
  -H "Authorization: Bearer $NIU_API_KEY"
```

## Parameters

### model

Location: **query**. Optional. Optional exact authorized video model alias.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 256
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Complete authorized native-module contexts; an empty modules array means no eligible native tools for the selection.

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
  "required": [
    "complete",
    "selected_model",
    "modules"
  ],
  "properties": {
    "complete": {
      "type": "boolean",
      "const": true
    },
    "selected_model": {
      "type": [
        "string",
        "null"
      ]
    },
    "modules": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "module",
          "model_alias",
          "display_name",
          "adapter",
          "video_channel",
          "management_channel",
          "context_label",
          "materials",
          "human_verification",
          "reference_inputs"
        ],
        "properties": {
          "module": {
            "type": "string",
            "const": "volcengine"
          },
          "model_alias": {
            "type": "string"
          },
          "display_name": {
            "type": [
              "string",
              "null"
            ]
          },
          "adapter": {
            "type": "string"
          },
          "video_channel": {
            "type": "string",
            "const": "ark-direct-v1"
          },
          "management_channel": {
            "type": "string",
            "const": "fastrouter-actions-v1"
          },
          "context_label": {
            "type": "string",
            "description": "Meaningful current model/adapter/channel label. Contains no account identifiers."
          },
          "materials": {
            "type": "object",
            "required": [
              "groups",
              "assets",
              "reference_requires_active",
              "reference_requires_same_context",
              "reference_requires_dispatch_authorization",
              "kinds"
            ],
            "properties": {
              "groups": {
                "type": "boolean",
                "const": true
              },
              "assets": {
                "type": "boolean",
                "const": true
              },
              "reference_requires_active": {
                "type": "boolean",
                "const": true
              },
              "reference_requires_same_context": {
                "type": "boolean",
                "const": true
              },
              "reference_requires_dispatch_authorization": {
                "type": "boolean",
                "const": true
              },
              "kinds": {
                "type": "array",
                "items": {
                  "type": "string",
                  "enum": [
                    "image",
                    "audio",
                    "video"
                  ]
                }
              }
            }
          },
          "human_verification": {
            "type": "boolean",
            "description": "Supports explicit private H5 verification operations, not proof of human completion or permission to mutate."
          },
          "reference_inputs": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "kind",
                "roles",
                "maximum_items"
              ],
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "image",
                    "audio",
                    "video"
                  ]
                },
                "roles": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "maximum_items": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 32
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid path or model query, or an unknown query field.

### HTTP 401

Authentication or selected workspace key is invalid or revoked.

### HTTP 403

Workspace membership, Read permission or current policy denies access.

### HTTP 404

Selected model or eligible route is absent or unauthorized.

### HTTP 409

Selected route configuration changed during admission.

### HTTP 501

Configured native management transport is unsupported.

### HTTP 503

Storage, selectable credential, Provider qualification or native configuration unavailable.

## Behavior and supported scope

Requires a current workspace API key or a workspace session with X-Niu-Key-Id. Reuses current video discovery and native module admission: current key/model grants, composed workspace/key model and Provider policy, eligible exact route, ownership, selectable credential and current configuration identity. Optional model is an exact alias, never a Provider inference hint. With no model, returns all eligible admitted contexts without picking the first. With an authorized video model that has no supported native module (including OpenRouter), returns complete:true and modules:[]. Unknown or unauthorized model returns 404. Admission, storage or configuration failures are errors, never successful empty discovery. No upstream request, inventory probe, material mutation, verification creation or generation is issued. Volcengine requires explicitly configured fastrouter-actions-v1 management plus a validated matching ark-direct-v1 video schema and valid management endpoint. Materials support is independent of generation reference support; reference_inputs describes configured schema only, and use still requires acknowledged Active materials, exact account/model/channel binding, current policy and dispatch authorization. Mutation endpoints additionally require Write permission. Human verification support is not a verification outcome. Contains no credentials, API base, upstream model, Provider resource references or internal account identifiers. Successful responses carry Cache-Control:no-store.

**Supported scope:** implemented
