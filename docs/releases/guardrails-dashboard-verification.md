# Guardrails dashboard verification

The workspace Guardrails list and Model & Provider Access editor use the saved backend policy. The list distinguishes a successful empty read from a failed read. Access edits preserve existing input and buffered-output rules, use the current expected revision, and retain the draft on conflict without an automatic write retry. Readers cannot edit.

The reference was OpenRouter's actual workspace Guardrails list, default-policy detail and Model & Provider Access editor. Niu implements its supported access modes with direct shadcn menu primitives. Unsupported budget, privacy, region and detector controls are absent.

Verified on the running development service:

- Saved an OpenRouter Provider allowlist in an isolated review workspace through the dashboard; a fresh navigation retrieved the saved name and active policy from the backend. The demo policy was unchanged.
- Inspected the editor and open model/Provider menus at desktop and 390px widths, including selecting a model and retaining the built-in menu gutter.
- Four focused tests cover content-rule preservation and expected revision, failed initial reads, conflict without retries, and reader permissions. Dashboard type checking passes.

This is a partial F09 implementation. Key assignment history and investigation beyond the recorded pre-dispatch/inspection decisions remain missing from the dashboard. Full detector, output-streaming, privacy, budget and performance qualification remains required by the release acceptance document.

## Revision API verification

Workspace policy history is now available through a scoped, read-authorized, no-store endpoint. It returns bounded immutable metadata with exclusive revision pagination, readable actor names and rollback attribution. Policy bodies, patterns, internal actor identifiers and credentials are excluded. The JavaScript SDK supports history reads and explicit rollback with current-head concurrency checks and no automatic retries.

The PostgreSQL-backed gateway suite passed 130 tests plus process replacement. The history cases cover 104 revisions across two pages without gaps or duplicates, active-head and rollback attribution, reader permission, cross-workspace denial and sanitized invalid cursors after authentication. A live isolated-workspace check saved a second version, restored the first as a new third version, read its history and paginated backwards. The demo workspace remained unchanged.

## History and restore dashboard verification

The dashboard now provides revision history, exclusive-cursor pagination, saved-version inspection and explicit restore. Version inspection reads the preserved policy rather than reconstructing it from current settings. Its dialog shows model/Provider restrictions and input/output rules before a writer can restore. Readers can inspect without a restore control. A stale-head conflict removes the restore action until history is reloaded; there is no automatic retry.

Verified the history table and version dialog at desktop and 390px widths. A real mobile-browser restore in the isolated workspace created version 4 from version 2; an independent backend read confirmed the exact policy and rollback attribution. The workspace was then restored to its original policy as version 5. The demo workspace was unchanged.

All 165 dashboard tests and 50 JavaScript SDK tests passed. Ten focused dashboard tests cover policy preservation, failed reads, history pagination and page failures, version review, scoped restore payloads, stale-head conflicts and reader controls. The gateway suite passed 130 tests plus process replacement; saved-version reads additionally cover workspace roles, cross-workspace denial, nonexistent versions and no-store responses.

This qualifies the tested history/review/restore path, not full F09. Key assignment history, complete denied-decision coverage and the remaining engine/data/performance acceptance work remain open.

## Content-rule dashboard verification

The policy detail now links to Model & Provider Access, Input rules and Output rules. The content editors follow OpenRouter's actual sensitive-information form: preset rows with actions, custom regex rows and a sample-text test. Niu exposes only its two versioned presets, local regex block/redact actions and required buffered-full output mode. It declares supported text coverage and incompatible request types; unsupported detector, streaming, privacy and budget controls are absent.

Synthetic tests use the backend stage-specific endpoints. They do not activate rules or save/send sample text to a model. The UI validates the synthetic/non-enforcement response flags, invalidates results when sample/rules/protocol change, discards superseded responses and distinguishes block, redact and indeterminate outcomes. Empty output rules remove the optional output configuration rather than saving an invalid empty policy. Whole-policy writes preserve other stages and access constraints under the current revision check.

