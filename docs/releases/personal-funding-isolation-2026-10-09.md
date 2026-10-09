# Personal funding isolation checkpoint — 2026-10-09

A new workspace in the existing personal account was configured with a zero
customer spending limit. Its explicitly scoped temporary API key completed an
actual OpenRouter streaming text request. The saved request confirmed completion
and owner-funded status with no customer charge.

Customer account balance projections were identical before and after the call.
The workspace's limit and committed customer amount both remained zero. An
independent PostgreSQL query found the personal-route binding, with no customer
tariff, balance-account binding, reservation or balance-ledger entry for that
attempt. The temporary key was revoked after verification.

Reading spending-limit history returned the single recorded zero-limit revision.
An attempted update with the stale initial revision returned HTTP 409. These
observations establish the exercised personal-versus-customer funding boundary
and the configuration revision check. They do not establish paid customer
admission, concurrent reservation safety, charging, refunds or payment settlement.
Fixture-test outcomes were not used as evidence.
