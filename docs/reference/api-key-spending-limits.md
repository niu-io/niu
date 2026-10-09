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
  committed customer amount. No company balance or procurement data is returned.
- `PUT .../keys/{key}/spending-limit/{currency}`: requires an installation
  administrator or the applicable company/workspace owner, `limit_nanos` and
  `expected_revision`. Use revision `"0"` initially; stale writes return 409.
  Omitting `limit_nanos` is rejected rather than silently restoring unlimited.
- `GET .../keys/{key}/spending-limit/{currency}/history`: scoped readers may read
  descending history, with `limit=1..100` and optional `before_revision`.

`NiuAdminClient` exposes `listKeySpendingLimits`, `setKeySpendingLimit` and
`listKeySpendingLimitHistory`. A replacement key reads the same policy/history.
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