Verified against the live service in an isolated workspace: email redaction; custom input blocking; Responses output blocking; bounded redaction growth reported as indeterminate; saved input/output reload; and an invalid regex save leaving the previous policy unchanged. Independent reads confirmed both saved stages and preserved model/Provider access. The workspace was restored to its original policy afterward; the demo workspace remained unchanged. Reviewed the detail page, preset/custom-action/protocol menus and editor at desktop and 390px widths. A source hot update retained the sample and selected protocol while the changed text appeared without a server rebuild.

Long synthetic samples use a bounded, internally scrolling text field. Reviewed a 20,000-character sample at desktop and 390px widths after capping its height.

All 175 dashboard tests pass, including 20 focused Guardrails cases covering permission controls, stage preservation/removal, custom rules, UTF-8 bounds, synthetic protocol payloads, invalid responses, stale tests and history/rollback behavior. These checks qualify this local text editor path. Key assignment history, complete denied-decision coverage, external detectors, output streaming, privacy/budget guarantees, retention/deletion and measured overhead remain open for full F09.

## Key assignment dashboard verification

The API-key detail page now shows mandatory workspace Guardrails and the additional key policy together, following OpenRouter's actual key detail pattern. Writers with an active key can choose a preserved workspace version, review its model/Provider restrictions and input/output rules, and explicitly save or remove the assignment. Version selection uses direct shadcn menu primitives and exclusive-cursor pagination. A pinned version stays pinned when the workspace head changes; removal leaves mandatory workspace enforcement intact.

Failed assignment/workspace reads do not show an empty policy or enable editing. Failed history/version reads prevent saving. Writes include the current assignment revision; a conflict disables further saves until an explicit reload, without an automatic write retry. Readers and inactive keys have no assignment control.

Verified through the running dashboard in an isolated workspace: saved version 7 while the workspace remained on version 8, retrieved it after fresh navigation, rejected a stale removal after a concurrent update, reloaded, and removed the assignment on mobile. Independent backend reads verified the preserved policy version, unchanged workspace head and three immutable assignment events. The temporary key was revoked afterward; the demo key and policy were unchanged. Reviewed the key card, assignment dialog and open menu at desktop and 390px widths. No model inference was required.

All 183 dashboard tests passed. Eight new focused cases cover scoped optimistic assignment, explicit-null removal, conflict recovery, reader/inactive-key controls, failed reads and older-version pagination. After adding full rule descriptions to the review, the eight focused cases and dashboard type checking passed again. This verifies the tested assignment path; it does not qualify full F09 or replace live enforcement acceptance. Assignment-history UI and complete denied-decision coverage remain open.

## Blocked-request and inspection diagnosis verification

Guardrails and Logs now link to a scoped Blocked requests view. It shows the latest 100 recorded pre-dispatch blocks with a readable reason, key name, one timestamp and preserved workspace/key policy versions. It explicitly distinguishes this bounded coverage from dispatched requests. The reason appears first so mobile users can diagnose a block before scrolling to policy columns. Failed reads or an unexpected coverage contract never become an empty-success state.

Logs request details now show recorded access attribution separately from input/output inspection. Missing historical attribution or inspection stays unavailable. A blocked or indeterminate output is explicitly described as withheld, with incurred usage and customer charges retained. No original content, identifiers or confidential Supplier costs are added by this decision UI. Execution completion is distinct from output inspection; the following verification covers withheld-output labelling and filtering.

Live checks in the isolated workspace recorded an input-pattern denial and an incompatible streaming request before dispatch, with no new dispatched attempts. A real Gemini request then exposed unsupported OpenRouter Chat envelope labels. The engine now accepts bounded textual Provider and native finish-reason labels and includes them in inspection; nested/oversized labels and unknown fields remain unsupported. OpenRouter's [response schema](https://openrouter.ai/docs/api_reference/overview) documents the native finish reason. No upstream source was copied.

After the compatibility fix, a real request recorded input redaction and an output pattern block; the response was withheld and its customer charge remained USD 0.000008. The original isolated workspace policy body was restored, temporary keys revoked, and demo configuration unchanged. Browser review covered actual allowed attribution without content inspection, an indeterminate output and the corrected pattern block, desktop/narrow decision details, the real pre-dispatch table, cross-navigation and a longer mobile date range. The Logs toolbar now wraps controls to avoid clipping that range.

