# Agent connection verification — 2026-10-31

Development evidence for the 0.3.0 candidate. This is not release qualification. Current work and remaining acceptance live in `niu-y4q`, especially `.1` and `.9`. Publication remains held.

## Package and host evidence

The standalone plugin/marketplace builders package both native host formats, shared skills, MCP runtime, browser login client, credential reader, README, MIT license and existing Niu icon. The output runs without an adjacent checkout. Official portable manifest/MCP JSON schemas and both skill validators passed.

Claude Code 2.1.316 accepted the plugin manifest. Its native `--plugin-dir … mcp list` health check started the bundled Niu server and reported Connected with an isolated fixture credential. This verifies host loading and MCP connection, not a Claude-generated task or paid model quality.

Codex CLI 0.162.0 recognized Niu 0.3.0 through a temporary local marketplace configuration. App-server read both packaged skills and the Niu MCP declaration. A temporary test installation and ephemeral session loaded the MCP tool inventory and successfully called `inspect_key`. The test installation was removed afterward. No model-generation turn was started.

The first Codex invocation deliberately exposed an environment boundary: a parent-process custom credential-file variable was not forwarded into the plugin process. The tool correctly reported login required. The qualification fixture then supplied its private credential-file location explicitly in the temporary MCP manifest. Production defaults use the user's private Niu configuration; this evidence does not establish automatic inheritance of arbitrary custom environment variables.

The installed Codex version returned no automatic onboarding skill despite recognizing the packaged skills. Do not claim automatic onboarding UI on this version. The install workflow must explicitly invoke the packaged connection skill. Native per-host installation and onboarding behavior remain version-dependent.

