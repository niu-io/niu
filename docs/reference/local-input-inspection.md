# Local content inspection coverage

Workspace Guardrail policies may include `input_rules` for bounded local text inspection on Chat (including Dashboard Chat), Responses and Embeddings. Rules run before dispatch, transformed-request validation and request bounds. Policies without input rules retain their existing access-only behavior. This is limited pattern matching, not universal secret, PII or injection detection.

| Protocol | Extracted text | Unsupported content |
| --- | --- | --- |
| Chat | System, developer, user, assistant and tool message string content; explicit text parts | Tools/functions declarations, tool-call objects, image/audio/file parts, null content and unknown message fields |
| Responses | Instructions, plain string input, self-contained message strings and `input_text` parts | Tools, conversation or previous-response references, prompt templates, tool events, images/files and unknown message fields |
| Embeddings | String input or a nonempty batch of strings | Token-ID arrays, mixed text/token batches and nested arrays |

Extraction returns a transformed copy. Block rules inspect original text before any redaction, including every batch member. Redaction preserves Unicode boundaries, message roles and protocol fields; it changes matched text to `[REDACTED]`. This is deterministic pattern matching, not universal secret, PII or injection detection.

Synthetic preview uses the shared rule configuration, effective-policy compiler and protocol inspector intended for dispatch integration. Rules are compiled together rather than running one policy's redaction before another policy's block rules. This preserves original-text block precedence across the effective set; the combined limit is 32 rules and overflow fails rather than truncating restrictions. Strict versioned preset parsing and ambiguous pattern/preset rejection are shared. The shared compiler is now also used by live inference.

On 2026-10-03, 15 focused Guardrail tests passed after the refactor. New fixtures verify original-text block precedence across all three protocols, unchanged input on denial, Unicode redaction, exact preset serialization, combined rule overflow and unknown/ambiguous configuration rejection. The synthetic JavaScript SDK example passed against the running server without inference or policy writes. That checkpoint covered the engine and preview only; live integration evidence is recorded below.

The engine limits patterns to 4,096 bytes, compiled regex/DFA size to 256 KiB each, regex nesting to 64 and rules to 32. Extracted original and transformed text are each bounded to 1 MiB in aggregate. Chat content paths are bounded to 4,096; Embeddings batches are bounded to 4,096 strings. Invalid patterns, unsupported content, denials and resource limits are distinct internal outcomes. Integration must expose safe reason codes without matched text.

Live integration binds the inspected policy revision to dispatch, combines mandatory workspace and assigned-key rules, revalidates transformed protocol objects and recomputes request bounds. Payload retention receives transformed content through a server-only response extension, replacing the original middleware capture. Correlated allowed/redacted inspection metadata is available through the authorized request-decision API; investigation UI and performance qualification remain open. External detectors and output inspection require separate contracts and qualification.

Access-policy preparation now reads mandatory workspace and assigned-key policies, policy revisions and assignment revision in one key/workspace-scoped database snapshot. A key from another workspace produces no snapshot. Dispatch rechecks current access rules under its existing coordination locks. Gateway admissions additionally bind the inspected workspace policy, key policy and key-assignment revisions to the attempt. The dispatch transition rejects a changed revision, even when the replacement policy still allows access. Revision binding also protects live input-rule inspection from policy changes.

The snapshot change passed four PostgreSQL Guardrail storage tests and the full gateway suite (121 tests plus the process-replacement integration test) on 2026-10-02. Assertions cover different workspace/current and pinned-key policy revisions, unassigned keys and negative cross-workspace reads. Existing dispatch-race and zero-upstream-call access-denial tests remain passing. This evidence concerns access-policy snapshots, not live prompt inspection.

## Preparation denial audit

Access and input-policy denials before admission are stored as immutable, workspace-scoped metadata. The record contains policy/assignment revisions, a fixed reason (`model_denied`, `provider_denied`, `unsupported_policy`, `input_blocked`, `input_unsupported`, `input_resource_limit` or `input_unavailable`) and server receipt time. No prompt, original/matched text, route credential or detector result is retained. An audit write failure still prevents inference dispatch.

Workspace readers can GET `/admin/v1/organizations/{organization}/projects/{project}/guardrails/denials` to inspect the latest 100 preparation denials, with meaningful key/policy names and `Cache-Control: no-store`. The response omits event/key identifiers and declares its limited coverage. These records are pre-admission decisions and have no attempt; dispatch-time race denials are not covered by this endpoint. Input denials declare `coverage: local_input` and `enforcer_version: local-input-v1`; access denials retain their separate coverage.

