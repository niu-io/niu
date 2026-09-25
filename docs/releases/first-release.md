# First feature-complete Niu release

Status: release target, not a description of shipped capabilities.

Scope version: 0.2 (2026-09-25). Agent Observability and Benchmark are the primary product workflow; existing gateway requirements remain required.

## Objective

Deliver an independently usable open-source Agent Observability and Benchmark product, with a complete AI gateway and management runtime. The primary unit is an accepted task outcome: its execution history, quality, total cost, latency and human intervention. Model requests are constituent events. An owner must be able to import authorized execution metadata, inspect task and agent activity, understand subscription consumption, and compare measured outcomes without enabling inference forwarding, account pooling or Enterprise policies.

The gateway remains part of the first-release scope. An operator must also be able to install Niu, create an organization and project, connect providers, issue scoped keys, execute supported requests, enforce spending and security policies, inspect every attempt and its cost, and upgrade and recover the installation using the documented product. These workflows must work through both the management API and console. Native subscription-backed inference remains a first-release requirement alongside API-key providers; subscriptions are not required to masquerade as agent tasks.

Performance and cost are the product outcomes; security constrains every execution path. Cost optimization is measured as cost per successfully completed task at an explicit quality and latency requirement. Missing measurements and failed tasks must remain visible.

“Feature-complete” means every required row below passes its acceptance tests in a clean installation. It does not mean universal provider compatibility or an unbounded promise of parity with other products. Narrowing a required row requires an explicit scope decision, not silently marking it complete.

## Required acceptance matrix

| ID | Product capability | Release acceptance evidence |
| --- | --- | --- |
| R01 | Installation and operation | Published build recipe produces one Niu application image exposing inference, administration and console on one port. Compose provisions its PostgreSQL dependency. Clean install, health/readiness, graceful drain, persistent restart, backup/restore and upgrade are exercised. No mandatory Redis, queue service or separate UI server. |
| R02 | Identity and administration | Persistent organizations, projects, operator sessions, roles and scoped API keys; create, rotate, revoke and expire keys through API and console. Cross-tenant isolation and revocation-before-next-attempt tests pass. Credentials are never returned by list APIs or logged. |
| R03 | Provider and model management | Configure, validate, enable, disable and rotate provider connections; publish versioned model aliases, capabilities, prices and route configurations through API and console. In-flight work pins a revision; disabled credentials cannot start new attempts. |
| R04 | Inference compatibility | Chat completions, streaming, tool calls, structured output, embeddings and Responses have documented request/response contracts and a provider capability matrix. OpenAI-compatible, native Anthropic and Bedrock routes each have applicable conformance fixtures. Unsupported combinations fail before dispatch. Cancellation and fragmented streaming are tested. |
| R05 | Execution and routing | One attempt coordinator owns explicit selection, opt-in weighted/round-robin routing, health, concurrency limits, bounded queues, deadlines, rate limits and bounded retries/failover. No silent explicit-model substitution or unbudgeted paid fallback. No provider switching after response commitment. Every dispatch, including failed retries, is attributable. |
| R06 | Durable usage and cost | Persist request and attempt identities, outcomes, usage confidence, immutable pricing revisions and integer monetary entries. Report API-equivalent cost, cash cost and capacity consumption separately. Missing usage remains unknown. Idempotent ingestion and reconciliation survive duplicate events and restart. |
| R07 | Budget enforcement | Organization/project/key budgets reserve exposure atomically before dispatch; concurrent calls and retries cannot spend the same allowance. Unknown liabilities remain reserved pending reconciliation. Routes without a defensible upper bound cannot claim strict budget enforcement. Crash, cancellation, expiry and delayed-usage tests pass. |
| R08 | Security and content policy | Enforce model permissions, credential boundaries, request limits and required pre/post content policy. Ship usable allow/deny and redaction rules plus a versioned policy interface. Define streaming inspection/buffering semantics; blocked content cannot leak before inspection. Hook failures obey explicit fail-closed rules. |
| R09 | Management console | Complete setup, provider/model and route editing, key/role management, budgets, usage/cost filtering, attempt detail and reconciliation visibility. Operator actions have durable audit records. No placeholder page is presented as a released feature. Retain niu.io branding and English copy. |
| R10 | Observability | Request/attempt correlation, redacted structured logs, metrics, traces, latency/TTFT, throughput, queueing, failure and usage-coverage reports. Default telemetry excludes prompts, outputs and credentials. Readiness reflects required dependencies. |
| R11 | Evaluation and scheduling contracts | Public deterministic task fixtures and validators, repeated-run runner and reports include failed tasks, retries, validation overhead and unknown costs. Compare explicit strong/cheap baselines and opt-in fixed rules. Model and agent adapters have separate capability contracts; ship a sandboxed reference task adapter to validate task accounting and cancellation. |
| R12 | Documentation and SDK | Complete self-hosting, configuration, API, capability, security, pricing, migration, backup and troubleshooting docs. JavaScript SDK supports released inference operations and cancellation/streaming. Examples run against the packaged product. |
| R13 | Enterprise extension compatibility | Public versioned interfaces and a public test extension validate identity federation, policy, provider/task adapters, selection and metering-event integrations. Extensions cannot bypass core tenant authorization, reservations, attempt recording or revocation. Community builds require no private dependency or license service. |
| R14 | Release quality and provenance | CI builds/tests the monorepo and container, validates migrations and extension compatibility, checks dependency licenses and import checksums, and inspects packaged contents. Record reproducible performance results on stated hardware and workloads. No unsupported savings or superiority claims. |
| R15 | Native subscription resources and account pooling | Ship at least one verified native subscription inference adapter and an API-key adapter through the same coordinator. Represent authentication mode, billing mode, account, plan and observed quota windows separately. Independently authored conformance and integration tests cover account-isolated refresh, concurrent refresh exclusion, quota observation freshness/reset, bounded account concurrency, session affinity, exhaustion/cooldown, credential expiry, capability-aware selection and failover. Explicit models and billing modes are preserved; paid overflow needs explicit authorization and budget. Provider-specific eligibility and supported protocol subsets are documented. No additional gateway service is required. |

