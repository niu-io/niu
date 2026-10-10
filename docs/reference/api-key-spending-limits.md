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
settlement, refund and concurrent admission remain unverified. Company available
capacity still uses reservation amounts and needs separate reconciliation with
known unsettled liabilities; correcting key/workspace caps does not close that
financial hierarchy gap.

After a private database backup, the optimized gateway applied migration 0214
and became ready on the existing database. Independent catalog inspection
confirmed both replacement functions and their volatile visibility. Actual
workspace/key spending reads completed; the temporary key was revoked and the
customer ledger remained empty. Storage checking and release compilation
completed. These observations establish migration/read compatibility only, not
the unexercised paid overrun branch.
