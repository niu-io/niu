# API-key customer spending limits

A key may have a lifetime customer spending cap for each company account currency.
Company available balance, workspace caps and key caps are separate constraints;
a paid request must satisfy all applicable constraints. Amounts use decimal
integer strings in currency nanounits, never JavaScript numbers. `null` explicitly
restores unlimited key spending; `"0"` permits no additional positive liability.

Secret rotation preserves the spending identity, policy revisions, prior customer
charges and outstanding reservations. A separately created key has its own
identity. The migration reconstructs historical rotations from saved rotation
audit records; it does not rewrite old request or ledger attribution.

Committed spending includes posted customer charges minus their refunds, plus
unreleased customer reservations that have not already become charges. Text and
video use the common account-locked reservation path. A database trigger also
checks new reservations. Uncertain work keeps its reservation; confirmed release
and settlement use the existing financial lifecycle. Actual liabilities must
still settle even if an upstream overrun exceeds the reserved bound; later work
must not hide that overrun. Lowering a cap below committed liability is rejected.
Unattributed outstanding workspace liabilities require reconciliation before a
finite cap can be configured.

Owner-funded personal routes do not consume customer funds or these customer
spending caps. These limits do not estimate or restrict personal upstream bills,
request rates, tokens per minute or concurrent requests. Unknown Supplier costs
are never substituted for customer prices.

## Management API and SDK

The [API contract](../../contracts/key-spending.openapi.yaml) defines:

- `GET .../keys/{key}/spending-limit`: account currencies, cap, revision and
  committed customer amount, plus `remaining_nanos`. Remaining allowance is
  `max(limit_nanos - committed_nanos, 0)` as an exact decimal integer string,
  or `null` when the key is unlimited. It describes only this key's allowance,
  not company balance or guaranteed admission; workspace and company constraints
  still apply. No company balance or procurement data is returned.
- `PUT .../keys/{key}/spending-limit/{currency}`: requires an installation
  administrator or the applicable company/workspace owner, `limit_nanos` and
  `expected_revision`. Use revision `"0"` initially; stale writes return 409.
  Omitting `limit_nanos` is rejected rather than silently restoring unlimited.
- `GET .../keys/{key}/spending-limit/{currency}/history`: scoped readers may read
  descending history, with `limit=1..100` and optional `before_revision`.

`NiuAdminClient` exposes `listKeySpendingLimits`, `setKeySpendingLimit` and
`listKeySpendingLimitHistory`. A replacement key reads the same policy/history.
The list returns the dedicated `KeySpendingAccount` SDK type, including the
remaining allowance. Committed spending is computed once per returned currency
and reused for the remaining amount; concurrent work can change either amount
after the read, so admission must still enforce limits transactionally.
The internal spending identity and operator identifiers are not returned.
Customer admission reports `key_spending_limit_exceeded` (HTTP 402) when the
proposed bounded charge would exceed the key cap.

## Current-input verification — 2026-10-09

Migration 0205 was applied to the existing development database after a private
backup, preserving credentials and existing data. The rebuilt optimized gateway
and built JavaScript SDK were used for actual management requests:

- The SDK saved `9007199254740993` nanounits exactly.
- Eight concurrent owner updates using revision 1 produced one HTTP 200 and seven
  HTTP 409 responses; the winning exact amount was returned by the read API.
- Viewer modification returned 403. Omitting `limit_nanos` returned 422.
- Rotation retained the current cap and both history revisions; an independently
  issued key remained uncapped.
- Explicit unlimited and then zero produced two further history revisions.
- A real personal OpenRouter request through the replacement key completed with
  the zero customer cap unchanged and zero committed customer amount.
- Independent PostgreSQL reads confirmed shared original/replacement identity,
  four persisted revisions and the final zero limit. Temporary keys/operators
  were revoked.

An initial actual run exposed an upsert/insert-trigger conflict on updates. The
implementation was corrected to separate insertion and update, and the complete
sequence above was rerun. Formatting, Rust release compilation/Clippy and SDK
build/type checking completed; no fixture outcome is used as evidence.

