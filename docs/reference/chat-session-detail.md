# Read one complete owned Chat conversation

Implemented runtime `549d2189`, reviewed 2026-10-12. Fixture outcomes provide
no evidence. This adds direct restoration; complete Chat/frontend acceptance
remains open.

## HTTP and SDK

`GET /admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}`
returns `{data, archived}`. `data` is the complete saved conversation, including
supported settings, attachments, results and nested turns. `archived` comes from
the separate native archive state. Successful responses set
`Cache-Control: no-store`.

```ts
const { data, archived } = await admin.getChatSession(scope, conversationRef);
```

The existing scoped save, delete, archive and content-export methods are
unchanged. Direct lookup reaches conversations outside the latest-100 list and
does not require traversing continuation pages. Archived conversations remain
readable by their authenticated personal owner. Installation or workspace read
permission alone does not expose another personal owner's conversation.

Saved-body selection and customer-charge hydration share one bounded read-only
snapshot. Charges come from native workspace attempts with matching model
references, including nested turns; saved browser accounting is ignored. Missing
or foreign references remain unknown, with no zero or Supplier-cost fallback.
This is the same accounting projection used by history lists and pages.

The existing 32 MiB saved-JSON materialization bound applies before loading the
body; oversized individual records return 413. Derived charge fields can increase
wire size. Storage waits use transaction-local 250 ms lock and two-second statement
limits; preceding authorization, pool acquisition and complete HTTP duration
remain separate.

| Status | Meaning |
| --- | --- |
| 200 | Complete owned conversation and archive state |
| 401 | Missing/revoked management identity or inference-only credential |
| 403 | No workspace read permission |
| 404 | No saved conversation in this workspace/personal ownership scope |
| 413 | Saved JSON exceeds one-response capacity; use content export |
| 503 | Durable storage unavailable or bounded read wait exceeded |

## Actual current-input verification

A stopped copy of actual request history retained 1,840 model requests. A new
ordinary workspace owner saved 101 distinct actual-response conversations through
the current API. The oldest was outside the latest-100 compatibility list. Direct
GET restored it with a complete actual customer-request CSV attachment and saved
settings, including explicit `logPayloads=false`. The clean-built SDK returned
identical content. Native actual charges were hydrated; no new inference occurred.

The owner archived that conversation. Direct GET retained its complete body and
returned true archive state across Gateway restart. An exclusive session-table
lock produced sanitized 503 in **253.55 ms**; release restored the same body.
These are exercised refusal/recovery observations, not a latency SLO.

Another ordinary personal viewer received 404; a foreign workspace request was
denied with 403, an inference-only workspace key with 401, and an unknown
conversation with 404. Deletion survived a further restart and returned 404,
even though another owner's native record with the same routing ID still existed.
Temporary owner/viewer revocation denied later reads.

A real saved two-turn conversation from another verification workspace was also
imported through the supported save API. Direct GET preserved both actual prompts
and responses. Its foreign attempt references did not acquire current-workspace
charge fields, and saved accounting was discarded rather than copied into a
customer charge. This verifies content import and the unknown-reference boundary;
it does not qualify new inference or cross-workspace billing.

## Independent final artifacts

A separate process reopened source and final databases. It reconstructed the
complete direct-read body and charge projection from the submitted actual content
and native ledger, verified the report digest and preserved settings, and checked
all remaining saved records. The imported two-turn payload matched its real source
content after removal of browser accounting; matching attempts were absent from
the destination workspace as expected.

The target owner's deleted row was absent while the other owner's same-ID row
remained. Complete source-owner and request/financial table fingerprints were
unchanged, including charges, ledger, funding, reservations and Supplier earnings.
Native actor revocation and lock-timeout diagnostics were independently checked.
Original configuration, database and encrypted identity were preserved; raw
content, responses and credentials remain outside Git.

The exercised path covers direct restoration, settings/text-report attachments,
authoritative charge projection, archive, scoped deletion, unknown imported
references, SDK, restart and revocation. It does not establish concurrent update
protection, image interpretation, every oversized legacy body, complete browser
restoration or production performance.
