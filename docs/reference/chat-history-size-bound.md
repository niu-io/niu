# Saved Chat history materialization bound

Current-input checkpoint on clean backend `2d385f7`, reviewed 2026-10-12.
Fixture outcomes provide no evidence. This is a backend resource-bound and
content-preservation checkpoint, not production performance qualification.

## Contract

The [continuation endpoint](chat-history-pagination.md) now selects record IDs
and saved JSON byte sizes before loading bodies into the Gateway. A page
materializes at most **32 MiB of saved JSON text**, as measured by PostgreSQL's
`octet_length(payload::text)`. It stops at the requested row count or this byte
budget, whichever comes first, then returns the last included row's cursor.
Clients must follow `next_cursor` rather than infer completion from row count.

Payload loading and customer-charge hydration still share the same bounded
read-only snapshot. No content is shortened, and attachments stay intact.
Derived customer-charge fields and the response envelope can increase wire
size beyond the saved-payload budget; this is not a 32 MiB HTTP or process-RSS
limit. PostgreSQL decompression/byte-size inspection is also subject to the
existing statement deadline.

The latest-100 compatibility call returns **413** with
`error.type = "chat_history_capacity_exceeded"` when its selected saved JSON
exceeds the budget. It does not return partial or empty-success history. Use
continuation paging instead. A historical single record above the budget is
also refused by paging; its existing individual content export remains
available independently. This condition does not erase saved data or accounting.
The exercised records were below that individual bound. The Gateway's current
24 MiB session-write transport limit is unchanged.

## Actual current-input run

An ordinary owner retrieved the current customer request CSV through the real
report API: **422,479 bytes**, representing 1,840 actual retained requests. The
owner saved it as a shared text attachment with 101 distinct real response
conversations, each linked to its actual completed upstream attempt. These
were current API saves of real retained content, not fresh model generations,
placeholder responses or invented usage. The export and response bytes were
retained privately for independent verification.

On the preceding executable, the latest-100 call returned one **51,872,003-byte**
HTTP body. With the new materialization bound, the same workflow returned
actionable 413 for that compatibility call. Requested 100-row continuation
returned **64 and 37 rows**, covering all 101 conversations and complete report
attachments. The updated final native saved JSON total was **52,384,260 bytes**.
A clean-built SDK at limit 23 returned the same full sequence in five pages.

Scoped-owner isolation, invalid cursors/limits, changed-cursor conflict, archive
selection, restart and actor revocation remained correct in the exercised
HTTP flow. An exclusive session-table lock returned sanitized 503 in **253.63 ms**.
This is an observed refusal, not a latency SLO.

A separate process reopened source and final databases. It verified original
SSE digests and reported usage, every saved payload and complete CSV attachment,
page/SDK ordering, native owner/update/archive state and exact charge hydration.
For each page it reconstructed original native byte sizes, checked the selected
prefix fit the budget and that the next record crossed it, and confirmed the
final cursor ended the complete sequence.

Complete fingerprints for requests, charges, ledger entries, funding,
reservations and Supplier earnings matched the retained source. No inference
was dispatched; existing customer charges/debits stayed **31,273,840 nanounits**.
Both temporary operators were revoked. A separate current-input small-content
run verified compatibility still returned 100 rows and HTTP/SDK continuation
returned all 101, with independent native content/accounting checks.

Before native refresh, the original installation archive was restored into a
fresh isolated PostgreSQL instance and compared independently. Configuration
and encrypted identity were preserved; authenticated registry matching remained
true. Raw conversation/report content and credentials remain outside Git.

## Remaining scope

This covers the exercised shared text-report attachment, saved-body budget,
legacy refusal and continuation preservation. It does not qualify model
attachment interpretation, every legacy oversized individual record, all
concurrent mutations, arbitrary history scale, PostgreSQL resource peaks or
Gateway CPU/RSS/throughput. Whole Chat and release acceptance remain open.
