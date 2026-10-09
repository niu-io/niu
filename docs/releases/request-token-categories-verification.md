# Request token categories

Development checkpoint, 2026-10-03. F06 remains incomplete.

Migration 0071 stores explicitly reported cached-input and reasoning-output subsets separately from authoritative token totals and charges. Missing categories remain null. Storage rejects negative/excessive quantities, missing authoritative usage, foreign-workspace writes and conflicting observations. An identical replay succeeds without replacing the saved observation.

The completion batch writes category observations within the same transaction as request completion. Its PostgreSQL fixture verifies an invalid subset leaves the request unresolved and a valid observation commits with completion. No category-specific billing rate or discount is inferred.

Non-streaming Chat collects only the explicit OpenAI-compatible usage detail fields. Invalid or missing fields remain unknown independently, without invalidating otherwise authoritative totals. The parser regression covers explicit zero, null, negative, excessive, string and fractional values. The PostgreSQL buffered-output gateway fixture passed with four Chat category records surviving blocking, redaction and indeterminate inspection; existing customer-charge/procurement reconciliation remained unchanged. Unreported Responses categories were not fabricated.

Streaming and Responses collection, per-request serialization, full-range category aggregates, SDK/contracts and rendered investigation remain outstanding. This is durable collection evidence for the stated Chat subset, not completion of token-category reporting or release qualification.

## Streaming Chat and non-streaming Responses follow-up

Streaming Chat now passes explicit category observations to the completion writer only at the terminal event. The parser fixture tests every byte-fragment width, explicit zero, contradictory category values, contradictory totals, omitted follow-up details and invalid follow-up details. Conflicting evidence remains unknown. The PostgreSQL priced-streaming fixture verifies terminal usage commits category counts, whereas a truncated stream and a completed stream without usage do not create category records. Existing settlement expectations remain unchanged.

Non-streaming Responses reads its protocol-specific input/output detail fields. The buffered-output integration fixture now verifies six durable Chat/Responses category observations, including withheld and indeterminate output, with unchanged customer and Supplier accounting. Both PostgreSQL gateway fixtures and the fragmentation/conflict unit test passed; storage/gateway Clippy passed with warnings denied, as did public-boundary and changed-file whitespace checks.

This supersedes the missing collection evidence for these two protocol paths. Per-request serialization, full-range aggregates, SDK/contracts and browser presentation remain outstanding. Responses streaming and unsupported protocol categories are not claimed.

## Scoped reporting follow-up

Request rows now serialize nullable exact category counts, and summaries expose reported subset sums with independent reported/unknown request counts. The category aggregate uses the same repeatable-read snapshot and scope/filter helper as existing summaries. No observations return null sums, whereas reported zero remains an exact zero string. The PostgreSQL fixture verifies two requests with partial reasoning coverage, a one-row page with full-range sums, exclusion by model filter and a foreign workspace with no leaked totals.

SDK declarations, the usage example and OpenAPI describe these fields and their partial-coverage semantics. All 69 SDK tests and type checking passed; storage/gateway Clippy passed with warnings denied, and OpenAPI parsed successfully. Category browser presentation, CSV export fields, real upstream coverage and complete release acceptance remain open.

## CSV category export follow-up

Customer-safe CSV now appends Cached input tokens and Reasoning output tokens columns, preserving existing column positions. Counts remain exact decimal strings; missing values are blank and explicit zero is retained. The routed PostgreSQL export fixture passed with a large reported cache count, explicit zero reasoning, unknown rows, reader authorization, foreign-workspace rejection and the unchanged 10,000-row rejection boundary.

The separate storage fixture passed with two maximum signed-64-bit cache observations: their full-range sum is the exact string `18446744073709551614`, while exported per-request counts remain `9223372036854775807`. Scope, partial coverage and filtered-empty regressions also passed. Storage/gateway Clippy, public-boundary and changed-file whitespace checks passed. This supersedes the missing CSV-field implementation above; rendered category presentation and real upstream coverage still remain open.

## Usage metric presentation

