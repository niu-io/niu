# Cached-input pricing

Customer text tariffs optionally accept `cached_prompt_rate`: an exact decimal
integer string in currency nanounits per million cached input tokens, with the
same maximum as the ordinary input/output rates. This is a customer selling rate;
Supplier offers have independent cached rates as described below. Route procurement
budget schedules remain independent and flat. Cache-write pricing remains unimplemented. Customer reasoning-output pricing is described in [Reasoning-output pricing](reasoning-output-pricing.md).

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

For a cached tariff, calculate the combined token amount below and round upward
once to currency nanounits:

```
((prompt_tokens - cached_prompt_tokens) * prompt_rate
 + cached_prompt_tokens * cached_prompt_rate
 + completion_tokens * completion_rate) / 1000000
```

Then add `request_fee_nanos` and apply the charge floor:

```
charge = max(rounded_token_charge + request_fee_nanos, minimum_charge_nanos)
```

Both fixed fields default to zero for historical tariffs. Admission applies the
same combination to its conservative token bound. See [fixed request fees](text-request-fees.md).

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
cache settlement remains unverified; broader token-category schedules remain implementation gaps.

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


## Supplier cached-input rates

Migration 0217 adds optional `cached_prompt_rate` to immutable Supplier text offer
revisions and `cached_prompt_tokens` to earned liabilities. The existing
installation-only `POST /admin/v1/providers/{provider}/offers` accepts the same
exact integer syntax and omission/null semantics as customer tariffs. Publishing
any new rate revision pauses the offer and clears its qualification pointer;
reviewing the new agreed rates remains required before commercial dispatch.
Existing attempts continue to use their bound revision.

Accrual uses the same integer `TokenRates` calculation above, with Supplier rates
and provider-reported quantities. Missing cache quantity leaves the earning
unresolved; recovery may retry after complete usage evidence becomes available.
No customer charge or reported upstream cost substitutes for the Supplier rate.
Supplier offer and grouped consumption reads expose the cache rate and the grouped
cached quantity where separately priced. These fields stay in the existing
Supplier/member and platform administration scopes, outside customer APIs.

The gateway shares only the rate request shape between customer and Supplier
publication. Authorization, pinned revisions and liability ledgers remain
separate. Existing route `cash_*` rates still control procurement budget holds and
cost accounting; this increment does not synchronize them with Supplier payouts
or add cache-aware procurement reservations. Operators must not interpret a route
budget hold as a guarantee that it bounds the Supplier liability.

### Current-input Supplier configuration checkpoint

After a private backup, the optimized gateway applied migration 0217 to the
existing database. Actual HTTP publication on a new unqualified Supplier and an
unconnected model verified flat creation, a cache rate above the ordinary input
rate, explicit null clearing, omission conflict and invalid integer rejection.
Eight concurrent updates sharing the same revision produced one accepted write
and seven conflicts. Independent PostgreSQL reads matched all four immutable
revisions and the selected rate; the actual administration response retained the
inactive and unqualified state. Its expanded consumption query executed with no
earnings. The shared customer publication path was independently rerun with the
same configuration checks. Temporary model and credential configurations were
disabled; no inference, funding, customer ledger entry or Supplier earning was
created. This verifies configuration and empty-read compatibility, not accrual.

Compilation, all-target gateway Clippy, SDK build and OpenAPI YAML parsing
completed. Actual cached Supplier accrual, missing-category recovery, nonempty
consumption aggregation, payout reconciliation and procurement-bound integration
remain unverified. No fixture outcome is evidence for these claims.

### Reading the original Supplier quote

`GET /admin/v1/providers/{provider}/offers/{offer}/revisions/{revision}` returns a
known immutable quote, including its model alias, meter kind, creation time and
exact text rates. All three identities must match. Platform administrators and
active members of that Supplier may read it; company ownership alone grants no
procurement access. Pausing or superseding a quote does not erase it. Reading a
quote does not establish current qualification, activation, earnings or payment.
Media offer revisions have null text rates; their purchase cards remain available
through the separate media pricing API. The JavaScript SDK exposes
`getSupplierOfferRevision` and `SupplierOfferRevision`. Internal identifiers are
API references and must not be displayed as product labels.

