# Historical first-release evidence — 2026-10-02

Archived implementation notes and the former release memo. These checkpoints are historical observations, not current release status or proof that a complete gate passed. Use [the release checklist](first-release.md) for scope and remaining work. Do not append new progress notes here.

---

# First feature-complete Niu release

Status: release target, not a description of shipped capabilities.

Scope version: 0.10 (2026-10-02). Niu delivers lower-cost model APIs and transparent usage and billing, with free Agent Observability. The [product focus](../product/product-focus.md) defines the commercial and product boundary. Task orchestration and evaluation belong to external clients, not a later required Niu release gate.

## Objective and first-use path

A developer can install Niu, connect a qualified model route, create a workspace-scoped key, call a supported model API, and inspect durable usage, latency, failures and customer charges after refresh. First inference requires no agent, task ID, subscription, import, benchmark or private service.

The hosted service offers verified discounted model supply. Community operation remains independently usable with configured Suppliers. Routing among several Suppliers is optional; one qualified discounted offer can establish customer value. Price comparisons must be model-specific and evidence-backed.

## Product decisions

The primary paying customer builds applications or third-party tools that consume model APIs. Niu competes with OpenRouter through qualified discounted supply and clear customer usage and charges. Developers using coding-agent subscriptions are an audience for free Agent Observability and may become API customers through their own applications; reducing their subscription bill is not the commercial promise.

OpenRouter is the development testing Supplier because it exposes a broad model catalog. Use its published public model rates as the test Supplier rates, with no assumed discount. Preserve its saved configuration and use real requests to verify the product. This integration establishes functional coverage, not a discounted supply agreement or evidence of customer savings. Only models with enabled, tested routes may be presented as usable.

Niu remains a model API supply and observability product. Supen owns task planning, subagent/model-effort selection, idle-time work and task completion review. GitHub issues, dollars per completed task and task productivity are client concerns, not required Niu measurements. Niu does not require subscription quota contributions or sharing in exchange for free visibility.

## Agreed product structure and development acceptance

- **Suppliers** is the single model-supply feature at `/suppliers`, including OpenRouter as the testing Supplier. Do not introduce separate Providers, Connections, or Upstream Provider destinations. Keep adapter/API/storage compatibility names internally. Configuration, model routes, pricing and settlements remain accessible within the Supplier area; commercial permissions remain enforced separately.
- **Models** is global at `/models`. Workspaces manage application API keys and their associated access, Logs, Usage and Billing; a workspace does not own the model catalog. Legacy workspace model links redirect to `/models`.
- **Agent Observability** is a top-level feature at `/agent-observability`, separate from Workspace. Codex is a source label, not the feature name. Remove the unexplained Import workflow. Subscription comparisons show estimated API-equivalent usage, not money earned or cash saved. Workspace-key requests belong to that workspace's reporting scope.
- Use the agreed Lucide icons: `Warehouse` for Suppliers, `FolderKey` for Workspace, `HatGlasses` for Agent Observability, `Logs` for Logs, and `CreditCard` for Billing. Hide the rail on mobile; verify responsive navigation and relevant interaction states.
- Niu supplies lower-cost model APIs and makes consumption transparent. Agent task planning, execution, model/effort decisions and task acceptance belong to Supen or other clients. Subscription quota sharing and subscription cost optimization are outside this release scope. API-equivalent subscription visibility is a free discovery feature for developers who may also build API-backed applications.
- Discounted supply is the commercial differentiator. Same-model routing across several providers is optional, not assumed to be the primary savings mechanism. Supplier onboarding still requires the evidence and data-handling qualification in F07; a low price alone does not qualify supply.
- Keep the local product on **port 2566**, with a live managed source watcher. Preserve configured credentials and product data across rebuilds and restarts. Do not run a second product service on 2555 or reset the database as routine setup.
- Preserve the configured local demo login and saved OpenRouter credential. Keep an active default workspace API key and usable test model routes. Verify an actual authenticated Supplier → Models → API key → Chat/API request → Logs/Usage/Billing journey. Empty pages, HTTP 200 responses and successful builds alone are not feature acceptance evidence.

These are acceptance requirements, not claims that the running development service already satisfies them. Record concrete failures and fresh verification results before marking any gate complete.

## Agent Observability design and delivery — F08

Use AgentOps as the reference for the focused investigation workflow, preserving Niu's brand tokens, shared shadcn controls and navigation shell. The feature has two main routed pages beneath `/agent-observability`: **Metrics** and **Traces**. Connection setup is a settings surface reached through **Connect agent** or **Connection settings**, rather than another primary navigation destination. Codex and other agents are sources and filters. Personal observations remain owned by the signed-in individual, independent of the selected workspace.

| Surface | Route | Primary purpose |
| --- | --- | --- |
| Metrics | `/agent-observability` | Understand observed volume, failures, duration and measured usage/value over a selected period. |
| Traces | `/agent-observability/traces` | Find a run and investigate its nested events, timing and reported errors. |
| Connection settings | `/agent-observability/settings` | Connect a source, verify delivery and manage consent and collection access. |

The AgentOps reference establishes the run-table → detail-drawer → selected-event investigation pattern and a separate aggregate Metrics page. Keep Niu's initial navigation equally focused. Do not add Agents, Sessions, Evaluations, Prompt Management, MCP or Deployment pages merely because related products expose them. Add a separate destination only when a qualified Niu workflow requires it.

- **Metrics:** compact summary metrics, usage/value trends and model/day breakdowns over the full selected interval. Subscription Value lives within Metrics: API-equivalent estimates, corresponding subscription fees, value multiples only when calculable, and paid overflow remain separately labeled. Display collection freshness, reported coverage and missing measurements. Show latency and execution-error distributions only when timed trace evidence exists. Each supported breakdown opens matching evidence with the same period and source filters.
- **Traces:** searchable, paginated run history with meaningful names, source, observed time, reported run status, duration, step errors and coverage. Opening a run shows a detail drawer with a compact summary, execution tree and waterfall on a common time axis, and a selected-event detail panel. Shared or overlapping work must not be counted twice. Preserve missing intervals, retry/delegation relationships and collector limitations. Sessions are investigation groupings when supplied by a qualified source, not a separate primary page. A graph view is optional after the tree and waterfall are verified; never infer causal edges from timestamps alone.
- **Connection settings:** supported sources/client versions, explicit metadata consent, least-privilege ingestion credentials, verification, latest receipt, collection health, pause/resume, disconnect and scoped deletion. The activation flow is connect → send/observe a verification event → inspect persisted evidence. Do not require users to locate or upload unexplained log files. A configured credential is not evidence that a native agent collector works.
- **Accounting and outcome semantics:** unknown prices remain unknown consistently in lists, details, metrics and exports. A failed step does not establish that the whole run failed; retain the source-reported run state separately from step errors. Completion is not proof of task acceptance or productivity. Subscription API-equivalent value, source-reported estimates and workspace customer charges remain separate. Supplier expenses and margins never enter these personal views.
- **Interaction and persistence:** preserve period, source and investigation filters across routed navigation, refresh and browser back. Use shared DropdownMenu primitives directly for choices. Verify menus, selection, detail navigation and loading/empty/error states at desktop and narrow widths. Saved records, connection preferences and fees must survive backend restart and browser-cache clearing. Never display internal identifiers, including in raw-data panels or exports intended for product users.

Delivery starts with durable personal Metrics and metadata-only Traces plus their authenticated ingestion/read/delete APIs. Qualify a real native Codex usage source separately; custom integration support cannot be described as automatic Codex collection. Add richer native event coverage only after validating timestamps, model identity, relationships, duplicate delivery, consent and data omission. The first release does not add orchestration, agent execution, prompt management, evaluations or task acceptance ownership.

The custom integration contract accepts bounded execution metadata: meaningful run/event names, source and client version, reported status, timestamps, explicit relationships, coverage and optional source-reported usage. Exclude prompts, responses, tool payloads, credentials and local paths by default. Ingestion credentials authorize submission only; they must not authorize personal reads or workspace inference. Identical retries are idempotent, conflicting reuse is rejected, and validation failures leave existing evidence unchanged. Publish a runnable SDK example and explain credential expiry, pause/resume, disconnect, deletion and retention. Collection freshness means the latest accepted receipt; it does not prove that all source activity was captured.

Implement and qualify in three increments: first backend ownership, ingestion and durable settings; then Metrics, Traces and the connection workflow with browser verification; finally the supported native Codex collector and packaged first-use journey. Record evidence separately for each increment. A working custom trace SDK or a populated synthetic demo does not close the native collection gate.

F08 requires a real consented connection and persisted first observation, an execution trace with nested model/tool steps and a step error, period/filter drilldown, scoped negative authorization tests, duplicate/conflicting-ingest tests, pause/revocation/deletion checks and restart durability. Synthetic fixtures verify contracts and UI interactions but do not qualify a native collector, model pricing, complete execution coverage or F08 as a whole.

## Workflow review requirements

The [workflow delivery plan](../product/workflow-delivery-plan.md) is part of this release scope. It expands F02–F10 with commercial identity/pricing, a focused qualified catalog, server-wide consumption analysis, durable multi-turn Chat, first-report agent collection and usable mobile navigation. Follow its delivery order and record each finding as reproduced, fixed, already resolved or blocked. Preserve existing review changes; tests and configuration gaps alone do not establish feature acceptance.

## Workspace Guardrails — F09

Workspace Guardrails are included in this release plan. Earlier backlog scheduling does not establish completion or exclude these requirements. Deliver in stages: policy composition and deterministic local input controls; explicitly configured external detectors and non-streaming output checks; then qualified streaming inspection. Unsupported operations and modes must remain explicit throughout. Each stage requires its own fresh evidence, and existing key grants or payload redaction alone do not qualify Guardrails.

