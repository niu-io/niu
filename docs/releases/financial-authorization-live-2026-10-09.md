# Live financial authorization boundaries

Date: 2026-10-09. The running gateway was exercised using freshly issued
company-owner, company-viewer and workspace-owner credentials against the
existing development organization. These were actual HTTP requests and current
database records, not fixture outcomes.

The company owner could read its company balance and transaction list. Company
viewers and workspace-scoped owners received HTTP 404 for those shared financial
reads. Each credential also received HTTP 404 for another organization's balance.

All three roles received HTTP 403 when attempting to record settled funding,
increase the credit limit, reverse an entry or invoke installation-only order
reconciliation. Funding and credit requests carried positive amounts; the
reversal and reconciliation requests used new nonexistent diagnostic references.
No installation credential was used to manufacture a payment or funding record.

Independent PostgreSQL snapshots of the organization's balance-account rows and
ledger-entry count were identical before and after the requests. The balance and
transaction API responses were also identical. All temporary credentials were
revoked. Private credentials and diagnostic identifiers remain outside Git.

This verifies the exercised authorization boundaries and absence of financial
mutation for those denied requests. It does not establish successful checkout,
paid callback verification, top-up reconciliation, customer request charging,
refund processing or credit admission under concurrent paid requests. Those
business paths still require real payment and qualified commercial-supply
evidence. No fixture-test result is used as evidence.

## Concurrent warning-policy writes on the native release service

An isolated zero-balance CNY company was created through the running
administration API, with a short-lived organization-scoped owner credential.
Eight synchronized real HTTP requests submitted different warning thresholds
using the same current policy revision. Exactly one returned HTTP 200 and seven
returned HTTP 409. The winning nanounit string was greater than JavaScript's
safe integer boundary and matched the subsequent account read exactly; the
policy revision increased once.

Independent PostgreSQL inspection confirmed the exact threshold/revision, one
policy-history entry and zero customer balance entries. Balance, approved credit,
reservations and available capacity all remained zero. The warning was then
explicitly disabled using the current revision, and the owner credential was
revoked. The isolated empty company remains in the development database as an
audit artifact; no existing company policy, funds or encryption identity changed.

This is current-input API and durable-database evidence for optimistic concurrency
and exact warning amounts. It does not demonstrate payment settlement, competing
inference reservations, refunds or commercial charge reconciliation. No merchant
activation or fabricated payment evidence was needed, and no fixture outcome is
used as evidence.
