# Full-range Logs sorting verification

Verified 2026-10-03 for the F06 sorting subset. No full release gate is closed by this evidence.

Logs, its request API and CSV export support newest first, oldest first, highest complete latency, most input tokens and most output tokens. The database orders the entire filtered range before pagination; the dashboard never ranks only its loaded rows. Token comparisons use database integers, not decimal-string or floating-point ordering. Known measurements precede unknown values, with creation time and attempt ID breaking ties. Latency matches the displayed complete timing or historical complete duration; interrupted timing remains unknown for ranking.

The cursor remains an attempt ID within the authorized workspace. Clients preserve sort and filters between pages. This is a live traversal, not a frozen cross-page snapshot: new requests or measurements completing between reads can move rows. CSV reads the selected range in one statement, subject to its declared 10,000-row bound. Charges are not ranked across different currencies.

The dashboard's **Request actions → Sort by** uses the inspected OpenRouter Logs overflow menu's labeled radio-choice pattern. The selected order is shown beside the request count and persisted in the URL. Selection restarts pagination, preserves filters/column choices and applies to export. Choosing Newest first removes the explicit sort parameter.

Acceptance:

- PostgreSQL tests covered all five orders over multiple pages, tied values, numeric 9/10 comparisons, unknown token counts, interrupted latency, invariant full-range summary counts, matching CSV order, invalid sorts and foreign-workspace cursors. Gateway suite: 142 tests plus one process-replacement test passed; Clippy passed with warnings denied.
- Read-only live checks traversed 35 saved requests in five pages for each order, with no duplicates and an exact expected-order match. All five CSV files matched the request order.
- The locally packed JavaScript SDK 0.1.0 verified the same five orders, pagination and CSV against those 35 requests. Tarball SHA-256: `02af0bb0dc20cc1ef2bd38afa91d95112e6fc8044c57cf14742f0a533abed7d2`. All 65 SDK tests passed; the package was not published.
- All 25 Logs/content interaction tests and the dashboard build passed. Checked desktop and 390-pixel menu alignment, checked states, order changes, reload, sorted export and return to the default. Desktop model wrapping was corrected while preserving readable mobile names/status/charges.
- Docs build and OpenAPI parsing/security-preserving sort contracts passed. No inference calls, Supplier configuration changes or saved-record mutations were needed.

Remaining F06 work includes full-range trends and customer-charge/failure breakdowns, token categories, broader payload protocol coverage and complete investigation qualification. Production performance and concurrent-write pagination behavior require separate qualification; this check does not claim immutable traversal under changing measurements.