Formats were checked against the [Claude Code reference](https://code.claude.com/docs/en/plugins-reference) and [OpenAI packaging reference](https://developers.openai.com/plugins/build/plugins). Schema acceptance alone is not runtime evidence.

## Connection and credential continuity

An isolated PostgreSQL-backed gateway and dashboard verified browser login, return to the original request, workspace selection, explicit approval, one-time agent exchange and private local credential storage. The login client then successfully inspected `/v1/key` and `/v1/models`. No paid model request was made.

The initial isolated deployment lacked platform currency/funding and returned 503 for the read-only probes. The client reported verification failure rather than claiming success. After test currency and synthetic noncash credits were configured through existing administrator APIs, the complete flow was repeated successfully. This is not evidence of a real payment or merchant integration.

Desktop and 390px approval layouts and open workspace menus were inspected. Narrow document width was 390px and content width 350px, with no horizontal overflow. GitHub device activation was inspected as the authentication-layout reference. Review criteria included NN/g hierarchy/recognition and applicable WCAG keyboard/reflow guidance.

## Automated evidence

- PostgreSQL authorization lifecycle tests: 2 passed, covering pending, wrong capability, denial, expiry, one-time concurrent exchange, scoped issuance and poll throttling.
- Gateway HTTP integration: passed before subsequent contract/expired-request mapping changes, covering anonymous/viewer/cross-origin/missing-Origin refusal, explicit approval, no-store and duplicate exchange refusal. Re-run against final candidate.
- MCP plus device client/persistence tests: 17 passed. Includes immediate stdio startup and continuing in the same MCP process after a credential is saved.
- Copied isolated plugin: initialized and performed authenticated `inspect_key` without a source checkout or paid inference.
- Generated contracts: 367 annotated operations, root visibility check passed; documentation generator emitted 469 REST operations and 419 existing SDK exports.

The credential startup regression found and fixed a real race: readline could consume initialization before asynchronous credential loading installed its consumer. Protocol discovery now works before login; each operation reloads current credentials, with a rejecting transport when login is missing. A placeholder credential is never forwarded upstream.

## Evidence limits

This checkpoint does not complete authorization lifecycle hardening, final browser recovery/revocation coverage, full native task workflows, delegated model-pool management, event subscriptions, continuous evaluation, final documentation/landing restructuring, or 0.3.0 release gates. Model quality and value decisions remain agent/user-owned. Task completion requires evidence beyond connection and packaging.

## Workspace pool checkpoint

Local PostgreSQL tests verify delegated management, workspace isolation, immutable revisions, conflicts and current-grant checks. Selection storage additionally verifies operation-only early failures, refusal to overwrite response evidence and refusal to link another workspace's operation. The gateway HTTP suite passed two tests covering management and simulated-upstream routing for Chat, Responses and Embeddings, including concrete model dispatch, policy revision headers, operation/attempt association and disabled-pool rejection. No paid model calls were made.

MCP now exposes six workspace policy tools with scoped routes, explicit read/write semantics and conflict recovery guidance. Eighteen MCP tests passed, including pool response metadata, configuration-schema parity with the handler contract, traversal refusal and no mutation replay after a conflict. The public SDK pool test and response-metadata regression tests passed (11 tests together). Generated references contain 475 REST operations and 422 public SDK exports; root visibility verifies 299 registered paths and 373 annotated methods. The API documentation generation suite passed five tests, including delegated pool authority classification.

Messages and GenerateContent source integration passed code checking; native-protocol runtime qualification remains pending at this checkpoint. Configuration preview currently validates configuration/candidate metadata only, without live dispatch or request simulation. Final pool UX, current native host packages, richer preview and release qualification remain outstanding. This record does not claim 0.3.0 completion or resume publication.

Native protocol fixture follow-up: the combined test initially reused unique Provider/model records across two cases. The Messages case reached successful assertions, but the combined test did not complete. Cases now use independently migrated PostgreSQL test databases; the complete four-test pool HTTP suite is being re-run. This is fixture isolation work, not evidence of a live native-model qualification.

### Subsequent contextual-preview verification

After separating the native fixtures into isolated test databases, all four workspace pool HTTP tests passed. Coverage now includes Chat, Responses, Embeddings, native Messages and encoded-path GenerateContent, with pool/operation/attempt correlation. The subsequent current-source rerun also passed all four tests with contextual preview coverage: rule selection, capability and protocol exclusions, weight distribution, default rejection, disabled policies, invalid context/bounds and no policy persistence. Gateway code checking passed.

Preview and runtime share policy-candidate and rejection helpers. MCP and SDK carry optional preview context without altering saved configuration. Thirty-one client tests passed, including both configuration and contextual-preview schema parity with handler contracts. Five generated API documentation tests passed. References now contain 475 REST operations and 424 public SDK exports; root visibility and annotation checks pass. These remain local simulated-upstream and contract checks, not paid model quality evidence or final release qualification.

The human model-review task and actual inspected OpenRouter reference are recorded in `docs/ux/agent-review-0.3.md`; the new workspace review UI has not been implemented or verified by this checkpoint.

## Resource event foundation checkpoint

The initial resource-event storage suite and pool regression passed three tests. Coverage includes atomic pool/event persistence, no phantom event on revision conflict, workspace isolation, explicit current management grants, destination-change secret rotation, metadata-only cursor preservation, one concurrent delivery lease, bounded retry delay, expired-lease recovery, rejection of late-worker writes, eighth-attempt lease protection, exhausted attempts with unknown HTTP outcome, and revocation before dispatch. No external webhook or paid model request was made by these PostgreSQL tests.

The event signing credential domain-binding unit test passed for correct scope/subscription and refusal under another workspace, organization, subscription or Provider-credential domain. The worker source passed gateway code checking at its checkpoint; the signing-key seal helper remains unused until subscription creation is integrated. Later startup/offline inspection and key-rotation inventory additions require their current-source regression run. Local signed-wire/redirect testing and rotation-target storage verification are running, not established by this checkpoint.

Worker source uses the existing public-only pinned-address HTTP transport, no redirects or implicit HTTP retries, a current-authority preflight, exact-body HMAC signing, lease-backed outcomes and graceful shutdown integration. This is not yet a qualified agent-managed subscription journey. Public subscription REST/MCP/SDK contracts, one-time signing-secret delivery, test-event semantics, end-to-end delivery and human review remain incomplete. Retained events are immutable; no pruning window is enabled. Publication remains held.

### Subsequent event transport and rotation verification

The local signed-wire test passed, including an independently calculated HMAC fixture, exact body/event/delivery identity, one request on an HTTP 307 response, and refusal by the production public-only client to target the loopback fixture. This verifies the wire helper and redirect boundary, not the complete database-to-receiver worker path.

The subsequent PostgreSQL event/pool regression passed all three tests with offline envelope replacement coverage. The first rotation run exposed the database's closed table-name authorization constraint; migration 0396 now extends that whitelist alongside the Rust target inventory. Replacement preserves the subscription's policy revision and processed cursor. Startup and offline inspection inventory all retained signing credentials with exact workspace/subscription bindings. Public subscription management, one-time secret issuance and a complete delivery journey remain unverified and unimplemented at this checkpoint.

## Event management and agent-client checkpoint

The scoped event REST surface now supports configuration/readback/history, decimal-cursor event reads, delivery diagnostics and targeted test events. Configuration writes recheck delegated authority transactionally. Signing credentials are returned only on create/explicit rotation; ordinary reads and history exclude them. Destination changes require rotation. A subscription test has its own event type and target and cannot masquerade as a pool change or notify another subscription.

The management-to-receiver HTTP integration passed, including independently verified HMAC, 503 retry with stable identity, acknowledgement, event reconciliation, workspace/permission denial, rotation and disabling. The subsequent five-test event/pool suite passed using the shared production batch-selection/claim logic with a test-only loopback transport. An initial parallel run failed before business assertions because simultaneous schema migrations exhausted local PostgreSQL lock memory; all five were rerun serially without removing tests. Production still enforces public-only HTTPS destinations.

Thirty-six MCP/SDK client and response regression tests passed. Six API documentation tests passed. Contract generation verifies 380 annotations, 482 REST operations and 427 SDK exports; root visibility exposes 305 registered paths and 380 generated methods. The event configuration schema is checked against MCP schema by parity tests.

MCP prepares private local signing-credential storage before a secret-issuing mutation and returns only a file path afterward. Tests verify private file modes, symlink/unsafe-file refusal, no secret in tool output, and no replay or disclosure after persistence failure. The bundled adapter requires POSIX ownership/modes; Windows secret issuance stops before mutation unless an ACL-capable host adapter is supplied. This is an explicit current limitation.

A newly built standalone plugin discovered 41 tools and completed one fixture subscription mutation, retained its signing key in a private file and omitted it from protocol output, without an adjacent source checkout. Both packaged skills and Claude Code manifest validation passed. This does not qualify the final native-host subscription workflow or inactive-host wake. Source/agent event guidance is bundled; publication remains held. Final host/browser acceptance and the continuous-evaluation producer remain outstanding.

## Evaluation input-binding checkpoint

Migration 0397 adds scoped revisioned evaluation definitions, immutable history and attempt bindings, and the storage foundation for immutable result runs. Definitions validate bounded task/rubric text, protocols and named sample hashes. Fingerprint version 1 canonicalizes public request JSON under a protocol/domain binding while excluding only model and transport/correlation metadata. It retains no raw sample prompt/output.

An explicit `x-niu-evaluation` reference is parsed at shared pre-dispatch admission. The sample fingerprint and current evaluations:read delegation are verified in the same transaction as attempt intent; mismatches or missing grants roll back intent. Untagged requests do not hash or store evaluation bindings. Tagged unpriced admissions are isolated from ordinary batching. Priced and personal admission also carry the optional binding. Dedicated errors distinguish sample mismatch and missing grant from storage failures.

Eleven storage/Guardrail regression tests passed: six admission-order tests, three audit-failure/prepaid tests and two new evaluation tests. The new tests cover canonical/protocol/parameter-sensitive hashes, historical revision pinning, scope/grant checks, immutable binding and complete rollback on mismatch. The final current evaluation storage rerun also passed both tests after schema checks were added.

The HTTP test passed for tagged Chat, Responses and Embeddings using a local owner-funded simulated upstream: missing grants return 403 and mismatches return 400 before any upstream request; valid calls retain their sample binding, and evaluation headers do not reach the Provider. The complete current workspace HTTP suite passed all six tests serially, preserving pool/native-protocol/event coverage. Gateway code checking passed during this checkpoint.

This does not qualify tagged Messages/GenerateContent, paid tariff/reservation behavior for tagged inference, retained quality-result capture, matched comparison/charge coverage, evaluation event production, evaluation API/MCP/SDK or human review. Those remain required by `niu-y4q.10`. The run table alone is not a result-recording feature. No paid model execution or publication occurred.

### Immutable evaluation receipts and matched comparison

Storage now captures attributed agent/check judgments against a pinned evaluation
revision in a repeatable-read transaction. Receipts include the original input
binding, current public routing revisions, selected-attempt timing, all attempts
in each submitted operation, customer-charge coverage and pool selections. A
same-slug/same-submission retry returns the original receipt; a changed submission
conflicts. Reevaluation may use a new rubric while retaining the original input
binding and its definition revision. Stored receipts cannot be updated or deleted.

Summary arithmetic includes unsuccessful operation attempts. Unknown, pending and
owner-funded charges remain unknown; monetary and workspace-unit dimensions stay
separate. Cost per accepted sample is emitted only for complete charge coverage,
a nonzero accepted count and one compatible dimension. Comparison intersects only
verified sample references with identical request hashes and task/protocol/rubric;
it reports evaluator changes and shared operations without selecting a winner.
The duration field describes the evaluated attempt, not total retry wall time.

Validation: storage check passed; three summary/comparison unit tests passed;
the PostgreSQL evaluation integration test passed with run creation, scoped reads,
write-grant denial, identical replay, conflicting replay, immutable-row rejection,
and changed-rubric comparison. These are storage-level fixtures, not paid model
quality evidence or completed agent/human workflows. Run APIs, request discovery,
event publication, SDK/MCP access and human review remain unverified/unimplemented.

### Evaluation discovery, HTTP and client checkpoint

Added migration 0398's scoped discovery index and nine delegated HTTP operations
under `/v1/evaluations`: definitions, non-dispatching fingerprint, admitted-attempt
discovery, immutable runs and matched comparison. Discovery uses lexical snapshot
pagination; clients must restart pagination to discover new admissions. Missing
results never establish that a potentially paid request did not execute.

The current PostgreSQL HTTP integration passed Chat, Responses and Embeddings
fixtures including pre-dispatch mismatch/grant rejection, input fingerprint,
definition revision conflict, attempt discovery, owner-funded unknown-charge
coverage, identical run replay and shared-operation comparison. Responses are
no-store and tags are not forwarded upstream. Native protocol and priced-path
qualification remain pending.

MCP adds nine evaluation tools and explicit inference `evaluation` arguments;
JavaScript adds evaluation methods/types and the matching request option. Both
send bindings as headers, never Provider request content. Client regression:
37 passed. Documentation generation/navigation: seven tests passed; 389 handler
annotations, 491 REST operations, 431 public SDK exports and 312 root paths.
The standalone plugin was built, its Niu skill validated, and an independent
stdio process initialized/listed all 50 tools including nine evaluation tools
without login or inference. This does not qualify native host task execution.
The shared skill and machine workflow now document budget authority, uncertain
response recovery, snapshot provenance and comparison limits.

The recorded-evaluation event producer and human review remain required before
continuous evaluation is complete. No paid model invocation, Git commit, push,
tag, release or deployment occurred at this checkpoint.

### Evaluation notifications and member-review boundary

Migration 0399 adds `evaluation.recorded` references to the existing immutable
workspace event stream. A first run insert and its event commit together;
identical receipt replay, denied capture and conflicting capture emit no new
event. The payload identifies the evaluation slug, definition revision and run
slug without judgment text, input/output or charge details. Subscriptions accept
one or both unique resource types (`pool.changed`, `evaluation.recorded`), and
candidate selection and leased claims both apply that filter. Targeted test
notifications bypass resource filters only for their named subscription. Filter
updates do not backfill events before a subscription cursor.

Four storage tests passed, including atomic/idempotent emission, exact run
reference, filter isolation, lease readback and bounded event-type validation.
The six current workspace HTTP regressions passed serially. Their evaluation
fixture verifies the actual HMAC-signed JSON bytes through the shared delivery
worker to a loopback test receiver for Chat/Responses/Embeddings captures, with
three notifications despite identical receipt replays. Production public-address
restrictions remain in force; only the test transport accepts loopback. An early
fixture run failed because installing an event cipher into its unrelated
plaintext Provider fixture made inference unavailable; the final fixture keeps
its event cipher explicitly scoped to event delivery and passed.

Twelve read-only `/api/v1/workspaces/{workspace}` review operations now expose
pool configurations/history/selections, subscriptions/deliveries, evaluation
definitions/runs and comparisons under existing member Read authority. No agent
key is required or accepted as member authority. The HTTP fixture proves Viewer
reads of persisted evaluation receipts and all three lists, rejection of an
inference key, and 404 for a workspace outside that viewer's scope. No signing
secret or procurement projection is returned. Other detail/history states still
need browser journey qualification; source APIs do not establish completed UX.

JavaScript member-review methods and accurate brief/receipt/summary/comparison
types compile; their scoped-route fixture passed. Eight event/evaluation client
tests and eight documentation tests passed. Current contracts contain 401 handler
annotations, 503 REST operations and 434 public SDK exports. Re-inspected the
actual OpenRouter Presets empty list, new-preset grouped detail and expanded
model browser read-only as a reference for review hierarchy; no preset was saved.
Narrow reference and final Niu rendering remain unverified. Publication stays held.

### Human dashboard review checkpoint

Added workspace navigation and read-only list/detail routes for model pools,
evaluations and event subscriptions. Detail Tabs expose saved configuration,
pool history/execution selections, event authority/delivery outcomes, pinned
criteria and attributed run results. Baseline selection survives a readable query
on revisit; comparisons preserve missing-charge and matched-input limits. Empty
states provide an agent task prompt and connection reference. Missing-resource
and membership failures remain distinct from empty data. The SDK uses the current
same-origin API base, not its standalone localhost default.

Browser inspected authenticated persisted synthetic fixtures at 1280×720,
900×800 (navigation closed/open) and 390×844, including keyboard menu selection,
focus return, comparison, failed deliveries, empty workspace and missing resource.
No document overflow or displayed UUID was found in the measured comparison;
current-page console errors were empty. Dated measurements, visual conclusions and
remaining UX limits are in docs/ux/agent-review-0.3.md. Fixtures are local only and
make no claim about real model quality, charges or live receiver delivery.

Build integration also reconciles existing MetricStripSkeleton count callers,
scoped cache invalidation predicates and one missing skeleton import exposed by
the current dashboard check. These preserve scope rather than invalidating all
cached credentials/workspaces. Human review is still in progress: full historical
configuration inspection, narrow comparison scan refinement, larger pagination,
copy feedback and final native-host handoffs remain unverified. Publication held.

Final checkpoint checks: dashboard TypeScript project check passed; eight targeted
UI/cache/navigation tests passed; Vite production build passed (existing large
chunk advisory remains). The new UI tests verify unknown-charge evidence and
UUID omission, immediate removal of old rows on workspace switch, and denied
membership never masquerading as an empty or saved resource. These checks do not
replace the remaining browser and full-journey qualification above.

## DeepSeek Harness native candidate

Added DeepSeek Harness alongside Claude Code and Codex for the first batch.
The Niu-owned Cordis adapter uses the official MCP and filesystem-skill providers
and the shared compiled Niu runtime. Compatibility is pinned to Harness
0.2.1-rc.5 (official source revision
`b830ec950faba0a46dda564be3e2d854afed94f1`), not all preview releases.

An isolated native profile installed the generated local package and composed it
with the base bundle. The running host discovered 50 Niu tools and both shared
skills, rejected an unauthenticated inspect call, and disposed Niu's tools and
skills while preserving all 78 unrelated tools, including a second independent
MCP connection. Native package removal succeeded; the resulting configuration
retained the base bundle without the Niu entry. No model inference was performed.

Package generation, skill validation and npm pack dry-run passed. Native
authorization continuation and additional operating systems remain unverified;
this is candidate evidence, not a published integration or completed release.
Publication remains held.

Follow-up: `scripts/verify-deepseek-plugin.mjs` passed against the pinned native
host. The repeatable check builds and installs its own isolated package/profile,
then verifies 50 tools, two skills, missing-login rejection, newly saved private
credential reload in the same process, HTTP revoked-authority rejection, local
credential removal, unrelated MCP preservation, unload and native removal.
The HTTP authority response is a local fixture; real browser approval remains
unverified. The process/profile are removed after qualification.

## Agent entry and landing alignment

The documentation homepage now introduces the agent workflow and the canonical
installation prompt, followed by one human workflow and direct machine-reference
links. The primary sidebar has two human entries; agent and specialist reference
groups are collapsed. Public navigation has one Docs entry for API/SDK references.
The separately owned website puts the same copyable prompt in the hero and lists
Claude Code, Codex and DeepSeek Harness consistently. Preview availability and
publication hold are explicit. Existing reference URLs remain available.

Current checks: documentation Astro build produced 975 pages and its search
index; website Astro build produced eight pages. Documentation contract tests
passed 8/8; website tests passed 2/2. Both Astro checks reported zero errors;
the documentation check's single unused-variable hint was subsequently removed.
The website public-shell snapshot matches the current public source.

Browser evidence: both prompt buttons report copied and produce exactly
`Install and configure Niu by following https://niu.io/docs/install.md.`.
At 390px both documents have scroll width 390px; the landing prompt occupies
362px and wraps. Documentation was visually inspected at desktop, 900px with
sidebar and 390px with navigation closed/open. The mobile language menu stays
inside the viewport and switching to English updates the entry and navigation.
These checks establish entry presentation, not full authorization or model
quality qualification; remaining release gates stay in Beads.

## Native protocol and priced evaluation admission

Extended actual gateway HTTP qualification for Messages and GenerateContent:
both native pool tests now bind the effective input fingerprint to an evaluation
sample, retrieve the admitted binding and record an accepted baseline. Both pass
against PostgreSQL and loopback native upstream fixtures. Owner-funded fixture
charges remain unknown in the receipt rather than becoming zero. This proves
protocol binding and receipt creation; it is not a live Provider quality result.

The storage admission test now also exercises the priced transaction with distinct
procurement and customer tariff rates. A valid sample commits its binding and one
cost reservation. A mismatched fingerprint rolls back the attempt and binding.
The PostgreSQL test passes. This qualifies priced admission atomicity, not the
complete priced HTTP settlement/receipt lifecycle or a paid upstream request.

A fourth dashboard review regression test passes: historical pool review renders
the earlier configuration, identifies changed candidates, closes with Escape and
returns focus to the revision button. All four review regression tests pass.

## Priced HTTP evaluation receipt

The priced Chat HTTP qualification now passes against PostgreSQL and a loopback
upstream fixture. A delegated key creates the definition, dispatches its tagged
sample and records an accepted baseline. With two input tokens and one output
token, distinct customer rates produce 11 nanos while procurement settles to
4 nanos. The receipt contains the customer amount, reports complete charge
coverage, aggregates USD nanos and computes 11 nanos per accepted result.
Procurement field names are absent from serialized evaluation evidence. The
evaluation header is not forwarded upstream. Identical submission returns the
original receipt. An initial fixture query used a nonexistent settlement table;
it was corrected to the authoritative cost_entries table before the passing run.

This closes the previously missing priced Chat HTTP settlement/receipt check.
It does not prove all priced protocol/streaming permutations, live Provider
quality, or native-host authorization and evaluation end-to-end acceptance.
No external paid execution or publication was performed.

## Refreshed Codex and Claude Code native candidates

Rebuilt the standalone package from current 0.3.0 source with 50 tools and both
shared skills. Codex CLI 0.162.0 app-server installed it from a distinct local
qualification marketplace, opened an ephemeral thread and exposed all 50 tools.
A missing credential was rejected; after writing a mode-600 local fixture
credential, the same host process completed inspect_key. Service-side revocation
and local credential removal were each rejected. The test installation was
removed in cleanup. No model turn or inference request was submitted.

The first inherited-environment probe failed because the custom credential-file
variable did not reach the Codex MCP child. The builder now accepts an absolute
--credential-file and configures that non-secret path explicitly in both native
manifests. The passing qualification used this option. Relative paths fail
before output is created. Host environment filtering remains enabled. Default
credential locations and DeepSeek Harness's explicit adapter environment remain
separate cases; this does not justify weakening filtering or embedding tokens.

Claude Code 2.1.316 accepted the refreshed manifest and reported the bundled MCP
connection Connected through --plugin-dir. Validation's marketplace-install
README advice is deliberately not presented as a published install command
while publication is held. This verifies loading/connectivity, not a Claude
model-generated task or browser approval. Codex's HTTP authority was also a
local fixture, so real browser authorization and full host task acceptance
remain open. Official packaging reference was re-inspected:
https://developers.openai.com/plugins/build/plugins.

## Authorization host allowlist and browser recovery

An actual CLI startup audit exposed a missing DeepSeek Harness authorization
allowlist entry despite its native tool-loading qualification. Added it to the
browser client, service validation, generated API enum and migration 0400, which
extends the existing database check without rewriting prior grants. The client
rejects invented host names. The existing full scoped single-use/concurrency
PostgreSQL test now runs with DeepSeek Harness; both lifecycle tests pass. The
gateway HTTP browser-approval test also uses DeepSeek Harness and passes,
including scope/origin checks and single-use exchange. Agent Connect tests pass
17/17. The current generated references include the third host; generation
reports 401 annotations, 503 REST operations and 434 SDK exports.

A refreshed native DeepSeek Harness qualification passes with the new bundled
client: 50 tools, two skills, credential reload/revocation, unload coexistence
and package removal. No inference was performed. This does not replace the
remaining actual DeepSeek browser-to-host approval handoff.

Actual local browser/CLI recovery qualification used a Codex request with all
six explicit management rights. Each permission was displayed; consent stayed
unchecked and approval disabled. Choosing a workspace allowed Decline without
consent. The page reported Connection declined; CLI exited with a refusal, no
private credential file existed and the durable request had no issued key.
After expiring that same disposable fixture, reload showed unavailable/expired
and directed the user back to the agent. At 390px scroll width remained390px.
Fixed the browser title from Page not found to Connect your agent; typecheck
and production build pass. These actions issued no new credentials.

## DeepSeek Harness actual browser-to-host handoff

On the current macOS test environment, rebuilt the gateway including migration
0400 and a fresh standalone DeepSeek Harness package. An isolated native profile
loaded 50 Niu tools before login and rejected inspect_key. The bundled login
client opened a real loopback Niu verification request for DeepSeek Harness with
all six management capabilities. In the browser, the signed-in disposable test
account selected its fixture workspace, reviewed the six labels and one-hour
model-access consequences, checked consent and approved. The client completed
its bounded exchange, saved a private mode-600 credential and verified key/model
reads. No browser credential or issued token was copied through conversation.

The same waiting Harness process then read the new credential without restart,
confirmed all six actual grants and successfully called list_pools,
list_evaluations and list_event_subscriptions against the real local gateway.
No model request or paid inference occurred. After qualification, revoked the
issued test key through the existing management API, confirmed key inspection
returned401, removed its private credential, stopped the owned host process and
removed its native test package. This establishes this host/version's scoped
connection and read workflow, not live Provider quality or every OS.

Gateway refresh initially failed authenticated event-secret startup validation:
the old disposable launcher generated a new encryption key every run. Repaired
only the owned disabled synthetic subscription and retained a stable private
fixture key outside source. Production validation was not weakened. A stale
browser handle was recovered using a fresh tab; the same authorization request
continued, without duplicate approvals. Publication remains held.

## Codex actual browser-to-host handoff

Codex CLI0.162.0 installed a fresh current-source standalone package through
a distinct local qualification marketplace. Its ephemeral app-server thread
loaded50 Niu tools and rejected inspection before login. The packaged login
client then created a real local Niu request with all six management rights.
The browser displayed Codex, the matching verification code, disposable test
account, selected workspace, one-hour authority and all six permissions.
Explicit consent enabled approval. After approval, the CLI saved mode600
credentials and verified key/model reads; the same waiting Codex thread
confirmed six grants and read pools, evaluations and event subscriptions.

This used the explicitly configured non-secret credential-file path, not
assumed environment inheritance. No model turn or paid inference was submitted.
The owned plugin installation was removed in finally cleanup; its issued key
was revoked via the management API, subsequent key access returned401 and the
private credential was deleted. This proves the pinned local connection/read
workflow, not Claude Code task execution, other host versions or live quality.

## Architecture and machine discovery audit

Reconciled the architecture's initial gap inspection with its later implemented
workspace contracts, replacing stale future-tense descriptions without treating
architecture as release qualification. The ownership map connects each human/
agent journey to enforced authorization, resource and member-review operations.
Scoped grants, transaction checks, commercial isolation, event lifecycle, matched
evaluation inputs and bottom-up Beads dependencies are explicitly documented.

The agent entry now starts with install.md rather than requiring the human
walkthrough. It distinguishes bounded account approval from other review
handoffs. llms.txt directly indexes installation and evaluation contracts. All
six machine entry files served by the local documentation server exactly match
current source. Fifteen linked documentation routes return200; referenced JSON
parses. Eight documentation contract tests pass. This proves local discovery
and contract linkage, not hosted publication or complete native task execution.

## Claude Code actual browser-to-native tool handoff

Claude Code2.1.316 loaded the current standalone plugin through --plugin-dir.
A loopback deterministic Messages/SSE fixture drove the actual host's native
inspect_key call before authorization and observed refusal. While that same
process waited, the bundled login client created a real local Niu request.
The browser showed Claude Code, matching code, disposable account/workspace,
one-hour model authority and all six management rights. Explicit consent and
approval completed the CLI exchange, private mode600 persistence and key/model
verification. The same Claude process then inspected its actual six grants and
called list_pools, list_evaluations and list_event_subscriptions successfully.

The first --bare fixture run omitted plugin MCP tools from the model's calling
surface even though independent MCP health checks connected. Restricted mode
with explicit read-only tool permissions passed; no permission bypass was used.
The host's model endpoint/key were process-local synthetic fixture settings;
user inference configuration was not persisted or replaced. No paid upstream
inference or real model quality was tested. Native task orchestration here is
protocol-driven and must not be described as an autonomous model-quality result.

The process exited successfully; the plugin was process-local. The owned issued
key was revoked through the management API, subsequent access returned401 and
the private credential file was removed. Official CLI and gateway documentation
were inspected at code.claude.com/docs/en/cli-reference and
code.claude.com/docs/en/llm-gateway-connect. Together with Codex and Harness
evidence above, this qualifies the pinned macOS connection/read handoffs.

## Native workspace management and human readback

Codex0.162.0 native tools used a real local browser-approved six-capability grant
to preview a disabled test pool, confirm preview did not save, create revision1,
read it, reject stale revision0, update revision2 and inspect immutable history.
The member browser then displayed revision2 and opened the original revision1
configuration with its changed description. The initial candidate was rejected
until the isolated gateway declared the fixture model; wildcard access did not
make an undeclared model usable. Publishing that disposable static configuration
also required the current routing generation, preserving startup concurrency.
No model dispatch was made; the synthetic route points only at loopback.

The same native session created a disabled public-HTTPS event subscription,
retained its one-time signing secret mode600 outside source, read configuration
without the secret, rotated it, rejected a stale update and rejected test-event
queueing while disabled. It read a503 failed delivery fixture and reconciled
the workspace event log. Signature files were never printed in protocol output;
the native package used an explicit non-secret private signing-directory setting.
This verified native configuration/recovery, not external receiver processing.
Actual signed worker/retry/deduplication evidence remains the separate loopback
HTTP and storage tests already recorded above.

Revoked this owned grant via the management API, confirmed401, removed its private
credential/signing file and removed the temporary native plugin. Disabled
policies and history remain inspectable as labeled local fixtures. Member browser
review shows Disabled separately from Missing or expired delivery authority, with
a reconnect/update remedy. No external webhook or paid inference occurred.
A probe initially read the MCP JSON envelope at the wrong level; continuation
read back the saved revision rather than replaying creation, then passed.

Final management checkpoint: all seven current-source gateway workspace HTTP
tests pass serially against PostgreSQL. Coverage includes delegated pool
authority/preview/revisions, routing and execution links across all five text
protocols, signed event test/retry/reconciliation/revocation, evaluation binding
and priced customer-charge receipts. The existing large test-binary linker
unwind advisory remains; it did not prevent these tests from passing. These
fixtures do not establish a production receiver, inactive-host wake or universal
model/task quality.

## Native evaluation workflow with bounded local requests

Codex0.162.0 native tools completed the actual local sequence: create a named
workspace pool and task definition, fingerprint the effective Chat input, execute
two explicitly tagged loopback requests against pool revisions1 and2, record
attributed exact-output checks as baseline/candidate, compare verified matching
samples, and disable the policy afterward. The local fixture counted exactly two
requests and rejected any third request; the evaluation header was not forwarded.
The receipts retain independent operations, verified input, definition/evaluator
provenance, actual timing and corresponding policy revisions. Comparison reports
one verified matched sample, zero shared operations and preserves unknown charges
with no invented cost-per-acceptance ratio. Synthetic outputs produced one accepted
and one rejected check; these are not claims about real model quality.

Initial dispatch was refused because the static local alias had no qualified
supply. There were no admitted attempts and no fixture hits. Added an own-account
loopback fixture Provider using existing admin ownership/model APIs, then native
request discovery confirmed no admitted sample before resuming. A probe envelope
read was corrected before dispatch. This avoided replaying an uncertain execution.
No production admission checks were weakened or retail/procurement values invented.

Member browser read the real retained run and compared it with baseline:1/1 versus
0/1 acceptance, one verified input each, one unknown-charge attempt each and
insufficient charge evidence. Results show the current evaluated attempt duration
(15ms in this fixture) and evaluator-attributed reason. Policy revision references
are retained in receipts but are not yet linked in the human sample table; that
connected review gap stays open under niu-y4q.4/.10.

The owned test grant was revoked through the API, access returned401, its private
credential was deleted, the native package removed, the fixture Provider disabled
and loopback server stopped. No external or paid model execution occurred.

## Human captured-policy provenance correction

Evaluation sample rows now link receipt policy slug/revision to the appropriate
workspace history range. The history query and cache key retain the requested
revision, independent of current name/configuration and the latest100-page.
Actual native-produced candidate revision2 opens historical policy2 while the
current policy is3; the saved configuration shows its prior enabled state.
A regression verifies current103/captured1 requests history before2 and opens
the captured configuration. No internal UUID or mutable-name fallback is used.

Desktop and390px rendering, keyboard Enter, Back and dialog Escape were inspected.
Six review tests, TypeScript check and production build pass. This resolves the
previous human provenance gap for the bounded native evaluation journey. The
public evaluation guide now states the synthetic-fixture qualification boundary
without claiming live model quality or production receiver behavior.

## Resumed documentation and entry-point verification

After the user resumed implementation, the previously running docs build was
confirmed complete: 975 pages and the search index. A final browser walkthrough
of the current Build with Niu article found a duplicated Starlight base in the
machine-reference sidebar and the article's Next link (`/docs/docs/install.md`).
Sidebar link configuration now supplies paths relative to the configured docs
base. The rebuilt article contains the five correct `/docs/*.md` reference
links and no duplicated base. Six served Markdown artifacts, including the full
application spec, match their source bytes. The 975-page rebuild, eight docs
contract tests and generated-reference check passed (503 REST operations and
434 public SDK exports).

The article's setup copy button produced the exact canonical prompt. Desktop
and 390px rendering were inspected; at 390px the article width is 358px and the
root scroll width is 390px. The article makes agent-performed installation the
primary flow, links the runnable source/spec, separates management credentials
from application credentials, and preserves preview/publication limits. Stale
DeepSeek connection and priced-evaluation qualification wording was reconciled
with the already recorded local evidence, without claiming live Provider quality
or all-host/all-protocol coverage.

The independent website's current hero copy button also produced the exact
prompt. Mobile navigation opened, language selection changed the page to English,
and Escape left the trigger focused. The 390px root has no horizontal overflow.
The public-shell source check passed. Marketing remains in the website repository.

Overall UX/release acceptance remains open: the subsequent architecture review
record `docs/reviews/react-router-2026-10-31.md` identified cache/session defects
(`niu-8hv.1` and `.2`) and an unfinished route-data ownership migration (`.3`).
The user assigned those repairs to a separate coding agent. They are not repaired
or accepted by this documentation pass; their eventual integration needs fresh
verification before final 0.3.0 delivery. Publication remains held.

## Final standalone marketplace and human trial qualification

The current marketplace builder produced a standalone dual-host package. Both
marketplace manifests resolve their bundled plugin, and the four packaged
capability/pool/event/evaluation references match current source bytes. Starting
the bundled MCP entry from outside the checkout discovers 50 tools and rejects
an unauthenticated inspect operation. Claude Code 2.1.316 native marketplace and
plugin validation pass. A missing marketplace description warning was corrected
in the builder; validation then passes without warnings. The validator's optional
advice to advertise a public install command is not followed while publication is
held and no public marketplace root is available.

Codex 0.162.0 added the generated local marketplace, installed Niu 0.3.0, listed
it enabled, removed the plugin and removed the marketplace using its native CLI
in a new isolated host configuration directory. No existing user profile or
account credentials were used; the disposable profile was removed afterward.
This verifies local artifact consumption, not published download integrity or
hosted deployment availability. Earlier browser/account qualification remains a
separate recorded layer.

The human Generations trial path was exercised through the local Niu gateway
with a short-lived ordinary application key limited to the single local fixture
model. The browser selected that key/model, entered a synthetic prompt, changed
maximum output tokens to 32, and sent once. A deterministic loopback SSE upstream
returned VERIFIED, 18 input and one output token. The page displayed Complete,
19 tokens and Own API key rather than an invented zero customer charge. A browser
reload restored the saved result; a read-only database check independently found
one matching persisted chat session. Inspect request opened the actual readable
request detail, showing the response, token counts, timing phases and own-key
charge boundary. Raw data contained the synthetic protocol payload, not private
credentials. At 390px, page and dialog widths measured 390px; Escape removed the
request hash. This is UI/transport/persistence qualification, not real model
quality or a billed external Provider test.

The fixture recorded exactly one request with maximum output 32. Its key was
API-revoked, unauthorized use returned401, the private credential file was
removed, the owned fixture Provider was disabled and the loopback server stopped.
No extra inference or paid workload was attempted. The separate Router/session
and cache fixes remain owned by the user-selected coding agent; this successful
single-identity trial does not establish their correctness.

## Final Router integration readback

The separate Router findings have been repaired and independently revalidated.
See the integrated follow-up in
`agent-platform-0.3.0-source-audit-2026-10-31.md` and its retained snapshot receipts:
118 files/1,021 tests and TypeScript pass, current source matches the captured
inputs, Vite build and hygiene pass. Original cache-race probes, account and
permission isolation tests, route lifecycle tests and actual member evaluation/
event review were exercised. The only follow-up edit was waiting for a rendered
workspace label in a timing-sensitive test; no assertion scope was removed.
This resolves the earlier source-delivery integration exception, not the
unexecuted hosted release gates or publication hold.