All 192 dashboard tests passed; nine new focused diagnosis cases cover safe labels, scope navigation, failed/malformed reads, missing historical protection and stale responses. Those focused cases passed again after the final navigation changes, and dashboard type checking passed. The PostgreSQL-backed gateway suite passed 132 tests plus process replacement, including supplemental-label redaction/blocking and fail-closed shape/bounds cases. Full F09 remains open: dispatch-time denied-transition auditing, complete retention/deletion, detectors, streaming/privacy/budget controls and measured overhead still require implementation or qualification.

## Withheld-output Logs status and filtering verification

Request metadata now includes the nullable immutable output-inspection outcome, without original content, confidential costs or additional identifiers. Logs labels blocked/indeterminate responses as Output withheld and marks redacted output. Provider execution remains unchanged for accounting, and request details call it Provider status. The existing completed-execution filter is labelled Provider completed; it can legitimately include withheld output. Null inspection metadata does not establish delivery or content protection.

The API and JavaScript SDK accept `status=output_withheld`. One scoped predicate applies to rows and the complete summary, including charges, token/model/key breakdowns and histogram. One-row pages over the two live withheld responses retained a full-range count of two and customer charges of USD 0.000016; traversal contained no duplicate attempt. The packed SDK's usage example reproduced those filtered totals without inference. Temporary test configuration and demo data were unchanged by this read-only qualification.

Filters now use route query parameters as their source of truth and preserve unrelated parameters. The Logs route no longer remounts for each filter change. A mobile selection wrote `status=output_withheld`; a fresh navigation restored its chip and two matching rows. Desktop keeps nested shadcn menus; narrow screens use a category followed by choices within one menu, matching the actual OpenRouter filter drilldown pattern. Reviewed both open states and fixed mobile clipping without changing item gutters or spacing.

All 194 dashboard tests passed, including withholding/redaction labels, retained charges and the mobile category/choice flow. After extending the URL assertions, all 15 focused Logs cases passed again. The PostgreSQL-backed gateway suite passed 132 tests plus process replacement, with added charged block/indeterminate pagination, exact full-range aggregates, scoped isolation, redaction metadata and API serialization cases. All 52 JavaScript SDK tests passed. This qualifies recorded output-inspection status and the tested filters; complete request delivery/cancellation semantics, dispatch-time denial auditing and full F06/F09 acceptance remain open.

## Packaged read-only history example

The SDK includes `examples/inspect-guardrails.mjs` for immutable workspace policy history and optional key assignment history. It follows exclusive cursors, rejects non-descending cursors, and prints names, revision numbers and change dates without rule patterns, internal identifiers or credentials. It makes no configuration changes or inference calls.

The extracted SDK tarball ran against the live isolated review workspace: 12 policy revisions and assignment revisions 3, 2 and 1 were returned. The latest assignment retained its cleared policy as null. Output checks confirmed the supplied credential and key identifier were absent. JavaScript syntax and public-boundary checks passed. This qualifies the example on recorded live history, not large-history pagination, the missing dashboard assignment-history view, or the full F09/F10 gates.

The SDK suite now includes four executable history-example checks using a local HTTP fixture: two-page policy and assignment traversal with exclusive cursors; missing optional key history versus empty recorded history; rejection of looping cursors without printing partial success; and propagation of access rejection without fabricating an empty result. All 56 SDK tests passed. Fixture checks verify reads only and explicit output allowlisting even when the API response contains extra internal identifiers or policy content. Live evidence above remains the proof of actual stored history; fixture pagination does not establish a large live history acceptance pass.

Dispatch-denial auditing remains open: the transition triggers raise policy conflicts inside the admission transaction, so an audit inserted in that same rejected transaction would roll back. Completion must retain the rejected transition and its checked policy attribution outside the failed transaction, cover both priced and unpriced admissions (including batched status returns), and test race, cancellation and storage-failure behavior without dispatching upstream or fabricating a current-policy snapshot as historical evidence. The existing preparation-denial feed must retain its explicit narrower coverage until this is implemented and qualified.

