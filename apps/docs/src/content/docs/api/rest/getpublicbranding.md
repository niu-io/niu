---
title: "Read public branding and theme defaults"
description: "GET /v1/branding"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/branding`

Public safe projection only; no authentication required. Returns display name, normalized logo/favicon PNG data URLs, default appearance and light/dark token maps; excludes actors, credentials and commercial settings. When no saved configuration exists, returns revision string 0 and Niu defaults. Theme fields are part of settings; there is no separate theme endpoint.

Operation: `getPublicBranding`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/branding"
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

### HTTP 503

Durable storage unavailable.

## Behavior and supported scope

Public safe projection only; no authentication required. Returns display name, normalized logo/favicon PNG data URLs, default appearance and light/dark token maps; excludes actors, credentials and commercial settings. When no saved configuration exists, returns revision string 0 and Niu defaults. Theme fields are part of settings; there is no separate theme endpoint.

**Supported scope:** implemented
