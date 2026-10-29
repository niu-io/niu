---
title: "Sign in to the configured shared demo account"
description: "POST /api/v1/auth/browser/demo"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/auth/browser/demo`

Available only when NIU_DEMO_LOGIN_EMAIL and NIU_DEMO_LOGIN_PASSWORD are explicitly configured. Requires the configured browser Origin. Verifies the existing account password with ordinary sign-in admission and revocation checks, then issues an HttpOnly browser session cookie. Credentials are never returned. Existing account permissions apply; no account is provisioned. Disabled demo sign-in returns 404. Responses are not cached.

Operation: `createDemoBrowserSession`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/auth/browser/demo"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Browser session established.

### HTTP 401

Demo credentials unavailable or revoked.

### HTTP 403

Browser origin rejected.

### HTTP 404

Demo sign-in disabled.

### HTTP 429

Sign-in admission limit reached.

## Behavior and supported scope

Available only when NIU_DEMO_LOGIN_EMAIL and NIU_DEMO_LOGIN_PASSWORD are explicitly configured. Requires the configured browser Origin. Verifies the existing account password with ordinary sign-in admission and revocation checks, then issues an HttpOnly browser session cookie. Credentials are never returned. Existing account permissions apply; no account is provisioned. Disabled demo sign-in returns 404. Responses are not cached.

**Supported scope:** implemented
