# First feature-complete Niu release

Status: historical scope version 0.4 and implementation checkpoints, superseded on 2026-09-29 by [the current release matrix](first-release.md). Requirements below are preserved for traceability, not current release obligations. Dated test results have not been rerun by the scope revision.

Scope version: 0.4 (2026-09-28). The current delivery is platform readiness: a clear provider-to-model-to-key-to-request-to-activity workflow, with Playground comparison and useful request history. Coding-agent integrations and task-economics automation are deferred until this platform gate passes. Agent Observability and Benchmark build on gateway evidence; provider collectors and manual imports supplement it.

## Objective

Deliver an independently usable open-source model gateway and cost-optimization product. The primary unit is an accepted complex-task outcome: its execution history, quality, total cost, latency and human intervention. Every supported model request in the product workflow goes through Niu. The gateway automatically persists request/attempt metadata, usage, latency, route and known cost; the dashboard analyzes those records without a user exporting logs. Supported agent adapters configure agents to call Niu and enrich those records with task IDs, local tool activity and outcome evidence. Provider-side capacity and invoice collectors supplement gateway evidence without becoming a prerequisite for request capture.

Sequence delivery in two steps. First make the platform itself straightforward and verifiably useful for provider setup, scoped keys, model comparison, client access, and automatic usage/cost visibility. Defer coding-agent connectors, subscription-preserving agent routes, external collectors, and task-level optimization until that platform path is accepted end to end. These remain later product targets, not first-platform-release prerequisites.

The gateway remains part of the first-release scope. An operator must also be able to install Niu, create an organization and project, connect providers, issue scoped keys, execute supported requests, enforce spending and security policies, inspect every attempt and its cost, and upgrade and recover the installation using the documented product. These workflows must work through both the management API and dashboard. Niu-managed native subscription supply, where provider eligibility permits it, remains distinct from a coding agent routing its own subscription-authenticated requests through Niu. Neither mode may be represented as an API-key call or as a complete agent task.

Performance and cost are the product outcomes; security constrains every execution path. Cost optimization is measured as cost per successfully completed task at an explicit quality and latency requirement. Missing measurements and failed tasks must remain visible.

“Feature-complete” means every required row below passes its acceptance tests in a clean installation. It does not mean universal provider compatibility or an unbounded promise of parity with other products. Narrowing a required row requires an explicit scope decision, not silently marking it complete.

## Primary product acceptance path

The first integrated dashboard review must pass the intersection of R03, R06, R09
and R20 before breadth work is treated as product progress: connect a usable
provider/model route, issue a key scoped to the selected workspace and project,
make a real client request through Niu, then see its automatically retained
usage, duration and cost status in the dashboard. The app setup must state the
base URL, key purpose, model alias and a copyable request example. The model
experience must let the operator compare at least two model aliases with the
same prompt, including observed output, token usage, duration and cost when
known; this is a model trial, not an accepted-task benchmark. Request activity
must remain visible after refresh and be browsable beyond the latest 100
entries. A healthy gateway is part of the product, not an external connection
users are asked to disconnect from.

This is the sequencing gate, not a reduction of the full product target below.
Task IDs and agent adapters enrich request evidence only after this path is
accepted. Provider billing imports, synthetic benchmark fixtures, a chat smoke
test, and generic resource management do not substitute for passing it.

## Release gates and sequencing

The 23-row matrix below defines the full task-economics product target; it is
not a flat checklist for deciding what to build next. Ship and describe the
capabilities in these gates:

1. **Platform readiness (current focus):** R01's packaged-install slice;
   R02–R03's workspace, key, provider and model slices; R04's documented
   first-request protocol; R06 and R09's request visibility and dashboard flow;
   R12's client setup example; R14's build and package checks; and R20. On a
   clean install, configure and validate a provider/model route, create a key
   scoped to the selected workspace and project, compare at least two model
   aliases against the same prompt in Playground, show copyable client setup,
   and send a real client request through Niu. After refresh, Activity must
   show that request automatically with usage, latency and either known cost or
   an explicit unknown; the user must be able to browse history beyond the
   latest 100 entries. Require the authentication, model-grant,
   tenant-isolation and secret-handling controls used by this path; the broader
   R01–R14 capabilities remain separate matrix work. This gate verifies
   platform usefulness, not task-level savings.
2. **Coding-agent integrations (deferred):** R21–R23
   start after platform readiness passes. Qualify each documented agent,
   version, provider, mode, and eligibility separately. A generic SDK or chat
   smoke does not count as a coding-agent integration.
3. **Task-economics release:** R10, R11, and R17–R19, with R22 as an
   additional activity source when direct routing is unavailable. A supported adapter must
   connect local task/tool/outcome evidence to gateway-owned attempts. Compare
   matched tasks only when the same task definition, tools, permissions, and
   acceptance evidence are available. Include failed work and all known costs;
   leave unknown prices and unobserved work unknown. At least one authorized
   paired experiment must be completed before claiming an optimization result.
4. **Subscription-route qualification:** R21. Validate each coding-agent and
   provider combination separately. A subscription route is supported only
   when the client and provider document the route, billing and eligibility
   remain valid, and a real end-to-end test confirms the subscription remains
   the payer. This is distinct from Niu-managed native subscription supply.
5. **Capacity and Enterprise expansion:** advanced R05/R07 controls, R13,
   and R15–R16. Niu-managed subscription supply, provider quota collectors,
   account pooling, and private optimization policies are optional to the
   gateway preview and must not become hidden prerequisites for first inference.
6. **Commercial services:** paid optimization, invoices, and referral credits
   follow evidence-backed task economics and an implemented billing and
   settlement owner. They are not part of the gateway preview; never show a
   price, savings promise, or earned credit without its underlying record.

Passing platform readiness permits a clearly labeled platform preview. Do not
call Niu's task-economics optimization generally available until the task
evidence and matched-evaluation gate passes. The matrix remains the acceptance
source for each capability; a gate does not mark its rows complete by
implication.

## Required acceptance matrix

