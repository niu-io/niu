---
title: "Read platform branding and theme configuration"
description: "GET /api/v1/platform/branding"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/branding`

Installation credentials or an explicit platform-administrator grant required; company owner/admin role alone does not grant platform administration. Returns the same public-safe branding/theme shape. When no saved configuration exists, returns revision string 0 and Niu defaults. Theme fields are part of settings; there is no separate theme endpoint.

Operation: `getBranding`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/branding" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Branding revision and settings in data.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "revision",
        "settings"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "settings": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "display_name",
            "default_appearance",
            "light",
            "dark"
          ],
          "properties": {
            "display_name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 80,
              "description": "Trimmed nonempty text without control characters"
            },
            "default_appearance": {
              "type": "string",
              "enum": [
                "system",
                "light",
                "dark"
              ]
            },
            "logo_data_url": {
              "type": [
                "string",
                "null"
              ],
              "maxLength": 349550,
              "pattern": "^data:image/png;base64,[A-Za-z0-9+/=]+$",
              "description": "Static PNG up to 256 KiB, at most 1024 by 512 pixels. Re-encoded from decoded pixels before saving. Missing or null resets to default."
            },
            "favicon_data_url": {
              "type": [
                "string",
                "null"
              ],
              "maxLength": 43714,
              "pattern": "^data:image/png;base64,[A-Za-z0-9+/=]+$",
              "description": "Square static PNG up to 32 KiB, at most 256 by 256 pixels. Missing or null resets to default."
            },
            "light": {
              "type": "object",
              "maxProperties": 8,
              "propertyNames": {
                "enum": [
                  "background",
                  "foreground",
                  "primary",
                  "primary-foreground",
                  "sidebar",
                  "sidebar-foreground",
                  "accent",
                  "accent-foreground"
                ]
              },
              "additionalProperties": {
                "type": "string",
                "pattern": "^#[0-9a-fA-F]{6}$"
              }
            },
            "dark": {
              "type": "object",
              "maxProperties": 8,
              "propertyNames": {
                "enum": [
                  "background",
                  "foreground",
                  "primary",
                  "primary-foreground",
                  "sidebar",
                  "sidebar-foreground",
                  "accent",
                  "accent-foreground"
                ]
              },
              "additionalProperties": {
                "type": "string",
                "pattern": "^#[0-9a-fA-F]{6}$"
              }
            }
          }
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required.

### HTTP 403

Platform administration required.

### HTTP 503

Durable storage unavailable.

## Behavior and supported scope

Installation credentials or an explicit platform-administrator grant required; company owner/admin role alone does not grant platform administration. Returns the same public-safe branding/theme shape. When no saved configuration exists, returns revision string 0 and Niu defaults. Theme fields are part of settings; there is no separate theme endpoint.

**Supported scope:** implemented