| R16 | Standalone collection and subscription visibility | At least one supported, versioned import/collector workflow operates without proxying inference, pooling or private services. Metadata-only defaults exclude raw prompts, source, tool output and credentials. Show coverage, freshness, shared quota windows, resets and unattributed changes. Requested and provider-reported actual models remain separate; absent actual identity is unknown. Import replay is idempotent, conflicting events are rejected, and retention/deletion removes associated imported records under the documented policy. Viewing reports cannot trigger inference, replay, subscription changes or allowance resets. |
| R17 | Task and agent execution investigation | One shared contract correlates tasks, agents/subagents, steps, model/tool invocations, attempts and validation/outcomes. Explicit causal links handle delegation, parallel branches, retries, checkpoints, resumes, cancellation and human intervention. A fixture exercises all of them; the console renders correct links and distinguishes wall-clock latency from summed work durations. Missing instrumentation is visible. Task and subscription views support drill-down in both directions without raw content by default. |
| R18 | Outcome and task/cohort accounting | Distinguish self-reported completion, deterministic validation, human acceptance and unverified outcomes. Aggregate shared/nested work once using canonical charge identities, including failed attempts, classification, validation, retries and escalation. Keep invoice cash, allocated subscription shares, API-equivalent cost and quota observations distinct. Unknown tool/resource costs remain unknown. Cohort spend includes failures and is divided by accepted completions; zero accepted completions yields undefined successful-task cost rather than zero. |
| R19 | Evidence-based comparison and diagnostics | Benchmark runs, imported telemetry and native adapters share R17's schema. Reference diagnostics link to observed events and are labeled heuristics. Reports separate observed results, heuristic diagnoses, untested estimates and paired experimental results. Isolated, opt-in, budgeted comparisons use matching task snapshots, tools, permissions and acceptance criteria; include all execution/evaluator costs, coverage, sample size and uncertainty. Fixtures include a cheaper candidate that wins, one that loses through extra work and one that fails acceptance. At least one authorized paired experiment supplies real evidence. Private policies use the same public benchmark constraints and cannot bypass authorization or accounting. |

| R20 | Simple model access and progressive disclosure | From a clean installation, configure one provider/model, issue a client key and make a standard model request without task definitions, telemetry imports, agents, benchmarks, pooling or Enterprise services. Console onboarding and quickstart demonstrate this path. Defaults need no pricing table or budget setup; optional controls cannot silently become prerequisites. Existing configured security and spending restrictions still apply. Advanced observation and evaluation are separate optional workflows within the same deployment. Regression tests verify inference with no imported execution records or subscription resources. |

## Simple access is a first-class workflow

Agent observability expands what users can inspect; it must not expand what they must configure to call a model. The default entry is connect a model, issue a key, make a request. Niu should provision routine workspace defaults during the eventual first-run flow; users should not need to learn the internal tenant hierarchy for a personal installation. The current bootstrap organization/project setup is an implementation limitation, not the final onboarding design.

Usage and cost views can reveal available observations progressively. Task imports, evaluation and pooling remain opt-in and must not appear as required setup steps. Minimal inference and standalone observation must both be independently useful. Product positioning does not make either workflow depend on the other.

## Priority amendment: observability first