On 2026-10-03, the full gateway suite passed (121 tests and process-replacement integration). The access-denial fixture verified ten durable decisions across Chat, Responses and Embeddings with zero upstream calls, immutable update/delete rejection, authorized reader access, inference-key rejection and negative cross-workspace reads. The running development server also served the bounded denial read with `no-store`; its OpenAPI reference resolved. Input/output decisions, full request correlation, dashboard investigation and dispatch-race-denial attribution remain unqualified.

The JavaScript SDK's `listGuardrailPreparationDenials(scope, options)` preserves coverage, nullable policy metadata and cancellation without sending a body. Its built client read the running server successfully on 2026-10-03; all 47 SDK tests passed, including scoped routing and invalid-scope rejection for this reader.

## Synthetic API test

Authorized workspace readers can POST to `/admin/v1/organizations/{organization}/projects/{project}/guardrails/input-preview` with `protocol` (`chat`, `responses` or `embeddings`), up to 32 `rules` (`pattern` and `action`) and a synthetic `request`. The response contains only `outcome`, `reason`, `redacted`, `synthetic: true` and `enforcement: false`, with `Cache-Control: no-store`. Unsupported content and resource limits return an indeterminate outcome; invalid patterns are rejected. The endpoint saves neither content nor policy and dispatches no inference or detector calls. It does not activate rules or establish live request protection.

Synthetic tests run on a bounded blocking-worker pool, outside async request threads. Each gateway process allows four running jobs and rejects excess work without queueing. A five-second response deadline returns an unavailable error; already running computation retains its slot until it finishes, including when a caller disconnects. These bounds are resource isolation, not a measured throughput or latency guarantee.

## Versioned synthetic presets

A rule supplies exactly one `pattern` or `preset`, plus `action: block` or `redact`.
`email_v1` matches common email-shaped text; example addresses can match, while
internationalized addresses and incomplete forms are not covered. `api_key_prefix_v1`
matches selected `sk-`, `sk-or-v1-`, `sk-proj-`, `ghp_` and `github_pat_` forms with
at least 16 following token characters. Unknown prefixes, opaque secrets, encoded
content and credentials in unsupported protocol parts are outside its coverage.
`niu_api_key_v1` separately matches Niu inference-key syntax: `niu_` followed by exactly 64 lowercase hexadecimal characters at word boundaries. Short examples, longer words, nonhexadecimal suffixes and encoded credentials are not covered. A syntactic match does not establish validity or ownership. Existing `api_key_prefix_v1` behavior is unchanged.
These presets are available to synthetic tests and active `input_rules`; their stated coverage limitations apply to both.

Malformed synthetic requests return a generic validation error after workspace authorization. Parser details, submitted enum values and field names are not echoed. This prevents invalid synthetic input from becoming an error-response content leak.

## Dispatch revision binding

Gateway preparation records immutable revision metadata without request content. Priced attempts bind after preparation; unpriced batches insert bindings and admit requests in one database transaction. A dispatch trigger compares these revisions after the existing policy coordination locks are acquired. A mismatch fails before upstream dispatch. Failed batch admissions roll back both attempts and bindings; prepared attempts remain `not_sent`. Compatibility storage callers without a binding continue to receive existing access checks and are not qualified for future content enforcement.

On 2026-10-03, three PostgreSQL tests verified workspace activation after inspection, changed key assignments, immutable bindings, transaction rollback, prepared-attempt denial and sixteen opposing concurrent two-workspace batches. Active content policies now reject compatibility admission without an inspection binding. Detector/output controls, dashboard management and performance acceptance remain open.

## Live integration evidence

On 2026-10-03, the full gateway suite passed 124 tests plus process replacement. A controlled upstream fixture exercised Chat, Responses and Embeddings, plus streaming Dashboard Chat denial: blocked requests made zero upstream calls, mandatory key blocking saw original text before workspace redaction, unsupported image content failed closed, and allowed text redaction reached all three upstream protocol paths. The fixture waited for all three retained request bodies and verified none contained the original matched text. Four PostgreSQL binding tests passed, including rejection of compatibility admission without inspection. JavaScript type checking and 47 SDK tests passed. The running development gateway applied the migrations and returned a healthy response on port 2566.

