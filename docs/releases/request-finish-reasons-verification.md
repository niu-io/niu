# Request finish-reason storage checkpoint

## Responses interruption collection — 2026-10-07

Nonstreaming Responses now supplies payload-independent metadata for explicit
`incomplete_details.reason` values: `max_output_tokens` normalizes to `length`
and `content_filter` retains that category. These meanings follow the
[official structured-output guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
Index zero represents the response as a whole, not an output-item position.
Completed status alone does not invent a stop reason. Missing, conflicting error,
unknown, steering and message-limit observations remain unknown; no arbitrary
upstream string or content is saved in finish metadata.

Both finish-metadata parser tests passed. A fresh isolated PostgreSQL router test
also passed for token-limit and content-filter responses with
`x-niu-log-payloads: false`: reopened storage returned each normalized observation
and both attempts had zero retained payload rows. Gateway compilation, SDK type
checking and changed-file public-boundary checks passed. The two routed Responses
PostgreSQL regressions passed together, preserving the existing opt-in text and
usage-accounting checks. A separate fresh storage test passed explicit deletion
and retention expiry: after purge and store reopening, finish metadata remained
scoped and immutable; late payload writes could not reopen the original retention
window, and foreign-workspace reads returned no metadata. Native streaming and
live upstream coverage remain required. The broader isolated PostgreSQL
`web::tests::inference::` run then passed all **19 matching database tests**,
including Responses, streaming tool deltas, tools, payload controls, customer-response
sanitization and Guardrail paths. Non-database parser tests and other gateway
modules are outside that run's scope; this is not whole-gateway qualification.
This increment does not qualify the entire F06 workflow or
supersede earlier checkpoint limitations beyond this nonstreaming subset.

2026-10-04. F06 remains incomplete.

Migration 0074 adds content-free completion observations keyed to their existing attempt. The storage API accepts only allowlisted terminal reasons with unique choice indexes, bounds each observation to 128 choices, and normalizes ordering. Explicit null, unknown strings, missing indexes, duplicate indexes, errors and oversized choice arrays remain unknown rather than becoming successful completion evidence. It does not change token usage, pricing or execution state.

A parser regression passed. A PostgreSQL integration fixture applied the current migrations and verified rejection before completion, cross-workspace read/write isolation, identical replay, conflicting replay rejection and invalid empty/duplicate observations. Reopening the storage connection retained the observation when no payload had ever been saved; usage remained unknown. This is connection-level durability with an actual database, not a process-restart or packaged recovery claim.

Nonstreaming Chat collection is wired as described below. Streaming choice aggregation is wired as described below. Request-summary/export contracts and SDK fields are wired as described below. Rendered Logs diagnosis is wired as described below. This checkpoint must not be described as a user-visible finish-reason feature or full protocol qualification. Responses/native protocol stop semantics also remain separate work.

## Nonstreaming Chat collection

Complete nonstreaming Chat response paths extract only allowlisted choice indexes/reasons and save them after completion acknowledgement. This includes an authoritative terminal upstream completion whose content fails the requested output contract. Unknown/malformed metadata remains absent. Saving metadata does not infer missing usage, alter customer charges, retain content or trigger another inference request. A failed observation write logs only the internal attempt reference and a fixed message; it does not change delivery/accounting. The completion and observation writes are separate, so an interrupted observation write can leave metadata unknown rather than retroactively claiming coverage.

The routed PostgreSQL tool-call fixture passed with `x-niu-log-payloads: false`: its tool-call reason persisted and its payload row count was zero. All 21 current inference regressions passed with PostgreSQL cases included; the gateway check also passed. This establishes this local fixture path and regression compatibility, not real upstream/model qualification, all native stop semantics, streaming collection, SDK/export coverage or a user-visible Logs feature. Responses, Embeddings and the separate Codex adapter currently supply no finish-reason observation.

## Streaming Chat collection

The bounded Chat SSE inspector tracks each observed choice index independently. It emits finish metadata only after `[DONE]` and only when every observed choice has an explicit allowlisted reason. Missing/null finishes, unknown reason strings, malformed/duplicate indexes and contradictory reasons remain unknown. Choice count is bounded at 128; usage-only events do not invent a choice. Existing wire sanitization and accounting semantics remain unchanged. Collection writes occur after completion acknowledgement, with the same interrupted-observation coverage limitation as nonstreaming collection.

All nine streaming parser regressions passed, including every fragment width for a two-choice stream, separate stop/length finishes, content exclusion, incomplete observations and contradictory terminal reasons. The routed PostgreSQL tool-stream fixture passed with unchanged wire bytes, durable tool-call finish metadata and zero payload rows after explicit opt-out. The priced-stream regression passed across ten local wire fixtures: the new length-limit observation persisted alongside exact settlement, while the previous incomplete/contradictory usage, identity, BOM and post-DONE checks retained their accounting behavior. These local fixtures do not qualify real external model streams or expose the metadata in Logs yet.

A concurrent migration-number collision was discovered during qualification. The development database already contained the finish-reason migration as 0074, so its identity/checksum was preserved; the unapplied registration-ownership migration was moved to 0075 without changing its SQL. Both database fixtures and all 32 release-script tests passed afterward, including migration-history checks. No migration row was deleted or rewritten.

## Scoped request API and CSV

Scoped request entries now include nullable `finish_reasons`, preserving explicit indexes and allowlisted reasons without content or Supplier commercial fields. CSV appends a Finish reasons JSON column after the existing token-category columns; previous column positions remain stable. An absent observation is JSON null in the API and a blank CSV cell. The SDK type and public OpenAPI schema describe the same bounded nullable array; the SDK README distinguishes token limits and tool handoffs from task acceptance or delivery success.

All three PostgreSQL request/export regressions passed. The extended reader-authorized fixture returns a known length observation in JSON and correctly quoted CSV; unknown rows remain null/blank. Existing cross-workspace rejection, exact large charges, sorting, formula-cell protection and the 10,000-row rejection boundary remain covered. All 70 SDK tests passed with its rebuilt types. The updated YAML schema parsed successfully, and the source/build-input boundary scan passed across 973 files. No new paid inference was issued.

This qualifies these fixture-backed API/export contracts. Live upstream metadata coverage, rendered Logs finish-reason presentation and live installed-client workflows remain open. No full F06 gate is closed.

## Packed SDK contract

A newly packed SDK was extracted outside the workspace. All 70 tests passed using its distributed ESM files, with the existing contract fixture copied beside the external harness; no source implementation was imported. An isolated TypeScript consumer compiled against the packed declarations, accepting nullable finish observations and rejecting arbitrary reason strings and nonnumeric choice indexes. The distributed dist/examples/README boundary scan passed across 28 files.

Tarball SHA-256: `25bb10717601ed69af33d9136be7140a803944566748065b60890fe09bacbf4d`. This verifies this package's type/export/test behavior, not a live upstream inference or installed-client workflow. Rendered Logs diagnosis and full F06/F10 remain open.

## Rendered Logs and one real upstream request

The actual OpenRouter Logs table and generation-detail sheet were inspected before the UI change. Niu uses its existing Overview definition list for Finish reason rather than adding a new card. Labels distinguish Stopped, Token limit reached, Tool calls, Content filter and Function call. Multiple choices are listed separately using readable choice numbers; absent observations say Not reported and never inherit the previous request's reason.

Dashboard typechecking and all 31 Logs interaction tests passed. The extended fixture verifies separate length/tool-choice labels and unknown values after next-request navigation. The running detail sheet was visually checked at confirmed 1280- and 390-pixel widths with a real known reason; the new row remained aligned and the phone document had no horizontal overflow. Next request changed to a historical unknown observation. Multiple-choice browser rendering remains separate from the fixture check.

One synthetic nonstreaming request used the saved OpenRouter demo route for `google/gemini-2.5-flash`, a temporary model-scoped key, an output-token bound of one and payload logging disabled. The upstream request completed; its persisted finish was length, with four input tokens and one output token. Logs showed Token limit reached and CSV preserved the same per-choice metadata/counts. The exact pinned customer tariff reconciled to 3,700 USD nanounits (USD 0.0000037). The retained-payload count was zero and the temporary key was revoked. No invoice, payment or Supplier configuration was written.

An initial verification read used the unsupported `api_key_id` query name and returned HTTP 400. Read-only recovery used the existing saved request and the documented `key_id` export filter; inference was not repeated. Historical requests were not backfilled from expired payloads. This qualifies one actual model/nonstreaming/token-limit diagnosis, not real tool/content-filter/multi-choice/streaming coverage, ordinary-role rendered acceptance, native stop semantics or the full F06 gate.

## Output after a reported choice finish

Streaming finish metadata now becomes unknown if the same choice emits new text, reasoning, refusal, tool-call or legacy function-call output after its reported terminal reason. Repeated identical terminal observations with no new output remain valid. This ambiguity affects finish-reason coverage only; independently valid terminal usage, token categories and customer settlement are preserved.

All ten streaming parser tests passed. The new regression fragments each contradiction at every byte width, checks unknown finish metadata and unchanged usage, and verifies harmless terminal replay. The priced PostgreSQL regression passed across eleven wire fixtures, including post-finish output: its finish observation was absent while its valid usage and exact customer charge still settled. No live inference was sent for this malformed-stream check. Broader real upstream/protocol qualification remains open.

## Explicit payload deletion and late capture — 2026-10-06

The fresh PostgreSQL durability fixture now also saves actual synthetic request/response content, confirms it is readable, deletes it through the scoped storage API, and attempts a late recapture. Content remains absent after that retry. Reopening the store still returns the immutable token-limit finish observation; cross-workspace reads remain empty and missing token usage remains unknown. The focused integration test passed with current migrations. This adds actual deletion evidence to the previous payload-opt-out checkpoint, without claiming Responses/native stop semantics, complete retention qualification or F06 completion.

## Saved streaming Logs diagnosis — 2026-10-06

The running dashboard was inspected using existing owner-funded streaming requests, without new inference or configuration writes. Desktop and 390-pixel phone details showed a known stop reason, token/cache/reasoning counts, preparation/first-output/output-stream timing, and Own API key rather than a customer charge. Messages displayed the retained request and assistant output; Raw data exposed the retained structured request and SSE response, including terminal metadata, without a Supplier purchase-price field. Next-request navigation updated model, timing, counts and payloads. The settled phone sheet retained its header/close control, readable overview, timing labels and tab access; the desktop rail was hidden. Temporary tabs were closed and viewport overrides reset. This is an installation-session rendered review of two saved successful streams, not ordinary-role authorization, all protocols, failure/unknown investigation, retained-content deletion or complete F06 acceptance.
