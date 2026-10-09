# Durable video output snapshots

Status: local storage and gateway checkpoint; full video release acceptance remains open.

Output-aware text-input video requests save their effective controls, pixel dimensions, duration, frame rate, schema and estimator revisions, and exact estimated quantity before dispatch. The snapshot contains no prompt, upstream credential or procurement price. Estimates remain distinct from reported usage, contractual maximum liability and final charges.

Migration 0133 adds append-only scoped snapshots bound to the original recovery route. Storage revalidates the request against that route's current model and credential revisions before insertion. Identical pre-dispatch retries preserve the snapshot; different specifications conflict. Migration 0134 adds the database trigger that denies dispatch on output-aware routes without a saved snapshot. Keeping this addition separate preserves the already-applied 0133 migration checksum. Legacy schemas without output configuration remain compatible; their dimensions and estimates are not invented or backfilled.

## Verification

- Nine PostgreSQL media-job tests passed, including exact 108,000-token estimation for 1280 × 720, five seconds and 24 FPS; missing-pin and missing-snapshot rejection; conflicting replacement; cross-workspace isolation; database update/delete rejection; post-dispatch mutation denial; and unchanged saved evidence after model configuration changes and storage reconstruction.
- Four gateway video tests passed, verifying snapshot creation during prepaid admission alongside existing bounded reservation, durable recovery and exactly-once accounting cases.
- Storage/gateway Clippy passed for all targets with warnings denied. Changed-file whitespace and public-boundary checks passed.
- No live video qualification, customer funds or saved Supplier configuration changed during these checks.

## Historical customer estimate API

The scoped saved billing endpoint now returns `effective_output` and `estimate`.
It verifies the saved estimate against the pinned effective output and prices it
using the original customer tariff/discount snapshot. The response contains only
customer amounts; it does not read Supplier purchase rates. Legacy fields remain
null and owner-funded/unpriceable estimated amounts remain unknown. No Provider
query, generation or settlement occurs during this read.

Four gateway tests passed with a prepaid case separating an estimated 108,000
video tokens / 11 nanounits from the eventual reported 100,000 tokens / 10
nanounits and independently reserved maximum of 20 nanounits. Estimate/output
remain unchanged through recovery and settlement. All 131 JavaScript SDK tests
passed, including exact distinct estimate/final strings beyond Number's safe
integer range. The SDK exports `VideoEffectiveOutput` and the expanded billing
response; OpenAPI and reference documentation describe nullable and estimated
semantics.

## Remaining acceptance

Finish Supplier output/meter configuration controls and customer pre-dispatch estimates. Integrate the authorized historical API/SDK explanations into Logs/Usage/Billing screens, keeping reported usage and final charges separate. Qualify reference duration only after media inspection and input contracts exist; this checkpoint accepts text inputs only. Process replacement, packaged upgrade and live channel evidence remain separate requirements.
## Image-reference output regression

On 2026-10-07, the expanded isolated PostgreSQL test
`output_estimates_are_immutable_scoped_and_survive_configuration_changes` passed.
Alongside its existing text estimate, immutable replay, changed controls,
workspace isolation and configuration-change checks, it now verifies that a
validated image reference retains the same output estimate without recording
its source URL. Video references still return `InvalidUsage`: reference duration
cannot silently be estimated as zero. Snapshot persistence alone authorizes
neither reference retrieval nor generation; inspected receipt-backed dispatch
remains a separate gate. This is storage regression evidence, not a live or
rendered reference-input workflow.
