# Historical video settlement quantity checkpoint

Initial checkpoint 2026-10-07; reviewed 2026-10-12. Customer Billing API/SDK subset; full historical explanation,
rendered diagnosis and live qualification remain open.

Video billing now returns `settled_usage` separately from current `usage`.
For posted charges it contains the immutable receipt's measured quantity,
billable quantity, named meter and Reported provenance. Minimum billable
quantities remain distinct from measured usage. Later conflicting observations
leave current usage unresolved and the reconciliation warning intact, while
preserving the original quantity behind the posted debit.

Before release, the projection recalculates the saved receipt with the pinned
customer pricing snapshot and compares the full receipt and exact charged
amount. Invalid historical evidence fails rather than inventing an explanation.
Unposted liability and owner-funded jobs return no settlement quantity. Receipt
revision IDs, Supplier prices and procurement information are excluded from this
customer projection. No migration or new charge is introduced by the read.

Historical PostgreSQL, Gateway and SDK fixture commands were executed. Their
outcomes are disregarded and provide no evidence of correctness, regression,
settlement or delivery. Compilation, type checking and static contract commands
were also executed; these do not qualify runtime business behavior.

The dashboard must still expose these distinctions in its historical charge
explanation. Qualified live generation, full Ledger/Logs/Usage traversal and
packaged lifecycle acceptance remain required.

## Current committed retained-video checkpoint

An actual native run used the digest-verified clean committed Gateway
`ab6f2ff1832af753b05c674651883c2fdedaf3db` and an isolated copy containing a
previously generated and independently decoded personal OpenRouter video. Offline
rotation preserved the encrypted result's tenant/job identity, original URL and
expiry. Destination-only startup recovered the saved job; an authorized newly
issued key downloaded the exact original artifact. A separate verifier matched
its SHA-256 to the original generation and fully decoded the file with FFmpeg.
No new generation or polling request was sent.

Actual `GET /v1/video/jobs/{id}/billing` returned `mode` and `state` as
`owner_funded`. `currency`, `reserved_nanos`, `charge_nanos`, `usage`, `price` and
`settled_usage` were null. Another company's key returned 404. Restart preserved
the byte-identical authorized response; key revocation changed the next request
to 401. The client initially reused a prior organization-creation idempotency key
for a different body and correctly received 409; using independent creation
requests preceded completion of this run.

Independent reopening authenticated the old/new result envelopes to the same
plaintext under their original tenant/job/kind associated data, rejected the old
key against the new envelope and checked unchanged retention metadata. One result
retrieval was added; existing generation/polling counts and financial data were
unchanged. There was no customer media charge, balance entry, funding receipt,
invoice payment or open customer reservation. Temporary keys were revoked.

This qualifies the exercised saved-result, authorization, personal-funding
projection and restart paths on schema 278. It does not qualify nonempty posted
customer settlement quantities, late conflicting observations after a paid media
charge, customer-funded media overrun or frontend historical-charge presentation.
Personal self-funded OpenRouter access is not qualified commercial media supply.
Original databases, deployment configuration and encryption identity were unchanged.
No fixture outcome is evidence; unverified scope remains open.