| ID | Product capability | Release acceptance evidence |
| --- | --- | --- |
| R01 | Installation and operation | One Niu image and port serve the homepage at `/`, docs at `/docs/`, the public model catalog at `/models/`, workspace UI under `/workspaces/:workspace/…`, and existing inference/management APIs. Compose provisions PostgreSQL. Clean install, route-family smoke tests, docs assets/search/sitemap, nested-route refresh, API 404 behavior, inference streaming, readiness, graceful drain, persistent restart, backup/restore and upgrade are exercised. No mandatory Redis, queue service or separate UI server. |
| R02 | Identity and administration | Persistent organizations, projects, operator sessions, roles and scoped API keys; create, rotate, revoke and expire keys through API and dashboard. Cross-tenant isolation and revocation-before-next-attempt tests pass. Credentials are never returned by list APIs or logged. |
| R03 | Provider and model management | In the dashboard or documented API, connect and validate a provider, browse or configure supported models, publish a usable alias, and make that alias available to a scoped project key. Explain provider credentials, routing and optional price configuration in terms of the next inference request. In-flight work pins a revision; disabled credentials cannot start new attempts. A model screen must help an operator decide what to route, not stop at a CRUD listing of aliases. |
| R04 | Inference compatibility | Chat completions, streaming, tool calls, structured output, embeddings and Responses have documented request/response contracts and a provider capability matrix. OpenAI-compatible, native Anthropic and Bedrock routes each have applicable conformance fixtures. Unsupported combinations fail before dispatch. Cancellation and fragmented streaming are tested. |
| R05 | Execution and routing | One attempt coordinator owns explicit selection, opt-in weighted/round-robin routing, health, concurrency limits, bounded queues, deadlines, rate limits and bounded retries/failover. No silent explicit-model substitution or unbudgeted paid fallback. No provider switching after response commitment. Every dispatch, including failed retries, is attributable. |
| R06 | Durable usage and cost | Every admitted Niu inference request automatically creates durable request and attempt evidence with outcome, usage confidence, requested/reported identity where available, timing, immutable price revision and integer monetary entries. The project dashboard reads this gateway-owned evidence; an end user never has to export or upload a log file. Support optional task correlation metadata so adapter-tagged calls can be grouped. Report API-equivalent cost, cash cost and provider capacity separately. Missing usage/cost remains unknown. Request history must be cursor-paged or aggregated beyond the latest 100 entries; totals disclose their loaded time window and never imply a complete total from a partial page. Persistence, retention, idempotence and reconciliation survive duplicate events and restart. |
| R07 | Budget enforcement | Organization/project/key budgets reserve exposure atomically before dispatch; concurrent calls and retries cannot spend the same allowance. Unknown liabilities remain reserved pending reconciliation. Routes without a defensible upper bound cannot claim strict budget enforcement. Crash, cancellation, expiry and delayed-usage tests pass. |
| R08 | Security and content policy | Enforce model permissions, credential boundaries, request limits and required pre/post content policy. Ship usable allow/deny and redaction rules plus a versioned policy interface. Define streaming inspection/buffering semantics; blocked content cannot leak before inspection. Hook failures obey explicit fail-closed rules. |
| R09 | Product dashboard and first-use flow | For the current platform release, guide an administrator from provider/model setup to a key scoped to the selected workspace and project, a Playground comparison of at least two model aliases using the same prompt, client setup, a real request through Niu, and automatically visible Activity after refresh. Show observed responses, token usage, duration and cost when known; label unknown cost explicitly. Make request history navigable beyond the latest 100 entries. Keep the normal gateway path usable without task IDs, imports, or agent integrations. Model selection, comparison, usage, cost, and request detail screens must support concrete decisions; generic CRUD tables alone do not satisfy the row. Later coding-agent setup must disclose the tested client version, route/collection mode, permissions, and data coverage. Operator actions have durable audit records, and inference-dependent actions fail with a clear recovery path when the gateway is unavailable. Keep explanatory copy short and let labels, status, defaults, and next actions carry the workflow. Retain niu.io branding and English copy. |
| R10 | Observability | Correlate every gateway request with its attempts, routing, latency/TTFT, throughput, queueing, failure and usage/cost evidence. Provide redacted structured logs, metrics, traces, and coverage reports to both operators and the cost-analysis workflow. Default telemetry excludes prompts, outputs and credentials. Readiness reflects required dependencies. Gateway request events and agent-local events have distinct provenance. |
| R11 | Evaluation and scheduling contracts | Public deterministic task fixtures and validators, repeated-run runner and reports include failed tasks, retries, validation overhead and unknown costs. Compare explicit strong/cheap baselines and opt-in fixed rules. Model-protocol adapters and agent/task adapters have separate capability contracts. Ship a sandboxed reference task adapter that routes model calls through Niu, correlates gateway attempts, and validates task accounting and cancellation. |
| R12 | Documentation and SDK | Complete self-hosting, configuration, API, capability, security, pricing, migration, backup and troubleshooting docs. JavaScript SDK supports released inference operations and cancellation/streaming. Examples run against the packaged product. |
| R13 | Enterprise extension compatibility | The immutable Enterprise release manifest, startup health checks, same-domain Gateway forwarding, and signed tenant context are exercised by an out-of-process reference service. Extensions cannot bypass core tenant authorization, reservations, attempt recording or revocation. Enterprise pins an immutable compatible Niu release. Community builds require no private dependency or license service. |
| R14 | Release quality and provenance | CI builds/tests the monorepo and container, validates migrations and extension compatibility, checks dependency licenses and import checksums, and inspects packaged contents. Record reproducible performance results on stated hardware and workloads. No unsupported savings or superiority claims. |
| R15 | Niu-managed native subscription resources and account pooling | Ship at least one verified native subscription inference adapter and an API-key adapter through the same coordinator. Represent authentication mode, billing mode, account, plan and observed quota windows separately. Independently authored conformance and integration tests cover account-isolated refresh, concurrent refresh exclusion, quota observation freshness/reset, bounded account concurrency, session affinity, exhaustion/cooldown, credential expiry, capability-aware selection and failover. Explicit models and billing modes are preserved; paid overflow needs explicit authorization and budget. Provider-specific eligibility and supported protocol subsets are documented. This row covers subscription supply managed by Niu, not forwarding a coding agent's own subscription session; that is R21. No additional gateway service is required. |
| R16 | Provider capacity and billing visibility | Provide at least one supported, versioned connector for out-of-band provider quota/capacity or billing evidence that Niu cannot derive from its own request ledger. Show source, coverage, freshness, shared quota windows, resets and unattributed changes. Keep provider-reported actual model identity distinct from Niu's requested alias. Metadata-only defaults exclude prompts, source, tool output and credentials. Connector replay is idempotent, conflicts are rejected, and retention/deletion follows documented policy. These provider records supplement automatic gateway capture; do not make users export or import their Niu request logs. |
| R17 | Task and agent execution investigation (deferred) | After platform readiness, verify the shared contract end to end: join gateway-native requests to optional adapter events for tasks, agents/subagents, tool steps, retries, validation, and outcomes. Explicit causal links handle delegation, parallel branches, fallbacks, checkpoints, resumes, cancellation, and human intervention. A supported adapter associates calls with a stable task ID; Niu's attempt remains authoritative for routed model usage and cost. Explicitly opted-in external collectors use R22 provenance and coverage. Fixtures are necessary but do not replace end-to-end verification. The dashboard distinguishes task wall-clock from summed work and exposes missing instrumentation. No task import is required for gateway request visibility. |
| R18 | Outcome and task/cohort accounting | Distinguish self-reported completion, deterministic validation, human acceptance and unverified outcomes. Aggregate shared/nested work once using canonical charge identities, including failed attempts, classification, validation, retries and escalation. Keep invoice cash, allocated subscription shares, API-equivalent cost and quota observations distinct. Unknown tool/resource costs remain unknown. Cohort spend includes failures and is divided by accepted completions; zero accepted completions yields undefined successful-task cost rather than zero. |
| R19 | Evidence-based comparison and diagnostics | Benchmarks join gateway-native request/attempt evidence with adapter task, tool and outcome events through R17's identities. A matched comparison is eligible only when the task snapshot, tools, permissions, and acceptance criteria match and validator or human acceptance evidence is available; otherwise show observations in Playground without a task-economics benchmark. Reference diagnostics link to observed events and are labeled heuristics. Reports separate observed results, heuristic diagnoses, untested estimates and paired experimental results. Isolated, opt-in, budgeted comparisons include all execution/evaluator costs, coverage, sample size and uncertainty. Unknown cost stays unknown; pricing is optional for gateway use and required only to calculate a monetary comparison. Fixtures include a cheaper candidate that wins, one that loses through extra work and one that fails acceptance. At least one authorized paired experiment supplies real evidence. Private policies use the same public benchmark constraints and cannot bypass authorization or accounting. Imported records are supplemental, not the default benchmark input path. |
| R20 | Simple model access and progressive disclosure | From a clean installation, configure a provider and alias in the dashboard, issue a key scoped to the selected workspace/project and allowed model, copy the Niu base URL/model alias/request example, then send a standard custom-client request through Niu. Verify that after refresh the Activity record appears automatically without an import, includes provider-reported usage and timing, and remains reachable by browsing beyond the latest 100 entries. Show settled cost when price evidence exists; otherwise cost must say unknown. Do not count an API-only chat smoke, imported run, coding-agent adapter, benchmark, pooling, or Enterprise service as completion. First inference needs no task ID or pricing setup, and optional controls cannot silently become prerequisites. |
| R21 (deferred) | Subscription-authenticated coding-agent gateway routes | Maintain a provider/client/version compatibility matrix that distinguishes documented support, tested behavior, eligibility/terms, and unknowns. For each supported pair, configure the coding agent's documented gateway/base-URL option while retaining its own subscription login and payer; where provider auth occupies a standard header, carry the workspace/project-scoped Niu key in a separate client-supported header such as `X-Niu-API-Key`. Verify a real streamed request appears automatically in Niu without replacing subscription auth. Remove Niu's credential before upstream dispatch; preserve provider auth capabilities, protocol fields, retries and streaming semantics. OAuth/session material is not persisted or logged by Niu. Clearly distinguish subscription quota and fixed fees, paid API overflow, and API-equivalent estimates; never claim a savings multiple until matched tasks with acceptance evidence and all relevant costs are measured. Unsupported or unverified pairs are explicitly labeled and cannot be routed by implication. |
| R22 (deferred) | External coding-agent activity and usage collection | For each supported agent, use a documented export/API, OpenTelemetry destination, or explicit local-file opt-in to ingest model request usage and available task/tool/retry/outcome events when calls do not pass through Niu. Record source, account/workspace scope, agent/version, event time, observed usage/cost authority, identity/correlation fields, retention, duplicate/loss behavior and known blind spots. Redact prompts, responses, source, tool payloads and credentials by default; content collection requires a separate explicit opt-in and deletion policy. Deduplicate and reconcile corrections, preserve unknown prices, distinguish aggregate subscription usage from request-level usage, and never imply this feed is gateway traffic or complete task evidence. Verify ingestion and coverage in the dashboard; imports remain supplemental to automatic Niu capture. |
| R23 (deferred) | Coding-agent connector package and two-mode setup | After platform readiness, provide a shared Niu Agent Connect package/CLI with versioned, independently maintained connectors for supported coding agents. The setup flow offers **Route through Niu** when the agent supports a documented endpoint/provider configuration, and **Collect agent activity** when a documented telemetry/export mechanism or explicitly opted-in local collector exists. Each connector declares compatible versions, supported modes, required permissions, data fields, sensitivity, coverage and known gaps before setup; users can verify, pause, uninstall and restore prior configuration. Route mode uses the selected workspace/project-scoped Niu key in the client's documented gateway credential slot or `X-Niu-API-Key` when provider auth must remain in the standard header; the gateway strips this Niu credential before dispatch. Collection mode leaves provider auth and request routing untouched, delivers observations off the critical path, and labels them as external. Mode changes are explicit; no silent fallback, credential/session extraction, unsupported scraping, or cross-workspace data access. At least one real client integration verifies each mode end to end. See the [Agent Connect architecture](../architecture/agent-connect.md). |