- **Policy management:** versioned workspace defaults and key assignments, role-checked CRUD, optimistic revisions, draft validation, effective-policy/route eligibility preview, activation and rollback. Define `inherit`, `allow_all`, `allow_list` and `deny_all`; intersect model/Provider grants and credential scopes, and deny an empty intersection. Children and request overrides may tighten mandatory restrictions but never weaken them. Apply retention/region requirements on every route, retry and fallback; distinguish verified evidence, accepted attestations and unknown classifications. Bind decisions to workspace, request, attempt, route and policy revision. Extend member assignments only after identity and budget ownership are defined.
- **Local input controls:** bounded secret/PII presets and custom regex with block/redact for an explicit textual Chat/Responses subset. Publish extraction and coverage for roles, content parts, prompts, tool arguments/results, Embeddings, files, encoded/multimodal data, candidate outputs, visible reasoning and unknown events. Preserve Unicode and JSON structure; revalidate transformed requests and recompute size/cost bounds. Unsupported content must be rejected when a mandatory policy cannot inspect it. Required checks run before dispatch, with zero upstream calls on blocked or indeterminate input. Optional policies must not complicate simple initial access. Pattern-based injection detection is best effort, never a universal prevention claim.
- **Detector adapters:** optional NLP, moderation and injection classifiers use authenticated, versioned and bounded interfaces. Required timeout, overload, unavailable service or malformed verdict is indeterminate and fails closed; observe-only mode is explicitly non-enforcing. Configuration declares recipients, content sent, credentials, retention, region, timeout, concurrency and costs. Apply egress/SSRF and redirect controls; never forward client authorization. Detector privacy is independent of inference Provider privacy. No speculative inference dispatch for pre-egress protection.
- **Output modes:** distinguish observe-only, bounded inspection before each supported chunk is released, and bounded full-output inspection. Reject incompatible streaming or oversized output, or buffer within declared bounds; never silently downgrade. Delivered bytes cannot be recalled, and windowed inspection is not full-response semantic coverage. Define protocol-correct termination, cancellation and settlement for blocked output, including incurred detector/Provider charges. Never retry on a less restricted route or change Providers after response commitment. Inspecting tool-call text does not govern tool execution outside Niu.
- **Budget semantics:** reuse the authoritative ledger with explicit subjects, currency, reset timezone and period. Distinguish independent key/member allowances from pooled balances. Hard caps require concurrency-safe reservations and bounded costs covering retries, uncertain liabilities and detector/Provider charges. If these prerequisites are unavailable, explicitly defer hard budget caps rather than introduce a second counter or advertise strict enforcement.
- **Dashboard and audit:** a Guardrails area under workspace settings provides presets, coverage/mode labels, synthetic tests and effective-policy/impact preview before activation. Safe audit metadata includes policy/detector versions, stage, outcome, reason code, inspected coverage, duration and request/attempt correlation. Raw matches, originals, secrets and detector responses are excluded by default from all logs, traces, errors and preview surfaces. Preserve public enforcement, basic isolation, local filters and adapter contracts without private-source dependencies; confirm any advanced edition boundary before implementation. Local filters require no new external service, proxy or application domain. Pin selectively reused modules/dependencies and verify licenses.

Acceptance requires cross-workspace and weakening/bypass tests; invalid/conflicting updates leaving the active revision intact; concurrent activation/reassignment/deletion tests; a fake upstream proving zero dispatch for required denials; transformed protocol-object assertions; and table-driven Unicode, nested JSON, role/tool, unsupported-content, invalid-pattern, oversized-input, timeout/outage and false-positive/negative fixtures. External adapters require SSRF, redirect/proxy, credential-isolation, forged/oversized-result, concurrency and cancellation tests. Output qualification covers held chunks, fragmented UTF-8/SSE/tool arguments, cross-chunk patterns, malformed events, buffer exhaustion, disconnects and mid-stream blocks. Fixture secrets must be absent across every sink. Shipping budgets require concurrent rollover/retry/liability reconciliation without double charging.

Measure added P50/P95/P99 latency, TTFT, throughput, CPU/RSS, detector cost, detection errors and failure behavior under fixed payload/concurrency for disabled, local, external, windowed and buffered modes. Establish rollout thresholds from measurements; make no unmeasured overhead claim. A packaged test and desktop/narrow dashboard walkthrough must demonstrate creation, preview, assignment, denial/redaction, authorized audit and rollback, with pinned artifacts and documented coverage/failure semantics. Use actual OpenRouter Guardrails interactions as the UI reference while retaining Niu's components and brand.

## Required acceptance matrix

Key Guardrail assignments now reference preserved policy revisions with database-enforced key/workspace/revision ownership and optimistic assignment updates. PostgreSQL storage tests verify cross-workspace rejection, stale assignment conflicts and durable reads. The shared inference path requires both workspace and key restrictions to permit access; a fake-upstream HTTP fixture verifies an assigned key denial still blocks Chat, Responses and Embeddings when the workspace allows all, with zero upstream requests. Assignment APIs, removal/rotation behavior, decision attribution and concurrent dispatch/activation qualification remain open.

The current gateway regression run passed all 107 tests with PostgreSQL and the configuration process-replacement test after Guardrail admission, API, rollback and attribution changes. These tests cover the implemented protocol/accounting/authorization fixtures; they do not qualify production performance, new content controls, external Supplier terms, browser workflows or installation gates. Product focus now explicitly includes the staged F09 Guardrails requirements.

Guardrail rollback now restores a validated prior workspace policy as a new revision using optimistic activation. The PostgreSQL HTTP test verifies reader/cross-workspace denial, successful restoration, stale rollback conflicts, and retention of the intervening revision. The dedicated Guardrails contract documents this endpoint. This does not qualify request/activation races, audit attribution or dashboard rollback interactions.

Activation and rollback revisions now retain bounded authenticated actor attribution in the same transaction; rollback records its source revision. The expanded PostgreSQL HTTP test verifies rollback attribution and source revision without storing the session credential. This is policy-change metadata only. Request-level decisions, coverage, timing, correlated audit APIs and dashboard audit views remain incomplete.

These are unqualified targets until fresh acceptance evidence is recorded. Historical implementation checkpoints do not automatically pass the revised gates.

Guardrails implementation currently has tested access-rule composition, bounded draft validation and workspace-scoped revision storage. Three unit tests verify intersections, explicit mode serialization, deny-preserving empty lists, schema-version checks and name/list limits. A PostgreSQL test verifies durable reconnect, workspace isolation, preservation of prior revisions and exactly one successful activation among concurrent updates using the same expected revision. The common inference admission path now checks stored workspace model/Provider restrictions before creating an attempt or sending an upstream request, failing closed on malformed stored policy. A PostgreSQL fake-upstream fixture verifies model denial and Provider denial across Chat, Responses and Embeddings with zero upstream requests. Workspace-authorized read, activation and non-persisting access-preview endpoints are now implemented. The same HTTP fixture verifies preview denies both restricted cases, inference keys cannot activate policy, valid activation succeeds and stale activation conflicts before protocol denials are checked. Preview explicitly does not establish route availability. A separate PostgreSQL HTTP test verifies workspace readers can read/preview but cannot activate, scoped administrators cannot read/activate another workspace, and an authorized administrator can activate its own policy; denied attempts leave the other workspace unchanged. Concurrent activation during dispatch, policy-revision attribution, key assignments, content detectors/output modes, safe audits, SDK/OpenAPI coverage and dashboard behavior remain unqualified.

| ID | Capability | Required evidence |
| --- | --- | --- |
| F01 | Independent installation and operation | One application image serves public catalog, docs, dashboard and APIs with PostgreSQL. Clean install, nested routes, restart, backup/restore and upgrade work without website/private source. Follow repository ownership for the optional hosted homepage and same-domain composition. |
| F02 | User authentication, workspace access and keys | Authentication is shared infrastructure: restore and validate sessions, redirect signed-out protected routes to Login before rendering the dashboard, preserve the requested destination, handle expiry and sign-out, and enforce authorization in the backend. Do not duplicate login workflows per page or expose installation-token/operator jargon in ordinary user flows. API and dashboard exercise key creation, rotation, revocation, model grants and workspace isolation. Credentials are not exposed through listings, logs or ordinary product UI. |
| F03 | Supplier configuration and client setup | Connect and validate a Supplier/model route, publish its alias and configure a client using the displayed base URL, model and workspace key. Unsupported capabilities fail explicitly. |
| F04 | Qualified inference and routing | Publish an explicit tested protocol/model matrix covering supported streaming, tool and structured-output behavior. Verify cancellation, fragmented streams, failures, bounded retries and attempt attribution. Preserve explicit model and effort requests; no silent model substitution or unauthorized paid fallback. Multiple Suppliers are not mandatory. |
| F05 | Durable usage and customer accounting | Record request/attempt evidence, source, confidence, timing and immutable customer price revisions. Unknown usage or charges stay unknown. Duplicate events, restart and reconciliation cannot double-charge. Supplier costs and margins are excluded from customer responses and exports by backend authorization and serialization. |
| F06 | Useful consumption investigation | A real client request appears automatically after refresh. Browse/filter history beyond the latest 100 records and show accurate time-window aggregates. Rank observed usage by model and workspace API key, and link each breakdown to the matching durable request evidence where observable. Unknown usage stays unknown. Visualize observed request phases on a common time axis to distinguish preparation, first-output wait and output delivery. Preserve cancellation and unknown phases. External agent task spans may show parallel work and gaps only when supplied with real timing; Niu does not orchestrate tasks. High volume is an investigation signal, not proof of waste; any potential-waste finding must cite evidence and a concrete change to investigate. |
| F07 | Qualified discounted supply | Verify a Supplier's right and ability to supply, model identity, protocol behavior, data handling, availability and agreed rates. Validate customer pricing and Supplier settlement against durable records. Any advertised discount includes a current model-specific baseline and conditions. Supplier confidential procurement data stays within the appropriate administrative boundary. |
| F08 | Agent Observability | Deliver the Metrics/Traces and connection-settings workflow specified above, including selected-event tree/waterfall investigation and consistent unknown/error semantics. Keep the feature top-level and independent from Workspace navigation; label Codex as a usage source. Do not ask users to locate or upload unexplained local logs. Qualify a real, consented collection path and document client versions and coverage. Preserve agent behavior and authentication. Persist observations and settings in the backend. Verify duplicate handling, partial coverage, missing rates, cache/reasoning token categories, model identity, period boundaries and zero/unknown fees. Keep workspace API charges in Workspace Usage unless the report explicitly measures requests made with that workspace's API key. Never label the estimate as earnings or cash savings. |
| F09 | Limits, security and data control | Deliver and qualify Workspace Guardrails as specified above, including effective policy, input/output controls, safe audit and explicit coverage. Verify credential isolation, workspace authorization, retention/deletion and required policy on every supported path. Declared budgets account for concurrent requests, retries and uncertain liabilities; unsupported strict enforcement is labeled. Personal agent telemetry excludes content and secrets by default. Workspace inference payloads use documented 24-hour retention with explicit per-request opt-out, bounded capture and scoped deletion. |
| F10 | Documentation, SDKs and release qualification | Released examples run against the packaged product. CI checks builds, migrations, licenses and upstream provenance. Verify affected UI in a browser at desktop/narrow widths and interaction states. Clearly identify unimplemented capabilities. Document and test any optional Enterprise interface without introducing a private dependency. |

