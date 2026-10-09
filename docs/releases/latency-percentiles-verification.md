# Usage latency percentiles

Development checkpoint, 2026-10-03. F06 remains incomplete.

The existing Usage latency card offers Average, P50, P95 and P99 through a direct shadcn DropdownMenu. The selected metric is URL view state and preserves request filters and charge grouping. The card displays the full-range sample count alongside the value; absent measurements remain unavailable rather than zero. Percentiles are shown only for the declared `gateway_body_ms` boundary. They measure complete gateway body consumption, not client receipt time or upstream-only generation.

The actual OpenRouter Activity Explore metric picker was inspected before editing, including its Avg/P50/P95/P99 latency choices. Niu retains its existing summary-card layout and shared components. Desktop and 390px card/menu reviews checked spacing, selected state and wrapping. P95 selection, reload restoration and P99 selection were inspected on the running dashboard. Browser-control timeouts interrupted subsequent navigation and interruption-only live page checks; those are not claimed as passed journeys.

Fresh verification:

- All 30 Logs/content dashboard tests and the dashboard build passed. New cases verify full-range percentile values with an empty displayed page, sample counts, preserved filters/grouping and null values when no complete timing exists.
- The PostgreSQL activity-timing test passed. It excludes interrupted and legacy measurements from the average and percentiles and verifies scoped empty sample sets.
- Read-only checks reconciled all 25 complete timing records in the running workspace with its summary: P50 1,318 ms, P95 3,046 ms and P99 4,083 ms. These are observations of the saved development requests, not a production benchmark or reliability threshold. No inference or data mutation was performed.

Remaining: full performance investigation, consistent timing categories across protocols, trends, production performance qualification and the outstanding live navigation checks. Highest-latency Logs ordering has separate [verification](logs-sorting-verification.md), including its historical-duration fallback; that fallback is not included in these gateway-body percentiles.


## Interrupted timing chronology

Migration 0072 closes a nullable-header constraint gap: elapsed totals must remain nonnegative, dispatch cannot exceed total duration, and a first-output timestamp requires a measured header timestamp. The storage write path also rejects malformed chronology and HTTP statuses before insertion. Interrupted requests may still retain null headers, output and HTTP status; no missing phase is replaced with zero or inferred from the total.

Both PostgreSQL activity-timing tests passed, including direct database rejection of invalid interrupted records and unchanged aggregate exclusion of interruptions. The gateway payload/timing integration passed for buffered and streamed responses, body cancellation and cancellation before headers. Storage Clippy passed with warnings denied. The running development database applied migration 0072; inspection found zero historical rows violating its added constraints. No inference was sent for this checkpoint, and the UI was unchanged. This qualifies chronology validation rather than the full performance-investigation workflow.

## Request waterfall review, 2026-10-04

Read-only browser review covered saved request details at 1280px, 768px and 390px, including retained synthetic payloads through the Messages and Raw data tabs. The nonstreamed request showed 62 ms preparation, approximately 1.38 s response wait and 1 ms delivery within its 1,445 ms total, without claiming generation throughput. The completed streaming request showed 14 ms preparation, 1,183 ms first-output wait and 12 ms output delivery within its 1,209 ms total. Its single-token label now reads “1 output token”; this was checked on the running dashboard after hot reload.

The interrupted streaming request showed 8 ms preparation, 613 ms first-output wait and 4 ms output delivery with an observed 625 ms interval. It retained an uncertain completion state and unresolved customer charge despite HTTP 200, and omitted throughput. Missing or expired payloads were identified rather than fabricated. The reviewed layouts remained readable without document overflow. All four timing component tests passed.

These saved development observations reconcile the displayed phases with stored offsets; they are not fresh upstream performance measurements, generation-speed benchmarks or full F06 qualification. No inference, key mutation or retention-policy change was performed during this review.