## Simple access is a first-class workflow

The default journey is connect a provider and publish a model alias, create a project key, point a client at Niu's base URL, make a request, and see its automatically retained usage, time and known cost. The dashboard provisions routine workspace/project defaults during first run. The project key is the application credential; installation administration credentials stay in the dashboard and are never pasted into a client. The provider connection and model alias are configured by an authorized administrator in the dashboard or management API.

The earlier R20 closure covered only an API-level chat smoke and one-time key provisioning. The clean-install dashboard path now passes end to end against a deterministic local OpenAI-compatible provider fixture. This verifies the first-use workflow and automatic request activity; commercial upstream behavior remains unqualified. See the gateway-first verification checkpoint below.

First inference must not require a task definition, agent adapter, task ID, benchmark, pricing table, budget, subscription resource or telemetry import. After the request, automatic gateway observations must be visible without setup. Agent adapters progressively add task grouping, local tool activity and acceptance evidence. For agents whose subscription path cannot be routed through Niu, optional documented collectors can add clearly labeled external usage and task observations. Provider quota/invoice collection remains a separate supplemental workflow.

## Priority amendment: gateway-first cost workflow

The first delivery is a complete path from provider setup to project key, gateway request and automatically visible request/cost evidence. The user does not bring Niu a JSON file. This order does not remove any required gateway row from the first feature-complete release.

1. Close the clean-install journey: connect/validate provider, publish an alias, create a scoped key, configure the base URL, send a request, and inspect the automatically persisted result.
2. Build the gateway-owned request activity and cost views over durable operations/attempts; support useful project-level aggregates, bounded history/filtering, cost/usage confidence and unknown outcomes.
3. Deliver agent adapters that keep inference on the Niu endpoint, attach stable task identity, and add tool, retry, validation and acceptance events to the gateway trace.
4. Add supported provider-side quota/invoice collectors as supplemental data, with source, freshness, reset, attribution and deletion semantics. Manual versioned imports remain an advanced migration/test path.
5. Run paired benchmarks against matched task snapshots and acceptance criteria, including all captured gateway and adapter costs. Keep synthetic fixtures clearly separate from measured model performance.
6. Complete native supply, baseline pooling/routing and remaining gateway workflows; evaluate private optimization only against the shared public evidence contracts.

The product must not infer counterfactual improvement from a production trace. Repetition and large context can support a diagnostic hypothesis, not establish unnecessary work or an inferior model choice. No savings target or competitive claim becomes a release result without measured evidence.

## Subscription and capacity acceptance details

- The public core owns native adapters, credential lifecycle abstractions, account pooling, usable reference policies, quota-aware admission and evaluation. Optimized policies and private evaluation assets remain Enterprise extensions.
- Model-protocol adapters and agent/task adapters are distinct. Select transport based on demonstrated protocol capabilities; neither an agent runtime nor a separate gateway is mandatory for subscription inference. Unsupported semantics fail explicitly.
- Credentials and refresh locks are account-scoped. Work on one account must not mutate credentials in a process shared by other accounts. Bound concurrency and preserve affinity where sessions or caches are account-specific. Do not assume session IDs transfer between accounts.
- Observed capacity includes account, window, unit, observation time, reset time, source and confidence. Percentage depletion must not be converted to a token balance without independent evidence. Unknown and stale observations cannot be advertised as available capacity.
- Reports keep token usage, API-equivalent charges, actual cash fees/allocations, and quota-window consumption distinct. Subscription fees and their allocated shares cannot be counted twice. Per-token pricing alone is not a complete subscription cash-cost model.
- Accounting and quota reservations share the existing attempt lifecycle. A provider timeout does not release cash exposure or reserved capacity without execution evidence. Reference account selection must respect interactive-capacity reserves and explicit paid-fallback limits.
- Tests include chronological arrival/concurrency replay and quota resets, not only isolated calls. Published support requires adapter-specific validation; an implementation in another product does not certify an integration.

## Enterprise boundary

The open-source release includes usable access control, keys, budgets, accounting, baseline routing, native multi-source account pooling, content policy, audit records and operational visibility. These foundations must not depend on enterprise services.

Enterprise can supply federation and provisioning integrations, advanced governance and retention, hosted provisioning and billing, private provider/task integrations, and learned optimization policies. It consumes a pinned public core and contracts rather than maintaining a copied core. Public test extensions contain synthetic data only.

Extension contracts must specify version negotiation, trusted tenant context, deadlines, cancellation, permitted mutations, idempotency and failure behavior. Route selectors return candidates; the core revalidates eligibility and reserves exposure. Metering integrations consume durable events and cannot rewrite the authoritative ledger. Out-of-process hooks require authenticated transport and bounded execution.

## Scheduling update (2026-09-26)

The single-origin product shell and packaged route matrix were brought forward as the immediate integration gate. The homepage, docs, catalog, workspace paths and API/static fallback boundaries now run through the existing Rust listener; packaged route and persistence evidence is recorded below. This work does not remove identity, provider conformance, cost, task-evaluation or release requirements. Workspace URL segments remain presentation; the server must continue to authorize every API request, and workspace-scoped operator sessions remain part of R02.

## Supporting implementation milestones

These milestones retain the full gateway and release scope.

0. **Single-origin application shell:** homepage, docs, public model catalog, nested workspace routes and explicit API namespaces on the existing Rust listener. Implementation and current runtime package smoke are complete; finish R01 qualification with the final multi-stage image build and supported-version upgrade test.
1. **Durable foundation:** schema and migrations, identity/scoped keys, configuration revisions, account/authentication/billing resource contracts, attempt coordinator and storage. Prove tenant isolation and crash recovery.
2. **Cost control:** normalized evidence, versioned integer pricing, fixed subscription fees and nonduplicating allocations, separate observed quota windows, three cost views, reservations, settlement and reconciliation. Prove concurrent budget enforcement and unknown-liability handling.
3. **Complete inference:** native subscription and API-key adapters, account-scoped refresh and quota observations, baseline pooling/affinity/cooldown, provider conformance, streaming and cancellation, supported protocols, rate/concurrency controls, routing, queueing and bounded failover. Prove all attempts use the same security and cost path.
4. **Complete product workflows:** management APIs and dashboard for setup, suppliers, keys, routes, budgets, usage and audit; content policies and operational telemetry.
5. **Extension and evaluation readiness:** executable enterprise contract fixtures, sandboxed reference task adapter, reproducible baseline evaluator and full-path performance measurements.
6. **Release qualification:** clean container installation, migration/restore/drain tests, SDK and documentation examples, artifact/provenance checks, and an evidence entry for every acceptance row.

