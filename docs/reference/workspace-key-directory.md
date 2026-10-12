# Complete saved workspace key directory

`GET /admin/v1/organizations/{organization}/projects/{project}/keys` requires
workspace management read permission. The legacy `project` path parameter
identifies a workspace. Metadata includes names, grants, revision, expiry,
revocation and latest durable dispatch time. Tokens and token hashes are never
returned. A workspace inference key does not grant management access. Internal
IDs remain API routing references, not product display labels.

Clean `e274aab` returns the complete saved directory in creation-time/routing-
reference order. Previously the compatibility response stopped at 1,000 records
without a continuation cursor, hiding later saved keys. Its existing response
shape is preserved and the obsolete OpenAPI array maximum is removed. Expired
and revoked records remain visible for administration. The read uses the shared
bounded read-only transaction initializer with transaction-local 250 ms lock and
2 s statement limits. Timeout returns sanitized 503 rather than an empty or
truncated successful response. Preserve known data when storage is unavailable.

## Current-input verification — 2026-10-12

A stopped copy of the actual mixed-request history had nine retained keys.
Normal management HTTP requests from a workspace owner created 1,001 new keys.
Clean `420ef96` returned the first 1,000 of the 1,010 saved rows, omitting the last
ten. The response and database order were independently compared.

A separate copy served by clean `e274aab` returned all 1,010 rows to an ordinary
workspace viewer. The first and last newly created key each completed a real
structured OpenRouter request with its fresh marker. Independent reopening
matched native usage and exactly one original-rate charge/debit per call:
34,693 USD nanounits in total. Last-used metadata matched the latest persisted
dispatch for each key. It is not authentication time or a general completion proof.

While an independent PostgreSQL session held an exclusive key-table lock,
the directory returned sanitized HTTP 503 in 259.19 ms with the lock still held.
After release and restart, its complete response and usage metadata were
unchanged. A foreign-scoped viewer was denied without the target references;
the inference key's management read was rejected. All 1,001 temporary keys were
revoked through management APIs, and the complete directory retained their
revoked records. Revoked inference and management identities returned 401.

Independent reopening checked every issued secret's hash against its saved key,
every directory field/order, issuance/revocation audit records, actual response
hashes/markers/usage, exact new charges/debits and native timing. Customer and
procurement holds were released; no funding receipt appeared. Original request
history contained 1,840 charges; the final copy had 1,842 and a customer total of
34,674,695 USD nanounits. Metadata responses contained only the declared public
key fields, without secrets, hashes or procurement information.

## Limits

This corrects completeness at the exercised size and verifies bounded lock
refusal/recovery. The compatibility response remains unpaged; it does not promise
arbitrary directory size, maximum throughput or a whole-HTTP deadline. The later optional page contract below has its own scoped qualification. This run does not
qualify browser rendering, every key-policy combination or permanent keys.
Personal upstream access and approved internal credit/rates do not establish
commercial supply or merchant funding. No fixture outcome is evidence. Static
clippy and annotation checks completed separately. A fresh backup restore and
native upgrade preserved the original configuration, encrypted identity and
business records; isolated verification did not alter the source dataset.


## Paced complete-directory reads — 2026-10-12

The same digest-verified clean `e274aab` executable served a further stopped copy
of the actual 1,010-key/1,842-request history. One isolated Gateway configured
two admission database connections. Eight client workers scheduled 1,200 ordinary
workspace-viewer reads at 20 requests/second. Every HTTP response contained the
complete directory: 221,012 bytes, all with HTTP 200/no-store and the same retained
reference hash. This read run generated no upstream model call or new key.

| Observation | Result |
| --- | ---: |
| Measured phase duration | 59.966 seconds |
| Completed reads/second | 20.011 |
| Client nearest-rank p50 / p95 / p99 | 10.33 / 12.14 / 13.04 ms |
| Maximum client duration / scheduling lag | 14.95 / 11.02 ms |
| Resource samples, approximately 500 ms intervals | 119 |
| Maximum sampled Gateway RSS | 20,816 KiB |
| Maximum sampled Gateway CPU from macOS ps | 12.8 percent |

Independent PostgreSQL reopening matched every field/order in the reference to
all saved keys and their latest dispatch timestamps, checked every retained
response digest/length, and recalculated the latency/resource observations.
Complete key-row fingerprints, attempts, charges and ledger counts/sums were
unchanged. Original first/last-key response artifacts and exact debits remained
consistent. Restart returned the same response bytes; the temporary reader was
revoked and subsequent access returned 401. No outstanding hold or funding
receipt appeared.

This qualifies the stated paced, warmed, local read workload on this small
retained directory, not saturation, arbitrary directory size, production SLOs,
concurrent mutations or long-duration stability. Eight worker slots do not imply
eight simultaneous active requests throughout the schedule. Client timing
includes loopback transport and response transfer. Resource samples cover only
the Gateway process, excluding PostgreSQL/host totals and unobserved peaks;
they do not prove absence of memory leaks. Original installation, identity and
source evidence were preserved. No fixture result supports these conclusions.


## Optional bounded pages — 2026-10-12

Clean `a78769f` adds explicit keyset pagination on the same endpoint:

- `?limit=100` returns up to 100 rows and `next_cursor`.
- `?limit=100&after={next_cursor}` continues exclusively after that key.
- `after` without `limit` uses page size 50.
- With neither parameter, the full compatibility `{ "data": [...] }` response
  remains unchanged and has no `next_cursor` property.

Limits are integers from 1 to 100. A missing or foreign-workspace cursor returns
409, not a reset to the first page. A page's scoped cursor lookup and rows share
one bounded read-only snapshot. Separate pages remain a live view; later normal
creation can appear at the tail. Revoked/expired keys remain metadata records.
Ordering is the existing ascending creation-time/key-reference order. The
projection/selection logic is shared with the complete-directory method, with
an additional exclusive bound and one-row lookahead for pages.

