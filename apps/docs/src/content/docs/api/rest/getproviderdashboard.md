---
title: "Provider-scoped earnings and operations; active explicit membership required"
description: "GET /api/v1/providers/{provider}/dashboard"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/dashboard`

Returns one repeatable-read snapshot in data. Balances group by currency and include all-time earned_nanos, unpaid_nanos, paid_nanos and period_nanos. All amounts and usage totals are decimal integer strings. Traffic includes admitted requests, completed requests, reported tokens and unresolved earnings in the selected rolling period. Daily earnings use UTC. Offers include rate_kind (text or media), model identity and availability (up to 1000); offers_has_more explicitly identifies truncation, and GET /api/v1/providers/{provider}/offers traverses the complete current directory. Text offers retain agreed currency, prompt_rate and completion_rate strings plus nullable cached_prompt_rate, cache_write_prompt_rate and reasoning_completion_rate. Consumption includes nullable cached_prompt_tokens, cache_write_prompt_tokens and reasoning_completion_tokens for separately priced categories. Media offers return null for text-price fields; their independent specification-selected purchase cards are available through media-rates. Consumption groups verified text tokens, request counts, agreed rates, earnings and unpaid amounts by model, payout revision and selected context_minimum_input_tokens (null for base rates); media_consumption separately groups media meter quantities, specifications, agreed purchase prices and earnings. Media earnings have null text-token categories and use the same exact external-payment settlement ledger; no request identifiers, customer identities, workspaces or task references are returned; settlements contain the latest 100 all-time external payment records; GET /api/v1/providers/{provider}/settlements provides filtered keyset pagination beyond this preview. No customer identity, prompt, credential, endpoint or customer charges are returned. This is an accrual ledger, not a guarantee of payment eligibility or schedule.

Operation: `getProviderDashboard`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "operatorBearer": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/dashboard" \
  -H "Authorization: Bearer $NIU_MEMBER_TOKEN"
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### days

Location: **query**. Optional.

```json
{
  "type": "integer",
  "enum": [
    7,
    30,
    90
  ],
  "default": 30
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Provider dashboard in data

### HTTP 400

Period must be 7, 30, or 90 days

### HTTP 403

Installation sessions do not imply Provider membership

### HTTP 404

No active membership for this provider

## Behavior and supported scope

Returns one repeatable-read snapshot in data. Balances group by currency and include all-time earned_nanos, unpaid_nanos, paid_nanos and period_nanos. All amounts and usage totals are decimal integer strings. Traffic includes admitted requests, completed requests, reported tokens and unresolved earnings in the selected rolling period. Daily earnings use UTC. Offers include rate_kind (text or media), model identity and availability (up to 1000); offers_has_more explicitly identifies truncation, and GET /api/v1/providers/{provider}/offers traverses the complete current directory. Text offers retain agreed currency, prompt_rate and completion_rate strings plus nullable cached_prompt_rate, cache_write_prompt_rate and reasoning_completion_rate. Consumption includes nullable cached_prompt_tokens, cache_write_prompt_tokens and reasoning_completion_tokens for separately priced categories. Media offers return null for text-price fields; their independent specification-selected purchase cards are available through media-rates. Consumption groups verified text tokens, request counts, agreed rates, earnings and unpaid amounts by model, payout revision and selected context_minimum_input_tokens (null for base rates); media_consumption separately groups media meter quantities, specifications, agreed purchase prices and earnings. Media earnings have null text-token categories and use the same exact external-payment settlement ledger; no request identifiers, customer identities, workspaces or task references are returned; settlements contain the latest 100 all-time external payment records; GET /api/v1/providers/{provider}/settlements provides filtered keyset pagination beyond this preview. No customer identity, prompt, credential, endpoint or customer charges are returned. This is an accrual ledger, not a guarantee of payment eligibility or schedule.