Each milestone ends in integrated, runnable behavior. Contract-only code or mock-only tests do not close a product row. Unit tests supplement end-to-end and fault-injection tests; external-provider checks must distinguish replay fixtures from live validation.

## Current evidence and gaps

The monorepo, gateway, dashboard, docs, SDK, execution contract, paired benchmark analyzer and public extension API are in place. Gateway-owned request capture, task correlation, an agent adapter for common JavaScript inference calls, execution-evidence ingestion, and paged request history now work together. The fresh-install request path now passes against a deterministic local OpenAI-compatible fixture, including automatic activity, older-history browsing, and explicit unknown cost with pricing unset. The overall release is not qualified: R09 remains partial on broader dashboard and operational requirements; R17 still needs broader adapter coverage and accepted-task cost/quality analysis; live upstream qualification, error and retry drill-down, broader budget enforcement, native provider and subscription conformance, sandboxed task evaluation, Enterprise process supervision and key distribution, upgrade compatibility, and reproducible performance/provenance evidence remain open. Durable workspace-scoped operator sessions, role gates, and immutable actor-attributed operator/session lifecycle audit events are implemented and tested.

### Gateway-first dashboard and SDK verification — 2026-09-27

The local dashboard flow configured an OpenAI-compatible test provider and model alias, issued a project key limited to that alias, and showed a copyable Niu base URL and alias. A real HTTP chat request passed through the Niu gateway to the local synthetic provider. The request feed retained it automatically without a request-log import; the dashboard displayed provider-reported usage and latency. With no price schedule configured, cost remained unknown.

The first-party JavaScript `NiuAgentAdapter` was also exercised against the same local gateway. It attached a stable task ID, routed chat through Niu, recorded a tool span and accepted validator evidence, linked the model span to the returned attempt UUID, and uploaded partial-coverage task metadata with a project-scoped execution collector. The request feed joined that evidence to the gateway request, and the dashboard showed **Accepted · partial coverage** while keeping cost unknown. Gateway activity groups now link to the matching metadata-only trace for full spans and causal links. A PostgreSQL integration test now traverses 105 persisted requests across 100-item and 5-item pages, inserts a request between page reads, verifies the older cursor has no duplicate or skipped entries, and confirms a refresh shows the new request. It also checks chronological order and task evidence. The request-history UI exposes older pages and loaded-window summaries; complete historical aggregation is still open. This SDK-level adapter exercise is implementation groundwork, not a coding-agent connector qualification and does not satisfy R21–R23.

This is end-to-end local evidence, not external-provider validation. The fresh-install follow-up below extends the request-path check to a clean database. R20's local-fixture first-use path is verified; R09 remains partial on broader dashboard and operational criteria. R17 remains partial because the JavaScript adapter does not observe unwrapped work, cover every agent runtime or causal link, or establish matched-task benchmark evidence. Do not infer savings until acceptance evidence exists; optional pricing and unknown costs remain explicit.

### Activity filters and full-range totals — 2026-09-28

Activity now filters by local date range, model alias, project key, and gateway
execution state. The API applies each filter inside the authorized project
scope and returns request, token, timing, and settled-cost totals across every
matching attempt, independent of the current cursor page. Unknown usage and
unsettled or unpriced cost remain explicit. Each attempt exposes its operation
and project key identity; consistent upstream-reported model identity is stored
separately from Niu's public alias and shown when the provider supplies it.

The PostgreSQL-backed history test still traverses 105 persisted attempts with
a new request arriving between pages. It now also checks a 10-row filtered
page against totals for all 106 matching attempts, exact token sums, an empty
date window, and a foreign-workspace key filter that returns no rows. The inference
test verifies an upstream-reported model survives the gateway response path;
the stream parser retains a model only when observed chunks agree. The dashboard
type check and Activity integration tests pass. Browser review of the local
dashboard at desktop and 390 px widths showed the filters and totals without
horizontal overflow, and selecting a fixture alias narrowed the feed and its
totals together. These remain deterministic local-provider checks, not
external-provider acceptance. Request-level actionable failures, detailed
retry lineage, and the remaining R09 workspace and operational checks are open.

Release evidence should record the tested commit, environment, command, result and artifact for each row. A release candidate is ready only when all required rows pass and known limitations are documented against exact capabilities.

### Scoped operator and Enterprise composition checkpoint (2026-09-26)

Gateway administration now authenticates durable operator sessions, enforces organization/project scope and role permissions, and limits operator management to owners. Session tokens are stored as hashes; revocation and the legacy-credential migration are covered by PostgreSQL tests. Operator/session lifecycle writes atomically append immutable audit metadata with installation or operator actor identity, target IDs, tenant scope and timestamp; the owner-scoped event API supports stable bounded cursor pagination. No bearer token, token hash or request body is stored in these events. The optional Enterprise adapter validates a pinned release manifest, routes only to declared module prefixes, signs a request-scoped actor context, and forwards bounded requests over private Unix sockets. Current service health controls both readiness and routing, and private API responses carry `Cache-Control: no-store`.

The private Enterprise `experiments` service persists project policy and run state, checks tenant scope and idempotency, requires separate-owner approval before reserving budget, and releases the reservation on cancellation. Its PostgreSQL persistence test passed against a local PostgreSQL database using the `niu` role. The Gateway unit and PostgreSQL route suite passes 50 tests; the storage PostgreSQL suite passes 12 tests; strict workspace Clippy passes. Enterprise workspace tests pass 13 library tests, 2 socket lifecycle tests, and 1 PostgreSQL persistence test.

This closes neither the public first-release matrix nor the Enterprise SaaS release. The Gateway does not start module processes or distribute verification keys; the Enterprise image and immutable compatibility pin are not assembled. The experiment service explicitly returns 501 for task execution and analyzer invocation. Native subscription inference, full provider conformance, complete dashboard workflows, sandboxed task evaluation, broader budget controls, supported-version upgrade testing, and reproducible performance/provenance evidence remain open.

### Durable storage checkpoint

`niu-storage` has embedded PostgreSQL migrations and scoped storage methods for organizations, projects, operations and attempt intent. The PostgreSQL integration test passes for composite ownership constraints, cross-tenant read/update rejection, concurrent dispatch exclusion, independent-connection visibility, unknown versus zero usage, token overflow rejection and repeated migration application. See `crates/storage/README.md` for the exact command and test limits.

This is partial evidence for R02 and R06 only. Gateway integration, persistent key authorization, real process/database crash recovery and financial accounting remain incomplete. No acceptance row is closed by this checkpoint.

### Scoped-key checkpoint

Persistent key issuance, hash-only secret storage, mandatory expiry, explicit model grants, authentication and revocation now exist in the storage layer. Dispatch accepts an authenticated principal and rechecks permissions under a transaction lock. Two PostgreSQL integration tests pass, including stale-principal expiry/revocation and forbidden-model rejection. Gateway integration, role-protected administration, rotation and dashboard workflows are still pending; R02 remains open.

### Gateway persistence checkpoint

The gateway now requires PostgreSQL, applies migrations at startup, authenticates persisted project keys, filters model listings by grants, and commits permission-checked attempt intent before provider dispatch. Non-streaming execution and usage evidence are persisted; unknown usage and failed/invalid upstream responses remain unsettled. Responses after dispatch carry operation and attempt IDs. Bootstrap administration creates organizations/projects/keys and revokes keys. Readiness checks the database. Compose provisions PostgreSQL with a named volume.