A current-input run read all four previously published configuration revisions
through the optimized gateway. Independent PostgreSQL reads matched each exact
currency, ordinary rate and cached rate, including superseded flat, cached and
explicitly cleared revisions. Actual company owner/viewer credentials were denied;
an explicitly granted Supplier viewer could read its quote. Mismatched Supplier,
offer and revision references were denied, as was the same viewer after membership
revocation. Temporary memberships and operators were revoked. Customer balance
entries and Supplier earnings remained unchanged. This covers text quote reads
and these authorization boundaries, not media quote reads, inference, procurement
reservations or paid settlement. Compilation, all-target gateway Clippy, SDK build,
formatting, OpenAPI YAML parsing and public-boundary checks also completed;
fixture outcomes were not used as evidence.

### JavaScript model-catalog type

The SDK `Model.customer_pricing` type includes optional nullable
`cached_prompt_rate`, preserving compatibility with older catalog responses.
A current-input run used the built JavaScript `NiuClient.models.list()` against
the running gateway, first with a flat tariff and then with a separate cache rate
on an unconnected model. Both returned the exact revision and rates; independent
PostgreSQL reads matched null and the configured cache rate respectively. No
inference or ledger entry was created. The temporary key was revoked and the
model/credential disabled. This verifies SDK catalog transport and the updated
type build, not cached inference billing or frontend rendering.

### Actual cached charges backed by approved credit

On 2026-10-10, an isolated native gateway issued three actual long-prefix Chat
requests through the owner's OpenRouter credential, with a restart before the
third request. Upstream reported cached input counts of 0, 5120 and 5120. The
internal customer cache rate was 246913578 nanounits per million tokens, above
the ordinary input rate of 123456789; output retained its independent rate.

For every completion, independent integer arithmetic applied the documented
non-overlapping cached/uncached formula and one ceiling operation. Database
charges, ledger debits, attempt totals and saved cached quantities matched.
Zero credit refused the initial request before dispatch; approved internal credit
then supported the calls without funding receipts. Holds were released, account
capacity and reconciliation agreed, statement totals matched, the key spending
cap denied another call, and refund replay produced one balance refund. A further
restart preserved exactly three charges and the expected remaining balance.

This supplies actual nonzero-cache customer-charge evidence, including a cache
rate above the ordinary input rate. It does not verify missing-category recovery,
concurrent cached liabilities, Supplier cache settlement, external funding or
other cache-write/reasoning/tiered schedules. The original development database
and encrypted credential identity were unchanged.

### Historical invoice cache details

A subsequent current-input run on 2026-10-10 made three actual long-prefix Chat
calls, each reporting 5120 cached input tokens. Independent database reads and
integer arithmetic verified their saved quantities, charges and ledger debits.
The invoice API returned the sum of those cached quantities and the original
246913578 cache rate with its tariff revision.

Publishing a replacement cache rate of 493827156 changed the billing overview's
current tariff. The existing invoice response remained identical, including its
original rate, revision, quantities and amount. A further gateway restart retained
that identical invoice. This verifies historical customer invoice details under
repricing; it does not establish Supplier cache settlement or external payment.


### Cached tokens combined with fixed fees and minimums

A current-input run used three actual long-prefix Chat completions with the
owner-funded upstream credential and approved internal verification credit.
Reported cached input counts were 0, 5120 and 5120. The separate cache rate
exceeded the ordinary input rate. Each tariff included a 12,345-nanounit request
fee; the first two used a 1-nanounit minimum. After a gateway restart, a new
revision raised the minimum to 10,000,000 nanounits for the third completion.

Independent verification parsed the saved raw provider responses and reopened
the stopped PostgreSQL database. Non-overlapping token arithmetic, one ceiling,
the additive fee and the applicable floor matched all three charges and debits.
The second request exercised nonzero cache plus the additive fee; the third
exercised nonzero cache with a minimum above the combined amount. The immutable
revision and both fixed amounts matched each charge. The invoice total was
11,971,111 nanounits, and the ledger matched that total less one idempotent refund.
Reservations were released and restart preserved the records.

This verifies the exercised combined customer pricing paths. Missing cache
usage, concurrent cached liabilities, Supplier settlement and external cash
funding remain separate; no payment receipt or commercial qualification was
created. The original development database and encrypted identity were unchanged.