## Distinct dispatch-rejection metadata

Migration 0066 gives the live access and inspected-binding trigger rejections a dedicated internal SQLSTATE, with a content-free detail containing a fixed reason and checked workspace/key policy and assignment revisions. The checks retain their existing lock and fail-closed behavior. Storage maps the dedicated code to the existing conflict response, so no public API shape or error behavior changes. Other admission conflicts retain their original code.

All nine PostgreSQL policy and admission-order tests passed, including explicit verification of the dedicated error code and exact workspace/key revision metadata for parent and key-policy rejection. Metadata has only four permitted fields and contains no policy body, request content or credential. Migration 0066 is applied in the development database. This enables accurate rejection classification; it does not yet persist denied transitions outside failed transactions or expand the preparation-only denial feed. Durable audit recording and investigation remain required for F09.

The full gateway suite also passed all 132 tests plus process replacement after this change. Workspace Clippy passed across all targets with warnings denied; public-boundary and diff-whitespace checks passed.

## Durable denial for the prepared dispatch transition

Migration 0067 adds immutable, content-free dispatch-rejection records and a database transition function used by `Store::mark_dispatched`. Existing ordered workspace/key/account/attempt locks are retained. A policy rejection rolls back only the attempted update in a subtransaction; its dedicated checked metadata is inserted outside that subtransaction and committed before the caller receives the existing conflict response. The attempt remains `not_sent`, and no allowed-dispatch attribution is created. Unrelated conflicts are not recorded as policy denials.

Nine PostgreSQL Guardrail/admission-order tests passed, including parent/key denials that retain exact checked revisions and resist deletion of audit records. No request text, policy patterns or credentials enter the audit table. This qualifies that prepared-transition storage path only. Priced reservation admission, unpriced batch admission, interruption/storage-failure qualification, scoped read APIs and rendered investigation remain unfinished. The current preparation-only feed has not been relabelled as covering all dispatch denials.

The full gateway regression passed 132 tests plus process replacement; workspace Clippy passed with warnings denied. Migration 0067 is applied locally. Public-boundary and diff-whitespace checks passed.

## Durable priced-admission denial

Migration 0068 adds an audited wrapper around priced reservation/dispatch. Only dedicated policy rejections are caught; their failed subtransaction rolls back reservation insertion, budget changes and dispatch intent before immutable checked metadata is saved. The storage call reads the explicit result and preserves the existing conflict response. Budget, authorization, invalid-price and unrelated admission failures retain their existing error behavior.

Five PostgreSQL Guardrail tests passed. The priced fixture proves a rejection leaves the attempt `not_sent`, no reservation, zero reserved/spent budget amounts and one exact policy-revision audit record. After an explicit allowing-policy activation, a deliberate retry dispatches and reserves the expected amount while retaining exactly the original denial event. Full gateway regression passed 132 tests plus process replacement, workspace Clippy passed with warnings denied, and migration 0068 is applied locally. Public-boundary and diff-whitespace checks passed. Unpriced batch admission, interruption/storage-failure audit qualification and rendered investigation remain required; F09 is incomplete.

## Rejection metadata after activation lock waits

Migration 0069 declares the metadata helper volatile so its reads use a fresh snapshot after policy coordination. The new PostgreSQL concurrency fixture holds the real workspace advisory lock, observes dispatch waiting in `pg_locks`, commits a mandatory policy revision, and verifies rejection records that committed revision while leaving the attempt unsent. It does not infer a wait from a sleep. All six policy tests passed, including the priced reservation rollback and explicit retry case. Public-boundary and diff-whitespace checks passed. Batch admission and complete audit investigation remain open.

## Rolled-back batch policy-error auditing

Migration 0070 adds immutable batch rejection records without an attempt foreign key: a failed batch can roll back its attempt rows. Dedicated policy-error metadata now includes internal scope/key attribution in addition to the fixed reason and checked revisions. Storage validates that attribution against the submitted batch, explicitly rolls back the failed admission transaction, then persists the single actual rejection before returning conflict. It neither fabricates attempts nor assigns the rejection to every batch member. These identifiers remain internal and are not added to customer API responses. This supersedes the earlier four-field internal-detail shape; its three attribution fields are needed to identify the actual rejected scope/key.