Paid text/video admission at the cap, outstanding-reservation contention,
settlement/refund accounting under this new cap and migration across every
historical deployment state remain unverified. Configuration and rotation
verification alone do not close those acceptance items. Frontend controls have
not been implemented by this backend workstream.

A subsequent actual scope check found that missing-key reads initially returned
an empty successful list. Management now verifies key existence within the
already authorized workspace: missing keys and keys supplied under the wrong
workspace returned 404 for list, history and update on the rebuilt gateway.
Authorized reads through both revoked original and replacement keys still
returned their four shared policy-history rows. Revocation is not history deletion.

## Remaining allowance verification — 2026-10-10

On the updated optimized gateway, a new temporary key initially returned null
remaining allowance for unrestricted currencies. Actual management writes and
reads preserved `9007199254740993`, the signed 64-bit maximum
`9223372036854775807`, zero and explicit unlimited exactly. With no customer
liabilities, each finite remaining amount equaled its cap. Rotation preserved
the full returned currency records, including the remaining allowance.

An independent PostgreSQL read confirmed the final exact cap, zero committed
amount and fifth policy revision. The customer ledger remained empty and the
temporary keys were revoked. Gateway release compilation, Clippy, SDK type
checking/build and OpenAPI YAML parsing completed. These observations verify
the read contract for empty commitments, not paid reservations, overrun clamping,
settlement, refunds or the full financial lifecycle. No fixture outcome is used.

## Known unsettled media liability

Migration 0214 changes key and workspace commitment calculations to count the
larger of an open reservation and its immutable known media charge when no debit
has been posted. Previously both calculations used only the reservation, even
when media settlement had retained a larger final charge because funds were
insufficient. Posted charges and linked refunds retain their existing contribution;
the original reservation is not rewritten.

This is a source-level correction, not paid-workflow acceptance. Actual overrun
settlement, refund and concurrent admission remain unverified. Company capacity reconciliation is implemented separately in migration 0215
and the corresponding gateway/storage changes described below; its paid
end-to-end behavior also remains unverified.

After a private database backup, the optimized gateway applied migration 0214
and became ready on the existing database. Independent catalog inspection
confirmed both replacement functions and their volatile visibility. Actual
workspace/key spending reads completed; the temporary key was revoked and the
customer ledger remained empty. Storage checking and release compilation
completed. These observations establish migration/read compatibility only, not
the unexercised paid overrun branch.

## Company outstanding liability

Migration 0215 adds one outstanding-liability calculation shared by company
admission, credit-policy changes, media settlement and its database debit guard.
For each open, unposted reservation it uses the greater of the original hold and
the known immutable media charge. Media settlement excludes its own attempt when
checking capacity for its final debit; other outstanding work still consumes
capacity. Already posted charges are excluded from outstanding amounts so their
ledger debit is not counted again.

Balance responses retain `reserved_nanos` as the original open-hold sum and add
`outstanding_nanos` for effective outstanding liability. `available_nanos` is
posted balance plus approved credit minus outstanding liability and can be
negative. OpenAPI and the JavaScript SDK describe the additional exact-integer
field; the SDK allows its absence when connected to older gateways.

After a private backup, the rebuilt optimized gateway applied the migration and
reached readiness on the existing database. Actual balance response fields
matched independent database reads and exact available-capacity arithmetic.
Database inspection confirmed that the media debit guard uses the shared
calculation. The customer ledger remained empty. These checks establish current
migration/read compatibility only: actual paid overrun, simultaneous settlement,
credit reduction with liabilities and refunds remain unverified.

### Balance response snapshot

Balance reporting computes posted funds, original holds and outstanding liability
in one statement snapshot, materializing each account's amounts before serializing
the response. It does not invoke the volatile admission helper separately for
`outstanding_nanos` and `available_nanos`. Admission and settlement retain their
account locks and current-visibility helper.

On the rebuilt service, four concurrent readers made 120 actual balance requests
while an independent writer applied 20 credit-policy revisions to a new empty
company. Each response retained exact available-capacity arithmetic. Independent
database inspection matched the final credit and revision and found no ledger
entries. Credit was then reset to zero; no workspace or inference key was created.
Release compilation and storage Clippy completed. Actual paid settlement
contention remains unverified; empty-account policy traffic does not cover it.

