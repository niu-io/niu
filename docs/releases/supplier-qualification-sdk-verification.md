# Supplier qualification SDK verification

Reviewed 2026-10-06. SDK lifecycle methods verified; no commercial Supplier qualified by this checkpoint.

The JavaScript SDK now exposes installation-only Supplier and offer qualification, separate business/offer revocation and explicit offer activation/pause. Offer reviews preserve the immutable current rate revision and protocol-matrix version. Only the declared review fields are forwarded; private agreement contents and extra credential fields are omitted. Digests require lowercase SHA-256 shape, expiries require safe future supported timestamps, and activation requires a boolean. The existing server remains authoritative for authorization, reviewed evidence, expiry, rate conflicts and eligibility.

All 99 SDK tests passed. Two new tests cover the five lifecycle request paths and methods, exact review fields, cancellation propagation, local malformed-evidence rejection and no automatic retry after an uncertain write. This is controlled transport coverage, not a live review, accepted agreement, actual offer activation or packaged acceptance.

Owner-funded personal OpenRouter testing is distinct from resale qualification. Direct personal text-call evidence is recorded separately. A personal key does not become commercial evidence through hashing; no live qualification or activation was performed here.
