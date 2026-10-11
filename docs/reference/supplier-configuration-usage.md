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

A subsequent current-input authorization run restored a stopped copy of those
actual records. A company owner received 403. After the installation credential
added that operator as an active Supplier manager, the usage endpoint still
returned 403 while the same member successfully read its Supplier dashboard
(200). Administrator totals and model rows stayed unchanged. Independent database
reopening checked the persisted membership, unchanged attempts and revocation of
the temporary operator against the saved HTTP results.

A separate current-input run used explicitly personal-owned configurations,
without customer credit or billing rates. An actual OpenRouter native Messages
completion for `openai/gpt-4.1-mini` returned the requested unique output marker
without complete aggregate token usage. A separate deliberately invalid upstream
credential produced a canonical HTTP 401 and a persisted `upstream_http_error`
observation with upstream status 401. The directory counted two unknown-usage
attempts, one completion and one failure; summed known tokens remained zero
without converting either request to known zero usage. Restart preserved the
report. Independent response-file inspection and database reopening checked the
output, aggregate nulls, safe failure, execution classification and timing sum.
Neither request produced a customer ledger entry or Supplier earning; temporary
workspace keys were revoked. An initial verification script incorrectly expected
502 for the credential refusal; the actual canonical 401 was preserved and the
expectation corrected, without changing gateway behavior.

A current-input media read used a stopped copy of an actual completed personal
video job. The directory initially had no requests for a newly created diagnostic
Supplier. Associating its existing configuration through the normal administrator
API produced one completed media attempt with unknown aggregate token usage.
This explicitly exercises current ownership, not retroactive commercial or
financial attribution. The report survived restart. Independent database reopening
checked the exact attempt/model association and HTTP timing semantics, and full
FFmpeg decoding plus the retained artifact hash checked the original generated
video. Full-record fingerprints of attempts, jobs, media routes, media transport
timings, customer balance entries and Supplier earnings remained unchanged.
No new video generation, upstream polling, funding or earnings was introduced by
this read verification.

These runs cover text and retained media traffic, unknown aggregate usage, an
upstream authentication failure and the stated authorization boundaries. Large
history query performance and production index-build duration remain unverified. An isolated [272-to-273 native upgrade](../releases/native-backend-upgrade-2026-10-11.md#supplier-configuration-index-upgrade)
preserved the existing business records and encryption identity.
It does not qualify an entire Supplier business workflow or release gate.

## Database contention

The diagnostic statement has transaction-local `lock_timeout=250ms` and
`statement_timeout=2s`. These bounds do not replace pool-acquisition, network or
HTTP deadlines. Timeout returns a sanitized 503, never truncated or empty success;
the transaction ends without leaving these settings on a pooled connection.
Large ranges that exceed the statement budget must be narrowed.

A current-input run held an actual exclusive route-table lock in a separate
PostgreSQL session while querying the retained three real text attempts. The API
returned 503 in 256.15 ms without a partial report or database object names.
After releasing the lock, and again after Gateway restart, the complete original
totals and model rows returned. Independent database reopening reconciled token
and timing sums; the PostgreSQL log recorded lock-timeout cancellation. This
checks lock contention and recovery, not the two-second execution deadline under
a large-history workload or production throughput.