The SDK exports `WorkspaceKeyPage` and provides `listWorkspaceKeyPage`; existing
`listWorkspaceKeys` still reads the full compatibility directory:

```ts
const first = await client.listWorkspaceKeyPage(scope, { limit: 100 });
if (first.next_cursor !== null) {
  const next = await client.listWorkspaceKeyPage(scope, {
    limit: 100, after: first.next_cursor,
  });
}
```

An ordinary workspace viewer read the actual saved 1,010-key history through
11 HTTP pages of at most 100 rows. A clean built SDK made actual HTTP requests
through 14 pages of at most 73 rows and separately used its legacy method. Both
traversals exactly matched the complete directory. Limits 0/101 returned 400;
missing and foreign-key cursors returned 409. A later key created through the
normal management API appeared alone after the prior tail cursor, yielding
1,011 target-workspace rows. Foreign-scope page access was denied.

An exclusive native key-table lock blocked the cursor lookup. The paginated
request returned sanitized 503 in 278.77 ms while the lock remained held.
After release/restart, the first page and complete saved response were identical.
Temporary keys and read actors were revoked; revoked page access returned 401.

Independent PostgreSQL reopening compared native ordering and all declared
metadata fields, both page traversals, cursor boundaries, later tail creation,
foreign key ownership and retained revocations. Attempts, charges and ledger
records stayed at 1,842 and 34,674,695 USD nanounits; no inference or financial
entry was created by this pagination run. No funding receipt or outstanding hold
remained. Original source data and installation identity were preserved.

This qualifies the exercised optional-page/SDK contract, scoped cursor refusals,
lock recovery and one later insertion. It does not establish frozen cross-page
history, every concurrent rotation/expiry transition, index/large-directory
capacity, browser integration or a new performance SLO. Earlier full-directory
measurements retain their `e274aab` executable revision and are not measurements
of this new implementation. Static clippy, SDK type/build and annotation checks
completed separately; fixture outcomes supply no evidence. Native replacement
followed a fresh isolated backup restore/comparison and retained configuration,
encrypted identities and durable business counts.


## Page activity lookup cost — 2026-10-12

Clean `8aba958` selects the scoped, ordered page before looking up each key's
latest dispatch. On a stopped copy of the actual saved 1,011-key directory,
PostgreSQL EXPLAIN ANALYZE showed the previous query probing dispatch activity
1,011 times for page sizes 1, 50 and 100. The revised query probes 2, 51 and 101
times, respectively, including the one-row continuation lookahead. Retained
native plans were independently checked. The key-directory scan still examines
1,011 rows and sorts them; this change does not establish indexed seek behavior
or arbitrary-directory capacity. Individual plan timings are not a workload SLO.

The committed executable was then exercised through actual ordinary-viewer HTTP
and a freshly compiled SDK against a separate retained real-request database
copy. Eleven HTTP pages and fourteen SDK pages reproduced all 1,010 initial
records. A normal management creation appeared after the prior tail cursor;
missing/foreign cursors, invalid sizes and cross-workspace access were refused.
The compatibility response remained complete. An exclusive key-table lock
returned sanitized 503 in 266.05 ms while held; release and restart preserved
complete/page responses. Temporary keys and readers were revoked, with 401 for
revoked reads.

Independent PostgreSQL reopening checked metadata/order, cursor boundaries,
foreign ownership and revocations. The 1,842 actual request/charge records and
34,674,695 USD nanounits of customer charges/debits remained unchanged, with no
new funding or outstanding hold. No inference was generated by this read-path
run. This qualifies the exercised SQL cost reduction and API recovery contracts;
large directories, concurrent mutation combinations, sustained page load and
browser integration remain unverified. Fixture outcomes provide no evidence.


## Indexed keyset selection — 2026-10-12

Clean `c1eee14` adds migration 0279's index on workspace ownership followed by
creation time and key reference. It includes revoked/expired records and leaves
API ordering, cursor validation and compatibility responses unchanged.

On an isolated stopped copy of the actual 1,011-key directory, the existing
page-first query scanned 1,011 key rows for the first page and 511 rows after a
middle cursor. Adding the index changed both selections to 2, 51 and 101 key
rows for page sizes 1, 50 and 100, including continuation lookahead.

A separate actual HTTP run started the committed Gateway against a retained
schema-278 real-request database copy. Startup applied migration 0279. Eleven
ordinary-viewer HTTP pages and fourteen clean-SDK pages matched all 1,010 initial
records; a later normal key creation remained visible at the tail. Saved native
plans from this deployment independently show the new index, 2/51/101 selected
key rows and dispatch probes for both first/middle-cursor pages, without a sort
node. Missing/foreign cursors, invalid sizes, cross-workspace access and revoked
readers were refused. Lock contention returned sanitized 503 in 260.29 ms while
the lock remained held; release and restart preserved complete/page responses.

Independent PostgreSQL reopening confirmed successful migration 0279, index
columns, saved plans, metadata/order, cursor ownership and revocations. Attempts,
charges and debit totals stayed at 1,842 and 34,674,695 USD nanounits. No inference,
funding receipt or outstanding hold was added by this run. Original data and
identity were preserved. Native installation upgrade followed a fresh isolated
backup restore and retained configuration, encrypted identities and durable
business counts; authenticated registry configuration remained consistent.

This qualifies index use and the exercised existing-data upgrade/page contract.
It does not establish arbitrary directory size, production SLOs, sustained page
load, every concurrent mutation combination, or browser presentation. A separate
query-plan experiment does not measure whole-API workload latency. Fixture
outcomes provide no evidence.
