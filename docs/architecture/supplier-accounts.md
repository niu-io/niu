# Supplier accounts and quota observations

Status: registry, storage controls and bootstrap read/create APIs are implemented. Native subscription transport, credential resolution, refresh network calls, quota-aware selection and console workflows remain in progress.

A supplier account separates provider identity, plan, authentication mode (`api_key` or `oauth_refresh`), billing mode (`metered_api` or `subscription`), health and concurrency. Authentication does not imply a billing model or a verified entitlement. New accounts are `unverified`; registration alone never makes them eligible for dispatch.

Credential storage uses opaque `env:` or `secret:` references. List responses exclude the reference and never contain secret values. These references describe the future adapter integration; registering a reference does not currently resolve it or connect an account to an inference route.

## Concurrency and refresh

Preparing an account-backed attempt atomically holds one of the account's concurrency slots and pins its credential revision. Dispatch rechecks health, refresh ownership, revision and slot state using the existing attempt coordinator. Released slots cannot dispatch. Unknown execution keeps the slot; only never-sent or confirmed execution permits release. Accounting uncertainty can outlive an execution slot independently.

OAuth refresh acquires exclusive ownership on one account and requires no held execution slots. Other accounts can refresh independently. Completion requires the same owner token, updates the opaque reference and increments the credential revision. It does not automatically change health to ready. Owner loss does not trigger timeout-based takeover: a provider refresh may have taken effect even when its response was lost. Explicit recovery and actual credential-store integration remain required.

These controls do not yet prove provider-side cancellation, quota reservation or resumable task semantics. The current inference routes still use their configured provider credentials; the registry does not advertise live subscription support.

## Quota evidence

Immutable observations identify the account, window, unit, remaining amount, optional maximum, observation time, freshness deadline, reset time and source. Units are `tokens`, `requests`, or `millionths_of_window` (1,000,000 means the whole window). Ratios are not converted to tokens. An absent remaining value means unknown, not zero.

Queries return the newest observed sample for each window, so delayed older samples cannot replace newer evidence. Future-dated observations are rejected. A sample is marked fresh only when its remaining amount is known and both freshness and reset deadlines are still in the future. Passing a reset boundary requires a new observation; no full quota is inferred automatically. Schedulers must check `fresh`, reserve demand separately, and preserve observed units.

## Bootstrap API

The management endpoints below accept an installation bootstrap token or an operator session scoped to the target organization/project. Reads require read permission and mutations require write permission. Quota ingestion also accepts a scoped collector key:

- `POST /admin/v1/organizations/{organization}/projects/{project}/accounts` registers an unverified account.
- `GET` at the same path lists up to 1,000 account metadata records without credential references.
- `GET /admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota` returns latest window observations with explicit freshness.

Example registration body:

```json
{
  "provider": "example-provider",
  "plan": "example-plan",
  "authentication_mode": "oauth_refresh",
  "billing_mode": "subscription",
  "credential_reference": "secret:account-credentials",
  "concurrency_limit": 2
}
```

Quota ingestion and refresh ownership are internal adapter/storage methods, not public client permissions. Operator roles, account activation workflows and audited recovery remain release requirements.
