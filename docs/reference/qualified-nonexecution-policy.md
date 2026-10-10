# Qualified text nonexecution policy

An adapter name is not sufficient evidence that a dispatched request did no work.
The `openrouter` adapter can be configured with a custom endpoint. A 401 from that
endpoint must not automatically inherit the canonical OpenRouter contract.

Migration 0233 adds an immutable nullable `nonexecution_policy` to managed attempt
routes. Admission derives `openrouter-text-auth-rejection-v1` only when the pinned
credential revision uses the `openrouter` adapter and the reviewed canonical
`https://openrouter.ai/api/v1` base, allowing trailing slashes. It records the
policy identifier, not another credential or endpoint copy. A credential revision
change before pinning rejects admission; the existing dispatch revision check
still applies. Later credential edits cannot rewrite the pinned decision.

Only an immediate HTTP 401 classified as `upstream_http_error`, with that policy,
unknown usage, dispatched uncertainty and no asynchronous media binding, may
transition to `confirmed_not_executed` and release its eligible holds. Media,
transport/stream loss, other statuses, custom endpoints, static routes without a
managed policy binding and legacy unqualified bindings retain uncertainty.
No new automatic retry, probe or cooldown is enabled by this change.

Historical bindings remain null rather than inferring their original endpoint
from today's credential configuration. Already recorded execution states are not
rewritten. A historical unknown request needs authoritative reconciliation; its
hold is not released merely because its saved adapter says OpenRouter. The
existing canonical Chat successor policy remains bounded and separately checked.
The pinned policy is internal evidence, not added to customer response fields.

## Actual current-input verification — 2026-10-11

A fresh isolated native run configured an `openrouter` adapter against an actual
noncanonical HTTPS API endpoint with a deliberately invalid temporary credential.
No saved personal credential was sent to that endpoint. The real service returned
401. Before the change, Niu recorded `confirmed_not_executed` and released the
customer hold solely from the adapter label and status.

With the new binary and migration, a fresh equivalent request still exposed the
sanitized 401 but retained `may_have_executed`, unknown usage and the original
customer/procurement holds. The key's 1,000,000-nanounit spending allowance remained
fully committed. Restart and financial recovery did not release the hold; another
request was rejected before a second attempt. No customer debit was invented.
An earlier endpoint trial returned 502 and did not exercise this 401 boundary;
it is not the evidence for these observations.

A separate actual request against the canonical OpenRouter endpoint, also using
an invalid temporary credential, retained the qualified behavior: its pinned
policy allowed confirmed nonexecution and both hold releases. Independent checks
reopened both stopped databases and compared failure status, immutable policy,
execution state and customer/procurement reservations. Each database contained
one original attempt and no customer charge or balance entry.

A fresh canonical personal Chat pool also completed through one permitted
successor after a real 401, with independently matched reported usage. A later
401 followed by a zero-cap successor preserved the earlier credential-RPM
semantics: three total dispatches, one undispatched successor and no financial
entries after restart. This verifies the exercised policy boundary, not every
adapter, historical deployment, endpoint spelling, uncertain commit or commercial
Supplier contract. No fixture outcome supports it.
