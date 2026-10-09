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