Verification includes real PostgreSQL with a local mock HTTP provider, durable usage assertions, revoked-key prevention of upstream calls, bootstrap API setup, admin/client separation and readiness failure on closed storage. The full workspace tests and documentation checks/build pass; a separate failure-path test covers absent usage, invalid success bodies and provider failures. Container execution, operator roles, streaming completion evidence, rotation, cost settlement and budget enforcement remain unverified or incomplete. These changes do not close a release row.

### Streaming evidence checkpoint

The gateway inspects bounded SSE events while preserving forwarded bytes. Valid terminal events persist execution and usage evidence before forwarding; missing/conflicting usage remains unknown. PostgreSQL integration tests cover fragmented complete streams, missing usage, truncation, error events and dropping a response before consumption. Unit tests cover UTF-8 fragmentation, CR/LF framing, multiline data, partial terminals and size limits. JavaScript `chat.stream()` supports incremental events, requested usage, AbortSignal and cancellation on early exit; six SDK tests pass. Streaming cost settlement, delivery acknowledgement and native-provider stream conformance remain open.

### Account and quota checkpoint

Account metadata now separates authentication, billing, plan, health and credential revision. The bootstrap API registers unverified accounts and lists metadata without credential references. PostgreSQL tests cover concurrent refresh exclusion, account isolation, concurrency slots, dispatch health checks and retention of uncertain slots. Quota observations preserve units and timestamps, reject future samples and ignore delayed older samples when selecting current evidence; freshness expires at either the freshness deadline or reset boundary. Native subscription transport, credential resolution, actual refresh calls, quota reservation, affinity and selection are still pending. R15 remains open.

### Key management workflow checkpoint

The branded dashboard now supports organization/project creation and selection, scoped key issuance, one-time secret dismissal, key listing, rotation and revocation. On a fresh installation, its first-run flow creates a personal workspace and default project, then issues a 30-day key with an explicit model grant. A dashboard test verifies the write sequence and one-time secret display. Key rotation preserves grants/expiry and writes immutable audit evidence atomically; a PostgreSQL race test confirms only one replacement wins. Browser verification against an isolated local gateway covered organization/project creation, issuance, display and dismissal. Durable operator lifecycle audit attribution and paginated audit API are implemented; the dashboard history view and remaining administration workflows are tracked separately.

### Dashboard route and component checkpoint

The dashboard uses React Router data routes and URL-backed navigation. Each feature route has a `page.tsx` entry with feature views and components grouped below its feature folder; the application shell and route table are separate. Execution-to-subscription drill-downs preserve organization, project and record IDs in query parameters. Shared UI primitives remain in `src/components/ui`, with Niu theme tokens as the visual source of truth. Route integration tests verify overview navigation, direct feature routes and unknown-route handling. Feature integration tests cover the management workflows; pure money and execution logic remains separately unit-tested, and shared visual primitives have no isolated unit tests. The packaged PostgreSQL smoke verifies the static server returns the application shell for direct execution and subscription URLs. Browser QA confirmed those URL routes and the active sidebar state at desktop and 390 px widths with no horizontal overflow. This architecture checkpoint does not close the remaining dashboard workflows or release gates.

### Cost reporting API checkpoint

Bootstrap administration exposes scoped lifetime budget snapshots and bounded cursor traversal of settled cost entries. Monetary and token integers are returned as decimal strings; cash and API-equivalent charges remain separate. PostgreSQL-backed tests cover admin/client separation, values above JavaScript's safe integer range, pagination, and cross-project/organization ledger isolation. These read APIs do not yet connect request admission to automatic pricing or settlement, and do not close R06 or the dashboard workflow gate.

### Cost dashboard checkpoint

The Usage & cost dashboard now reads project budgets and paginated settled entries from the durable admin APIs. It displays separate cash and API-equivalent costs, reservation exposure, price revisions and bound overruns. BigInt formatting tests cover nanounits above JavaScript Number precision and the signed 64-bit maximum. Production build and browser verification pass for project selection and absent-budget/empty-ledger states. Populated ledger rendering, frontend pagination interactions, budget editing and automatic inference settlement still require further integration evidence.

### Automatic settlement recovery checkpoint

Streaming and non-streaming completion enqueue settlement when a trusted held price reservation and provider usage exist. A bounded background writer batches completion evidence and settlement by workspace after the response; a separate sweep retries the completion-to-settlement gap without redispatching inference. PostgreSQL tests cover concurrent recovery, idempotent charges, retention of unknown-usage holds, and automatic recording of provider overruns. OpenAI-compatible text routes create reservations from operator-attested token bounds before dispatch. Full process-crash qualification remains open.

### Budget creation API checkpoint

Bootstrap administrators can create a project's lifetime cash budget using exact decimal-string amounts. API tests cover client-key rejection, malformed/overflowing amounts, invalid currency, concurrent creation with one 201 and one 409, and unchanged persisted balances. For priced OpenAI-compatible text routes, configured upper bounds are reserved before dispatch, provider usage settles the reservation, and exhausted project budgets block dispatch. Organization and key-level budgets, non-lifetime windows, broader billable dimensions, and strict bounds for unpriced routes are not implemented. This is partial R07 evidence; the release row remains open.

### Priced inference checkpoint

Optional OpenAI-compatible text route pricing now publishes/reuses an immutable scoped price, reserves configured token bounds before dispatch, and settles provider-reported usage. A PostgreSQL/local-provider integration test covers exact cash/API-equivalent charges, shared price revisions, injected output limits, rejected unsupported shapes and exhaustion preventing upstream calls. Earlier checkpoints describing entirely unwired pricing are superseded for this text subset. Input bounds remain operator-attested provider limits; richer billable dimensions, budget hierarchy, subscription fees and live provider qualification remain open.

### Historical imported-task dashboard checkpoint

This earlier page listed scoped JSON imports and displayed spans, intervals, links, model identity and outcome evidence. Browser verification confirmed the renderer against a synthetic fixture only. It did not collect live gateway traffic or prove task-cost usefulness, so it is contract/renderer evidence rather than the primary Tasks workflow. The gateway-first activity view supersedes it as the default user path; imports may remain supplemental for migration and tests.

### Referenced task charges checkpoint

The earlier imported-trace view included a graphical timeline and a referenced-charges panel. It resolves explicitly linked Niu attempt UUIDs against settled project ledger entries, deduplicates shared charges and leaves external/unsettled references unresolved. This is useful renderer/accounting evidence for adapter-enriched traces, but an import-provided link does not replace automatic gateway correlation. Subscription fees, allocation, independent attribution verification, collectors and retention controls remain open; R18 stays partial.

### Simple-access workspace checkpoint

The API keys page offers **Use default workspace**. An installation administrator can call `POST /admin/v1/setup/default-workspace` without a body to create the designated organization and project atomically, or retrieve their existing IDs. This is a shared installation default, not a per-user personal tenant. Setup never adopts an existing organization by matching its name and creates no implicit API key. A usable project key requires at least one published model alias so its permissions are meaningful. The dashboard must direct a user with no aliases to provider/model setup, then return to key creation.

PostgreSQL tests cover concurrent creation, restart reuse and no implicit keys; HTTP tests cover bootstrap-admin authorization and client-key rejection. Managed vendor/provider and model setup now has dashboard support. A fresh local database with no providers or models was used to configure a loopback OpenAI-compatible provider, publish an alias, create the first workspace/project and scoped key, and send a standard request through Niu. The dashboard displayed the copyable base URL and alias and automatically listed the request with usage and timing; no import was used. With pricing unset, cost was explicitly unknown. The one-use key was revoked after verification. This verifies the local-fixture R20 journey; it does not qualify commercial upstream behavior. R09 remains partial for its wider dashboard and operational requirements.

### Supplier capacity dashboard checkpoint

The optional Supplier accounts page lists registered metered and subscription accounts independently of inference traffic. It displays billing/authentication modes, observed account health, configured concurrency limits and on-demand quota evidence with source, units, observation time, expiry and reset time. Expired evidence becomes stale while the page remains open; missing evidence remains unknown. The account listing explicitly warns at its current 1,000-row cap. Registration and quota collection remain separate backend integration responsibilities; this view is not a connected native subscription collector.