This verifies the bounded local text subset, not the whole F09 gate. External detectors, output filtering, correlated investigation UI, retention acceptance and measured overhead remain unqualified. The input worker pool permits four jobs per process; busy, timed-out or failed jobs deny dispatch. Already-running jobs retain their slot until completion.

## Allowed input attribution

The authorized request-decision reader now includes nullable `input_inspection` metadata: `outcome` (`allowed` or `redacted`), `coverage: local_text`, `enforcer_version: local-input-v1` and nonnegative `elapsed_ms`. Duration measures the local worker phase, including request cloning and effective-rule compilation, rather than upstream generation. Original or matched text, patterns and credentials are excluded. Metadata is stored with the immutable inspected revision binding, so later policy changes do not rewrite it. Historical attempts and access-only bindings remain null; no inspection evidence is fabricated.

Active input policies require both matching revision bindings and a recorded inspection result before dispatch. A matching snapshot alone is insufficient. Metadata constraints require outcome and duration together. This does not establish full detector coverage or complete the Guardrails gate.

The attribution update passed five PostgreSQL admission/binding tests, all 124 gateway tests and the process-replacement test on 2026-10-03. Fixtures assert actual unchanged-input and redacted-input outcomes, nonnegative duration, omission of matched content, rejection of missing results and malformed nullable metadata, revision-change denial and concurrent batch lock ordering. JavaScript type checking and all 47 SDK tests passed; the development gateway remained healthy after applying the migrations. No UI change or performance qualification is claimed by this checkpoint.

## Policy validation execution

Structural policy checks run before regex work: version/name/access values, rule count, source exclusivity and pattern byte size are bounded without compiling expressions. Live requests compile the combined effective rules once inside their bounded inspection worker. Authorized activation, policy preview, rollback and key assignment compile policies inside the bounded administration/synthetic worker pool. Access-only policies do not schedule regex jobs. Busy, deadline and worker failures return unavailable before any policy write; jobs retain their slots until completion even if callers stop waiting.

On 2026-10-03, all 124 gateway tests and the process-replacement test passed after moving compilation off async request workers. The administration fixture verified role checks before invalid-regex validation, generic errors without submitted pattern text, and unchanged policy state on rejection. Port 2566 remained healthy. These are execution/resource-isolation checks, not measured latency or throughput acceptance.

## Complete-output engine preparation

A test-only output-inspection module now extracts complete textual Chat and Responses candidates. Chat extraction covers every choice's content, refusal and visible reasoning strings; Responses extraction covers message text/refusal parts and a duplicated `output_text` field. The engine evaluates original text across candidates before applying redaction, preserves supported JSON structure and numeric usage, and bounds both serialized original and transformed objects to 1 MiB. Supported schemas are strict: tools, opaque reasoning objects, audio, annotations, nonempty token log probabilities, unknown content/fields and Embeddings outputs are rejected. Responses also accepts explicitly typed standard configuration metadata, inspects string instructions/user values and metadata values, and supports visible reasoning summaries. Unknown or opaque fields remain unsupported; this is not universal Responses compatibility.

Four focused engine tests passed on 2026-10-03, covering Unicode, multiple candidates, refusals, visible reasoning, duplicated/nested output text, block precedence, unchanged originals, unsupported/malformed structures and size/redaction growth. That checkpoint covered the engine only. The live complete-buffer integration and its narrower qualification are recorded below; streaming inspection and detectors remain unfinished.

## Live complete-buffered output

Policy activation supports explicit `output: { mode: buffered_full, rules: [...] }`. Rules use the same bounded regex/presets and block/redact actions as input rules. Workspace and pinned-key output rules compose; at most 32 combined output rules are supported. Unknown modes and empty output rule sets are invalid. Output policies are pinned with the inspected request revision binding, and compatibility admissions without a required binding are rejected.

Supported complete textual Chat and Responses bodies are held before client delivery and inspected on a bounded worker. Serialized original and transformed inspection objects are limited to 1 MiB; the existing upstream JSON reader separately permits up to 16 MiB before protocol validation. This is not a claim that total response memory is limited to 1 MiB. Streaming, tool requests, structured-output requests and Embeddings are incompatible with this mode and rejected before inference. Unsupported response envelopes/content, oversized output and unavailable inspection fail closed after inference; they can still incur charges. The strict textual envelope listed above remains the qualified subset, rather than universal model/Responses compatibility.

