# Supplier configuration usage

`GET /admin/v1/providers/{provider}/configuration-usage` supplies platform
administrators with operational traffic for configurations explicitly owned by a
Supplier. It works before an offer is published. It does not create an offer,
qualify supply, infer agreed rates, or create earnings or settlement records.
Supplier membership and customer workspace roles do not grant access.

Pass required `from_ms` (inclusive) and `to_ms` (exclusive) Unix milliseconds,
with a positive interval of at most 90 days. `limit` defaults to 50 and accepts
1–100 model rows. Continue with `next_after` as `after`; this is an exclusive
lexical model-alias boundary. Each page uses one database statement snapshot;
pages are live, not a frozen export. Full-range `totals` do not depend on the
model page. Responses use `Cache-Control: no-store`.

The JavaScript administration client exposes `getSupplierConfigurationUsage`
and the corresponding exported query/result types.

## Attribution and unknown values

Attribution uses current explicit configuration ownership and persisted managed
or media request routes. Disabled configurations retain their recorded traffic.
Unbound historical/static requests are not inferred. This operational view is
separate from offer-bound Supplier financial history and is not historical
financial attribution. Each dispatched attempt counts once, including retries;
a shared managed/media binding cannot count the same attempt twice.

Counts and token sums are decimal strings. Token sums include requests with both
provider-reported aggregate token counts. Requests without complete reported
aggregates are counted separately, including non-token media. Zero summed tokens
does not establish zero usage for those requests. Failure counts describe saved
failure observations. Execution-unknown counts remain explicit.

Timing totals sum complete recorded HTTP delivery durations, not asynchronous
video job durations. `complete_total_ms` is null when no complete timing exists.
No customer identity, request/key IDs, endpoint, credential, price, cost, or
margin is returned. Missing/deleted Suppliers return 404; invalid ranges and
page arguments return 400. Storage failure remains an error, not an empty report.

## Current-input verification

An isolated native PostgreSQL/Gateway run on 2026-10-11 used the owner's actual
personal OpenRouter access through two independent Niu credential configurations
under one explicit Supplier identity. These configurations used the same saved
upstream secret; this does not establish two externally issued keys or commercial
supply. Three actual structured Chat responses traversed workspace keys. Rotating
and disabling the first configuration preserved the second configuration and
left the first request visible in the operational history.

One-model pages retained identical full-range totals and returned both aliases
without duplication. An unrelated Supplier and a disjoint time interval returned
empty scoped results. Invalid ranges, limits and boundaries were rejected;
a missing Supplier returned 404 and an inference key could not read the report.
Restart preserved the report apart from its observation timestamp.

Independent reopening of the stopped database and inspection of retained actual
response files reconciled all three aggregate token pairs, per-model counts and
complete HTTP timing sums. Both route indexes and migration 273 were present.
Explicit internal verification credit and rates supported accounting; there were
no funding receipts or Supplier earnings. The original runtime/database were not
modified by the isolated run.

This run covers completed text traffic. Nonempty media/unknown-usage/failure
aggregation, Supplier-member and scoped-administrator negative checks, large
history query performance and upgrade index-build duration remain unverified.
It does not qualify an entire Supplier business workflow or release gate.
