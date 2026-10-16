# Procurement readiness and customer capacity

Current-input check: 2026-10-16.

The gateway separates unavailable platform procurement capacity from customer
balance exhaustion. Migration 0349 changes only the procurement-budget rejection
inside atomic priced admission. The legacy explicit procurement reservation path
uses the same storage error. Customer balance checks retain their existing 402
contract. Customer responses disclose only `service_not_ready` and a platform
administrator contact instruction, never procurement amounts.

A newly created isolated company, workspace, positive administrator noncash gift,
private internal verification route, customer tariff and inference key exercised
the actual HTTP path. With no procurement budget, the request returned HTTP 503
`service_not_ready`. Independent database reads found no committed attempt,
dispatch, procurement reservation or customer reservation for that refusal.

After provisioning only its platform procurement budget, the same input passed
that admission boundary and reached the actual external Provider. The Provider
returned HTTP 403. Niu retained the dispatched attempt as `may_have_executed`
and its customer hold; it recorded no customer charge, balance debit or cash
receipt. The verification did not replace unknown execution with a successful
or free completion. The temporary key was revoked and its private credential
configuration disabled. Existing customer and Provider configuration was not
changed.

This verifies the distinct readiness failure and its atomic rejection. Successful
inference, exact positive settlement, standard-price enrollment and deployed
new-workspace acceptance remain unverified by this run. Configured rates were
internal verification inputs; no commercial supply qualification or payment was
asserted. No fixture outcome is evidence.