Quota API `remaining` and `maximum` now use nullable decimal strings, preserving signed 64-bit quantities without browser rounding. Consumers of the prerelease API must update from JSON numbers; timestamp fields remain numeric milliseconds. Tests cover exact large quantities, explicit zero and null. The dashboard production build passes; live browser verification and a supported native collector remain open.

### Browser workflow verification — 2026-09-26

Verified the locally built dashboard against the migrated gateway and PostgreSQL using synthetic data:

- **Quick setup:** Use default workspace selected the designated organization/project and prefilled a key name. No model alias existed, so the model grant was empty and Issue key remained disabled. This exposed a missing next step; it is not evidence of a usable first-run flow. The dashboard must guide the administrator to publish a provider/model alias before creating a key, then show how that key and the Niu base URL are used.
- **Supplier evidence:** the built JavaScript SDK registered a synthetic subscription account and submitted fresh and historical quota observations to the live gateway. The browser showed separate authentication/billing modes, unverified health, configured concurrency, source and timestamps. It preserved `9223372036854775807` exactly and displayed null remaining capacity as Unknown alongside a Stale label. The desktop account table scrolls horizontally when required.
- **Imported trace renderer:** the parallel fixture rendered a common timeline, 100 ms task duration, overlapping agent intervals and a zero-duration checkpoint. This validates rendering of supplied synthetic evidence, not automatic gateway capture or a real agent task.

These observations cover only the listed paths. They do not qualify resolved monetary rows, mobile layouts, automatic freshness transitions, end-to-end provider onboarding, native collectors or the full release. No real provider requests were made during this verification.
### Metadata import and task investigation checkpoint

Projects can import versioned metadata-only execution records, list bounded pages of summaries, filter the current page by task/source/record ID, inspect one trace, and delete an imported record. PostgreSQL-backed gateway tests verify admin authentication, project scoping, idempotent replay, conflicting replay rejection, schema-version rejection, summary payload omission, independent-connection persistence, cursor traversal, detail retrieval, cross-project isolation and metadata-only deletion. The dashboard presents task wall-clock separately from summed timed model/tool invocation work, agent/model/tool counts, retries, outcome evidence with source authority, unresolved charge references, causal links and untimed/clipped intervals. Parent agent, step and attempt spans are excluded from invocation work; untimed calls remain visible. It does not infer a final result when accepted and rejected evidence coexist.

Verification: `niu-storage` PostgreSQL integration tests (8 passed), gateway PostgreSQL integration tests (10 passed), Rust workspace tests, dashboard TypeScript check, production build and Vitest component/unit tests (15 passed). Browser smoke testing against a PostgreSQL-backed gateway imported a synthetic trace, displayed its cancellation and conflicting outcome evidence, and confirmed no horizontal overflow at desktop and mobile widths. An earlier browser pass traversed a 52-record result over two pages without losing the selected trace. The import path accepts only the public version 1 schema; prompts, responses, code, tool output and credentials are not part of this record.

Reproduction commands: `cargo test --locked --workspace`; `DATABASE_URL=<disposable-postgres-url> cargo test --locked -p niu-storage --test postgres -- --ignored`; `DATABASE_URL=<disposable-postgres-url> cargo test --locked -p niu-gateway -- --ignored`; `pnpm --filter @niu-io/dashboard test`, `check`, and `build`; `pnpm --filter @niu-io/docs check` and `build`; `pnpm build:catalog`; and the JavaScript SDK `check`, `test`, and `build` commands. PostgreSQL tests require a disposable server account permitted to create test databases.

This is historical partial evidence for manual ingestion endpoints, not for a customer request-log workflow. Execution and quota ingestion can still use versioned imports behind authorized admin/collector credentials for tests, migration and supplemental sources. The normal product flow must persist and query inference events directly from the gateway. Native quota/invoice connectors, tenant operator roles, live updates, automatic retention and task-level quota reconciliation remain open. Cohort accounting resolves monetary amounts only from settled entries whose references exactly parse as a scoped Niu attempt UUID; provider-native namespaces remain unresolved.

R17 remains partial. The shared version 1 contract and first-party JavaScript adapter route supported model calls through Niu, attach a stable task ID, report tool/retry/validator/human evidence, and link attempts to gateway-owned accounting. Shared fixtures now cover delegation, parallel branches, fallback, retry, resume, cancellation, human intervention, requested/reported identity, and unknown model identity; the dashboard renders the causal evidence and keeps unknown costs visible. Broader adapter runtime coverage, complete observation, and matched-task cost/quality analysis remain open.

### Gateway-first dashboard request verification — 2026-09-27

Using the local development dashboard, an existing local test provider/model configuration was available. A project-scoped key was issued for its model alias, and a standard chat request was sent to the dashboard's copyable Niu base URL. The Gateway returned HTTP 200 with 12 prompt and 5 completion tokens from a local OpenAI-compatible provider fixture. The request appeared in project activity under its task ID without an execution import; browser network observation recorded zero execution-import POSTs. The page displayed the base URL and model alias. No price was configured, so activity correctly showed cost unknown.

This confirms the local provider → scoped key → Gateway request → automatic activity path on the existing development install. It did not establish clean-install acceptance; the fresh-install follow-up below covers that gap with the same local fixture. Commercial provider behavior and a real paired task experiment remain unverified. R09 remains partial on broader dashboard and operational criteria; R17 remains partial pending broader adapters and accepted-task analysis.

### Fresh-install follow-up — 2026-09-27

A separate fresh local database started with zero providers, models, workspaces and keys. Through the dashboard, the administrator configured the same deterministic loopback OpenAI-compatible fixture, added the `niu-clean-chat` alias, and used the first-run flow to create a personal workspace, default project and model-scoped key. A browser client sent a standard chat request to the displayed Niu base URL with `X-Niu-Task-ID`. Niu returned HTTP 200 with 12 prompt tokens, 5 completion tokens and a 6 ms model duration. The Tasks page automatically showed the request grouped under that ID, exposed the copyable Niu URL and alias, and reported cash and API-equivalent cost as unknown because pricing was unset. No execution import was used; the one-use key was revoked after the check.

This verifies the clean-install R20 path against a local provider fixture and confirms that first inference does not require pricing, task import or an agent adapter. It does not qualify commercial provider behavior. R09 remains partial on its broader screen, audit and recovery criteria. R17 remains partial on broader adapter runtime coverage and matched-task acceptance/cost analysis; no authorized paired experiment was run.

### Dashboard key and Playground comparison follow-up — 2026-09-28

The clean local installation was exercised again through its browser dashboard. The administrator configured an OpenAI-compatible loopback fixture with two enabled aliases, created a project key limited to both aliases, and used the copyable base URL, model alias, and OpenAI SDK example on the key receipt. The key list, create form, and per-key activity detail routes were verified; the key secret was not available on the detail page.

A standard client request with the same prompt was sent through Niu to each alias without `X-Niu-Task-ID`. Both returned HTTP 200 and provider-reported usage (12 prompt tokens; 11 and 17 output tokens). The local fixture observed one authenticated request for each upstream model. The key detail page and full Activity page automatically showed both requests, their provider model, usage, and timing, without an import. The Playground then completed its built-in two-model comparison through a temporary key, showing the distinct fixture responses, per-model client latency and token deltas, and unknown monetary cost. Its temporary key was revoked after the comparison; both persistent QA keys were also revoked. A 390 px browser viewport showed no page-level horizontal overflow; the API-key table keeps its own horizontal scroll area.

This confirms the clean-install provider → project-scoped key → same-prompt model comparison → Niu request → automatic activity journey against a deterministic local fixture. It does not measure model quality or task economics, qualify a commercial provider, or establish savings. Cost remains unknown because no prices were configured. To verify the R20 history gate in the browser, a temporary fast-only key sent 101 additional requests through Niu; all 101 returned HTTP 200. Filtered Activity initially showed 100 loaded requests and a cursor, then **Load older activity** displayed the 101st request and cleared the cursor. The temporary key was revoked after this check. This complements the existing 105-row PostgreSQL cursor test. R20's clean-install and history-paging flow is verified against the local fixture; commercial-provider qualification and broader operational acceptance remain separate. R09 remains partial; R17 remains partial pending broader adapter coverage and matched tasks with validator or human acceptance evidence.

