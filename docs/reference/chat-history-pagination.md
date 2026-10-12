# Personal Chat history continuation

Implemented backend/SDK contract on `1025bf9`, reviewed 2026-10-12.
Fixture outcomes provide no evidence.

## HTTP and SDK contract

`GET /admin/v1/organizations/{organization}/projects/{project}/chat-sessions`
keeps its existing latest-100 `{data}` response when neither `limit` nor `after`
is supplied. `archived=true` alone retains that compatibility behavior.

Either paging parameter selects `{data, next_cursor}`. `limit` is 1–100 and
defaults to 50. Pass the previous response's opaque `next_cursor` as `after`
while retaining the archive selection. A null cursor ends the history. Results
are ordered by update time and session ID descending; identifiers belong in
routing contracts, not displayed labels. Each page belongs to the authenticated
personal owner within the authorized workspace and selected archive.

```ts
let after: string | undefined;
do {
  const page = await admin.listChatSessionPage(scope, { limit: 50, after });
  // Integrate page.data into the saved-conversation history.
  after = page.next_cursor ?? undefined;
} while (after);
```

Existing `listChatSessions` and `listArchivedChatSessions` retain their behavior.
The new method validates page size, archive flag and cursor syntax before HTTP.
Backend authority remains the permission check and scoped storage query.

Malformed parameters return 400. A cursor that was updated, deleted, moved to
another archive or does not belong to this owner/workspace returns 409; restart
from the first page. The cursor fingerprints its update time. Paging is a live
view, not a frozen cross-request snapshot: other conversations can change
position between pages, so a refreshed history can require restarting as well.

Payload selection and customer-charge hydration share one bounded read-only
snapshot. Legacy and paged reads reuse the same accounting projection. Missing
references stay unknown and saved browser accounting never becomes authoritative.
Transaction-local limits are 250 ms for lock waits and two seconds for statements;
failed storage reads return sanitized 503, never an empty-success history. These
limits exclude preceding authorization, pool acquisition and full HTTP duration.

## Current-input verification

A stopped copy of actual request history contained 1,840 real upstream streams
and matching customer charges. An ordinary workspace owner saved **101 distinct
actual successful response artifacts** through the current session API. These
were retained completed streams, not 101 new model calls, generated placeholder
conversations or fixture responses. Original response digests and reported usage
were retained for independent verification. No new inference was dispatched.

The compatibility list contained the latest 100 rows. Six HTTP pages at limit 17
and five calls through the clean-built SDK at limit 23 returned all 101 saved
conversations in the same order, including the previously unreachable tail.
Each result's customer charge matched its actual native attempt. A separate
ordinary viewer saw an empty personal history and could not use the owner's
cursor. Malformed limits/cursors returned 400; unknown cursors returned 409.

An exclusive session-table lock returned sanitized 503 in **253.17 ms** while
held. Release and restart restored the same first/continuation pages. Updating
the cursor conversation returned 409 on continuation. Archiving one conversation
placed it in archived paging. Both temporary operators were revoked.

A separate process reopened the original retained history and final stopped
database. It compared complete fingerprints for requests, customer charges and
ledger, funding records, reservations and Supplier earnings: all were unchanged.
It reconstructed all 101 payloads from actual SSE content/usage and native saved
rows, verified update/archive ownership, HTTP/SDK ordering and charge hydration,
and checked lock diagnostics and final revocation. Existing charge/debit totals
remained **31,273,840 nanounits**. Original installation configuration, encrypted
identity and databases were preserved. Raw response content and credentials
remain private.

This qualifies the exercised populated backend and SDK path. Browser history
integration, large payload volume, concurrent mutation across pages, query-plan
capacity and production performance remain unverified. The compatibility call
still returns only the recent 100 rows; clients need the paging method to access
complete history. No complete Chat or release gate is closed.