### Current-input shared-account concurrency

The [two-gateway credit-backed run](key-spending-multi-instance-live.md) exercises
one real completion alongside three simultaneous cap rejections. It also records
the account-lock upgrade deadlock found in the initial run and the shared
reservation helper correction. Exact charging, released holds and post-restart
cap enforcement were checked independently; broad capacity remains unqualified.

## Actual text overrun, rotation and restart — 2026-10-10

A fresh native gateway/database used the saved personal OpenRouter credential
with explicit internal customer tariffs and administrator-approved credit. This
was a self-funded integration run, not a commercial Supplier or received-payment
qualification. The customer tariff was zero for input and 1,000,000,000 USD nanos
per million output tokens. The key cap was 1,000 nanos.

One real strict-schema Chat stream requested `max_tokens: 1`. The upstream
returned the complete requested marker, a terminal completion and usage reporting
11 output tokens. The retained response was independently parsed; this observed
behavior is not a promise that other requests or providers ignore that bound.

Independent database reads confirmed the original 1,000-nano reservation remained
unchanged and was released. One immutable customer charge and one debit both
recorded the full 11,000 nanos, matching reported usage rather than truncating the
charge to the requested bound or key cap. The attempt retained the same reported
token counts and `confirmed_completed` state.

After rotating the key, its management response reported limit `1000`, committed
`11000` and remaining `0`, all decimal strings. Another inference request returned
402 `key_spending_limit_exceeded`. Gateway restart retained those exact values
and refused another request identically. Independent final reads still found only
one attempt and one customer charge, with matching reconciliation totals and no
open settled hold. The replacement key was revoked and isolated processes stopped;
the original database and encrypted credential identity were preserved.

The first verification script stopped after settlement because its reservation
query used an incorrect column name. Verification resumed against that retained
database and response; no replacement generation was used to erase or substitute
for the original observation.

This closes the exercised text settlement-overrun and remaining-allowance branch.
It does not qualify customer-funded media overruns, company credit exhaustion,
all token estimators or concurrent overrun settlement. An admission cap bounds
new reservations; it cannot retroactively cancel upstream consumption.

## Cancelled text stream liability — 2026-10-11

A fresh isolated native gateway sent a real self-funded OpenRouter Chat request
with internal customer rates and approved verification credit. The client closed
after receiving actual content. The attempt retained unknown usage, a positive
customer reservation and `response_stream_cancelled`; no charge was invented.

The management API set the key cap to exactly that outstanding reservation.
Reads reported committed spending equal to the cap and remaining allowance `0`.
After secret rotation, the replacement key retained those exact amounts. A new
request returned HTTP 402 `key_spending_limit_exceeded`, both before and after
gateway restart. No concurrency cap was configured for this run, so these were
spending rejections rather than concurrent-request denials.

An attempted policy decrease below the outstanding liability returned HTTP 402.
The verification script initially expected 409 and stopped at that assertion.
Independent verification reopened this retained database without submitting
another generation: it found exactly one cancelled unknown attempt, both customer
and procurement holds, no charge or ledger entry, and two rotated keys sharing
one spending identity. The cap still equaled the hold at revision 1, with exactly
one policy-history row; the rejected decrease did not mutate the policy. The
isolated gateway/database were stopped. No fixture result was used as evidence.

This checks cancellation liability, rotation and restart for the exercised Chat
path. It does not establish recovery of missing upstream usage or authorize
release of uncertain liabilities. Merchant funding and commercial supply were
not part of this run.


## Key caps across recovered completion — 2026-10-11

A fresh actual native Messages stream returned a unique requested marker and its
terminal event while an isolated database fault rejected the local completion
write. Execution and usage remained uncertain, with one outstanding customer
reservation and no charge. Explicit internal prices and approved verification
credit were used; no merchant funding or commercial Supplier agreement was
fabricated.

