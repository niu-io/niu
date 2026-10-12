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
arbitrary directory size, maximum throughput or a whole-HTTP deadline. A future
bounded page contract needs separate design and qualification. This run does not
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