The first delivery is a standalone metadata import, subscription overview and task investigation workflow. It is useful without completing account pooling or automated routing. This order does not remove R01–R15 from the first feature-complete release.

1. Define the common execution evidence contract and independently authored fixtures, including DAG relationships and separate acceptance evidence.
2. Implement an idempotent metadata import/collector, scoped persistence, coverage and deletion, using existing tenant and accounting identities.
3. Deliver subscription overview and task investigation, with unknown/unattributed usage, canonical charge attribution and trustworthy latency.
4. Run reference benchmarks against the same events and outcome model; keep observation separate from optional, budgeted replay.
5. Complete native supply, baseline pooling/routing and remaining gateway workflows; evaluate private optimization only against the shared public evidence contracts.

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

## Supporting implementation milestones

The observability-first order above controls near-term scheduling. These milestones retain the full gateway and release scope.

1. **Durable foundation:** schema and migrations, identity/scoped keys, configuration revisions, account/authentication/billing resource contracts, attempt coordinator and storage. Prove tenant isolation and crash recovery.
2. **Cost control:** normalized evidence, versioned integer pricing, fixed subscription fees and nonduplicating allocations, separate observed quota windows, three cost views, reservations, settlement and reconciliation. Prove concurrent budget enforcement and unknown-liability handling.
3. **Complete inference:** native subscription and API-key adapters, account-scoped refresh and quota observations, baseline pooling/affinity/cooldown, provider conformance, streaming and cancellation, supported protocols, rate/concurrency controls, routing, queueing and bounded failover. Prove all attempts use the same security and cost path.
4. **Complete product workflows:** management APIs and console for setup, suppliers, keys, routes, budgets, usage and audit; content policies and operational telemetry.
5. **Extension and evaluation readiness:** executable enterprise contract fixtures, sandboxed reference task adapter, reproducible baseline evaluator and full-path performance measurements.
6. **Release qualification:** clean container installation, migration/restore/drain tests, SDK and documentation examples, artifact/provenance checks, and an evidence entry for every acceptance row.

Each milestone ends in integrated, runnable behavior. Contract-only code or mock-only tests do not close a product row. Unit tests supplement end-to-end and fault-injection tests; external-provider checks must distinguish replay fixtures from live validation.

## Current evidence and gaps

The monorepo, approved branding, selected source imports, initial gateway/console/docs/SDK, execution contract types and process-local usage evidence exist. Current tests cover a small initial slice. None of the required rows is complete yet. Durable persistence, identity, budgets, broader inference, complete console workflows, extension fixtures and container qualification remain required work.

Release evidence should record the tested commit, environment, command, result and artifact for each row. A release candidate is ready only when all required rows pass and known limitations are documented against exact capabilities.

### Durable storage checkpoint

`niu-storage` has embedded PostgreSQL migrations and scoped storage methods for organizations, projects, operations and attempt intent. The PostgreSQL integration test passes for composite ownership constraints, cross-tenant read/update rejection, concurrent dispatch exclusion, independent-connection visibility, unknown versus zero usage, token overflow rejection and repeated migration application. See `crates/storage/README.md` for the exact command and test limits.

This is partial evidence for R02 and R06 only. Gateway integration, persistent key authorization, real process/database crash recovery and financial accounting remain incomplete. No acceptance row is closed by this checkpoint.

### Scoped-key checkpoint

Persistent key issuance, hash-only secret storage, mandatory expiry, explicit model grants, authentication and revocation now exist in the storage layer. Dispatch accepts an authenticated principal and rechecks permissions under a transaction lock. Two PostgreSQL integration tests pass, including stale-principal expiry/revocation and forbidden-model rejection. Gateway integration, role-protected administration, rotation and console workflows are still pending; R02 remains open.

### Gateway persistence checkpoint

The gateway now requires PostgreSQL, applies migrations at startup, authenticates persisted project keys, filters model listings by grants, and commits permission-checked attempt intent before provider dispatch. Non-streaming execution and usage evidence are persisted; unknown usage and failed/invalid upstream responses remain unsettled. Responses after dispatch carry operation and attempt IDs. Bootstrap administration creates organizations/projects/keys and revokes keys. Readiness checks the database. Compose provisions PostgreSQL with a named volume.

Verification includes real PostgreSQL with a local mock HTTP provider, durable usage assertions, revoked-key prevention of upstream calls, bootstrap API setup, admin/client separation and readiness failure on closed storage. The full workspace tests and documentation checks/build pass; a separate failure-path test covers absent usage, invalid success bodies and provider failures. Container execution, operator roles, streaming completion evidence, rotation, cost settlement and budget enforcement remain unverified or incomplete. These changes do not close a release row.

### Streaming evidence checkpoint