## Sequencing and release labels

1. **API and observability preview:** qualify F01–F06 and the applicable security/documentation requirements in F09–F10. Follow the complete setup-to-request-to-activity journey. Useful observability must work with one configured route and no subscription connector.
2. **Discounted commercial supply:** qualify F07 and the commercial accounting/security paths before publishing offers or price advantages. This gate does not depend on coding-agent adoption or task benchmarks.
3. **Free subscription visibility:** qualify F08 after the gateway path. Codex comes first; other clients require separate qualification. Report unavailable measurements honestly rather than estimating usage from quota percentages.

The complete scope requires all applicable rows; individual previews must name their qualified subset. No current row is marked passed by this document. Automatic report sharing is not required; any sharing must be explicitly approved and limited to previewed aggregates.

## Scope migration

The [legacy release plan](first-release-legacy.md) preserves R01–R23 and dated implementation checkpoints. It is historical evidence, not a parallel roadmap. References to those row IDs describe the old scope.

- Earlier gateway, identity, accounting, security, dashboard, packaging and SDK work maps into F01–F07 and F09–F10, subject to current verification.
- R11 and R17–R19 task runners, task outcomes and benchmark obligations are removed from Niu's release scope. External clients may correlate their own task evidence with Niu request records.
- R15 subscription inference/account pooling and R21 subscription-preserving rerouting are not release requirements. They cannot be inferred from a working API proxy or observation connector.
- R16 and R22–R23 contribute only relevant usage-collection concepts to F08. The subscription report does not require local tool events, task acceptance or a two-mode routing connector.
- Existing task/benchmark APIs, storage and code are retained pending a separately reviewed compatibility plan. This documentation revision neither removes runtime features nor claims new features are implemented.

## Boundaries and evidence

[Repository ownership](../architecture/repository-ownership.md) continues to govern routes, artifacts and independent community builds. Marketing source remains in its separate repository. External orchestration clients must use public interfaces; their private implementation details do not belong in this tree.