### Subscription observation checkpoint

Bootstrap administrators can register supplier-account metadata and import version 1 quota observations without routing inference. Exact observations replay to the original ID; a conflicting payload for the same account, window and observation timestamp returns 409. Latest window reports preserve provider units and reset/validity timestamps, expose a prior snapshot as a baseline, and mark differences unattributed. Big integer quantities use decimal strings in read responses. Account registration remains unverified and exposes no credential reference.

PostgreSQL storage tests cover tenant scoping, newer-versus-delayed sample ordering, freshness/reset expiry, unknown values, duplicate replay, conflicting replay and future timestamps. Gateway PostgreSQL tests cover authorization, API replay/conflict/version rejection, no inference dispatch, account inactivity, and observation persistence across an independent connection. The Subscriptions dashboard tests cover account registration, quota import, exact 64-bit display, freshness and unattributed change presentation.

This extends R16 evidence but does not close it: quota collection is still manual, coverage is source-reported, native collectors and operator roles are absent, automatic retention is unavailable, and quota changes are not reconciled to per-attempt usage or task records. Account views can link a matching assigned Niu attempt UUID; this does not establish task-level attribution.

### Outcome and cohort accounting checkpoint

Execution records now roll up agent claims, deterministic validation and human acceptance separately, including per-authority evidence counts. Agent-only acceptance stays unverified; disagreement remains conflicting. The authenticated project cohort endpoint scans at most 10,000 imports, reports event-record and distinct source/task counts, groups outcome evidence by source/task ID, and counts coverage/work/retry/failure evidence. Canonical attempt UUID references are deduplicated across records and resolved only from settled ledger entries in the same project. API-equivalent totals remain separate from cash calculated from Niu's configured price rates. Failed/rejected work contributes when it has a canonical charge reference. Quota snapshot count is presented without task attribution; invoice cash and subscription allocation cash are explicitly marked not imported. Cost per accepted task is returned as an exact rational only when coverage and all observed billable references are complete and at least one task is accepted; zero accepted tasks yields no ratio.

PostgreSQL integration coverage exercises task-level conflict handling across multiple records, cross-record reference deduplication, exact API/cash totals, rejected-work spend, tenant isolation, unresolved namespaces, partial coverage, quota separation, and the zero-accepted case. Dashboard component tests cover grouped event records, agent-reported estimates and complete versus incomplete evidence without presenting partial spend as successful-task cost. Version 1 groups matching source/task IDs but does not merge the same real task across independent sources. The report is a live bounded view, not a snapshot. Invoice reconciliation, subscription fee allocation, attribution of subscription/quota deltas, native collectors and cross-source task identity remain open, so R18 stays partial and open; R19 paired experiments and diagnostics remain unimplemented.

Verification: Rust workspace tests pass; all 9 storage PostgreSQL tests and all 10 gateway PostgreSQL tests pass against PostgreSQL 17. Dashboard Vitest tests pass (20), with TypeScript check and production build passing. Astro check reports no diagnostics and docs build completes. OpenAPI YAML parsing, Rust formatting, and `git diff --check` pass. The enterprise compatibility checker passes against the public working tree. Browser verification against the PostgreSQL-backed gateway renders the cohort on desktop and a 390 px viewport with no horizontal overflow.

### Paired benchmark analysis checkpoint

The `niu-benchmark` library and CLI analyze version 1 paired datasets built from the shared execution record contract. They match candidate trials against the same declared task snapshot, tool, permission and acceptance-policy hashes; require pinned candidate revisions, explicit opt-in metadata, complete trace coverage for qualification, and fully settled cost evidence; and enforce a declared cash cap against reported totals. Reports keep source acceptance separate from quality-and-latency-qualified completions, include candidate and evaluator cash/API-equivalent cost plus failed-task spend, return no qualified-task ratio at zero qualified completions, and include a Wilson interval for decisive paired results. Heuristic retry, coverage and model-identity observations cite source record and span IDs; missing billable-work references fail closed.

The synthetic public fixture includes a cheaper candidate that wins, a candidate that loses after extra model work, and a candidate that fails deterministic acceptance. Rust tests cover outcome and cost rollups, candidate revision pinning, task acceptance, zero denominator, budget refusal, incomplete pairs, uncertainty, and heuristic evidence links. The documented reproduction command is `cargo run --locked -p niu-benchmark -- compare contracts/fixtures/paired-experiment.v1.json`.

This is an offline analyzer, not an experiment runner. It does not authenticate source evidence, validate an approval, reserve budget before dispatch, isolate task tools/permissions, execute or cancel tasks, or persist report history. The authorization fields are metadata only. No real paired experiment has been run; synthetic results do not establish model quality or savings. R11 and R19 remain open.

Verification: the locked Rust workspace suite passes, including six benchmark evaluator tests and the CLI integration test; strict workspace Clippy passes with warnings denied. Dashboard Vitest passes all 25 tests with TypeScript check and production build; docs check reports zero diagnostics and the build completes; all 10 JavaScript SDK tests, type check and build pass, including the execution recorder suite. Against PostgreSQL 17, all 9 storage and 10 gateway integration tests pass.

### Versioned extension API checkpoint

The public Rust crate `niu-extension-api` defines the `niu.extension.v1` semantic contracts for identity-claim resolution, policy decisions, provider encoding/decoding including normalized stream frames, task execution evidence, candidate ordering and immutable metering observation. The public Enterprise composition specification now defines a separate process boundary: an immutable build-time release manifest, private health checks, same-domain authenticated forwarding, and a short-lived signed tenant context. The Rust trait suite remains semantic contract evidence; it is not a substitute for the HTTP service adapter, static route composition, or cross-process tests.

The Gateway now provides the optional Enterprise HTTP adapter: startup manifest and compatibility validation, immutable health-gated route registration, operator-session permission checks, signed request context, bounded Unix-socket forwarding, and separate Enterprise readiness. The adapter does not supervise module processes or distribute verification keys. Full OIDC/SAML login and session flows, sandbox execution for task adapters, hook orchestration, production provider adapters, a durable policy catalog and decision audit, a metering outbox/retry worker, streaming policy semantics, and the out-of-process reference-module release test remain unimplemented. R13 remains open and no Enterprise compatibility release pin is established.

### Packaged PostgreSQL smoke checkpoint

Release CI builds the single-application image and checks its non-root user and runtime contents. A packaged smoke test starts a clean PostgreSQL 17 container and the image on its single HTTP port, waits for database-backed readiness, serves the branded dashboard and JavaScript bundle, creates an organization, project and scoped key through the admin API, and restarts the gateway. It also sends a scoped chat request to a deterministic local provider and verifies that the operation, attempt and provider-reported usage persist across restart while execution imports and supplier accounts remain empty. The test generates ephemeral credentials at runtime.

This provides clean-container, migration-on-startup and application-restart persistence evidence for part of R01, and runtime-content evidence for R14. Compose CI confirms the product and PostgreSQL are the only services, persists records across both app and database restarts using the named volume, and restores a `pg_dump` into a clean database before verifying the restored tenant. It also holds an admin read behind a PostgreSQL table lock, sends SIGTERM, and confirms the in-flight request completes before the gateway exits. CI recomputes every selected LiteLLM crate tree fingerprint, checks the selective crate set and retained MIT declarations, verifies the standalone cost-engine checksum, runs Cargo's SPDX license policy over the full Rust development graph, and emits a package-level JavaScript license inventory artifact. The JavaScript check allowlists the current package licenses and scopes LGPL and MPL exceptions to pinned build-only packages. Upgrade testing against a supported previous release remains open. Reproducible performance qualification and release-provenance evidence remain open; R01 and R14 are not closed.