Output decisions are immutable, scoped to the attempt and exposed through the authorized request-decision reader. `output_inspection` declares outcome, safe reason, `buffered_full`, `local_text`, `local-output-v1` and elapsed time. No original output, pattern or match is stored in this metadata. Historical/access-only attempts stay null. Payload retention sees only delivered redacted JSON or a generic denial, and transformed responses discard an obsolete content-length header.

On 2026-10-03, all 129 gateway tests and process replacement passed. A priced controlled-upstream fixture exercised Chat and Responses block/redact delivery, pre-dispatch streaming/tool rejection with zero upstream calls, oversized and unknown-field failures, immutable audit, six upstream calls without retry/fallback, and retained payloads without withheld content. All six attempts retained reported usage, settled procurement liabilities at their own rates, and recorded independent customer charges at the published customer tariff. Blocking output did not release or erase incurred spend. This fixture does not qualify a real Supplier/model matrix, output streaming, external detectors, UI management or measured performance.

## Responses envelope compatibility

The complete-buffer inspector accepts typed standard Responses configuration fields alongside generated messages: nullable scalar settings, bounded reference strings, enumerated configuration labels, empty tools, plain-text output configuration and bounded string metadata. Echoed instruction/user text, metadata values and visible `summary_text` reasoning summaries are inspected together with candidate text. Metadata labels and opaque reference identifiers are not content-inspection coverage. Nonempty raw/encrypted reasoning, unsupported tools/output formats, prompt objects, nonnull error objects, unknown fields and malformed configuration remain indeterminate and withheld. Metadata uses conservative UTF-8 byte limits (16 entries, 64-byte keys, 512-byte values), and transformed metadata is revalidated after redaction.