The gateway inspects bounded SSE events while preserving forwarded bytes. Valid terminal events persist execution and usage evidence before forwarding; missing/conflicting usage remains unknown. PostgreSQL integration tests cover fragmented complete streams, missing usage, truncation, error events and dropping a response before consumption. Unit tests cover UTF-8 fragmentation, CR/LF framing, multiline data, partial terminals and size limits. JavaScript `chat.stream()` supports incremental events, requested usage, AbortSignal and cancellation on early exit; six SDK tests pass. Streaming cost settlement, delivery acknowledgement and native-provider stream conformance remain open.

### Account and quota checkpoint

Account metadata now separates authentication, billing, plan, health and credential revision. The bootstrap API registers unverified accounts and lists metadata without credential references. PostgreSQL tests cover concurrent refresh exclusion, account isolation, concurrency slots, dispatch health checks and retention of uncertain slots. Quota observations preserve units and timestamps, reject future samples and ignore delayed older samples when selecting current evidence; freshness expires at either the freshness deadline or reset boundary. Native subscription transport, credential resolution, actual refresh calls, quota reservation, affinity and selection are still pending. R15 remains open.

### Key management workflow checkpoint

The branded console now supports organization/project creation and selection, scoped key issuance, one-time secret dismissal, key listing, rotation and revocation. Key rotation preserves grants/expiry and writes immutable audit evidence atomically; a PostgreSQL race test confirms only one replacement wins. Browser verification against an isolated local gateway covered organization/project creation, issuance, display and dismissal. Tenant operator roles, individual audit attribution, pagination and the rest of the console remain open.

### Console component checkpoint

The console uses selected shadcn/ui controls, Radix primitives, Tailwind theme mappings and Lucide icons. niu.io brand tokens remain authoritative. Production console build and browser checks on port 2555 cover navigation, admin connection, organization/project selectors, existing key listing, and checkbox-driven issue-form eligibility. This verifies the component migration only; unimplemented console workflows and release gates remain open.

### Cost reporting API checkpoint

Bootstrap administration exposes scoped lifetime budget snapshots and bounded cursor traversal of settled cost entries. Monetary and token integers are returned as decimal strings; cash and API-equivalent charges remain separate. PostgreSQL-backed tests cover admin/client separation, values above JavaScript's safe integer range, pagination, and cross-project/organization ledger isolation. These read APIs do not yet connect request admission to automatic pricing or settlement, and do not close R06 or the console workflow gate.

### Cost console checkpoint

The Usage & cost console now reads project budgets and paginated settled entries from the durable admin APIs. It displays separate cash and API-equivalent costs, reservation exposure, price revisions and bound overruns. BigInt formatting tests cover nanounits above JavaScript Number precision and the signed 64-bit maximum. Production build and browser verification pass for project selection and absent-budget/empty-ledger states. Populated ledger rendering, frontend pagination interactions, budget editing and automatic inference settlement still require further integration evidence.

### Automatic settlement recovery checkpoint

Streaming and non-streaming completion now invoke settlement when a trusted held price reservation and provider usage exist. A bounded background sweep retries the completion-to-settlement gap without redispatching inference. PostgreSQL tests cover concurrent recovery, idempotent charges, retention of unknown-usage holds, and automatic recording of provider overruns. Route pricing and reservation admission remain unwired, so normal gateway requests still cannot create priced reservations. Full process-crash qualification remains open.

### Budget creation API checkpoint

Bootstrap administrators can create a project's lifetime cash budget using exact decimal-string amounts. API tests cover client-key rejection, malformed/overflowing amounts, invalid currency, concurrent creation with one 201 and one 409, and unchanged persisted balances. Documentation explicitly describes the present admission limitation: budgeted requests need reservations, while automatic route pricing remains unwired. No release gate is closed by this API.

### Priced inference checkpoint

Optional OpenAI-compatible text route pricing now publishes/reuses an immutable scoped price, reserves configured token bounds before dispatch, and settles provider-reported usage. A PostgreSQL/local-provider integration test covers exact cash/API-equivalent charges, shared price revisions, injected output limits, rejected unsupported shapes and exhaustion preventing upstream calls. Earlier checkpoints describing entirely unwired pricing are superseded for this text subset. Input bounds remain operator-attested provider limits; richer billable dimensions, budget hierarchy, subscription fees and live provider qualification remain open.

### Imported task console checkpoint

The optional Tasks page lists scoped imports and displays spans, observed intervals, causal links, requested/reported model identity and separate outcome authorities. Browser verification with the synthetic parallel fixture confirms a 100 ms task interval, unknown actual model identity, shared charge references and a completion claim contradicted by validation. The CLI successfully imported that fixture into the local gateway before inspection. The console production build passes. A graphical timeline, resolved task costs, collector integrations and retention controls remain open.
