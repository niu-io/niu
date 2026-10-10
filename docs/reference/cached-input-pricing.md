# Customer cached-input pricing

Customer text tariffs optionally accept `cached_prompt_rate`: an exact decimal
integer string in currency nanounits per million cached input tokens, with the
same maximum as the ordinary input/output rates. This is a customer selling rate;
Supplier offers and procurement schedules remain independent and flat in this
increment. Cache-write and separate reasoning-output rates are not implemented.

## Versioned configuration

Publish through the existing installation-only workspace tariff endpoint.
`cached_prompt_rate: null` selects the original flat input tariff. Omission also
selects flat pricing for a new tariff or a previously flat tariff. When replacing
an existing cached tariff, omission returns a conflict: clients must explicitly
preserve the rate or send null to disable it. Existing optimistic revision checks
and immutable history remain applicable. Historical requests keep their pinned
revision; old revisions retain null cache pricing after additive migration 0216.

Tariff reads and invoice lines expose the pinned cache rate. Invoice lines add
`cached_prompt_tokens`; null denotes a flat tariff without a separately billed
cached quantity. The JavaScript SDK accepts the optional rate and validates its
exact integer representation. Frontend editing/display is not part of this change.

## Reservation and settlement

Before dispatch, the customer input liability bound uses the larger of the normal
and cached input rates, plus the existing output bound. Cached input is allowed
to be more expensive than ordinary input. The database zero-price dispatch
exception also requires a zero or absent cached rate.

For a cached tariff, final price is the ceiling of the following combined value,
with one rounding step to currency nanounits:

```
((prompt_tokens - cached_prompt_tokens) * prompt_rate
 + cached_prompt_tokens * cached_prompt_rate
 + completion_tokens * completion_rate) / 1000000
```

Cached quantity must be reported, nonnegative and no larger than total input.
Missing cached evidence is unresolved, not zero: no customer charge is fabricated
and the outstanding customer reservation is retained. Completion replay preserves
reported token categories before accrual. Charge records retain the cached
quantity alongside the pinned tariff revision. Flat tariffs retain the original
aggregate input/output calculation and do not require cache details.

## Current-input evidence and open work

After a private backup, the optimized gateway applied migration 0216 using the
existing database/encryption identity. Actual installation API calls created a
private, unconnected model configuration solely for tariff management, plus an
isolated unfunded company/workspace. Flat creation, a cache rate above the ordinary
input rate, explicit clearing, omission conflict and invalid-rate rejection were
checked. Eight concurrent writes with one revision yielded one saved next revision
and seven conflicts; independent PostgreSQL inspection matched all four immutable
revisions and the winning rate. The configured model and credential were disabled.
No upstream inference, commercial qualification or funding was fabricated.

The expanded invoice projection also executed through an actual scoped empty read;
this is query compatibility, not invoice reconciliation. Compilation, Clippy, SDK
checking/build and OpenAPI parsing completed. Fixture outcomes supply no evidence.
Actual cached customer-funded admission, debit, missing-category recovery, refund,
invoice reconciliation and concurrent liabilities remain unverified. Supplier
cache pricing and broader token-category schedules remain implementation gaps.

### Live token-category inputs

A subsequent current-input run used a temporary owner-funded OpenRouter mapping
and workspace key with the optimized gateway. Chat nonstreaming, Chat streaming
with usage requested, and Responses nonstreaming each returned explicit cached
input and reasoning output quantities. The HTTP response (the terminal usage
chunk for streamed Chat) matched the independently read attempt totals and
persisted token-category row exactly. Final database inspection found three
completed attempts with both categories, no customer ledger entries, no active
verification keys and no enabled verification credentials. These calls establish
usage-input preservation for these three paths, not customer-funded settlement.

The fourth requested path, Responses streaming, returned HTTP 501 before creating
an additional attempt. This agrees with the documented unimplemented Responses
streaming subset. It remains a protocol coverage gap, not a qualified streaming
path or a reason to infer zero cache usage.


The subsequent [Responses streaming increment](inference-qualification.md#responses-streaming-implementation-and-current-input-evidence)
replaces the earlier 501 implementation boundary. A real completed Responses SSE
request now preserved the reported cache and reasoning quantities in PostgreSQL.
The customer-funded settlement limitations above still apply.

### Flat-tariff catalog contract

A current-input configuration run published an ordinary flat tariff on a temporary
unconnected model and read both the actual workspace-key `/v1/models` endpoint
and the scoped administration model catalog. Both returned the exact pinned
revision, currency, unit and integer input/output rates with
`cached_prompt_rate: null`. Independent PostgreSQL inspection matched that null
rate and both integer rates. No inference or ledger mutation occurred; the key
was revoked and temporary model/credential disabled. The older catalog source
example was aligned with this explicit nullable field. Fixture outcomes are not
business evidence, and catalog reads do not qualify inference or paid settlement.
