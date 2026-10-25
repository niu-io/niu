# Release checklist

This is the permanent release acceptance entry point for Niu. Keep this path stable across releases. Execution state and ownership live in Beads; this document is its generated, reviewable view, not a separate backlog.

## Execution procedure

1. Identify the live immutable core, website and composition revisions. Record them on the release-gate parent before executing acceptance. A changed candidate invalidates prior GREEN evidence.
2. Claim each required case in Beads and execute its complete acceptance scope against the actual hosted candidate with fresh inputs. Prefer free upstream models and bounded test workspaces; distinguish simulated payment settlement from real merchant settlement.
3. Independently inspect the final artifacts: saved responses, downloaded bytes, persisted settings, request logs and applicable ledger entries. Record timestamp, inputs, observed outcome, artifact verification and evidence reference. Fixture-test outcomes have zero evidentiary value.
4. Search existing findings before publishing a reproducible defect in the owning GitHub repository. Link the finding to the bead. Keep credentials, private identifiers and customer information out of public evidence.
5. Mark GREEN and close a case only when its entire acceptance scope is verified for the candidate. Record partial progress in Beads notes; partial success remains non-green. Fixes require deployed regression verification.
6. Refresh this document and evaluate the gate with the command below. Exit 0 means every required case has qualifying GREEN evidence; nonzero blocks release. This command validates recorded evidence; it does not execute the product journeys or replace review of the evidence.

```sh
python3 scripts/release-checklist.py --check
```

For a new release, preserve historical evidence in Beads, update the candidate and re-execute required cases. Use `--parent` for a replacement release-gate epic; never shrink scope merely to obtain GREEN.

## Current execution

Last generated: 2026-10-24T15:02:40+00:00.

**Release decision: NOT ELIGIBLE**

Generated read-only snapshot of Beads `niu-4do`. Edit evidence and execution state in Beads, then regenerate. This report does not run tests.

All required items must be GREEN for the actual candidate. RED, BLOCKED, UNTESTED, missing, duplicate, stale or unverified evidence blocks release. A closed bug or passing fixture suite cannot establish GREEN. Scope may not be removed to manufacture a pass.

Candidate: core `8d44fe86575c8ea5b6f2b4dd5312b281fefa245d`, website `369b3671a0592bd7dee1be35d188a08ce491d036`, composition `9a4aaf8b3f62d952bd271b1792272dca78b89f0c`.

Counts: GREEN 29, RED 11; required 40.

| Check | Result | Journey | Bead |
| --- | --- | --- | --- |
| [x] REL-01 | GREEN | Release provenance and live health | niu-4do.1 |
| [ ] PUB-01 | RED | Marketing navigation and responsive pages | niu-4do.2 |
| [ ] CAT-01 | RED | Catalog search, filters and persistence | niu-4do.3 |
| [x] CAT-02 | GREEN | Model details and launch handoff | niu-4do.4 |
| [ ] DOC-01 | RED | Documentation and SDK guides | niu-4do.5 |
| [ ] HELP-01 | RED | Embedded Help | niu-4do.6 |
| [x] AUTH-01 | GREEN | Login, logout and session boundaries | niu-4do.7 |
| [x] AUTH-02 | GREEN | Profile, language and theme persistence | niu-4do.8 |
| [ ] SEC-01 | RED | Role and tenant isolation | niu-4do.9 |
| [x] WS-01 | GREEN | Workspace lifecycle and readable URLs | niu-4do.10 |
| [x] MEM-01 | GREEN | Members, roles and revocation | niu-4do.11 |
| [x] KEY-01 | GREEN | API key creation and restrictions | niu-4do.12 |
| [x] KEY-02 | GREEN | API key rotation and revocation | niu-4do.13 |
| [x] INF-01 | GREEN | Model discovery and non-streaming text | niu-4do.14 |
| [ ] INF-02 | RED | Streaming, stop and cancellation | niu-4do.15 |
| [x] INF-03 | GREEN | Tools and structured output | niu-4do.16 |
| [x] INF-04 | GREEN | Embeddings | niu-4do.17 |
| [x] CHAT-01 | GREEN | Chat history and durable sessions | niu-4do.18 |
| [x] CHAT-02 | GREEN | Attachments and multimodal inputs | niu-4do.19 |
| [x] MEDIA-01 | GREEN | Image and audio capability boundaries | niu-4do.20 |
| [x] MEDIA-02 | GREEN | Video and Provider-native operations | niu-4do.21 |
| [x] LIB-01 | GREEN | Library and saved artifacts | niu-4do.22 |
| [x] OBS-01 | GREEN | Request logs and Activity | niu-4do.23 |
| [x] OBS-02 | GREEN | Usage, costs and exports | niu-4do.24 |
| [x] BILL-01 | GREEN | Charging, reservations and adjustments | niu-4do.25 |
| [x] PAY-01 | GREEN | Mock activation and durable selection | niu-4do.26 |
| [x] PAY-02 | GREEN | Mock settlement idempotency | niu-4do.27 |
| [ ] PAY-03 | RED | Unpaid checkout recovery | niu-4do.28 |
| [x] PAY-04 | GREEN | Real merchant capability boundaries | niu-4do.29 |
| [x] GUARD-01 | GREEN | Guardrail configuration and enforcement | niu-4do.30 |
| [x] PROV-01 | GREEN | Provider credentials and route readiness | niu-4do.31 |
| [x] PROV-02 | GREEN | Provider portal and commercial boundaries | niu-4do.32 |
| [x] POOL-01 | GREEN | Routing pools and fallback | niu-4do.33 |
| [x] ADMIN-01 | GREEN | Customer and account administration | niu-4do.34 |
| [ ] ADMIN-02 | RED | Pricing, reports and audit | niu-4do.35 |
| [x] ADMIN-03 | GREEN | Branding and installation settings | niu-4do.36 |
| [x] SDK-01 | GREEN | API and SDK real consumer | niu-4do.37 |
| [ ] UX-01 | RED | Responsive navigation and keyboard | niu-4do.38 |
| [ ] REC-01 | RED | Network, empty and failure recovery | niu-4do.39 |
| [ ] REG-01 | RED | Published defect regression closure | niu-4do.40 |