The key cap was set to the exact reservation. Secret rotation preserved the cap
and committed amount. Four concurrent requests through the replacement secret
received 402 `key_spending_limit_exceeded` before creating another attempt.
Lowering the cap below the liability also returned 402, without a policy revision.
Restart preserved identical allowance reads through the old and replacement key.

After a tenfold tariff edit and replacement-key revocation, canonical generation
reconciliation under the still-active database fault rolled back atomically.
Removing that fault allowed eight concurrent reconciliation calls to produce one
immutable terminal receipt. Existing recovery settled exactly one charge/debit
using the request's original tariff and released its reservation. Both key records
then reported that actual charge as committed spending, with remaining allowance
equal to the original cap minus the charge. Reducing the cap to the charge
succeeded; reducing it one nanounit further was refused. Restart and receipt
replay did not add another charge.

Independent reopening compared the saved actual SSE quantities and marker with
the receipt, retained original uncertainty and exact pinned-price debit. It also
confirmed two revoked keys sharing one spending identity, exactly two accepted
policy-history revisions, no open customer hold and unchanged encrypted Supplier
credential. This exercises the completion-write-failure recovery branch, not
successful settlement of cancelled upstream work. Customer-funded media and
other providers are outside this checkpoint. No fixture outcome is evidence.

## Multi-key burst across two Gateways — 2026-10-11

The [64-request current-input burst](key-spending-burst.md) used eight keys with
two fixed-fee requests of allowance each. Sixteen actual model completions and
48 key-cap refusals produced exactly two debits per key, with no extra attempts
or open customer reservations after restart and independent artifact inspection.
The linked report separates successful upstream-inclusive latency from refusal
latency and records the limits of its sampled process observations. It does not
qualify sustained capacity, variable-token prices or funded payment.

## Refunds after key rotation across two gateways — 2026-10-11

An isolated run used clean `22d3780`, internal approved credit and explicit rates
with the owner's personal OpenRouter credential. One structured and one streamed
request completed with the requested marker and independently priced usage. A
key cap equal to their combined charge rejected further paid admission. The key
was then rotated, and its original token returned 401.

Two gateways concurrently requested distinct partial refunds against the first
original debit, each exceeding half of that debit. Exactly one returned 200 and
one 409. Replaying the winner did not add a refund; refunding the remainder made
the total exactly equal to the first debit. A further one-nanounit refund returned
409. Both original and replacement key management reads returned the same
commitment (the second charge) and restored allowance (the first charge).
Historical attempts retained their original key attribution and both customer
charges remained immutable. Restart retained the ledger and paid statement.

Independent reopening parsed the retained structured response and SSE terminal
usage, matched both completed attempts and exact original debits, and checked the
two refunds against their source entry. The old/new keys shared the original
spending identity; both temporary tokens were revoked at the end. No outstanding
customer hold, funding receipt or external invoice-payment record existed. This
verifies the stated rotation/refund combination; it is not an external payment
refund, media settlement or general refund-capacity qualification.

## Native missing-usage recovery and rotated cap (2026-10-12)

Pinned committed gateway `3235c493f263579a32dc0c4afea469a48d7c0239` ran a fresh
actual Messages request to explicit OpenRouter model
`openai/gpt-4.1-mini-2025-04-14` in an isolated native PostgreSQL environment.
The response's incomplete usage naturally retained unknown aggregate state and a
**284,445 USD nanounit** customer hold. No fault trigger or fabricated missing
quantity was used in this run.

Normal administration set the key cap to that outstanding liability and rotated
the secret. Original and replacement management reads agreed. Four concurrent
requests using the replacement returned 402 with `key_spending_limit_exceeded`;
the database still contained only the original attempt. Reducing the cap below
the open liability also returned 402.

Captured-reference reconciliation obtained matching non-cancelled terminal usage
and settled exactly **8,889 USD nanounits** under the request's original tariff,
despite a later tenfold price publication. The hold was released, and the same
spending identity reported 8,889 committed and 275,556 remaining. Tightening the
cap to the actual debit left zero remaining; another request was denied without
creating an attempt. A reduction below the debit was rejected. Eight concurrent
reconciliation replays and restart preserved one receipt and one debit. Both
temporary secrets were revoked.