The protocol reference is [OpenRouter's Open Responses item specification](https://github.com/openrouterteam/skills/blob/main/open-responses/references/protocol-and-items.md), checked 2026-10-03. This implementation covers explicit supported fields rather than importing its source or promising every extension. Structured-output requests are rejected before inference when a required buffered policy is active; changing JSON text could violate its requested format, and that integration remains unqualified.

All 130 gateway tests and process replacement passed after this change on 2026-10-03. The full charged-output fixture now uses standard response metadata and verifies that echoed protected text is absent from delivered and retained bodies. The new engine fixture covers visible summaries, escaped metadata keys, preserving usage/configuration, opaque-field denial and redaction expansion beyond metadata limits. A structured-output request fixture proves rejection before upstream calls. Real Supplier/model envelope qualification, detector/streaming controls and full F09 remain open.

## Policy composition and administration rejection

The live charged-output fixture additionally pins a blocking key policy while the current workspace policy redacts the same text. The original output is blocked, the reader preserves different workspace/key revisions, and incurred usage remains recorded. After clearing the optional assignment, a separate unpriced alias in an unbudgeted workspace still redacts output and records its independent customer tariff. No procurement hold is fabricated for that unpriced request. A budgeted workspace rejects unpriced dispatch rather than bypassing bounded reservations; this does not qualify a universal customer hard cap.

Guardrail activation, access preview, rollback and key assignment now handle JSON parser rejections inside their authorized handlers. Invalid fields/types return generic `400` errors without submitted values; unauthorized callers receive `401` before these errors are interpreted. Rejections leave active policy state unchanged. The existing assignment fixture now expects the contract's generic invalid-request status rather than the framework's previous `422` parser response.

All 130 gateway tests and the process-replacement test passed on 2026-10-03 after these changes. The output fixture verifies eight upstream calls without denied-output retries, independent customer charges across two scopes, and the pinned-key block. Administration fixtures cover malformed data across all four endpoints, generic errors without marker text, unauthorized credentials and unchanged active revision. The development service remained healthy on port 2566. Detector/output streaming, dashboard workflows, real model qualification and measured overhead remain open.

## Synthetic output preview

The read-authorized workspace `guardrails/output-preview` endpoint and SDK `previewGuardrailOutput` test complete Chat or Responses output with the same buffered inspector used at dispatch. A test requires 1–32 rules and returns safe outcome/reason/redaction metadata, explicit buffered/local-text coverage and synthetic/non-enforcement flags. It does not activate a policy, dispatch inference, persist content or create an output decision. Original, transformed and matched text are excluded from the response. Compilation and inspection share the existing four-slot, no-queue bounded worker pool with a five-second response deadline; slots remain held until computation finishes after cancellation.

The synthetic request envelope has Niu's 1 MiB HTTP limit. Serialized original/transformed inspection objects also have the 1 MiB engine limit; redaction expansion can exceed it even when the request fits. Invalid rules/protocols/envelopes are rejected; unsupported tool/opaque content and inspection resource limits return an indeterminate result. This preview does not qualify streaming output or external detectors.

Qualification: all 131 gateway tests plus process replacement and all 51 JavaScript SDK tests passed. Output-preview fixtures cover block/redact/unchanged Chat, Responses text/refusal/visible reasoning, unsupported tools, redaction growth, workspace readers, cross-workspace and inference-key rejection, malformed rules and generic errors without submitted values. Policy state, inference activity and output-decision storage remain unchanged. A live-service check independently confirmed block/redact/unsupported outcomes and unchanged policy/audit/customer-charge counts. The packed SDK's included output-test example ran against the live gateway using synthetic content only. The local text rule editor and synthetic sample controls are now verified in the [dashboard evidence](../releases/guardrails-dashboard-verification.md). Full F09 management and engine/data/performance qualification remain open.

## Worker deadline and failure recovery

Fresh worker regressions exercise the actual five-second response deadline with a controlled blocking job. Deadline expiry returns `WorkerError::Deadline` while keeping its concurrency permit held; additional work returns Busy without being queued. Releasing the blocked job restores capacity and subsequent work succeeds. A synthetic worker panic returns only `WorkerError::Failed`, releases its permit and permits subsequent work. The existing cancelled-waiter regression also passes.

All 11 local-input inspection tests passed, and gateway Clippy passed for all targets with warnings denied. These are worker-capacity and return-value checks; the panic fixture uses a nonsensitive message and does not qualify arbitrary panic-hook log content, external detector recovery, live endpoint overload/cancellation behavior or performance thresholds. Full F09 remains open.

## Niu credential preset verification

The separate `niu_api_key_v1` preset is supported by the backend policy/preview API and JavaScript SDK. Unit checks cover block, Unicode-preserving redaction, exact length/character boundaries, wire parsing and unchanged older-preset behavior. A PostgreSQL routed fixture places an actual issued inference key into Chat, Responses and Embeddings inputs; each is blocked before upstream dispatch or attempt creation. Error responses and safe denial metadata exclude the key. Both focused gateway tests, all 70 SDK tests and gateway Clippy passed.

Live synthetic input-redaction and output-block previews passed with generic key-shaped fixture text and no-store responses. Saved policy and activity summaries stayed unchanged; no inference was sent. The dashboard preset chooser is now covered by the follow-up below. Full security/data/detector acceptance remains open.

## Niu-key dashboard preset follow-up

Input and output rule editors now expose Niu API keys as a separate preset with the existing Block/Redact action menu. OpenRouter's actual Guardrail draft, Sensitive Info Detection checkbox/action states and synthetic-test layout were inspected before editing. Niu retains its established rule editor and installed choice-menu primitives.

All 28 Guardrail dashboard tests and dashboard typechecking passed. New input/output cases verify the versioned preset and selected action reach the correct synthetic endpoint; removing the preset invalidates its result. Initial test fixtures had incorrect result text and omitted mandatory output coverage fields; those fixtures were corrected without relaxing response validation.

The running editor was inspected at desktop and 390px, including the open action menus. Desktop input Block, mobile input Redact and mobile output Block tests produced their expected real API results using synthetic key-shaped text. Drafts were discarded without saving. The saved workspace policy stayed unconfigured and request history stayed at 35; no inference was sent. This supersedes the missing preset-chooser qualification above, but does not establish a saved-policy browser activation/rollback journey or full F09 acceptance.

## Non-enforcing complete-output observation

Explicit `observe_only` output policies use the same bounded local Chat/Responses inspector, with a separate immutable observation record. Matching or indeterminate output is delivered unchanged unless an independent enforcement policy withholds it. Observation sees original text and cannot weaken mandatory parent enforcement. Streaming, tools, structured-output requests and Embeddings remain incompatible; this is not streaming or detector coverage. Synthetic previews accept either mode and default to buffered enforcement. See [current backend/SDK evidence and dashboard limitations](../releases/output-observation-verification.md).