### OpenAI-compatible embeddings checkpoint

The gateway exposes text embeddings for OpenAI-compatible routes that explicitly declare the operation and optional dimensions/base64 capabilities. Scoped API-key authorization, persisted attempts, zero completion reservation, provider usage settlement and public model alias normalization share the existing request lifecycle. PostgreSQL tests cover a successful priced request and pre-dispatch rejection when the route capability or provider is unsupported; request validation tests cover malformed shapes. This is a narrow R04/R12 increment, not provider conformance evidence. Responses, broader tool/structured-output behavior, native Anthropic/Bedrock embeddings and live-provider conformance remain open.

### Function tools and structured JSON checkpoint

OpenAI-compatible routes can separately opt in to function calls, streaming tool deltas, and non-streaming JSON object/schema response formats. Request validation checks tool names and uniqueness, tool-choice references, schema envelope, and option types before operation creation. Unconfigured features fail with `501`. Non-streaming responses must return declared tool names with valid JSON-object arguments; JSON response formats must return valid JSON. These checks protect the response contract but do not execute tools or evaluate JSON Schema constraints. The TypeScript SDK exposes typed request and response fields.

Gateway tests cover opt-in and rejection, forwarded provider payloads, tool-call usage persistence, structured JSON usage persistence, malformed provider output remaining unresolved, and byte-preserving fragmented tool deltas with terminal usage persistence. The gateway suite passes 36 non-PostgreSQL tests and all 33 PostgreSQL-backed tests against PostgreSQL 17. This is partial R04/R12 evidence only: support is limited to operator-verified OpenAI-compatible routes; tool execution stays in the application, priced tools and structured JSON streaming are unsupported, native Anthropic/Bedrock tool conformance is absent, and full Responses compatibility remains open.

### Responses API text checkpoint

OpenAI-compatible routes can separately opt in to a non-streaming text subset of `POST /v1/responses`. The request accepts a text string and bounded optional instructions, output limit, sampling values, metadata and user identifier; multimodal inputs, tools, streaming and response/conversation state are rejected before operation creation. Provider output must use Responses message/refusal or reasoning item types. Niu preserves the response shape, aliases the model, and maps provider `input_tokens`/`output_tokens` into durable attempt usage. Priced routes conservatively bound UTF-8 input/instructions, reserve the output limit and settle reported usage through the shared ledger.

The JavaScript SDK exposes `responses.create()` with typed request/response shapes and cancellation. Unit and PostgreSQL tests cover validation, forwarding to `/responses`, alias normalization, priced usage settlement, malformed provider output remaining unresolved, and pre-dispatch rejection of streaming. Current verification passes 17 gateway unit tests, all 15 gateway PostgreSQL integration tests, strict gateway Clippy, and all 13 JavaScript SDK tests; Astro check reports no diagnostics and the documentation build completes. This is partial R04/R12 evidence; native Anthropic/Bedrock, streaming, multimodal input, tools/stateful conversations, live provider conformance and complete Responses compatibility remain open.

### Single-domain package checkpoint (2026-09-26)

The current optimized Linux gateway binary and current dashboard, docs and site bundles were assembled into a temporary runtime-only image. The packaged direct smoke and Compose persistence smoke both pass. They cover the public homepage, `/docs/`, `/models/`, a public catalog route, direct refresh of nested workspace paths, Pagefind assets, canonical URLs and sitemap, static and API 404 boundaries, non-streaming and streamed inference, PostgreSQL evidence persistence across restart, and Compose backup/restore, app/database restart, migrations and graceful drain. A real browser also verified Pagefind results and workspace navigation at desktop size, then checked the homepage, docs, catalog, overview and nested executions route at 390px with no horizontal overflow.

This validates the route behavior and packaged runtime contents, but it is not a completed final multi-stage `Dockerfile` build: the local builder could not save the Rust build layer after exhausting its available storage. CI is configured to build the full Dockerfile. Upgrade testing against a supported prior version is also open, so R01 remains partial. The workspace slug is a route segment only; it does not grant access, and workspace-scoped operator sessions and roles remain part of R02.

### Upstream integration verification (2026-09-26)

After integrating the latest public `main`, the locked Rust workspace suite passes; all 11 storage and 18 gateway PostgreSQL integration tests pass against PostgreSQL 17. Dashboard tests pass (33), with the TypeScript check and production build passing. The JavaScript SDK tests (18), type check and build pass. Docs and site checks/builds, strict workspace Clippy, Rust formatting, selective-import checksum verification, JavaScript license verification, and OpenAPI/Render YAML parsing pass.

The workflow in `.github/workflows/ci.yml` builds and inspects the final multi-stage image, then runs the direct packaged smoke and Compose PostgreSQL persistence/backup-restore smoke on each push. The local Docker builder has not completed that full multi-stage build because it ran out of builder storage. Release acceptance rows remain open, so this integration checkpoint is not a qualified first release and must not receive a release tag.


## Separate marketing repository and single-domain composition

The marketing source is maintained in `niu-io/website`; `apps/catalog` now owns only the public model catalog. Community `/` redirects to `/workspaces/default/`. Hosted composition supplies a separately built, immutable website artifact through `NIU_SITE_DIR`, while `NIU_CATALOG_DIR` serves product catalog assets. All hosted routes remain under `niu.io`.

Two automated Gateway tests cover composed route ownership, disjoint asset namespaces, workspace deep links, unknown API/static paths, and operation without a website artifact. The earlier packaged-image observations above predate this separation; the updated package smoke must run at final image qualification. No new Docker image was built for this change.


### Local operator and domain composition checks (2026-09-26)

The Gateway suite passes all 56 tests, including real PostgreSQL authorization, session expiry/revocation, operator lifecycle audit, tenant filtering before list limits, and two separate-artifact routing tests. Storage passes 3 unit tests and 13 PostgreSQL tests, including audit transaction rollback and stable cursor boundaries. The dashboard suite passes 44 integration and workflow tests, including delayed audit pagination, rejected cursor recovery, and disconnect cancellation; its typecheck and production build pass. Strict workspace Clippy passes. Catalog and documentation checks/builds pass, and the JavaScript dependency license inventory passes. The updated package smoke script parses successfully; final container qualification remains outstanding.

A local Gateway with isolated PostgreSQL served the independently built website, catalog, docs and dashboard from one origin. Browser checks covered homepage-to-catalog navigation, documentation navigation, mobile menu, asset loading, and desktop/mobile layouts. The operator workflow created a viewer, displayed and dismissed its initial credential, rendered attributed lifecycle activity, and rejected management access when connected as that viewer. Browser storage contained no credential. After a graceful Gateway stop and fresh process start against the same PostgreSQL database, the viewer session still authenticated and its attributed audit events persisted; revoking that operator immediately invalidated the session. These checks do not claim a production deployment or completed Enterprise release image.

### Managed vendor checkpoint (2026-09-26)

Installation vendor records and model mappings now persist in PostgreSQL. The management API supports OpenRouter and OpenAI connections, credential rotation, optimistic revisions, model capability declarations, public catalog visibility and enabled state. Vendor credentials are encrypted using a deployment-owned master secret. Organization/project operators cannot manage shared connections. Static aliases remain supported; database aliases take precedence even when disabled. Bootstrap imports a vendor once using a durable identity independent of its editable name.

Gateway verification passes 64 unit/API tests plus an automated real-process PostgreSQL restart test. Storage verification passes 5 unit tests and 14 PostgreSQL tests. Coverage includes scoped access denial, ciphertext isolation, stale updates, dynamic model and credential changes, disabled-route shadowing, seed rollback, rename/restart preservation, missing or incompatible encryption keys, and exact preservation of API-configured pricing during metadata edits. Strict Gateway/storage Clippy passes. These checks use synthetic provider credentials and local HTTP provider fixtures; they do not certify live upstream model behavior or a hosted deployment.

This checkpoint advances R03 without marking the entire acceptance row or release complete. The first catalog seed has no verified prices. The model editor preserves existing API-configured pricing; interactive price configuration and the broader routing/qualification requirements remain separate acceptance work.