Independent reopening matched the saved native response, recovered usage, original
bound tariff, exact original-account debit, shared rotation identity and two policy
history rows. The final cap and committed amount both equaled 8,889; one attempt,
charge and debit remained, without an open hold or funding receipt. Encrypted
credential identity was preserved. This verifies the stated key-cap/recovery
combination using personal upstream access and approved internal credit; it does
not establish merchant funding, commercial Supplier rights or media settlement.
No fixture outcome is evidence. Original development data and encryption were
unchanged.

## Bounded policy recording across key controls — 2026-10-12

Key spending, request-rate, token-rate, concurrency and IP policy updates all
serialize on the durable key identity. An actual native HTTP run on retained
`cafce5a` locked that identity row separately for each valid update. All five
requests remained pending after approximately 1.60 seconds; releasing the lock
allowed the original requests to save their policies. No Supplier agreement,
external payment or inference was fabricated for this management run.

Committed `03a027a81c6dc0597ac2f184fa44ce0dd964dcf7` uses the existing bounded
recording initializer for all five writes. Validation, owner authorization,
identity locking, expected revisions, audit history and commit logic are preserved.
The shared transaction-local limits are 250 ms for lock waits and two seconds per
statement. They do not change pool-wide settings or impose a whole-request deadline.
Storage contention retains the existing HTTP 503 response contract.

A repeat on the digest-verified clean committed binary returned 503 in roughly
252–256 ms for every policy while the identity lock was still held. Each timeout
left the current policy/history and customer financial counts unchanged. Successful
updates after release created exactly one revision per policy; stale revision
replays returned 409. Key rotation and Gateway restart preserved all five policies
and the zero pre-request usage state. The old credential returned 401. The token
window's observation timestamp naturally changes between reads and was excluded
from policy equality; quantities and policy fields were checked.

The rotated key then made one actual structured text request. The native response
reported 46 input and 10 output tokens; the bound customer tariff produced exactly
**155,556 USD nanounits** and one matching debit. A second request returned 429
under the one-request-per-minute policy, including after restart, without another
attempt or charge. Both original and replacement keys were revoked at completion.

Independent reopening checked the saved policy responses and actual native
response against PostgreSQL: one revision in each history, common rotation identity,
preserved absolute expiry and model permissions, the original recovered request's
unchanged charge/debit, and exactly one new completed request attributed to the
replacement key with the exact bound-tariff debit. No open reservation, external
funding receipt or invoice payment remained. An initial verification script compared
all timeouts to the starting counts instead of each policy's pre-update counts;
correcting that client bookkeeping and repeating the run preceded the actual call.

After fresh backup restoration matched business and encrypted-identity
fingerprints, graceful native replacement preserved configuration, credential
ciphertexts/revisions and durable counts on schema 278. Exact replacement and
previous retained binaries were checked; authenticated routing configuration still
matched. No fixture outcome is evidence. This qualifies these policy-contention,
rotation and exercised admission paths; it does not establish every cross-protocol
interleaving, production throughput, permanent keys or full New API parity.

## Key lifecycle contention and atomic rollback — 2026-10-12

Committed `ab6f2ff1832af753b05c674651883c2fdedaf3db` extends the same bounded
recording initializer to key metadata edits, rotation and revocation. Key issuance
and dispatch/admission transactions are unchanged. These operations retain their
existing authentication, scope checks, revision rules, audit and atomic commit
contracts. The bounds apply to lock waits and individual statements, not the
complete HTTP request or connection-pool acquisition.

Actual HTTP runs on retained `03a027a` separately blocked all three operations
on their key identity row and on the audit table: the six requests remained
pending after about 1.60 seconds and completed only after lock release. The initial
metadata client mistakenly used PUT; the documented PATCH method was used for
the completed verification. On the digest-verified clean `ab6f2ff` binary, every
corresponding request returned 503 in approximately **252–255 ms** with the lock
still held. The audit-table cases exercise rollback after the transaction has
reached its final audit insertion, rather than only an initial identity lock.