Customer price advantages are verified against named baselines. API-equivalent subscription value follows the methodology in [product focus](../product/product-focus.md#free-subscription-value-report). Request volume, inferred waste and task productivity are different measurements. Do not substitute one for another.

## Current cleanup verification (2026-10-02)

This checkpoint does not qualify a complete release gate.

- Supplier configuration now lands at `/suppliers`; the duplicate Providers rail entry is removed. Legacy Provider and workspace configuration links redirect into the Supplier area. Supplier pricing and settlements remain reachable from that area.
- The shared application boundary redirects signed-out protected routes to Login and preserves the requested destination. Focused tests cover workspace, Supplier, legacy Provider, Chat, Models and Agent Observability routes. This is not evidence that the full identity lifecycle and all backend authorization paths are qualified.
- The configured OpenRouter credential and active default demo API key were preserved. Two enabled test model routes were added from the live OpenRouter catalog. Real Chat requests succeeded through Niu and their token usage appeared in durable gateway request records.
- The dashboard build and 20 focused tests passed. Desktop/narrow browser review and interactive sign-in verification remain pending because the browser automation session failed. No UI gate is passed on build/tests alone.
- Customer billing, discounted commercial supply, complete protocol behavior, session expiry, cross-workspace authorization and consented agent collection still require their respective acceptance evidence.

### Customer response boundary checkpoint

Upstream monetary metadata is now removed from Chat, Responses and Embeddings JSON replies and Chat SSE frames. Token evidence and user content are preserved. Fragmentation tests and the OpenRouter gateway integration test cover supplier cost removal; a live request confirmed the public usage object contains token metadata only. All 95 gateway tests, including PostgreSQL cases, passed at this checkpoint. This does not qualify all protocol combinations or replace F05/F09 acceptance.

The broader dashboard suite found tests that still assumed a signed-out workspace shell and inline sign-in. Those expectations must be migrated to the shared authentication boundary while preserving their authenticated navigation, recovery and isolation coverage. That run was a failed intermediate checkpoint; the subsequent authentication/navigation checkpoint below supersedes its test status. Focused successes must not be reported as full release acceptance.

### Authentication and navigation checkpoint (2026-10-02)

The dashboard suite now passes all 136 tests across 28 files. Authentication restoration uses one shared boundary; tests begin with isolated browser caches and exercise login before protected navigation. Gateway outages remain visible while checking the session, without rendering protected content. Legacy workspace model redirects preserve the model path and query, and global model detail routes retain the Models navigation scope. Existing workspace switching, session revocation, keyboard navigation, draft recovery and scoped access tests remain covered.

The dashboard production build passed. JavaScript SDK tests passed (22); development and upgrade helper tests passed (11). Docs and catalog checks reported zero errors, warnings and hints. These results qualify the named automated checks only: rendered desktop/narrow UI verification remains pending, and helper tests are not a clean-install, upgrade or backup/restore demonstration.

Outstanding release evidence includes browser verification, independent packaged installation/upgrade/restore, a complete supported client protocol matrix, qualified discounted commercial supply and current price baselines, and a real supported consented agent collection path. Agent Observability currently shows an unconnected source state; backend import tests do not qualify that user journey. No F01–F10 row is marked passed by this checkpoint.

### Packaging and report calculation checkpoint (2026-10-02)

The packaged smoke and pinned-upgrade scripts require Docker. Docker is unavailable in the current acceptance environment; those runtime checks have not run. The independent-image, upgrade and backup/restore requirements remain open. Passing helper tests do not substitute for them.

Agent API-equivalent calculation now uses checked decimal arithmetic rather than binary floating point. Rates are represented exactly to 18 decimal places in USD per token, category costs are summed before a single rounding to nanodollars, and overflow keeps the estimate unknown. Seven calculation tests cover cache categories, threshold rates, unknown cache-write usage, model mismatch, values beyond floating-point integer precision, fractional rounding and malformed rates.

Official [Codex telemetry documentation](https://learn.chatgpt.com/docs/config-file/config-advanced) describes opt-in OTel export and completion token events. This establishes a candidate source, not a qualified Niu collector. Before connecting it, verify an actual supported Codex version, exact event fields and model identity, subscription/API attribution, duplicate behavior, coverage, and a local filter that excludes prompt/tool content and credentials. Preserve the user's existing agent configuration and require explicit collection consent. The current workspace-scoped import compatibility API does not establish the required independent personal Agent Observability scope.

### Personal observation boundary checkpoint (2026-10-02)

Personal observation storage and `/admin/v1/agent-observability` endpoints now derive ownership from the authenticated individual session. No workspace ID or application API key chooses the report owner. Shared installation credentials cannot impersonate an individual report. Consent, pause, batch ingestion and deletion are backend operations; records retain client/consent versions and server receipt times. Response references are hashed and excluded from report output. Conflicting retries are rejected; identical retries are deduplicated. The legacy workspace import API remains a separate compatibility contract.

The PostgreSQL storage acceptance test covers consent, owner isolation, reconnect durability, pause, conflicting duplicates and deletion. The HTTP acceptance test covers individual-session ownership, shared-admin rejection and absence of workspace customer charges. All 96 gateway tests passed with PostgreSQL cases included. The local service was restored on port 2566 with its existing database and configuration preserved.

This checkpoint does not complete F08. The collector, personally authenticated demo/user journey, and desktop/narrow UI review remain open. Backend report breakdowns and fee settings are covered by the subsequent checkpoint; their user interface remains unqualified. The existing Agent Observability page remains explicitly unconnected until the supported collection path is implemented and qualified.

### Personal fee and breakdown checkpoint (2026-10-02)

Personal reports now include UTC day/model breakdowns separated by billing mode, observed token categories and unknown-category counts. Model provider identity remains separate from the model name. Subscription fees and paid API overflow are durable personal settings and never workspace customer charges. A comparison requires a positive known fee for exactly the requested period, known billing attribution and priced subscription observations. API observations do not increase subscription value; overflow is shown separately. Coverage remains explicitly observed-only.

The personal storage tests exercise exact-period comparison, API/subscription separation, zero and unknown fees, unknown billing attribution, fee persistence and deletion. The HTTP test checks that fee settings remain private to their session owner. This remains backend acceptance only; collector and complete UI/client qualification are still required for F08.

### Direct navigation correction (2026-10-02)

The running packaged server was missing the `/suppliers` and `/agent-observability` dashboard routes and returned 404 for direct navigation. Both routes and nested Supplier management paths now serve the dashboard shell; static-site regression tests cover hosted and community composition. Live checks on port 2566 confirm both routes return HTTP 200. The dashboard rebuild passed. These checks do not establish successful rendered navigation: the reported Chat route error remains unqualified while browser diagnostics are unavailable.

The local launcher now requests preservation of earlier immutable dashboard assets during rebuilds so existing tabs can still load their lazy modules. This prevents a known rebuild failure mode but does not establish the cause of the reported Chat crash.

### Personal report consistency (2026-10-02)

Report totals, sources, fee comparison and day/model breakdowns now read one repeatable database snapshot so concurrent ingestion cannot mix states within a response. Both breakdowns retain nullable cache-write/reasoning totals and unknown-category counts. PostgreSQL tests verify that conflicting batches roll back earlier inserts, pause requires renewed consent before ingestion resumes, and period ends are exclusive. These checks do not qualify the collector or rendered report.

### Development hot reload correction (2026-10-02)

`pnpm dev` now serves the live Vite dashboard on port 2566 and proxies APIs, local login, docs and catalog to the loopback Gateway on port 2567. Port 2555 is unused. `--packaged` retains direct Gateway package verification on 2566. HTTP checks confirm the application document loads the Vite client; a WebSocket check received an HMR source update on 2566. The user confirmed that a newly opened tab loads correctly. The previous tab remained stale even after reported hard refreshes; its browser-specific failure is not diagnosed by these server checks.

### Payload diagnosis and development sessions (2026-10-02)

Logs request details now retain one timestamp and remove the separate timeline and evidence labels. Explicit per-request payload capture uses `x-niu-log-payloads: true`; Chat exposes this through its “Save payloads in Logs” setting; the current dashboard enables it for new chats, while API calls require the explicit header. Default-content policy still requires release review. Request/response content is separate from the accounting ledger, expires after 24 hours and is limited to 1 MB per captured side. Scoped content read/delete endpoints enforce workspace authorization. Capture excludes HTTP headers; known credential fields in request objects are removed, and response capture uses the sanitized customer output. This is not a promise to redact arbitrary secrets embedded in prompt text. Earlier requests cannot acquire content retrospectively.

A PostgreSQL HTTP fixture verifies disabled-by-default capture, JSON/SSE response capture, scoped access, reconnect durability, expiration and the commercial data boundary. Local development login sessions now persist hashed tokens in PostgreSQL; storage tests cover reconnects, revocation, expiry and credential changes. An actual development backend restart followed by a browser reload retained the authenticated session and reopened the request details. Two live Chat requests completed through OpenRouter; the Logs detail displayed the captured prompt and streaming response. All 98 gateway tests passed. The broader product UX audit and desktop/narrow visual qualification remain in progress.


### Request phase timing (2026-10-02)

New admitted API calls collect monotonic timing without content capture: dispatch, response headers, first meaningful streamed Chat output and response-body completion. Timing is stored against the durable attempt and returned only through its authorized workspace feed. Preparation includes validation and admission; first-output wait includes upstream service and network time. Output stream duration includes delivery and terminal processing, not an isolated model computation measurement. Nonstreamed responses cannot expose generation start and do not display token throughput. Cancellation after dispatch, including before response headers, retains an incomplete observed interval. Missing headers and HTTP status stay null. Process crashes and cancellation during admission acknowledgement remain coverage gaps. Older requests are not backfilled.

A live OpenRouter Chat request rendered 73 ms preparation, 2.21 s first-output wait and 205 ms output stream. Desktop and 390 px mobile review showed the phase bars on a shared scale with durations, total and measured output throughput. All 99 gateway tests and the Supplier restart integration test passed; timing assertions cover scoped durable reads, streamed/nonstreamed output and response cancellation. Fifteen focused dashboard tests passed, and dashboard/docs checks passed. These are request-level observations, not a claim of complete agent-task or video generation qualification. The Chat rail uses `SquareSparkles`. The API key detail no longer exposes its internal UUID and translates wildcard access to “All configured models.”


### Interrupted request timing coverage (2026-10-02)

Timing collection now keeps an admission-to-cancellation interval when the client disconnects before response headers arrive. The phase chart renders the observed response wait and does not fabricate delivery or token throughput. A PostgreSQL HTTP fixture cancels an actual delayed upstream request, verifies null headers/status/output offsets and reads the durable incomplete record after reconnect. Four phase-chart tests and dashboard type checking passed. Process-crash coverage, full external agent-task collection and video generation qualification remain open.

### Payload retention preference update (2026-10-02)

New inference payloads are retained for 24 hours by default, superseding the opt-in default above. Requests can explicitly opt out using `x-niu-log-payloads: false`; Chat exposes the same choice in its composer settings. Existing scope authorization, capture size bounds, credential-field removal and customer-output sanitization still apply. Earlier content is not backfilled.


### Single-model Chat and live cancellation (2026-10-02)

Chat now permits one enabled route, retaining optional comparisons of up to four models. A model-restricted key no longer triggers a repeated selection update; available models are memoized. The picker and response count use singular wording when appropriate. Ten Chat integration tests passed, including a managed key restricted to one model. A real single-model OpenRouter response was cancelled after output began; Logs retained 63 ms preparation, 1.65 s first-output wait and 132 ms observed output, with unknown terminal usage and no throughput claim. The partial waterfall was reviewed at desktop and 390 px widths. This does not qualify external task collection or the entire release.


### Request observability contract alignment (2026-10-02)

The OpenAPI workspace request feed now describes customer charge fields and model/key usage breakdowns instead of installation-only upstream expenses. A separate public contract defines retained payload read/delete authorization, the explicit API capture header and nullable monotonic timing fields, including interrupted responses. YAML parsing and every local/external JSON Pointer reference passed; docs checking reported zero diagnostics. These checks establish contract consistency, not independent packaged installation. Docker remains unavailable in this environment, so F01 image/upgrade/restore acceptance is still open.


### JavaScript observability SDK alignment (2026-10-02)

The JavaScript SDK now types the actual customer charge, phase timing and full-range usage summary responses. Its workspace request feed supports time/model/key/status filters, and scoped methods read/delete separately retained payloads. SDK documentation removes the stale upstream cash example, explains the compatibility workspace identifier and preserves nullable/exact-string quantities. All 23 SDK tests and type checking passed, including filter encoding, scope-injection rejection, retained-content deletion and customer amounts above JavaScript safe-integer range. Packaged-product SDK examples remain unqualified until independent image acceptance is available.

### Runnable SDK usage example

The JavaScript SDK usage example was executed against the development gateway with retained real requests. Pagination completed, interrupted requests retained unknown usage, and missing customer rates remained unpriced rather than being replaced with Supplier expenses. The example is included in the package file list. This verifies the local SDK workflow; packaged image acceptance remains a separate release gate.

### Release regression checkpoint (2026-10-02)

The current dashboard suite passed all 142 tests across 29 files. Agent Connect passed 12 tests covering pinned client versions, credential isolation, content exclusion and durable queued delivery. Eleven development, packaging-helper and public-boundary helper tests passed. JavaScript SDK and Agent Connect type checks passed; docs checking reported no diagnostics. The JavaScript package dry run includes the runnable usage investigation example, and the four changed example/documentation/package files passed the public-boundary scan.

These are automated and local SDK checks. They do not establish a consented Codex collection journey, discounted commercial supply, or independent packaged installation. The API payload default differs from the metadata-only wording in F09; that policy discrepancy remains open pending reconciliation.

### Inference qualification matrix (2026-10-02)

The [inference qualification matrix](../reference/inference-qualification.md) separates live model observations from simulated adapter coverage and unsupported protocol combinations. Fresh nonstreaming Chat calls through the authorized dashboard endpoint succeeded for both enabled OpenRouter models, preserving the public alias, reported token usage and attempt header while excluding Supplier monetary fields. All 14 gateway inference tests passed with isolated PostgreSQL databases. An initial run used the unprivileged application role and failed before fixture setup because it cannot create databases; the rerun used the local test administration connection without changing application privileges. Live tool/structured-output, Responses/embedding model checks, effort handling and full retry/fallback qualification remain open.

### Explicit effort and failure attribution (2026-10-02)

Gateway fixtures now assert unchanged nonstreaming `reasoning_effort` and streaming OpenRouter `reasoning` forwarding. Native adapter checks reject unsupported effort/thinking parameters rather than dropping them. A Chat upstream 503 fixture confirms one dispatch, one durable attributed attempt, a gateway error and unknown token usage; it does not automatically retry. All 22 tests matching inference passed, including database-backed deadlines, accounting and Supplier dispatch controls. The qualification matrix records this adapter evidence separately from live model checks. Live upstream effort behavior and the complete supported protocol failure/fallback matrix remain open.

### PostgreSQL CI coverage correction (2026-10-02)

The release workflow now runs all storage integration test targets with PostgreSQL rather than only `postgres.rs`. This includes separate personal-observation, Chat persistence, local-session, billing, Supplier, registry and audit suites. The equivalent local command passed all 24 ignored PostgreSQL tests using isolated test databases. CI also runs every Python helper test; all 11 passed locally. Workflow YAML parsing, the changed-file public-boundary scan, and selective-import checksum/MIT attribution verification passed. The import verifier requires Python 3.11 or later and was run locally with Python 3.14. These local results validate the commands; no hosted CI execution or packaged-image acceptance is claimed.

### Payload control contract and SDK (2026-10-02)

The retained-content OpenAPI description now matches the implemented 24-hour default and explicit `x-niu-log-payloads: false` opt-out. JavaScript request options expose `logPayloads` for individual Chat, streamed Chat, Responses and embeddings calls; per-request choices override client defaults without changing credentials or metadata. Invalid nonboolean choices fail before transport. All 24 SDK tests and type checking passed. OpenAPI YAML/reference validation and changed-file public-boundary scanning passed. This corrects the public contract and caller controls; it does not resolve the default-content policy discrepancy with F09 or qualify every upstream protocol.

### Workflow review incorporated (2026-10-02)

The workflow delivery plan expands the release acceptance criteria and sets implementation order: Supplier identity/configuration, model mappings, qualification and agreed rates; then customer catalog prices and workspace keys, limits, usage and billing; then Chat and other LLM-dependent features. Agent Observability page implementation is handled separately. The review confirms default-on API payload retention with explicit opt-out, separate from personal agent collection. This supersedes earlier pending default-content-policy notes. The added requirements are not marked complete; current-state reproduction and end-to-end evidence remain required.

### OpenRouter test Supplier rates (2026-10-02)

The existing development OpenRouter API configuration is explicitly associated with its Supplier business. Twenty-five model offers were saved using the live public catalog's USD input/output token prices; each saved rate was compared exactly in Niu's nanounits per million tokens. A second import created zero duplicates. The importer validates existing latest revisions before writing and rejects changed prices or currencies for review without rewriting historical agreed rates. Unit checks cover exact conversion, invalid/unrepresentable prices, opaque revision handling, duplicate-current-offer rejection and stale-rate rejection. These are authorized test rates with no discount claim. Supplier UI verification, commercial qualification, customer tariffs and request-to-charge acceptance remain open.

The JavaScript SDK exposes installation-only agreed-rate publication with exact string quantities and opaque revision responses. Validation rejects malformed, negative and out-of-range rates before transport; write conflicts propagate without retries. All 32 SDK tests passed, including the new rate-publication regression. Saved offers remain unqualified until their separate acceptance requirements are met; publication alone does not establish dispatch readiness.

### Supplier rate lifecycle regression (2026-10-02)

Fresh PostgreSQL checks passed the two Supplier accounting/qualification tests and three configuration/ownership tests. Rate-update assertions verify the new immutable revision clears activation and qualification, stale updates preserve current rates, and already admitted requests retain their original payout revision. The HTTP regression verifies an authenticated Supplier manager cannot publish agreed rates, valid installation writes create revisions, stale writes conflict and malformed/out-of-range prices leave the saved offer unchanged. The complete gateway suite passed 112 tests and the separate process-replacement test. The JavaScript suite passed 33 tests, including current-offer reads and revision-aware rate publication. These checks do not qualify real Supplier evidence, rendered workflows, customer tariff setup or the full release.

### Supplier catalog availability and metadata (2026-10-02)

The effective model catalog now excludes explicit Supplier offers that are inactive or lack current qualification. Direct resolution rejects those offers as unavailable, while the dispatch boundary retains its independent qualification check. Legacy routes without an offer retain existing behavior. Storage checks verify qualified active offers are available, publishing a rate revision makes them unavailable, and simultaneous edits against one revision accept exactly one writer. The gateway suite passed 112 tests plus process replacement; a subsequent focused HTTP check verifies a newly created unqualified offer is absent from the effective catalog. The live OpenRouter metadata refresh updated 26 existing mapped models, all with readable catalog names. This is descriptive metadata rather than protocol or supply qualification; the test offers remain unavailable until their separate evidence requirements are satisfied.

### Supplier dashboard and live test-route checks (2026-10-02)

Per-offer rate editing now prefills exact currency amounts, fixes the existing alias and submits its current revision. Linked Supplier properties load the configured endpoint and save with revision checks; a blank replacement credential preserves the stored key and availability. Failed administration reads show an error with Retry rather than false empty pricing, and refreshes retain previously loaded data. Nine Supplier dashboard tests and TypeScript checks passed. Desktop browser inspection verified saved rates and a successful properties save; narrow viewport control timed out, so responsive acceptance remains open. A real non-streaming request and a streaming request through the existing Gemini 2.5 Flash route returned content and provider-reported usage. The streaming check verified three events and terminal DONE in 1.26 seconds; this single observation is not a performance benchmark. No offer qualification or customer tariff was inferred from these legacy-route checks.

### Supplier ownership foundation (2026-10-02)

An indexed, explicit ownership relationship now links a configured API to an existing Supplier business. Installation-only read/write endpoints establish the association atomically with configuration revision and audit updates. Same-business retries are idempotent; different-business reassignment, stale initial revisions and unknown references fail without partial writes. Existing configurations are not associated by name, and no business or qualification evidence is fabricated. Two storage registry tests and all six Supplier configuration HTTP tests passed, including customer-key rejection and credential-free read output. OpenAPI and architecture documentation describe the operation. Commercial switcher integration, scoped configuration filtering and the real offer-to-charge journey remain required; the empty pricing view is not yet marked resolved.

### Supplier offer ownership consistency (2026-10-02)

Configuration association now rejects conflicting existing offer ownership, and new offer publication rejects a different linked Supplier. Shared/exclusive configuration locks serialize publication against association. All five Supplier registry/accounting tests passed, including a new conflicting-owner regression and existing exactly-once earnings/settlement and expired-evidence dispatch tests. Legacy unassociated configurations remain explicit migration work; the UI and real commercial journey are still incomplete.

### Supplier-scoped configuration reads (2026-10-02)

The installation configuration listing now accepts a Supplier filter backed solely by explicit ownership records. Unassociated and unrelated configurations are excluded, unknown ownership returns an empty list without fallback, and customer inference credentials remain unauthorized. Six Supplier HTTP tests passed, including an unassociated neighboring configuration and credential-free metadata assertions. OpenAPI parsing and changed-file public-boundary scans passed. The Supplier switcher has not yet been connected to this filter; rendered business-context acceptance remains open.

### Non-admin Supplier boundary and gateway regression (2026-10-02)

The configuration association fixture now creates a real authenticated Supplier manager. Its own business dashboard succeeds, another business dashboard is denied, and configuration association/read/filter operations remain forbidden. Customer inference keys remain unauthorized. The complete gateway suite passed all 102 tests with PostgreSQL, followed by the process-replacement test. This validates the current backend regression scope; it does not qualify UI context integration, commercial rates/supply evidence, clean installation or a real personal collector.

### Development migration recovery (2026-10-02)

The watcher had applied the ownership migration before its audit-constraint extension was appended, causing a migration checksum mismatch and stopping the stack. The original migration is restored unchanged; the audit extension is a separate forward migration. `pnpm dev` restarted successfully on 2566 with the retained database. Authenticated configuration, business and workspace reads passed, and the application document contains the Vite HMR client. All three storage registry/ownership tests passed against the split migration sequence. Browser reload inspection repeatedly timed out, so no rendered UI or session-restoration claim follows from these HTTP checks. Supplier UI integration remains pending.

### Server-side request histogram (2026-10-02)

Workspace activity summaries now include up to 24 nonempty histogram buckets computed over all matching requests, independently of pagination. Scope, time, model, key and execution filters are shared with summary totals. Bucket boundaries use explicit time filters when provided and observed bounds otherwise; empty ranges return no buckets. A PostgreSQL HTTP fixture verifies a six-row page still includes more than 100 requests in its histogram, bucket totals equal filtered summary counts, and foreign/empty ranges return none. SDK type checking, OpenAPI parsing and changed-file public-boundary scanning passed. The existing chart still uses loaded rows and must be switched to the server field and browser-verified before this UX finding is resolved.

### Consistent consumption summaries (2026-10-02)

Histogram buckets, request/token totals, model/key breakdowns and customer-charge aggregates now read a single repeatable-read, read-only transaction. Concurrent writes cannot mix snapshots within one summary response. Request pages and later pagination calls remain live and are not claimed to share that snapshot. All five gateway activity/execution HTTP tests passed, including full-range histogram and customer-commercial-boundary assertions. Contract parsing and changed-file public-boundary checks passed. The chart UI still requires integration and browser verification.

### Logs histogram UI integration (2026-10-02)

The existing chart now consumes the server histogram instead of loaded request timestamps. Sparse buckets keep their positions on the selected time axis, and the misleading latest-loaded-request label is removed. No client-row fallback is used when server histogram data is unavailable. Twelve Logs integration tests and dashboard type checking passed; the fixture verifies server counts can exceed displayed request rows. Desktop/narrow rendered verification remains pending because browser operations timed out in the current session; this finding is implemented but not visually qualified.

### Completed-request latency percentiles (2026-10-02)

Activity summaries include discrete P50/P95 durations across the entire filtered range, from the same snapshot as other aggregates. The boundary is gateway body consumption; missing and incomplete measurements are excluded, and an empty sample returns null percentiles. The PostgreSQL HTTP test verifies completed 100/300 ms measurements produce P50=100/P95=300 while an incomplete 10-second measurement is excluded, independently of the loaded page. SDK type checking, OpenAPI YAML parsing and changed-file public-boundary checks passed. Usage visualization and rendered verification remain pending; these are not upstream-only generation or client-receipt measurements.

The expanded PostgreSQL fixture also passed model/status selection, an empty time window, and a real key whose request has no timing. All return zero timing samples and null percentiles rather than invented zero durations; completed model/status selection retains the two valid samples. Foreign-key filtering remains empty. These checks qualify filtering and unknown-measurement behavior, not the pending visualization.

### Chat history deletion and SDK lifecycle (2026-10-02)

Owned Chat sessions can be deleted durably through the scoped backend endpoint. Storage tests verify owner/workspace isolation and repeat deletion; HTTP tests verify invalid authentication is denied, successful/repeated deletion returns 204, and history reads are empty afterward. The SDK exposes history reads and deletion with validated scopes and cancellation. All 26 SDK tests, OpenAPI parsing and changed-file public-boundary checks passed. Chat deletion controls, multi-turn branches, archive/export and rendered qualification remain incomplete. Supplier association SDK methods also preserve revision checks and propagate conflicts without retries.

Chat saves also whitelist nested result, settings and attachment fields. The HTTP persistence test verifies unknown credential fields are absent after reading saved data while attachment content and explicit payload opt-out survive. Timestamps, elapsed durations and supplied token counts require nonnegative JavaScript-safe integers; nullable token counts remain unknown. The expanded HTTP test rejects negative/fractional elapsed values and negative/unsafe token counts. This is structured-field validation, not arbitrary secret detection inside conversation text; multi-turn and UI lifecycle acceptance remain open.

Optional ordered `turns` now persist up to 100 prompts with per-model response arrays, retaining compatibility with single-turn sessions. The HTTP test saves two turns with distinct model responses, strips unknown nested fields, rejects malformed turns/phases and confirms rejected updates leave the existing history unchanged. The SDK exports typed sessions, turns and results and supports scoped saves; all 27 SDK tests passed. This qualifies storage and transport only: the Chat composer still needs branch-specific context replay, history rendering and browser acceptance.


### Agent Observability pages and installable companion (2026-10-02)

Metrics, Traces and connection settings now use durable personal APIs. Trace history supports period/source/name/state filters, pagination, a detail drawer, tree/waterfall views, selected-event relationships and scoped deletion. Full-range aggregates read one consistent snapshot; unknown timing and pricing remain explicit. Exports use meaningful labels and numbered event references rather than internal identifiers. All-unknown subscription value displays Unknown instead of a zero subtotal.

The source-packaged `@niu-io/agent-observability` companion installs on Node.js 22+, verifies a connection, wraps an agent process while preserving its exit status, prints opt-in Claude Code hook settings and explicitly retries a bounded credential-bound metadata queue. The wrapper records process evidence only. The hook adapter whitelists tool metadata and does not open transcripts, return permission decisions or collect arguments/results. Its coverage is partial and its root outcome stays unknown. A JavaScript SDK self-test records a completed run containing a recovered tool failure without dispatching inference. Registry publication is not claimed.

Validation passed: six companion tests, 31 JavaScript SDK tests, four PostgreSQL storage tests, three personal-report/trace HTTP tests and 31 dashboard observability/navigation tests. Dashboard production build, docs checking/build and API-contract parsing passed. The packed companion was installed in an isolated prefix and sent metadata to the running platform. Live pause rejected delivery, renewed consent allowed the queued record to flush, and revoked test credentials returned 401. Browser review covered the 1280-pixel desktop layout and real 390-pixel iframe viewports, source/state menus, consent, key reveal, nested event selection and drawer alignment. Temporary review pages and test secrets are removed; verification history remains labeled as self-tests.

This checkpoint does not complete F08. Native Codex token/subscription collection, a real Claude Code client-version run, packaged native collection first-use qualification and complete source coverage remain open. Process/hook metadata cannot substitute for those measurements.

### Atomic Supplier setup foundation (2026-10-02)

Installation-only configuration creation accepts an explicit `create_supplier` option. When true, the Supplier business, encrypted API configuration, ownership link and both audit records commit in one transaction. Omitting the option preserves legacy configuration-only behavior; no ownership is inferred from names or adapters. Fresh PostgreSQL storage and HTTP tests verify linked creation, duplicate-write rollback without an orphan business, invalid authentication rejection, credential-safe responses and legacy compatibility. The dashboard creation form is not yet connected to this option, so this is backend acceptance evidence rather than a completed Supplier setup workflow.

The OpenRouter test rate check detected one changed public input/output rate and published a new immutable revision using the expected current revision. All 25 test model rates were then compared exactly against the live public catalog. Historical accounting is retained; this does not establish discounted supply or qualify offers for activation.

### Dashboard Supplier creation wiring (2026-10-02)

The configuration directory's Create supplier action now explicitly requests atomic business/configuration creation. Eight focused dashboard workflow tests passed, including the exact request body and scoped Supplier listing; the dashboard type check passed. Browser inspection on port 2566 verified the existing creation dialog, its open API-service choice menu and service-specific default endpoint. No new Supplier credential was submitted in this browser check, and narrow-width acceptance remains unverified. The separate New supplier dialog in the pricing area still creates only a business name and exposes disabled API fields; replacing that incomplete path is required before Supplier setup is qualified.

### Both Supplier creation entry points (2026-10-02)

The pricing area's New supplier dialog now reuses the complete configuration form and opts into the same atomic creation transaction as the directory. Disabled endpoint/key placeholders and name-only submission were removed. After a successful write, the dialog closes before ownership discovery; a failed discovery reports that creation succeeded and reloads the business list without inviting a duplicate creation. Five focused administration tests passed, including successful navigation to the owned business and post-commit discovery failure; the preceding broader Supplier run passed ten tests. Dashboard type checking and public-boundary checks passed.

The actual OpenRouter BYOK provider entry and key controls were inspected before this change; Niu retains its existing Supplier dialog because these are installation procurement configurations rather than customer BYOK settings. Browser review on port 2566 verified enabled endpoint/credential fields, desktop close alignment, and the complete 390 px form with its aligned open service menu and hidden desktop rail. The viewport was restored and confirmed at 1280 px. No real credential or new Supplier was submitted in the browser; successful persistence is covered by the separate database/HTTP fixtures. End-to-end commercial qualification, customer tariffs and discounted supply remain open.

### Nonexecution and customer invoice closure (2026-10-02)

Billing overview and invoice closure now exclude dispatched attempts whose terminal evidence confirms nonexecution, matching Logs' customer-charge semantics. Unpriced and unresolved counters do not treat these attempts as billable; attempts that may have executed remain unresolved and continue to block closure. A fresh PostgreSQL regression includes priced and unpriced confirmed-nonexecution attempts alongside reconciled charges, verifies neither receives a charge, and issues the exact existing invoice total. It retains checks for ambiguous usage blocking, pinned revisions, concurrent accrual/payment idempotency and immutable records. Fresh gateway HTTP tests passed for workspace-scoped billing authorization and independent customer/Supplier accrual. Public-boundary checks passed. This backend correction does not establish customer price configuration for the live test Supplier or complete commercial acceptance.

### Public SDK customer billing controls (2026-10-02)

The JavaScript administration client now exposes workspace-scoped customer billing reads and explicit retail tariff publication, separate from Supplier agreed-rate publication. Exact amounts remain strings; current-revision updates conflict without retry, invalid rates/scopes are rejected before transport, and cancellation signals are preserved. All 35 SDK tests passed. A fresh SDK read against the running development server returned the demo workspace's customer-safe billing contract with zero tariffs and zero invoice records. This verifies access and response handling, not a populated commercial billing journey: live selling prices, charged requests and invoice acceptance remain open. Public-boundary checks passed for the changed SDK source, tests and documentation.

### Authenticated customer model price discovery (2026-10-02)

The authenticated model list now includes nullable `customer_pricing` drawn only from the key's workspace selling tariffs. Currency nanounits per million input/output tokens remain exact strings and the current immutable revision is included. Missing tariffs return null, never Supplier prices or an assumed zero. A fresh PostgreSQL-backed HTTP check verifies exact fractional rates, key model restriction, another workspace's unpriced response and absence of procurement fields. SDK types and API documentation describe these semantics; SDK type checking passed. The public unauthenticated catalog has no workspace tariff context and is unchanged. Live customer prices and the full request-to-invoice journey remain open.

### Customer discovery revision lifecycle (2026-10-02)

The authenticated model-price HTTP regression now publishes a retail revision through installation administration, verifies discovery advertises that revision with explicit zero rates, rejects a stale repeat with conflict and reads the original exact rates unchanged from storage. This distinguishes an agreed zero price from an absent tariff while preserving historical revisions. The fresh database-backed test passed; it does not claim a live paid-request or invoice workflow.

### Gateway regression after Supplier and retail discovery changes (2026-10-02)

A fresh full gateway run, including PostgreSQL tests normally ignored without a database, passed after atomic Supplier creation, confirmed-nonexecution invoice handling and workspace-scoped model-price discovery. The separate process-replacement check also passed with configuration retained without seed credentials. This regression evidence covers the tested runtime paths; it does not replace clean packaged installation, restore/upgrade, live protocol qualification, production performance or commercial Supplier evidence.

### Static artifacts and local release tooling (2026-10-02)

Fresh production builds passed for the dashboard, public docs and catalog. Three upgrade-helper unit tests passed. The JavaScript license verifier accepted 566 installed package versions under its existing license policy and scoped build-only exceptions. Documentation build warnings remain for Astro head-injection bundling and a missing 404 content entry; successful compilation alone does not qualify rendered documentation or nested-route behavior. Docker is not installed in this environment, so clean container install, packaged examples, backup/restore and container upgrade qualification remain unexecuted. No development data or service configuration was replaced by these builds.

### Packaged customer-price qualification coverage (2026-10-02)

The packaged smoke workflow now checks initially absent customer pricing, publishes an explicit independent fixture selling tariff, compares exact authenticated model-price metadata and verifies the same revision survives application restart. These assertions apply to both image and Compose smoke paths. Python syntax and public-boundary checks passed. Docker remains unavailable locally, so these added packaged assertions have not run and are not acceptance evidence for installation or persistence.

### Current supply availability audit (2026-10-02)

Fresh authenticated reads found only the legacy Gemini 2.5 Flash alias available; all 25 explicitly saved OpenRouter offers were inactive and unqualified. The inference matrix now separates these current availability facts from historical successful model calls. Earlier GPT-4.1 Mini observations do not qualify its currently paused offer. No supply-rights, data-handling, model-identity or protocol evidence was invented to activate offers. The release still requires qualified supply and customer tariffs before commercial acceptance.

### Full dashboard regression (2026-10-02)

All 154 dashboard tests across 32 files passed. The initial run exposed a timing error in the workspace not-found test: it found the shell breadcrumb heading before the lazy recovery page's link mounted. Waiting for that link resolves the race; product labels and rendering were unchanged. The suite covers its existing workflow fixtures, including Supplier creation, but does not establish full browser qualification or native agent collection. Agent Observability implementation was left unchanged.

### Full storage regression (2026-10-02)

The complete storage suite passed with PostgreSQL-backed tests enabled, including atomic Supplier setup, explicit ownership, immutable customer/Supplier rate revisions, nonexecution invoice handling, admission races, workspace isolation, retained sessions and migration recovery fixtures. No tests failed or were ignored in this run. These isolated database checks do not qualify a production backup/restore, previous-release container upgrade, live Supplier agreement or native client telemetry. The separate Agent Observability implementation was not edited.

### Request-to-invoice fixture acceptance (2026-10-02)

The existing qualified simulated-upstream request fixture now issues a customer invoice through HTTP, replays issuance with the same idempotency key and reads its grouped lines. The invoice contains the exact 12000-nanounit customer charge for the completed request while the independent Supplier ledger accrues 4000 nanounits. Replay returns the same invoice and customer lines contain no Supplier earnings. The extended PostgreSQL-backed gateway test passed. These fixture amounts are not production prices or live commercial evidence; actual Supplier qualification and demo customer tariff setup remain open.

### Customer model contract cleanup (2026-10-02)

Inspection confirmed the admin model serializer excludes route procurement prices for both installation and customer identities. Removed the unused dashboard `RoutePricing` type and optional procurement-price field from its customer model contract; no callers referenced either. Dashboard type checking and public-boundary checks passed. Rendered product behavior is unchanged; this cleanup prevents the customer dashboard contract from suggesting those fields belong in customer-facing models.

### Public test-rate refresh and exact SDK inputs (2026-10-02)

The OpenRouter test-rate importer now supports explicit `--refresh-rates` publication. It validates the selected catalog and route identities before writing, retains historical rate revisions, supplies the current revision for optimistic concurrency, and refuses currency changes or ambiguous current offers. Refreshing rates does not establish qualification, discounts or customer selling prices. Five importer tests passed; a live refresh verified all 25 public input/output rates with zero additional records or revisions after the reviewed rate update.

The JavaScript SDK now rejects numeric rate inputs at runtime, including inputs from plain JavaScript callers that bypass TypeScript types. Supplier and customer tariff publication require exact integer strings before transport. All 36 SDK tests passed, including numeric-input rejection and exact monetary values beyond JavaScript's safe integer range. These checks qualify these contracts only; the complete release gates remain open.

### Supplier route qualification invalidation (2026-10-02)

A new additive migration invalidates offer qualification atomically when a reviewed Supplier endpoint, adapter or encrypted credential changes, or when its upstream model, route ownership or declared capabilities change. Affected offers pause, retain immutable prior evidence and receive an audit event; activation requires a new current review. Display-name edits and unchanged connection values preserve qualification. This prevents prior model/protocol evidence from silently authorizing a different route.

All three Supplier PostgreSQL storage tests passed, including six material-change cases, transaction rollback, unchanged-value controls, rejected reactivation and retained evidence/audit counts. These are fixture-based enforcement checks, not external Supplier or protocol qualification. No development offer was activated and no discounted supply claim was introduced.

### Prepared-request qualification race (2026-10-02)

Supplier-bound attempts now pin the exact qualification review alongside the agreed rate revision. Dispatch rejects a changed or missing pinned review, including when a changed route has subsequently been requalified at the same rates. Existing completed accounting records remain unchanged; pending legacy bindings without a pinned review fail closed. This prevents requalification from reviving requests prepared with stale connection data.

Three Supplier storage tests passed, with all six material-change cases demonstrating rejected stale dispatch after requalification and retained `not_sent` state. Six Supplier/customer HTTP regression tests passed, including independent billing ledgers and access boundaries. The source-watched development service applied both additive qualification migrations without resetting its database. This is enforcement evidence, not full F04/F07 acceptance.

### Supplier route availability at dispatch (2026-10-02)

Prepared Supplier requests now recheck both the Supplier configuration and mapped model's enabled switches, route existence and ownership immediately before dispatch. Catalog eligibility and offer binding apply the same enabled-route requirements. Disabling a route preserves its qualification evidence but denies dispatch; material changes still require a new review.

Three Supplier PostgreSQL tests passed, including disabled configuration/model checks across six prepared-request cases, unchanged qualification and retained `not_sent` state. Six Supplier/customer HTTP regressions passed. These checks qualify the named availability controls only; live protocol coverage and commercial supply remain open release gates.

### Live inference after Supplier dispatch hardening (2026-10-02)

A fresh nonstreaming Gemini 2.5 Flash request succeeded through the running dashboard Chat API using the existing active Demo Workspace key. Its durable activity record showed confirmed completion, provider-reported token usage, HTTP 200 and complete 1,486 ms request timing, including a 40 ms pre-dispatch interval. No first-output timing was inferred for the nonstreaming response. Retained request and generated-response payloads were complete, untruncated and usable for diagnosis; upstream monetary metadata was absent from both the customer response and retained response usage.

The customer charge remained explicitly `unpriced` with a null amount, rather than substituting OpenRouter procurement rates. This is fresh evidence for the named model and nonstreaming request/Logs contract after the qualification migrations; it does not qualify explicit commercial offers, other protocols, the full rendered workflow or discounted supply.

### Rendered request latency consistency (2026-10-02)

The Logs table and request detail headline now use the complete measured request interval shown by the timing waterfall. Previously the live request displayed 1,437 ms in the headline and a 1,486 ms waterfall total because the headline used a narrower attempt interval. Interrupted timing does not become a completed latency; historical records without phase timing retain their recorded attempt duration.

The actual OpenRouter workspace Logs page was inspected as the reference. Niu's populated request-detail view was reviewed at desktop and 390-pixel width, including measured timing and retained payloads; no clipping was observed in the reviewed detail. All 155 dashboard tests passed, including complete/incomplete timing cases and the existing Logs interactions. This qualifies the named correction and rendered detail only, not the full consumption-investigation workflow.

### Aggregate latency consistency (2026-10-02)

Usage averages now use completed request timing totals, matching the Logs latency headline and waterfall. Interrupted phase timings are excluded from both the average and its sample count. Historical records without phase timing retain their complete attempt-duration fallback. The metric is labeled Average latency rather than Average model time, since measured totals include gateway preparation and delivery.

A PostgreSQL acceptance test verified a 136 ms average from completed 100/300 ms measurements and a 7 ms legacy sample, excluding an interrupted 10,000 ms observation; an interrupted-only filter returned zero samples and an unknown average. The gateway activity HTTP regression passed. Type checking passed, and the populated Usage metric was inspected at desktop and 390-pixel width. The full Usage exploration and performance release gates remain open.

### Live SDK timing contract (2026-10-02)

The built JavaScript SDK read the running Demo Workspace activity endpoint and independently reconciled all 14 eligible request records with the server's 1,886 ms rounded average and sample count. The SDK documentation and OpenAPI contract now distinguish completed full gateway request totals, legacy dispatch-to-completion intervals and interrupted observations. Average calculations retain the documented historical fallback; percentile samples exclude missing phase timing rather than treating historical attempt durations as full gateway measurements.

The SDK build passed and the OpenAPI document parsed successfully. This qualifies this live SDK read and documented timing contract, not packaged installation, a complete SDK protocol matrix or the full release.

### Key Guardrail assignment API (2026-10-02)

Workspace-authorized GET/PUT endpoints now expose preserved key policy assignments at the scoped key Guardrail path. Assignment validates the stored policy, requires an active key in the same workspace and uses optimistic assignment revisions. The JavaScript SDK provides matching read/assign methods; the dedicated Guardrails OpenAPI contract documents permissions, unknown assignments and failure responses.

A PostgreSQL fake-upstream HTTP test now creates the key assignment through the API and verifies readback, inference-key rejection, workspace-reader write denial, authorized reader access, cross-workspace read denial and stale assignment conflict. The assigned restriction still blocks Chat, Responses and Embeddings with zero upstream calls after the workspace policy allows all. All 37 SDK tests passed and the assignment contract parsed. Removal/rotation semantics, assignment audit history, dashboard management and the remaining F09 content-control gates remain open.

### Key assignment attribution and rotation (2026-10-02)

Guardrail assignment changes now retain immutable, workspace-scoped policy/assignment revision history with authenticated actor attribution in the same transaction. Failed or stale writes leave both the assignment and its history unchanged; credentials are not recorded. Existing rotation preserves the assigned policy and revision while revoking the old key.

The PostgreSQL storage test passed durable assignment/rotation checks, rejected history deletion and competing updates with exactly one committed actor-attributed event. The HTTP enforcement test passed and verified installation attribution with no duplicate event after a stale write. Removal semantics, assignment history API/UI and request-level decision audits remain separate open F09 requirements.

### Revision-safe key policy removal (2026-10-02)

The key Guardrail PUT endpoint now accepts an explicit null policy revision to clear the optional key assignment. It preserves an incremented assignment revision and immutable removal event, preventing stale recreation after removal. Missing policy fields are rejected rather than interpreted as removal. The SDK exposes `clearKeyGuardrail`; readback retains the cleared assignment's revision with null policy fields. Mandatory workspace policy enforcement remains unchanged.

PostgreSQL storage tests passed removal/readback, retained actor history, stale recreation rejection and reassignment with the current revision. The fake-upstream HTTP test passed explicit removal, missing-field rejection, stale conflict and a mandatory workspace denial after clearing, with zero upstream requests. All 38 SDK tests passed. Dashboard assignment management and audit-history investigation remain open F09 requirements.

### Authorized key assignment investigation (2026-10-02)

The scoped key Guardrail history endpoint and SDK method now expose newest-first immutable assignment/removal events with policy names, revisions, times and readable actor names. Responses exclude internal actor identifiers and credentials. An exclusive revision cursor bounds pages to 100 events; history before audit support is not fabricated.

The PostgreSQL HTTP test passed authorized reader access, cross-workspace denial, 104-event pagination, removal history and a workspace owner's actor-name resolution without identifier/credential exposure. All 39 SDK tests passed; the history contract parsed. Dashboard history investigation and correlated request-level decisions remain open F09 requirements.

### Current model policy at dispatch (2026-10-02)

A database dispatch trigger now rechecks current workspace and assigned-key model rules before transitioning a prepared request to possible execution. Workspace activation and dispatch share a transaction lock; key assignment changes serialize through the key row. A changed model denial rejects the transition and leaves the attempt unsent. Admission paths map this rejection to a conflict rather than a generic storage failure.

PostgreSQL tests verify a request prepared before workspace activation and one prepared before key assignment are both rejected at dispatch. All 45 storage tests and the full gateway regression passed, including the configuration process-replacement test. This closes the tested model-rule preparation gap only: Provider-rule races, correlated decision attribution and measured overhead of the added transaction coordination remain open F09/F10 gates. No performance claim follows from functional tests.

### Recorded Provider at dispatch (2026-10-02)

Priced and batched unpriced requests now record the configured Provider on the attempt before dispatch. The current workspace/key access check applies Provider rules to that recorded identity alongside model rules. Once recorded, the Provider snapshot cannot be changed; historical requests with an unknown identity fail closed under restrictive Provider rules. The legacy batch function remains available, while current gateway callers use the Provider-aware overload.

Three PostgreSQL Guardrail tests passed, including requests prepared before workspace/assigned-key Provider denial, matching/nonmatching allow-lists, unknown identity rejection and immutable snapshots. The full gateway regression passed, including protocol, independent billing and configuration process-replacement checks. This qualifies the tested dispatch controls; concurrent-load coordination, correlated decision records, content controls and performance measurements remain open requirements.

### Admission coordination and priced all-model keys (2026-10-02)

Admission now acquires workspace policy coordination before key/account/attempt locks. Batches acquire workspace locks in a stable scope order. A PostgreSQL fixture completed 16 rounds of concurrent opposing two-workspace batches, with both requests admitted in each batch. This verifies the tested lock ordering, not load capacity or measured overhead.

Priced reservation and its final dispatch recheck now honor the same all-model wildcard grant as unpriced admission. The gateway fixture exercises a wildcard key through successful priced requests, settlement and budget exhaustion. All 114 gateway tests and the separate configuration process-replacement test passed. Customer tariffs remain separate from Supplier purchase rates; no test Supplier rate was promoted to a customer tariff. Broader release and performance qualification remains open.

### Storage-level payload retention boundaries (2026-10-02)

A dedicated PostgreSQL storage fixture supplements the inference capture checks. It verifies the 24-hour default expiry, first-write preservation under duplicate capture, read/deletion isolation between workspaces, hidden expired records followed by physical purge, and retained attempt metadata after payload deletion. Direct storage writes exceeding the response or request size bounds are rejected without retaining a partial record. The fixture passed against the current migrations. This does not qualify every protocol's capture behavior or the complete dashboard deletion workflow.

### Payload API access and deletion (2026-10-02)

A PostgreSQL HTTP fixture verifies inference credentials cannot read diagnostic payloads, workspace readers can read with `Cache-Control: no-store` but cannot delete, and workspace administrators can delete. Cross-workspace reads and deletions return the shared authorization layer's not-found response, leaving the source payload intact. Authorized deletion removes only content and preserves attempt metadata. The fixture passed; complete rendered deletion interactions remain unqualified.

### Payload contract and SDK error fidelity (2026-10-02)

The request-content OpenAPI responses now distinguish insufficient role permission (403) from concealed out-of-scope workspace records (404), matching the verified shared authorization behavior. An SDK transport fixture verifies deletion preserves the caller's cancellation signal, propagates 404 without retry, and rejects invalid attempt identifiers before transport. All 40 JavaScript SDK tests passed; the updated contract parsed and public-boundary checks passed. This is contract/SDK evidence, not qualification of the complete UI or every content-capture protocol.

### Explicit capture-header validation (2026-10-02)

Inference payload capture now accepts only one case-insensitive `true` or `false` header value. Malformed, empty, comma-combined and repeated values fail before admission instead of silently enabling content retention. The PostgreSQL HTTP fixture verifies these rejected requests create no attempts, while existing omitted-header capture, explicit opt-out, streaming and retention checks continue to pass. The full gateway regression passed 115 tests plus configuration process replacement. SDK guidance and the capture-header contract describe the validation. Broader content-policy and rendered workflow qualification remains open.

### Responses input extraction preparation (2026-10-02)

The bounded local text engine now extracts self-contained Responses instructions, plain string input and explicit text-message content parts, preserving original protocol structure and Unicode. Tool content, files/images, conversation references and previous-response state are rejected rather than treated as inspected. Denial checks see original content before redaction. Chat extraction also checks the rule-count limit before traversal. Four engine tests passed, including nested Responses transformations, instruction denial and unsupported-content cases. This module remains disconnected from live policy enforcement: policy schema, dispatch coordination, safe decision attribution and protocol integration are still required before any content-control capability is advertised.

### Embeddings input extraction preparation (2026-10-02)

The local engine now inspects Embeddings string inputs and batches with aggregate size limits and original-content denial precedence. Numeric token arrays, mixed batches and nested inputs fail explicitly. Tests verify Unicode redaction, preserved dimensions/output encoding, no mutation of originals, batch denial and aggregate input bounds. Responses prompt templates are also rejected because referenced content is outside local inspection. All five engine tests passed. The [extraction coverage](../reference/local-input-inspection.md) documents limits and unimplemented integration; this remains preparation rather than live Guardrail enforcement.

### Authorized synthetic local input tests (2026-10-02)

Workspace readers can test synthetic Chat, Responses and Embeddings input against bounded local block/redact rules through the documented input-preview endpoint. Results return safe outcome/reason codes and whether text would change; originals, transformed payloads and matches are never returned. Responses prohibit caching. The endpoint stores no policy or content and dispatches no inference or detector request. Unsupported content is indeterminate, not allowed.

The PostgreSQL HTTP fixture passed protocol denial/redaction cases, token-array rejection, inference-key/cross-workspace denial, invalid-pattern rejection, secret-free responses and zero persisted requests/policy. All 118 gateway tests and configuration process replacement passed; the Guardrails contract parsed. This qualifies only the API synthetic workflow. Dashboard interaction, SDK access, live content-policy enforcement, correlated audits and output/detector controls remain incomplete.

### Synthetic input SDK and live example (2026-10-02)

The JavaScript SDK now exposes typed synthetic input tests and safe verdicts, validates supported protocols/rule counts/pattern byte sizes before transport, and preserves cancellation. The fixed example sends only synthetic text and prints the safe result. All 41 SDK tests passed. Running the built example against the development service on port 2566 returned the expected blocked pattern outcome with `synthetic: true` and `enforcement: false`. This is development API/SDK evidence, not packaged-product qualification or live content enforcement.

### Synthetic inspection worker isolation (2026-10-02)

Synthetic rule compilation and text inspection now run outside async request threads, with four blocking jobs per gateway process and no waiting queue. A five-second response deadline, capacity exhaustion or worker failure returns unavailable without inference dispatch. Running computation retains its slot after caller cancellation or deadline expiry until it finishes.

All six local-engine tests passed, including a controlled cancellation fixture proving the occupied slot cannot be reused until the blocked computation completes. The PostgreSQL synthetic endpoint regression passed after worker isolation. These checks establish the tested resource bound, not measured latency, throughput or live content-policy protection.

### Immutable allowed-dispatch policy attribution (2026-10-02)

Successful dispatch now records the current workspace policy revision and key policy/assignment revisions atomically with the attempt transition. The record is immutable and remains tied to preserved policy names after activation or assignment changes. An authorized request-level API returns only access coverage, enforcer version, policy names/revisions and one recorded time. It contains no content, credentials, internal identifiers or commercial information; responses prohibit caching.

Four PostgreSQL Guardrail storage tests passed, including historical attribution, immutability, scoped reads and no allowed record after a denied transition. The full gateway suite passed 120 tests plus configuration process replacement, including scoped reader access and inference-key/cross-workspace denial for the new endpoint. The contract parsed and public-boundary checks passed. Historical missing records and denials remain null; durable denied-decision auditing, content enforcement, UI/SDK investigation and performance qualification remain open.

### SDK investigation and priced policy attribution (2026-10-02)

The SDK now reads request-level allowed-dispatch attribution with typed historical policy metadata, preserves cancellation and leaves missing records null. All 42 SDK tests passed. The priced PostgreSQL inference fixture now activates a workspace policy and assigns it to the all-model key, verifies both successful requests retain the correct policy/assignment revisions and name, and still verifies settlement and exhaustion prevent further upstream calls. That fixture passed. UI investigation and durable denial auditing remain incomplete; these access records do not establish input/output inspection.

### Main API contract includes Guardrails (2026-10-02)

The main OpenAPI document now references all seven implemented Guardrail paths: workspace read/activation, access preview, rollback, key assignment, assignment history, synthetic input preview and request dispatch attribution. A traversal parsed and resolved 99 local references across five contract files and verified every dedicated Guardrail path is included. Public-boundary checks passed. This validates reference completeness, not every operation's conformance or a generated client. Packaged install/upgrade/restore execution remains unavailable in the current environment because neither Docker nor Podman is installed; no packaging gate is passed.

### Versioned synthetic local presets (2026-10-02)

Synthetic input tests and the SDK now accept explicit `email_v1` and `api_key_prefix_v1` presets as alternatives to a custom pattern. A rule cannot supply both sources or neither. Documentation states covered forms and false-positive/negative limitations; no universal secret/PII detection claim is made. Seven engine tests, the PostgreSQL synthetic HTTP fixture and all 43 SDK tests passed, including preset redaction, invalid/ambiguous sources and secret-free responses. These presets remain synthetic-test capabilities; live policy enforcement is not enabled.

### Synthetic validation errors exclude content (2026-10-02)

The synthetic inspection endpoint now handles JSON rejection explicitly after workspace authorization, returning a generic validation error instead of Axum parser details. PostgreSQL HTTP fixtures verify secret-bearing invalid protocol/action values and unknown field names are not echoed, alongside preset and prior authorization/zero-dispatch checks. The fixture passed. The API contract reflects generic 400 validation responses. This establishes the tested preview error boundary, not all product error-response sinks.

### Current dependency and storage release checks (2026-10-02)

The CI-pinned cargo-deny 0.20.2 auditor passed Rust dependency licenses, including the pinned regex engine. The JavaScript license verifier passed 566 installed package versions under the existing scoped exception policy. The selective import verifier confirmed 22 LiteLLM crates, MIT attribution and the standalone cost-engine checksum. Ten Guardrails/payload source and test files were formatted and passed their targeted formatting check; other shared-worktree formatting differences remain and the overall formatting gate is not passed.

All 49 PostgreSQL storage tests passed against the current migrations, including dispatch attribution, lock-order batches, billing, retention, Supplier qualification and isolation fixtures. These are local release checks, not independent image installation, browser acceptance, external Supplier qualification or a complete F01–F10 pass.

### Bounded cleanup and non-renewable payload expiry (2026-10-02)

Payload capture no longer deletes all expired content on each save. Existing background maintenance removes at most 500 expired records per pass and skips locked rows. Reads continue to hide expired content immediately; physical cleanup remains dependent on maintenance progress, without a hard deletion-time guarantee. New captures derive expiry from the original attempt creation time, so late duplicates cannot restart retention after deletion or purge. Missing attempts still fail the foreign-key boundary.

Two PostgreSQL storage fixtures passed first-write retention, late capture rejection, missing-attempt rejection, size limits and a 550-record cleanup case with ten locked rows. Cleanup completed in bounded passes without waiting for the held rows and preserved every attempt. Both gateway payload capture/deletion regressions passed. Contract and SDK documentation describe the fixed window; this is functional retention evidence, not a throughput benchmark or complete F09 qualification.


### Native Codex CLI telemetry adapter (2026-10-02)

The installable companion now supports `niu-agent-observability codex -- [args]`.
An authenticated loopback OTLP JSON receiver extracts allowlisted metadata before
upload or private offline storage. Per-invocation Codex settings enable this
receiver without editing user configuration, provider routing or authentication.
The adapter excludes prompts, outputs, account details and arbitrary attributes,
and separates token completion events from timing-only completion events to avoid
double counting. Each event is a partial trace with an unknown overall task outcome.

Codex CLI 0.154.0 was exercised with an ephemeral session and a local mock Responses
service. Native telemetry confirmed input/output/cache counters and the actual
field names. This is native client/exporter qualification against controlled
responses, not a real subscription billing run. Source-reported tokens are retained
in trace details; subscription Metrics aggregation, reasoning breakdowns,
cross-event trees and desktop first-use qualification remain open. F08 remains open.

Validation for this adapter: all 11 companion tests passed with the native Codex
check enabled; syntax checks and public-boundary checks passed. The rebuilt npm
archive installed successfully, and its native launch command ran Codex 0.154.0
and delivered process metadata to a local test receiver. Documentation checks and
the static documentation build passed. No user Codex configuration was modified,
and no live OpenAI inference or subscription billing qualification was performed.


## Collector release and setup guidance — 2026-10-06

`@niu-io/collector@0.1.1` is published on npm with GitHub Actions provenance;
its registry archive checksum and installation were verified. Release publishing
uses a separate workflow triggered by a new `collector-v<version>` tag on a
commit belonging to main. PRs validate the archive without publishing.

Connection settings and the public Agent Observability guide now use the published
package and `niu-collector` commands. Codex setup defaults to source `codex`,
version `0.1.1`, plugin installation, explicit hook trust, private ingestion
credentials, `connect --consent`, `enable codex --consent`, and a session restart.
The persistent receiver and trusted SessionStart hook support ordinary local
sessions without repeatedly invoking the wrapper.

Correlated native metadata and session hooks assemble into chronological session
traces with deduplicated usage and bounded continuation parts. Coverage remains
partial; task acceptance, subscription billing attribution, comprehensive desktop
qualification and cloud orchestration coverage are not established. Verification,
queue retry, disable/disconnect, key revocation and separate history deletion are
documented. This supersedes the earlier source-only publication and separate-event
trace setup notes; the underlying qualification limits remain in force.