## Dated run record

2026-10-24 continuation: all 40 current acceptance cases now have a verified outcome: 29 GREEN, 11 RED, 0 BLOCKED and 0 UNTESTED. Release remains NOT ELIGIBLE. The earlier six prerequisite-only results were not completed acceptance and have been superseded by the continuation below.

Three missing commercial cases are now GREEN after actual installation-authorized onboarding, customer browser login, mock settlement, seven real free-model requests, independent charging calculations, live reservation observation, key/workspace limit denials, refund replay and final ledger cleanup. Pricing and financial reporting were actually exercised and are RED: simulated funds are classified as verified cash receipts, reported as [Niu issue 116](https://github.com/niu-io/niu/issues/116).

Two media cases contained incorrect scope assumptions. MEDIA-01 now verifies truthful image/audio capability boundaries; it does not claim unsupported image/audio generation works. MEDIA-02 retains the actual positive video run and adds saved playback after key revocation, with explicit verification that upstream cancellation is not exposed. The rationale and original scope error are preserved in the [dated continuation evidence](ux/production-acceptance-completion-2026-10-24.md). No implemented failing journey was removed from the 40-case gate.

Independent commercial evidence: seven customer charges total 11273000 nanounits, matching per-request token and fee arithmetic. A 10192000-nanounit live hold settled to 3024000; the remaining hold was released. One 1050000-nanounit refund remained one entry after replay. Original statement lines stayed unchanged across a new price publication. Final isolated balance and reservations are zero after unused simulated funding was reversed.

Earlier positive coverage includes text/SSE/tools/schema, embeddings, image interpretation, document extraction, durable Chat, keys/members/workspaces, guardrails, routing, mock scenarios, exports and a real five-second video. Video/library downloads have identical SHA-256 96e4d3156ce834d5de3d124225d42cd358b954b4791d76ca3bf3eea2ebcfe094; inspected output is H.264, 864x496, 5.088 seconds and 975488 bytes.

Cleanup: all audit keys and temporary operators are revoked or expired; the new isolated customer's revoked key/session independently return 401. Test routes, pools and offer are disabled/paused; temporary Provider membership is inactive. Synthetic request, payment, statement and video history remains for reproduction. Demo login and original settings are restored. No unrelated supply or customer configuration changed.

Existing findings remain open, including public Niu issues 95, 98, 111–116 and website issue 5; restricted deployment findings are tracked separately. The gate requires deployed fixes and affected regression reruns before release. Documentation and portable Beads changes are local and unpushed; GitHub issue 116 and the deployment follow-up comment were published as requested.

## Acceptance and evidence

### REL-01 — Release provenance and live health

Identify the actual immutable core, website and composed deployment; health and required startup services agree with that candidate.

- 2026-10-24T12:56:21+00:00: Current Render live composition matches the immutable core and website release pins; served admin and authenticated APIs respond. Independent artifact: Live composition 9a4aaf8 with core 8d44fe86 and website 369b3671; no version inferred solely from About UI.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.25.

**Execution notes (partial progress does not establish GREEN):**

Current Render live composition matches the immutable core and website release pins; served admin and authenticated APIs respond.

### PUB-01 — Marketing navigation and responsive pages

Home, blog, comparisons, FAQ and conversion links reach the intended real destination at desktop and narrow widths.

- 2026-10-24T13:44:08+00:00: Enumerated 24 actual same-origin homepage destinations and independently fetched each: 23 returned HTTP 200 and the FAQ architecture destination returned 404. Independent artifact: Expanded the real plugin FAQ and followed Architecture overview in the browser; it navigated to /docs/concepts/architecture/ and rendered the documentation 404. Prior website issue remains reproducible.. Reference: https://github.com/niu-io/website/issues/5.

**Execution notes (partial progress does not establish GREEN):**

Enumerated 24 actual same-origin homepage destinations and independently fetched each: 23 returned HTTP 200 and the FAQ architecture destination returned 404.

### CAT-01 — Catalog search, filters and persistence

Exercise input/output modalities independently, provider filters, empty/reset states, refresh and copy with actual catalog results.

- 2026-10-24T14:11:37+00:00: On hosted public catalog, clicked Text input and Text output separately after clearing: both set generic text query and matched the same 24 of 26 models. Empty/reset and model-ID copy feedback were exercised; reload cleared the filter. Independent artifact: Actual rendered control state and result counts confirm directional filters are not independent. Existing finding A07 remains reproducible on the deployed candidate.. Reference: https://github.com/niu-io/niu/issues/98.

**Execution notes (partial progress does not establish GREEN):**

On hosted public catalog, clicked Text input and Text output separately after clearing: both set generic text query and matched the same 24 of 26 models. Empty/reset and model-ID copy feedback were exercised; reload cleared the filter.

### CAT-02 — Model details and launch handoff

Verify real model details, customer prices, capabilities and scoped launch target; unsupported capabilities must not be offered as working.

- 2026-10-24T14:12:23+00:00: Opened actual free text, embeddings and customer-funded model details. Free text Try in Chat preserved workspace/model and was used for a real reply; video handoff selected the correct native Video model. Embeddings detail truthfully offered model discovery and said no generation preview. Independent artifact: Customer-funded GPT-4.1 Mini detail displayed Not published for both prices and explicitly did not guarantee supply. No fabricated zero price or unsupported Chat preview was offered for embeddings. Route capabilities matched the independently successful free text/embedding/video calls.. Reference: docs/release-checklist.md#cat-02--model-details-and-launch-handoff.

**Execution notes (partial progress does not establish GREEN):**

Opened actual free text, embeddings and customer-funded model details. Free text Try in Chat preserved workspace/model and was used for a real reply; video handoff selected the correct native Video model. Embeddings detail truthfully offered model discovery and said no generation preview.

### DOC-01 — Documentation and SDK guides

Check search, deep links, localization, copied examples and rendered SDK headings against served artifacts; run a real documented consumer path.

- 2026-10-24T13:45:00+00:00: Clicked the introductory Chinese installation-setup link on the actual served getting-started guide. Independent artifact: Browser URL changed to #installation-setup-zh, scroll stayed zero, and independent DOM lookup confirmed no matching target; real Chinese section uses a different ID. Documentation acceptance remains failed even though the page itself returns 200.. Reference: https://github.com/niu-io/niu/issues/111.

**Execution notes (partial progress does not establish GREEN):**

Clicked the introductory Chinese installation-setup link on the actual served getting-started guide.

### HELP-01 — Embedded Help

Open and navigate real embedded documentation at desktop/narrow widths without frame refusal or lost navigation.

- 2026-10-24T13:15:34+00:00: Current hosted browser Help iframe displays niu.io refused to connect. Independent artifact: Independent GET of the actual iframe URL /docs/?embed=help returns HTTP 200 with X-Frame-Options DENY; no article renders.. Reference: https://github.com/niu-io/niu/issues/113.

**Execution notes (partial progress does not establish GREEN):**

Current hosted browser Help iframe displays niu.io refused to connect.

### AUTH-01 — Login, logout and session boundaries

Valid/invalid password, fresh login, reload, logout, protected deep link and expired/unauthorized session behavior.

- 2026-10-24T14:26:48+00:00: Signed out through the account menu, independently confirmed session endpoint 401, then opened a protected key deep link and was redirected to login. One intentionally invalid password showed a truthful mismatch error. Independent artifact: Valid demo login returned to the original protected key URL; full reload retained authenticated access and fresh session endpoint returned 200. Independently revoked scoped identities returned 401, demonstrating unauthorized-session rejection without relying on browser cache.. Reference: docs/release-checklist.md#auth-01--login-logout-and-session-boundaries.

**Execution notes (partial progress does not establish GREEN):**

Signed out through the account menu, independently confirmed session endpoint 401, then opened a protected key deep link and was redirected to login. One intentionally invalid password showed a truthful mismatch error.

### AUTH-02 — Profile, language and theme persistence

Save reversible profile/appearance settings, independently read persistence, revisit and restore original values; keyboard and mobile choices work.

- 2026-10-24T14:32:24+00:00: Changed demo display name, saved, reloaded and independently read backend profile; changed theme to Dark and verified backend preference plus rendered dark class after reload. Changed language to English and verified reload, then used keyboard End/Enter to restore Chinese. Independent artifact: Separately inspected the rendered appearance dialog and open language menu at an actual 390px viewport. Restored profile Demo and System theme, independently read persisted values. Keyboard evidence was at desktop; narrow menu evidence was visual and pointer-open, not a separate narrow keyboard pass.. Reference: docs/release-checklist.md#auth-02--profile-language-and-theme-persistence.

**Execution notes (partial progress does not establish GREEN):**

Changed demo display name, saved, reloaded and independently read backend profile; changed theme to Dark and verified backend preference plus rendered dark class after reload. Changed language to English and verified reload, then used keyboard End/Enter to restore Chinese at 390px.
Changed demo display name, saved, reloaded and independently read backend profile; changed theme to Dark and verified backend preference plus rendered dark class after reload. Changed language to English and verified reload, then used keyboard End/Enter to restore Chinese.

### SEC-01 — Role and tenant isolation

Ordinary customer, scoped member and provider roles cannot access installation or foreign-tenant data; independently verify backend denial and UI visibility.

- 2026-10-24T13:42:21+00:00: Fresh demo session still reports platform_admin=true and manage_operators=true; browser exposes installation administration and authenticated installation configuration reads return 200. Independent artifact: Independent scoped Viewer probes correctly deny installation operations and foreign workspace access, but the public demo identity remains installation-privileged; the deployment security finding is still unresolved.. Reference: Restricted deployment security finding, tracked separately from public customer data.

**Execution notes (partial progress does not establish GREEN):**

Fresh demo session still reports platform_admin=true and manage_operators=true; browser exposes installation administration and authenticated installation configuration reads return 200.

### WS-01 — Workspace lifecycle and readable URLs

Create a test workspace, rename, preserve/edit stable slug, switch, revisit and archive/delete only owned test resources; verify backend state.

- 2026-10-24T14:15:51+00:00: Created owned audit workspace, renamed it without changing its saved slug, revisited and restored its name. Created a separate empty workspace through UI: Chinese name generated pinyin slug, explicit edited slug was preserved in the destination URL. Independent artifact: Deleted only that empty test workspace through typed-name confirmation; independent workspace list no longer contains it. Main audit workspace remains with original name and stable release-qa-20261024 slug; retained history was not deleted.. Reference: docs/release-checklist.md#ws-01--workspace-lifecycle-and-readable-urls.

**Execution notes (partial progress does not establish GREEN):**

Created owned audit workspace, renamed it without changing its saved slug, revisited and restored its name. Created a separate empty workspace through UI: Chinese name generated pinyin slug, explicit edited slug was preserved in the destination URL.

### MEM-01 — Members, roles and revocation

Exercise authorized test membership creation, role change and revocation; verify effective scope from the affected identity without contacting external people.

- 2026-10-24T13:42:19+00:00: Created a dedicated workspace-scoped Viewer and access session without sending messages; own workspace/list/assets read succeeded, installation endpoints and key creation were denied, and another workspace returned 404. Independent artifact: Changed Viewer to Admin in browser; same identity could then create a test key. Revoked membership in browser; same session immediately returned 401. Removed the role-probe key. Member UI and role-change audit agreed with backend enforcement.. Reference: docs/release-checklist.md#mem-01--members-roles-and-revocation.

**Execution notes (partial progress does not establish GREEN):**

Created a dedicated workspace-scoped Viewer and access session without sending messages; own workspace/list/assets read succeeded, installation endpoints and key creation were denied, and another workspace returned 404.

### KEY-01 — API key creation and restrictions

Create a least-privilege test key with explicit model/budget restrictions; verify saved metadata, secret handling and actual request enforcement.

- 2026-10-24T15:01:57+00:00: Completed the previously missing commercial budget enforcement with an isolated funded customer and real free upstream. Key and workspace limits each rejected actual requests with their distinct 402 error; restored limits allowed a real successful response. Earlier model, expiry, IP, rate and concurrency evidence remains applicable to the unchanged candidate. Independent artifact: Persisted limit revisions and independently read requests show the denials and subsequent completion. The final temporary key was revoked and independently returned 401.. Reference: docs/ux/production-acceptance-completion-2026-10-24.md.

**Execution notes (partial progress does not establish GREEN):**

Current hosted partial evidence: created model-restricted key through UI; persisted key list contains only qa/free-lfm-20261024. Allowed zero-price model returned exact expected response. Request using same key for another configured model rejected HTTP 404 not_found_error. Expiry, spending/concurrency limits and complete scope enforcement remain to verify.
Created restricted keys and independently read grants/limits; allowed free model succeeded, another model returned 404, RPM zero returned explicit 429 denial and policy restore was verified, concurrency bound denied excess requests. Dedicated 2-second key subsequently returned 401.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Completed the previously missing commercial budget enforcement with an isolated funded customer and real free upstream. Key and workspace limits each rejected actual requests with their distinct 402 error; restored limits allowed a real successful response. Earlier model, expiry, IP, rate and concurrency evidence remains applicable to the unchanged candidate.

### KEY-02 — API key rotation and revocation

Rotate a test key, verify old/new key behavior, revoke and verify denial; uncertain mutations must be recoverable without duplicate secrets.

- 2026-10-24T14:06:19+00:00: Rotated the owned audit key in the browser; old credential returned 401 and replacement produced ROTATION_OK before UI revocation. Repeated a second rotation with the same request key: 201 then 200, same replacement identity, no second secret; recovery returned that identity. Independent artifact: Independent recovery read matched the original mutation; after revocation both old and replacement credentials returned 401 from hosted model discovery.. Reference: docs/release-checklist.md#key-02--api-key-rotation-and-revocation.

**Execution notes (partial progress does not establish GREEN):**

2026-10-24 hosted current-candidate execution: rotated dedicated test key through list action and confirmation dialog; replacement secret displayed once. Old secret rejected chat/completions with HTTP 401; replacement returned HTTP 200 and ROTATION_OK from the free upstream. Revoked replacement through UI; both GET models and POST chat/completions then returned HTTP 401. Reloaded key list independently shows exactly the original and replacement records, both Revoked. Uncertain-response recovery/idempotent retry remains unverified; keep case non-green. Test secrets are stored outside the public tree and neither key remains active.
Rotated the owned audit key in the browser; old credential returned 401 and replacement produced ROTATION_OK before UI revocation. Repeated a second rotation with the same request key: 201 then 200, same replacement identity, no second secret; recovery returned that identity.

### INF-01 — Model discovery and non-streaming text

Use an actually available free upstream model for a fresh prompt; independently inspect final output, request record and customer accounting.

- 2026-10-24T13:45:55+00:00: Actual hosted non-streaming free-model request returned exact QA_OK_24 with stop termination; independently matched its 19 input and 74 output tokens to the saved request record and browser detail. Independent artifact: Workspace accounting and export identify own-Provider-key billing, zero unresolved/unpriced entries, no customer charges, no remaining reservations; account balances unchanged across the subsequent free-model probe batch.. Reference: docs/release-checklist.md#inf-01--model-discovery-and-non-streaming-text.

**Execution notes (partial progress does not establish GREEN):**

Current candidate hosted E2E 2026-10-24: created private zero-price OpenRouter liquid/lfm-2.5-2.6b:free route and model-restricted key in dedicated budgeted release QA workspace. First bounded request ended at token limit without answer; second max_tokens=256 returned HTTP 200, finish_reason stop, exact QA_OK_24. Independently opened workspace request logs: exactly two completed rows, usage 19/24 and 19/74 matches API responses, charge presentation Own API key. Accounting and final artifact reconciliation still pending; do not mark GREEN.
Actual hosted non-streaming free-model request returned exact QA_OK_24 with stop termination; independently matched its 19 input and 74 output tokens to the saved request record and browser detail.

### INF-02 — Streaming, stop and cancellation

Run fresh streaming inference, stop/cancel and exercise terminal states; inspect persisted partial/final output and reservation/accounting recovery.

- 2026-10-24T14:23:30+00:00: Successful hosted SSE returned STREAM_OK_24 and terminal DONE. Separate fresh browser cancellation clicked Stop generating during startup after one Send; actual inference still completed to its bounded output limit. Independent artifact: Independent backend reads show two sessions for the single unique cancellation prompt: one connecting with empty output and one complete, corroborated by run-1057. Earlier cancellation showed the same stranded duplicate. Recorded as core issue 115; no claim that client cancellation proves upstream nonexecution.. Reference: https://github.com/niu-io/niu/issues/115.

**Execution notes (partial progress does not establish GREEN):**

Hosted current-candidate partial evidence: SSE request to zero-price Liquid model returned HTTP 200, 16 SSE chunks, reconstructed exact STREAM_OK_24, and terminal [DONE]. Cancellation, reload persistence and reservation reconciliation remain unverified; not GREEN.
Successful hosted SSE returned STREAM_OK_24 and terminal DONE. Separate fresh browser cancellation clicked Stop generating during startup after one Send; actual inference still completed to its bounded output limit.

### INF-03 — Tools and structured output

Run a supported real tool/structured-output exchange; verify arguments/schema, final response and saved records.

- 2026-10-24T13:45:56+00:00: Enabled tool and schema declarations only for the dedicated free route after checking live upstream metadata. Actual structured request returned valid JSON answer 43; forced add_numbers tool call returned arguments a=17,b=26, and submitted tool result yielded final sum 43. Independent artifact: Three hosted successful requests and their actual response artifacts are saved; request list/export accounting records the corresponding free owner-funded attempts with no customer charge or unresolved reservations.. Reference: docs/release-checklist.md#inf-03--tools-and-structured-output.

**Execution notes (partial progress does not establish GREEN):**

Enabled tool and schema declarations only for the dedicated free route after checking live upstream metadata. Actual structured request returned valid JSON answer 43; forced add_numbers tool call returned arguments a=17,b=26, and submitted tool result yielded final sum 43.

### INF-04 — Embeddings

Use a configured real embeddings model and current input; inspect vector shape/values and corresponding usage/accounting.

- 2026-10-24T13:50:01+00:00: Configured a dedicated private route to live upstream zero-priced liquid/lfm-2.5-embedding-350m:free and submitted two fresh text inputs through Niu /v1/embeddings. Independent artifact: HTTP 200 returned two finite 1024-component vectors and 21 prompt tokens. Independently read hosted request record: confirmed_completed, 21 input/0 output tokens, owner_funded customer charge status.. Reference: docs/release-checklist.md#inf-04--embeddings.

**Execution notes (partial progress does not establish GREEN):**

Configured a dedicated private route to live upstream zero-priced liquid/lfm-2.5-embedding-350m:free and submitted two fresh text inputs through Niu /v1/embeddings.

### CHAT-01 — Chat history and durable sessions

Create and continue a fresh conversation, rename/reopen/archive/export it; verify backend persistence from a fresh page independent of browser cache.

- 2026-10-24T14:16:51+00:00: Created fresh conversation answering 17+26 with 43; renamed, exported, archived and restored it. A later continuation using an available restricted key correctly used the earlier answer and returned 86. Independent artifact: Fresh backend chat read contains three turns including original 43, transparently failed upstream attempt and successful continuation 86; full page reload retained 86. Export JSON independently matched original prompt/response and saved title. Archive/restore was independently checked.. Reference: docs/release-checklist.md#chat-01--chat-history-and-durable-sessions.

**Execution notes (partial progress does not establish GREEN):**

Hosted current-candidate partial evidence: opened Generations with dedicated workspace and restricted key; submitted current arithmetic prompt 17+26; actual upstream returned 43, Complete, 72 total tokens, Own API key billing, linked request run-1033. Reloaded saved chat-1003 URL: exact prompt and answer 43 persisted. Rename/archive/export/fresh independent backend artifact verification remain pending, so not GREEN.
Created fresh conversation answering 17+26 with 43; renamed, exported, archived and restored it. A later continuation using an available restricted key correctly used the earlier answer and returned 86.

### CHAT-02 — Attachments and multimodal inputs

Upload owned test text/image/document inputs to supported models; verify saved attachment, actual model interpretation, reload and deletion/recovery.

- 2026-10-24T14:21:40+00:00: Uploaded an owned red/blue image and a fresh text document through the real composer. Real model outputs identified left red/right blue and extracted ORCHID-4729 with quantity 37. Removed and reattached the draft document; bounded output-limit failure was shown truthfully before successful continuation. Independent artifact: Independent backend reads retained image bytes and text attachment content; saved document response survived a fresh page load. Deleted only the owned document conversation through UI confirmation: backend GET returned 404 and its saved URL showed unavailable/access recovery rather than restoring deleted content.. Reference: docs/release-checklist.md#chat-02--attachments-and-multimodal-inputs.

**Execution notes (partial progress does not establish GREEN):**

Uploaded an owned red/blue image and a fresh text document through the real composer. Real model outputs identified left red/right blue and extracted ORCHID-4729 with quantity 37. Removed and reattached the draft document; bounded output-limit failure was shown truthfully before successful continuation.

### MEDIA-01 — Image and audio capability boundaries

Verify the live API contract, configured output capabilities, generation entry points and rejection of unsupported image/audio generation requests. If image/audio generation is advertised or configured, require actual current-input downloadable outputs and independent media/accounting inspection; absent capabilities must not be claimed as working.

- 2026-10-24T15:02:02+00:00: Corrected erroneous generation scope to capability-boundary acceptance, with an explicit dated rationale. Current hosted OpenAPI has no image/audio generation endpoints, inventory has no corresponding output capability, and UI offers text tasks/Video. Independent artifact: Actual bounded image-generation and audio-speech probes using a valid key returned 404. This GREEN verifies truthful unsupported-capability boundaries only; no image/audio generation success is claimed.. Reference: docs/ux/production-acceptance-completion-2026-10-24.md.

**Execution notes (partial progress does not establish GREEN):**

Inspected live model catalog and configured capabilities: no image-output or audio-output route is configured. Attempted bounded image-generation and audio-speech endpoint requests with a test key; both returned 404.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Scope correction after the user challenged the plan: standalone image/audio output was incorrectly assumed. Current hosted contract, capability inventory, UI and actual 404 probes establish unsupported capability, not a missing test credential. GREEN here qualifies the truthful capability boundary only; it does not qualify image/audio generation.
Corrected erroneous generation scope to capability-boundary acceptance, with an explicit dated rationale. Current hosted OpenAPI has no image/audio generation endpoints, inventory has no corresponding output capability, and UI offers text tasks/Video.

### MEDIA-02 — Video and Provider-native operations

Exercise the supported video submission, completion, saved output and recovery against real upstream media; independently inspect downloaded artifacts and billing scope. Verify the live cancellation contract and distinguish deleting local results or saved input from upstream cancellation. If cancellation is exposed, exercise it on a bounded live job.

- 2026-10-24T15:02:04+00:00: Preserved actual fresh five-second video completion, original/library byte equality and inspected red-ball output. Reopened saved input after original key revocation and played the persisted result; UI disables new generation/Provider checks. Independent artifact: Playback independently reports 5.088 seconds, 864x496, readyState 4 and advancing currentTime. Current hosted contract has no upstream cancel operation; results deletion is explicitly separate. Acceptance corrected to supported lifecycle and truthful boundary, not fictional cancellation support.. Reference: docs/ux/production-acceptance-completion-2026-10-24.md.

**Execution notes (partial progress does not establish GREEN):**

Submitted exactly one fresh 5-second 480p native video, observed completion, downloaded and visually inspected the red-ball result. Saved it to workspace Library and restored its preview after reload without resubmission.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Scope correction: current video API exposes no upstream cancellation operation. Preserve positive real-video evidence and verify saved-history recovery after key revocation; never describe result deletion as job cancellation.
Preserved actual fresh five-second video completion, original/library byte equality and inspected red-ball output. Reopened saved input after original key revocation and played the persisted result; UI disables new generation/Provider checks.

### LIB-01 — Library and saved artifacts

Upload/list/filter/open/download/delete owned test artifacts; independently compare downloaded bytes and persistence/permissions.

- 2026-10-24T13:40:53+00:00: Uploaded a newly generated PNG through hosted asset API; browser library listed it, preview rendered the red/blue image, search found it and showed the no-match state, then rename survived reload. Independent artifact: Browser-downloaded PNG matched uploaded bytes exactly. Scoped viewer could read the same workspace asset. Browser deletion removed the row and a fresh content GET returned 404.. Reference: docs/release-checklist.md#lib-01--library-and-saved-artifacts.

**Execution notes (partial progress does not establish GREEN):**

Uploaded a newly generated PNG through hosted asset API; browser library listed it, preview rendered the red/blue image, search found it and showed the no-match state, then rename survived reload.

### OBS-01 — Request logs and Activity

Find current audit requests through workspace/global filters and detail views; verify timestamps, outcome, correlation and permission scope.

- 2026-10-24T14:07:49+00:00: Located current primary and fallback calls in workspace Logs using the actual Model menu; two matching rows, correct upstream identities, completed states, key names and local timestamps. Opened request detail and followed global Activity into the dedicated workspace. Independent artifact: Independent request API records match run-1052/run-1053, 16/44 and 23/36 token counts, UTC timestamps corresponding to rendered Asia/Shanghai time. Scoped viewer isolation was independently checked in MEM-01.. Reference: docs/release-checklist.md#obs-01--request-logs-and-activity.

**Execution notes (partial progress does not establish GREEN):**

Located current primary and fallback calls in workspace Logs using the actual Model menu; two matching rows, correct upstream identities, completed states, key names and local timestamps. Opened request detail and followed global Activity into the dedicated workspace.

### OBS-02 — Usage, costs and exports

Reconcile current request counts/customer charges across usage reports and exports; verify filter and timezone boundaries and no procurement disclosure.

- 2026-10-24T14:18:20+00:00: Reconciled the current 23-request checkpoint across workspace overview, global Activity workspace drilldown and independent request data: 17 reported and 6 unknown, 1097 input and 1420 output tokens. Filtered model-pool CSV contained exactly its two actual requests with matching tokens and no procurement fields. Independent artifact: CSV UTC times correspond exactly to Asia/Shanghai rendered timestamps. Today date filter retained current-day records; following-day range returned zero requests and correct empty report states. Customer charges remain owner-funded/not-charged, never substituted with upstream expenses. Later audit calls are outside this checkpoint.. Reference: docs/release-checklist.md#obs-02--usage-costs-and-exports.

**Execution notes (partial progress does not establish GREEN):**

Reconciled the current 23-request checkpoint across workspace overview, global Activity workspace drilldown and independent request data: 17 reported and 6 unknown, 1097 input and 1420 output tokens. Filtered model-pool CSV contained exactly its two actual requests with matching tokens and no procurement fields.

### BILL-01 — Charging, reservations and adjustments

Verify real request charging, failure/cancellation reservation release and authorized adjustment idempotency using independent final accounting artifacts.

- 2026-10-24T15:01:58+00:00: Executed seven real commercial requests after a hosted mock top-up. Independently recomputed all token charges and request fees; observed a live reservation, settlement and release; exercised refund, identical replay and over-refund rejection. Independent artifact: Seven charges total 11273000 nanounits; live hold 10192000 settled to 3024000; one refund 1050000 despite replay; over-refund 409; zero reconciliation discrepancies. Unused simulated funding reversal leaves final balance and reservations zero.. Reference: docs/ux/production-acceptance-completion-2026-10-24.md.

**Execution notes (partial progress does not establish GREEN):**

Attempted a real customer-funded GPT-4.1 Mini request with an owned zero-budget key; hosted gateway returned 503 service_not_ready before dispatch. Actual free personal calls and completed video correctly remain owner-funded with no Niu customer debit.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Executed seven real commercial requests after a hosted mock top-up. Independently recomputed all token charges and request fees; observed a live reservation, settlement and release; exercised refund, identical replay and over-refund rejection.

### PAY-01 — Mock activation and durable selection

Enable/disable through browser, restart and revisit; verify saved state, same-origin checkout and persistent simulated provenance.

- 2026-10-24T12:56:23+00:00: Current candidate browser enable/disable and service restart preserved selection and saved orders; re-enabled for authorized audit. Independent artifact: Post-restart API retained disabled state and historical simulated=true; final state enabled and ready.. Reference: https://github.com/niu-io/niu/issues/99#issuecomment-6384356589.

**Execution notes (partial progress does not establish GREEN):**

Current candidate browser enable/disable and service restart preserved selection and saved orders; re-enabled for authorized audit.

### PAY-02 — Mock settlement idempotency

Exercise success, duplicate, delayed and out-of-order notifications; independently reconcile each order, exact balance delta and one credit per paid intent.

- 2026-10-24T12:56:25+00:00: Current candidate fresh success, duplicate, delayed and out-of-order scenarios exercised. Independent artifact: Independent order, balance and transaction reads found each successful intent credited once and exact aggregate delta; other currencies unchanged.. Reference: https://github.com/niu-io/niu/issues/99#issuecomment-6384356589.

**Execution notes (partial progress does not establish GREEN):**

Current candidate fresh success, duplicate, delayed and out-of-order scenarios exercised.

### PAY-03 — Unpaid checkout recovery

Decline/cancel/timeout never credit; customer status and an authorized discoverable recovery action must agree with merchant evidence.

- 2026-10-24T12:56:26+00:00: Declined and cancelled intents remain pending; browser administrator reconciliation receives 403. Independent artifact: No unpaid credit, but terminal status and discoverable recovery acceptance fail.. Reference: https://github.com/niu-io/niu/issues/114.

**Execution notes (partial progress does not establish GREEN):**

Declined and cancelled intents remain pending; browser administrator reconciliation receives 403.

### PAY-04 — Real merchant capability boundaries

Configured real payment integrations require genuine merchant evidence. Disabled integrations must be truthful; mock evidence cannot qualify real-money collection.

- 2026-10-24T13:42:43+00:00: Inspected hosted payment integration API and rendered gateway cards: real Stripe, EPay and ZhifuX are unconfigured and unavailable for checkout; Mock payments is separately identified as enabled and simulated. Independent artifact: Independent integration/configuration responses agree on disabled real integrations and enabled mock card method; UI explicitly says no real merchant or money movement. This qualifies capability boundaries only, not real-money collection.. Reference: docs/release-checklist.md#pay-04--real-merchant-capability-boundaries.

**Execution notes (partial progress does not establish GREEN):**

Inspected hosted payment integration API and rendered gateway cards: real Stripe, EPay and ZhifuX are unconfigured and unavailable for checkout; Mock payments is separately identified as enabled and simulated.

### GUARD-01 — Guardrail configuration and enforcement

Create reversible scoped test policy, verify save/revisit, allowed and denied actual requests, rollback and visible diagnostics.

- 2026-10-24T13:40:18+00:00: Created and saved scoped input-block policy in browser; reloaded and independently read policy revision 1; actual matching inference returned 403 before dispatch, while nonmatching inference returned ALLOWED_QA. Independent artifact: Blocked-request UI linked the rejection to saved policy version 1. Removed rule through browser, saved rollback, and repeated formerly blocked input returned HTTP 200 and OK.. Reference: docs/release-checklist.md#guard-01--guardrail-configuration-and-enforcement.

**Execution notes (partial progress does not establish GREEN):**

Created and saved scoped input-block policy in browser; reloaded and independently read policy revision 1; actual matching inference returned 403 before dispatch, while nonmatching inference returned ALLOWED_QA.

### PROV-01 — Provider credentials and route readiness

Test bounded credential/route lifecycle and live qualification without exposing secrets or changing unrelated supply; readiness reflects actual current offers/routes.

- 2026-10-24T14:20:23+00:00: Configured private free text, vision and embedding routes on the existing own-account OpenRouter connection and verified real upstream outputs. Disabled the owned embedding route afterward; actual embeddings request then returned 404. Independent artifact: Created and replaced a dedicated disabled placeholder credential without dispatching it: revisions advanced, has_credential stayed true, enabled stayed false, and reads exposed no secret. Provider directory separately shows credential counts, qualification and offer readiness; own-account routes did not become qualified commercial supply. Disabled test credential and route remain recorded; unrelated supply unchanged.. Reference: docs/release-checklist.md#prov-01--provider-credentials-and-route-readiness.

**Execution notes (partial progress does not establish GREEN):**

Configured private free text, vision and embedding routes on the existing own-account OpenRouter connection and verified real upstream outputs. Disabled the owned embedding route afterward; actual embeddings request then returned 404.

### PROV-02 — Provider portal and commercial boundaries

Verify own-provider membership, offers, usage and settlement visibility; no foreign-provider or confidential platform procurement data leaks.

- 2026-10-24T14:14:03+00:00: Visited actual Provider usage, model offers and settlement history. Created a dedicated scoped viewer and granted only OpenRouter membership; its directory contained exactly one Provider. Independent artifact: Independent scoped-session reads: own offers, dashboard and settlements 200; foreign offers/dashboard/settlements 404; platform credential configuration 403. Viewer cannot read administration-only earnings endpoint. Membership disabled and temporary operator revoked after verification; no financial records were changed.. Reference: docs/release-checklist.md#prov-02--provider-portal-and-commercial-boundaries.

**Execution notes (partial progress does not establish GREEN):**

Visited actual Provider usage, model offers and settlement history. Created a dedicated scoped viewer and granted only OpenRouter membership; its directory contained exactly one Provider.

### POOL-01 — Routing pools and fallback

Verify scoped pool configuration and actual route/fallback outcomes with bounded current requests, preserving authorization and budget limits.

- 2026-10-24T14:18:07+00:00: Created a workspace-scoped pool with two private free-model candidates. First real request returned POOL_OK via primary Liquid route; disabled primary and next real request returned SECONDARY_OK via lower-priority NVIDIA route. Independent artifact: Independent request records run-1052 and run-1053 identify the distinct expected upstream models and complete outputs. Disabled owned pool after testing; actual request then returned 404 and stale revision update returned 409. No ambiguous upstream failure was replayed or treated as safe automatic retry.. Reference: docs/release-checklist.md#pool-01--routing-pools-and-fallback.

**Execution notes (partial progress does not establish GREEN):**

Created a workspace-scoped pool with two private free-model candidates. First real request returned POOL_OK via primary Liquid route; disabled primary and next real request returned SECONDARY_OK via lower-priority NVIDIA route.

### ADMIN-01 — Customer and account administration

Verify authorized customer onboarding, currency/account scope and persisted changes on owned test entities; customer UI does not reveal internal data.

- 2026-10-24T15:02:00+00:00: Installation-authorized onboarding created an isolated CNY customer/workspace and expiring customer session. Browser login and mock funding worked; rename persisted without changing slug; customer scope excluded foreign billing and platform administration. Independent artifact: Independent customer reads show only its workspace; foreign billing 404, Provider credential/pricing administration 403. Temporary identity revoked and independently denied 401; synthetic financial history retained.. Reference: docs/ux/production-acceptance-completion-2026-10-24.md.

**Execution notes (partial progress does not establish GREEN):**

Visited current customer administration as demo; the page requires installation administrator credentials and explicitly distinguishes separately funded company onboarding.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Installation-authorized onboarding created an isolated CNY customer/workspace and expiring customer session. Browser login and mock funding worked; rename persisted without changing slug; customer scope excluded foreign billing and platform administration.

### ADMIN-02 — Pricing, reports and audit

Validate reversible test pricing and matching customer-facing charges/reports/audit evidence; no confidential platform figures enter customer surfaces.

- 2026-10-24T15:02:01+00:00: Actual customer charges, immutable invoice lines, prospective price revision, browser statements and publication audit were verified. A fresh simulated top-up nevertheless appears as verified cash in financial reporting. Independent artifact: The order retains simulated=true, while its isolated two-second summary interval reports verified_cash_receipts_nanos=1000000000. Rendered reports use Verified cash receipts. New core issue 116 and bead niu-zr9 remain open.. Reference: https://github.com/niu-io/niu/issues/116.

**Execution notes (partial progress does not establish GREEN):**

Published a zero-valued CNY text price only for the isolated disabled QA pool, independently read its exact schedule and found the matching Standard published audit entry. Reviewed current financial reports, which separate owner-funded calls and show unavailable CNY quotes rather than inventing values.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Actual customer charges, immutable invoice lines, prospective price revision, browser statements and publication audit were verified. A fresh simulated top-up nevertheless appears as verified cash in financial reporting.

### ADMIN-03 — Branding and installation settings

Verify safe reversible settings, validation, save feedback and revisit; inspect exposed configuration without changing global secrets or brand assets.

- 2026-10-24T13:43:30+00:00: Inspected installation settings and branding controls; empty display name was rejected by browser validation. Saved default appearance Light through the installed choice menu and save action; independent backend read confirmed revision 1. Independent artifact: Restored original System appearance through revision-checked API, reloaded branding and independently read System and unchanged Niu display name. Existing logos/theme colors and currency were preserved; installation currency correctly shows migration-required read-only guidance.. Reference: docs/release-checklist.md#admin-03--branding-and-installation-settings.

**Execution notes (partial progress does not establish GREEN):**

Inspected installation settings and branding controls; empty display name was rejected by browser validation. Saved default appearance Light through the installed choice menu and save action; independent backend read confirmed revision 1.

### SDK-01 — API and SDK real consumer

Run a documented installed SDK/API consumer against the hosted service, with actual output, typed failures and correct authentication/scope.

- 2026-10-24T13:49:31+00:00: Followed served SDK quickstart: built and packed @niu-io/sdk 0.1.0, installed the actual tarball in an independent consumer directory, and ran NiuClient against hosted /v1. Independent artifact: Installed consumer listed exactly the three allowed QA models and returned SDK_OK_24 from actual free-model inference. Invalid credentials raised NiuAPIError with HTTP 401. Earlier bounded key correctly raised typed key_concurrency_exceeded 429 after unresolved attempts occupied both slots; this remains separate recovery evidence.. Reference: docs/release-checklist.md#sdk-01--api-and-sdk-real-consumer.

**Execution notes (partial progress does not establish GREEN):**

Followed served SDK quickstart: built and packed @niu-io/sdk 0.1.0, installed the actual tarball in an independent consumer directory, and ran NiuClient against hosted /v1.

### UX-01 — Responsive navigation and keyboard

Review affected task journeys at 1440/900/390px with navigation open/closed, menus/dialogs, focus, Escape, overflow, grouping and action emphasis.

- 2026-10-24T14:11:03+00:00: Inspected actual 390px Models ready-state shell and final open filter Sidebar. Filters render, but both product rail and account menu have zero rendered width and the sidebar offers no product/account navigation. Independent artifact: Rendered screenshot confirms no reachable Workspace, Generations, Credits/settings or sign-out controls in the model shell. Existing issue 112 updated with the narrower current ready-state evidence; desktop and settings-menu checks do not override this mobile failure.. Reference: https://github.com/niu-io/niu/issues/112.

**Execution notes (partial progress does not establish GREEN):**

Inspected actual 390px Models ready-state shell and final open filter Sidebar. Filters render, but both product rail and account menu have zero rendered width and the sidebar offers no product/account navigation.
Additional actual rendered verification at 1440px and 900px: workspace key content widths are 1116px with 1440px navigation open, 1372px collapsed, and 840px at 900px. At 900px the 790px table scroller contains 949px content; Status begins at x943, outside the viewport. Existing issue 98 A05 updated; no fixture evidence. Screenshots inspected for both desktop navigation states.

### REC-01 — Network, empty and failure recovery

Exercise observable offline/interruption/retry/empty/missing-config states without fabricated successful outputs or duplicate mutations.

- 2026-10-24T14:26:09+00:00: Forced actual browser offline state and confirmed a fresh session fetch failed. Library refresh showed gateway unavailable and retry guidance; restoring network and refreshing recovered the persisted video. Empty library/search/date ranges and deleted-session recovery were also exercised. Independent artifact: Interrupted Chat startup still produced a duplicate saved connecting session and completed inference (issue 115). Thus read recovery works, but interruption and mutation recovery acceptance is not fully satisfied.. Reference: https://github.com/niu-io/niu/issues/115.

**Execution notes (partial progress does not establish GREEN):**

Forced actual browser offline state and confirmed a fresh session fetch failed. Library refresh showed gateway unavailable and retry guidance; restoring network and refreshing recovered the persisted video. Empty library/search/date ranges and deleted-session recovery were also exercised.

### REG-01 — Published defect regression closure

Revalidate every discovered issue against the candidate; no unresolved required checklist defect may be counted green. Link actual closure evidence.

- 2026-10-24T14:28:37+00:00: Revalidated hosted FAQ navigation, Chinese quickstart anchor, Help embedding, mobile Models navigation, public directional filters, SDK constructor localization, unpaid mock recovery and restricted deployment security/readiness findings against the pinned candidate. New early-stop duplicate-session defect was reproduced and published as issue 115. Independent artifact: Existing owning-repository issues were updated instead of duplicated. Required known defects remain open and reproducible; no source-only fix, fixture result or unrelated successful journey qualifies closure. Public references omit restricted issue URLs and commercial data.. Reference: https://github.com/niu-io/niu/issues/115.

**Execution notes (partial progress does not establish GREEN):**

Revalidated hosted FAQ navigation, Chinese quickstart anchor, Help embedding, mobile Models navigation, public directional filters, SDK constructor localization, unpaid mock recovery and restricted deployment security/readiness findings against the pinned candidate. New early-stop duplicate-session defect was reproduced and published as issue 115.