During each failed operation, key-table fingerprints and non-audit record counts
were unchanged and the old credential still authenticated. After lock release,
audit counts were also unchanged before retry. This is a refused operation:
503 does not mean revocation succeeded. Retry after resolving contention and
confirm the resulting state; this bound cannot cancel work already dispatched.

Successful retries updated metadata exactly once, atomically revoked old keys
and created replacements, or revoked the selected keys. Stale edits and a second
rotation returned 409. Repeated revocation retained 204 without another audit
event. Restart preserved the old/replacement authorization transitions. Replacement
identity, absolute expiry and model grants were unchanged; secret hashes differed.
All temporary keys were revoked at completion.

Independent PostgreSQL reopening matched the saved operation artifacts,
per-key edit/rotation/revocation audits, key lineage and final authorization state.
The server log identified lock timeout at audit insertion for all three actions.
The original actual-response customer charge/debit and account fingerprint were
preserved, with no new inference, external payment, funding or reservation.
`/v1/models` checks here verify credential authorization transitions; they are not
evidence of a new upstream inference or complete business acceptance.

A fresh private backup restored with matching business and encrypted-identity
fingerprints before graceful native replacement. Exact replacement and retained
previous binaries were checked; the original configuration, credential ciphertexts
and revisions and durable counts remained unchanged on schema 278. Authenticated
routing configuration still matched. No fixture outcome is evidence.

### Bounded key issuance

Implementation `28bd9d0` extends the shared bounded recording initializer to
workspace key creation. The key and its `issued` audit commit atomically; failure
returns no usable secret. Existing expiry, grants and storage contracts are
unchanged. The limits apply to individual database statements, not the entire
HTTP request or connection-pool admission.

Actual HTTP diagnosis against the preceding immutable binary observed creation
still waiting after 1.6 seconds with either the key table or audit table locked.
The updated binary returned 503 after approximately 260 ms and 256 ms,
respectively, while each lock remained held. After release,
key counts, audit counts and key fingerprints showed complete rollback. Normal
retry created exactly one key and one issuance audit per case; authentication
survived restart and revocation returned 401. These model-list checks establish
authorization transitions, not new inference.

Independent reopening checked the final issued/revoked keys, exact audits and
original actual-response invoice, tariff, charge, debit and account fingerprint.
No extra inference, funding, payment or open reservation was created. No fixture
outcome supports this checkpoint.

A fresh native backup restored with matching durable-data fingerprints before
replacement with the verified binary. Original configuration and encrypted
identities were preserved; readiness and persisted routing agreement were
confirmed on schema 278.

### Shared stream concurrency across two Gateways — 2026-10-12

Digest-verified clean implementation
`feae5a7c17f3bc139a8a67a13767381c35206878` ran two Gateway processes sharing a
fresh native PostgreSQL database. Each configured two admission connections;
maintenance connections remain additional. An actual personal OpenRouter
structured stream occupied a workspace key with concurrency limit one. Before
changing the policy, an overlapping request through the second Gateway received
429 `key_concurrency_exceeded` and created no additional attempt.

While the original request was dispatched, the administrator reduced the limit
to zero and rotated the key. The replacement was denied through the second
Gateway, while the original stream returned its unique marker, native usage and
`[DONE]`. One exact customer charge/debit settled, reservations released and the
shared lineage's active count returned to zero. Restart retained the zero policy
and the replacement's 429 refusal; both temporary secrets were finally revoked.

Independent parsing and hashing of the original SSE plus PostgreSQL reopening
checked the unique output, original-rate debit, one completed attempt, shared
rotation lineage, policy history `1 → 0`, released holds and absence of funding.
The overlap was observed against the real upstream; no artificial delay or fake
completion was inserted. This verifies these stream admission and policy-edit
transitions, not every protocol, unknown-disconnect recovery or maximum capacity.
Personal access and internal credit/rates are not commercial supply or externally
funded payments. Original deployment data and encrypted identity were unchanged.
No fixture outcome supports this checkpoint.
