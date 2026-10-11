# Interrupted stream reporting

## Current-input checkpoint — reviewed 2026-10-12

The clean committed `f91eb89` Gateway handled three actual Responses requests
through a saved personal OpenRouter credential in isolated PostgreSQL: one stream
closed by its client after content, one normally completed stream and one request
that exceeded an intentionally shortened upstream deadline. Internal verification
retail rates and explicit approved credit were used; no cash funding, commercial
Supplier qualification or external payment was fabricated.

Cancellation retained `response_stream_cancelled`, incomplete HTTP-200 delivery,
unknown usage and possibly executed upstream work. Timeout retained
`upstream_timeout` with the same financial uncertainty. Their two customer balance
reservations and procurement reservations remained outstanding across restart.
A rotated key with a concurrency limit of one could not admit another request
while its cancelled liability remained unresolved. The normal stream alone
recorded provider-reported usage, one customer charge and an equal ledger debit.
Its retained terminal SSE usage independently reproduced the exact tariff
calculation. This verifies uncertainty retention, not settlement of cancelled work.

## Ordinary workspace reader

A viewer-scoped installation session read the copied current-input records through
workspace request list, request detail and CSV export endpoints. Pagination with
one row per page covered every attempt without duplicates. Each page retained the
same full-range summary: three requests, one known usage, one charged request and
two unresolved customer charges. Known totals matched the normal stream; unknown
input/output tokens and charge values stayed null in JSON and blank in CSV.
Neither unknown charge became zero or a procurement expense.

Request details and exports retained distinct cancellation and timeout failures.
The cancelled stream's timing remained incomplete despite HTTP 200. The server
histogram counted all three requests independently of the single loaded row;
each bucket was checked against stored request timestamps after reopening the
isolated database. Customer amount totals matched the sole immutable charge and
ledger debit. Procurement fields were absent from customer JSON; the procurement
cost endpoint returned 403. After Gateway restart, the first page and CSV were
identical. Revoking the viewer made subsequent reads return 401.

## Evidence and limits

Independent verification reopened the stopped PostgreSQL copy, parsed the original
normal-stream terminal SSE, inspected retained partial-delivery state, and matched
saved list/detail/export artifacts to attempts, failures, charge revisions,
account entries and outstanding reservations. Reporting created no new requests,
charges or financial entries. No fixture outcome was used as evidence.

This covers actual cancellation, actual deadline expiry and ordinary-reader
reporting for these three requests. It does not qualify every interrupted-stream
interleaving, upstream terminal reconciliation, large-history performance,
customer-funded video or frontend rendering. Personal OpenRouter is self-funded
testing and does not establish qualified commercial supply.