The existing Usage token card now selects total, input, output, cached input or reasoning output using the installed choice-menu primitives. The choice persists in the URL while retaining filters, latency selection and charge grouping. Category sums show independent reported/unknown coverage and identify their inclusion in input or output totals; missing observations remain unavailable rather than zero.

OpenRouter Activity and its open Explore metric menu were inspected before editing. The running Niu Usage page was reviewed at desktop and 390px widths, including the open menu, selecting cached input and reasoning output, and reloading the saved choice. Existing 35 requests show zero category observations and 35 unknowns; no historical counts were invented and no inference was sent. Dashboard typechecking and all 222 tests passed. The final shorter Reasoning label fixed clipping at 390px; the corrected closed and open states were inspected, and all 30 focused activity tests passed again, including exact sums beyond integer ranges, partial coverage, explicit zero, unknown categories, legacy responses and preservation of other URL choices.

This qualifies the aggregate metric selector only. Per-request category presentation, complete protocol collection, real upstream measurements and F06 release qualification remain open.

## Per-request detail presentation

Logs request details now place cached input beneath the input total and reasoning beneath the output total. Counts use exact integer formatting; explicit zero is retained, and missing fields show Unknown. The existing timing and customer-charge metrics are unchanged. OpenRouter Logs and its loaded generation-detail and expanded Usage states were inspected before editing; Niu retains its established request sheet and excludes procurement values.

All 31 focused activity tests passed, including exact large counts, zero, unknown counts and previous/next request behavior. Dashboard typechecking passed. A saved request was opened from its Logs row on desktop and again at 390px, and both rendered detail layouts were inspected. Its historical categories remain unknown; no demo data was fabricated or paid inference sent. This resolves the earlier browser interaction failure for this named request only, not all key drilldowns or request-detail workflows. Complete protocol and real upstream category qualification remain open.

The rebuilt and extracted SDK also passed the [packaged category-reporting checkpoint](regression-and-recovery-verification.md#packaged-token-category-reporting), including exact agreement with live saved request summaries. This is read-only reporting evidence; it does not establish upstream collection coverage.

## Responses supported-boundary regression

The PostgreSQL Responses inference fixture now reports four input tokens, two output tokens, three cached input tokens and explicit zero reasoning. Its completed attempt retains the authoritative totals and persists the two category subsets without changing its six-nanounit fixture budget charge. A malformed output remains execution-uncertain and creates no category observation.

Streaming Responses remain explicitly unsupported: the routed request returns HTTP 501 with `unsupported_operation_error`, names Chat streaming as an alternative, has no attempt header, does not reach the upstream capture and creates no category record. The strengthened fixture and all 16 PostgreSQL inference regressions passed, alongside public-boundary and whitespace checks. This is controlled protocol-boundary evidence, not Responses-streaming implementation, real Supplier qualification or full F04/F06 completion.

## Consistent streamed usage totals

Streamed Chat now rejects usage accounting evidence when a supplied `total_tokens` is malformed or differs from input plus output, matching buffered Chat validation. Omitted totals remain compatible with explicitly reported valid input/output counts. Contradictory evidence stays unknown even when the stream reaches its terminal event; cache/reasoning observations are not persisted from that evidence. Delivered stream bytes are unchanged.

All six stream-parser tests passed, including fragmented consistent totals and mismatched/null/string/negative/fractional total cases. The strengthened PostgreSQL priced-streaming fixture proves contradictory terminal totals leave spending unsettled, preserve the reserved liability and create neither settled cost entries nor category records. All eight PostgreSQL accounting regressions and gateway Clippy for all targets passed. This fixes a real streamed-versus-buffered accounting inconsistency; complete protocol, real upstream and F04/F05/F06 qualification remain open.

Responses now applies the same optional-total consistency rule as Chat; its routed fixture proves a completed response with contradictory totals retains unknown usage and creates no category observation or settled cost entry. Embeddings accounting also validates its supplied total and database bounds. See [protocol accounting consistency](../reference/inference-qualification.md#responses-and-embeddings-usage-consistency) for fresh checks and limits.