Eleven PostgreSQL policy/admission-order tests passed. The stale-inspection batch case retains `policy_changed` and the checked revision while leaving both attempt rows and inspection bindings rolled back. Prepared and priced denial tests still pass. This covers policy exceptions, not all per-row conflict statuses returned by admission eligibility checks. Complete status-denial auditing, cancellation/storage-failure qualification, scoped investigation APIs and dashboard review remain open.

Full gateway regression passed 132 tests plus process replacement. Workspace Clippy passed with warnings denied, public-boundary/diff-whitespace checks passed, and migration 0070 is applied locally.

## Scoped dispatch-denial reads

Added the read-only `/guardrails/dispatch-denials` administration endpoint and JavaScript SDK method. It returns at most 100 combined immutable dispatch and batch policy exceptions, with readable key/policy names, checked revisions, fixed reasons and explicit `latest_100_dispatch_policy_exceptions` coverage. Internal event/attempt/key/actor identifiers, policy bodies, request content, credentials and commercial records are omitted by storage serialization. Cache-Control is no-store. The preparation-denial endpoint remains unchanged.

The routed PostgreSQL authorization test uses actual workspace-reader and inference credentials: inference cannot read, the reader cannot read another workspace, and authorized reads contain the recorded name/revision without private identifiers or credentials. The first run caught a coverage-label mismatch, corrected before delivery. SDK tests passed all 57 cases, including scope/cancellation/coverage for the new method. The contract parses, and public-boundary checks pass. Combined-feed limit/order qualification, rendered investigation, per-row status auditing and interruption/storage-failure acceptance remain open.

The corrected full gateway run passed 133 tests plus process replacement, and workspace Clippy passed with warnings denied. Diff-whitespace checks passed.

## Combined denial-feed qualification

The PostgreSQL feed fixture now inserts 110 immutable records across dispatch and batch tables plus a newer record in another workspace. It proves the limit of 100 is applied after combining sources, chronology is descending across source boundaries, historical policy names/revisions survive later activation, missing key-policy metadata stays null, and workspace isolation excludes the newer external record. Explicit output-field checks exclude internal identifiers and credentials. Updating batch denial history is rejected. All seven PostgreSQL policy tests passed; public-boundary and diff-whitespace checks passed. Fixture records exist only in isolated test databases and do not replace live workflow evidence.

This closes the focused combined-feed limit/order/storage-isolation check. The customer investigation UI, status-denial completeness, interruption/failure qualification and full F09 remain open.

## Combined dashboard investigation

Blocked requests now reads both preparation denials and recorded dispatch policy exceptions, sorts them chronologically and caps the combined view at 100. Reasons identify missing required inspection, changed policies or model/Provider access rejection. A compact stage label distinguishes preparation, dispatch and batch admission. One timestamp remains per row; readable historical key/policy labels are preserved. The introduction explicitly notes incomplete admission-denial coverage and points output blocks to Logs. A failed/unsupported feed produces an error, never an empty or apparently complete partial list. Superseded workspace responses are discarded.

Reviewed actual OpenRouter Activity/Guardrails and the established Niu table layout before editing. OpenRouter’s current account has an empty Guardrails setup state, so the populated view retains the existing Niu investigation table rather than fabricating reference statistics. Live desktop and 390px reviews verified the combined records, wrapped cells and horizontally reachable policy columns. An isolated review key with a saved mandatory input policy produced an actual missing-inspection dispatch rejection through the database transition; the resulting immutable record was fetched through the workspace API and rendered above older preparation blocks. No LLM call or demo policy change occurred, and the temporary key was revoked.

The dashboard suite passed 194 tests before the final two cases; all six focused denial tests then passed, including chronological stage merging, partial-read failure, refresh and stale-response handling. Dashboard type checking passed. Per-row admission-status auditing, full interruption/failure acceptance and full F09 remain open.

## Key assignment-history view

API key details now expose a read-only Assignment history dialog, including inactive keys and readers. It loads only on open, follows exclusive assignment cursors, distinguishes removal from assignment, and shows saved policy names/versions, actor names and one change date. Failures retain an explicit error and retry; invalid/non-descending cursors do not duplicate history. No internal identifiers or raw policy bodies are rendered. Closing or changing scope cancels stale reads.

Inspected actual OpenRouter key management and the existing Niu saved-policy history dialog before implementation; the new view uses the same installed Dialog/Table pattern. A live revoked review key displayed its three stored assignment/removal events. Desktop and 390px browser review verified hierarchy, wrapping, horizontal access to dates, close behavior and inactive-key access. No assignment was modified. Eleven focused key/history tests and dashboard type checking passed; public-boundary and diff-whitespace checks passed. Large live histories and the full reader/writer workflow remain to be qualified as part of F02/F09.

Assignment-history lifecycle qualification now includes two additional tests: changing key scope discards the older response; closing aborts the read, and reopening loads fresh history without allowing a late closed response to repopulate it. All five history-view tests passed, followed by the full dashboard suite: 201 tests across 39 files, none skipped.

Key-assignment history now sends explicit Cache-Control no-store. The routed PostgreSQL reader/history regression passed, checking both initial and older pages, including the 104-event cursor case and cross-workspace rejection. This is backend pagination evidence; it does not replace large rendered-history review. Public-boundary and diff-whitespace checks passed.

## Assignment history after key rotation — 2026-10-03

Key rotation already preserved the active assignment but omitted its initial history entry on the replacement key. Rotation now creates a System assignment event from the copied assignment in the same transaction that revokes the old key and issues its replacement. The original key's immutable history remains attached to the original key. Cleared assignments preserve their revision and null policy; rotation does not resurrect a removed policy. Existing previously rotated keys are not backfilled by this change.

All seven storage Guardrails tests passed, including inherited assignment history, cleared-policy rotation, reopened reads, cross-workspace exclusion and concurrent assignment updates. The separate concurrent rotation regression passed: exactly one replacement wins, permissions and absolute expiry remain unchanged, and revocation remains effective. The routed gateway creation/rotation/revocation test and storage Clippy with warnings denied passed. Public-boundary and changed-file whitespace checks passed. These controlled backend checks do not close F02/F09 or qualify the complete rendered rotation journey.

## Audit-write failure and pre-admission interruption — 2026-10-04

Two new PostgreSQL regressions in `crates/storage/tests/guardrail_audit_failures.rs` exercise prepared dispatch, priced reservation/dispatch and a two-member unpriced batch against an active mandatory model denial.

A test-only trigger rejects insertion into either immutable denial table. Every admission call returns the injected database failure rather than acknowledging dispatch or claiming a saved audit. Prepared/priced attempts remain `not_sent`; both batch operations and attempts roll back. No cost reservation, reserved/spent budget amount or allowed-dispatch decision survives. Removing the fault and deliberately retrying returns the policy conflict and exactly one checked denial with the actual revision. The audit outage is not misrepresented as an empty successful denial record.

The interruption check holds the real workspace policy advisory lock, observes the admission backend waiting in `pg_locks`, and cancels that specific database query. All three admission paths return PostgreSQL cancellation. The same no-dispatch/no-reservation invariants hold, with no fabricated policy audit for a check that did not run. Releasing the lock and retrying records the actual checked denial. The test observes the wait rather than assuming one from elapsed time.

All 14 PostgreSQL Guardrails, admission-order and failure tests passed. This qualifies injected audit-storage failure and database cancellation before admission for these storage APIs. It does not qualify an HTTP client disconnect, process termination, connection loss after commit, acknowledgement loss, all per-row eligibility statuses, or gateway egress under those failures. A request admitted before cancellation can retain uncertain execution/liability; this evidence makes no claim that cancellation unsends it. F09 remains incomplete. Test triggers and synthetic data exist only in isolated test databases; no development policy, Supplier configuration or inference was changed.
