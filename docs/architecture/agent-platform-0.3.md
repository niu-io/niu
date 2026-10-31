# Agent platform architecture for 0.3.0

Design baseline, 2026-10-31. Governing requirements: [principles](../product/agent-oriented-principles.md) and [experience blueprint](../product/agent-experience-blueprint.md). Work and dependencies are tracked in `niu-y4q`; this document records architecture, not a live backlog or release qualification.

## Layers and dependency direction

Human goals and authority → host-native plugin → shared capability discovery and operation semantics → scoped Niu API/MCP adapters → existing resource, authorization, routing and accounting services.

Build and qualify from the service contracts upward. UX and documentation expose the qualified composition afterward. Claude Code, Codex and DeepSeek Harness share task semantics, but each package uses its supported manifest, installation and lifecycle mechanisms. They do not share an invented login or hook format.

| Layer | Responsibility | Implementation boundary |
| --- | --- | --- |
| Existing services | Authorize resources, execute configured policies, preserve accounting and state | Reuse existing APIs and data; change only when a documented gap requires it |
| Agent capability contract | Describe operation availability, grants, prerequisites, effects and verification | Actual tool/API sources remain authoritative; index must not imply grants |
| MCP/adapters | Typed resource discovery, comparison, evidence and authorized operations | Preserve unknowns; do not return confidential admin projections to workspace users |
| Host integration | Installation, credential references, discovery, review/resume guidance | Native manifests with shared concise skills; no silent inference rerouting |
| Human product | Goals, grant/review actions, model trials and performance/cost inspection | Resource-scoped, readable deep links and existing durable data |
| Documentation/landing | Short human entry, agent reference, accurate scenario claims | Publish capabilities only after the underlying journey is verified |

## Initial contract inspection and gaps

The table below records the initial inspection, before the workspace contracts
defined later in this document were added. It does not describe current release
availability; qualification lives in Beads and the dated verification record.

| User outcome | Concrete source | Decision |
| --- | --- | --- |
| Discover accessible models and limits | `sdks/mcp/src/tools.ts`, `resources.ts`, `config.ts` | Reuse current key/model/catalog tools; connection probe is read-only |
| Compare task samples and retrieve evidence | MCP `compare_models`, `get_generation` and normal inference tools | Reuse; agent controls task evaluation and approved test budget |
| Inspect/publish pool policy | `contracts/model-route-pools.openapi.yaml`, `apps/gateway/src/vendors/route_pools.rs`, JavaScript admin client | Reuse revision and preview semantics under actual authority; workspace delegation requires a separate safe design |
| Inspect request charges/performance | Existing generation telemetry and workspace Logs/Activity | Reuse customer-safe projections; preserve timing definitions and unknown states |
| Change access and budgets | Existing key control APIs and administration UI | Keep existing scopes; do not promote a workspace key into administrative credentials |
| Subscribe to resource events | Server observer/delivery-inspection plugin only | Missing customer subscription lifecycle; define producer, scope, delivery and recovery before implementing host hooks |

Pool handlers explicitly require installation credentials or an authorized platform administrator. `auditModelRoutePool` includes margin-health information. A generic tool forwarding arbitrary admin routes would violate both authority and commercial boundaries. Preserve the existing admin interface; customer-agent pool control needs an allowlisted resource projection and ownership/authorization design, not an installation token bundled with a plugin.

A configured pool is also not proof of arbitrary retry behavior. Existing handler documentation limits Chat fallback eligibility. Host guidance must refer to the actual routing contract rather than promise universal automatic recovery.

## Credential and review flow

A host package contains no credentials. The agent installs the supported integration and obtains a workspace credential through secure local setup. The first probe inspects grants and lists authorized models without paid inference. Preserve existing MCP servers and model/provider settings.

Distinguish explicit management capabilities from base inference access. Enumerate supported grants and resource scope before offering mutations. Missing authority returns a concrete prerequisite and review destination. After a person completes the authorized action, the agent reads back state itself. Never turn user approval prose into an invented authenticated session.

The target review record identifies resource, revision, proposed effects and applicable spending consequences. Existing APIs remain the source of saved truth. Readback must distinguish a saved policy from a successful live model request and distinguish uncertain charging from a failed unpaid request.

## Events and host lifecycle

Platform event subscriptions require durable configuration, tenant filtering, authenticated delivery, stable event identities, retry/deduplication, reconciliation and revocation. A resource-change event carries evidence; the consuming agent decides whether to evaluate or change policy within authority.

Host hooks can initialize guidance or process a supported local lifecycle event. They do not guarantee delivery to an inactive agent. Establish each host's supported wake/background mechanism before claiming automatic adaptation. Missing delivery primitives are product work, not a documentation workaround.

## Packaging and compatibility

Place coding-agent packages outside server-side `plugins/` to avoid conflating runtime extension types. Keep shared task guidance single-sourced and generate host distributions deterministically where their formats differ. Bundle or pin runtime dependencies, verify pack contents, and test from an isolated directory without an adjacent source checkout. Installation must preserve unrelated host configuration; uninstall must remove only Niu-owned entries and retain user data unless explicitly requested.

Use official host manifest references and record tested host versions. Schema validation, MCP handshake, read-only probe, bounded task/evidence workflow and review/revisit are separate acceptance layers. Missing native runtime access remains unverified rather than treated as a passing package test.

## Refactoring constraints

Preserve API/storage compatibility, durable saved data, user-visible slugs, theme tokens and shared components. Keep customer prices separate from procurement rates. Keep current document URLs while changing entry hierarchy. Target 0.3.0 does not waive release gates or the publication hold.

The dependency graph in Beads orders capability/authority architecture before shared discovery and host packages, then human UX and documentation, followed by landing and end-to-end acceptance. Necessary authority/event gaps must be tracked as dependencies of the affected journeys rather than silently removed from the intended product.

## Primary entry and account authorization

User decision, 2026-10-31: the landing's dominant action is a copyable prompt pointing to the stable `https://niu.io/docs/install.md` entry. Suggested prompt: **Install and configure Niu by following https://niu.io/docs/install.md.** The agent handles host-specific setup and directs the person through Niu login; account authorization then returns to the agent without manual key relay. This takes precedence over the earlier dashboard-first CTA and manual workspace-key setup.

A declared device/browser authorization handoff alone does not establish a working connection. Qualify that foundation before claiming the install prompt reaches a connected agent. Use a short-lived, single-use authorization request with a secret polling credential separate from the user-visible verification code. Bind approval to an authenticated Niu session, the selected workspace, explicit grants and expiry. Login alone cannot approve the request. Denial, expiry, one-time credential delivery, lost responses, revocation and CSRF protection need explicit tests. Never expose a polling secret in the browser verification URL or return a browser session credential to the agent.

The human review page must show the requesting client and requested scope before approval. Persist authorization state in the backend; browser storage is not the source of truth. Scope issued access to the approved workspace and operations without conferring installation authority. The polling result and subsequent read-only probe establish connection; a page redirect or package installation alone does not.

`apps/docs/public/install.md` records the installation contract and current unreleased state. Replace availability text with verified release/package discovery only after the end-to-end flow exists. Keep the URL stable across host and package revisions.

## Continuous evaluation and feedback

User clarification, 2026-10-31: the gateway's value includes continuously supplying quality and value evidence to coding agents and people, enabling repeated optimization. Treat the cycle as invocation → evaluation → feedback → policy change → revalidation.

Gateway-owned measurements establish model/route/configuration revisions, request/attempt outcomes, timing, retry/fallback behavior, usage and customer charges. Quality evidence must identify its task/rubric, evaluator, sample, observation time and associated request/model revision. Distinguish automated checks, agent judgments and human acceptance; transport success is not quality. Use existing request references rather than collecting unrelated external agent telemetry.

Support matched task-sample comparisons and retained evaluation results linked to underlying calls. Represent missing/uncertain charges, partial outputs and stale evidence explicitly. Cost per acceptable result is meaningful only with an explicit acceptance rule and matching charge coverage; a single low token rate or proxy benchmark does not establish workload value.

Agents consume structured comparison/evaluation evidence and people inspect the corresponding trial and performance views. Resource events can signal new evidence or changed conditions. The consuming agent owns the decision to adjust its model policy within delegated authority; evaluation itself does not authorize additional paid tests or automatic promotion.

Preserve prior evaluation and routing revisions so a change can be compared with its baseline and reversed. Define sampling limits, evaluation spending bounds and data retention before enabling continuous paid evaluation. Niu supplies measurement, association and feedback mechanisms, while task-specific quality and value judgments retain their stated owner.

## Delegated workspace management grants

The 0.3.0 authorization foundation adds explicit management capabilities to a browser request: `pools:read`, `pools:write`, `events:read`, `events:write`, `evaluations:read`, and `evaluations:write`. The list is finite and duplicate-free. Ordinary requests and existing API keys receive none. The browser shows the requested capabilities before approving the complete request; adding scope requires a new approval.

Grant rows attach to the issued key and original approval atomically. Checks bind the key to its workspace, current expiry/revocation and the approving operator's current write authority. A management grant is not platform administration and never authorizes confidential pool audit projections. `/v1/key` exposes current management grants for agent discovery. A grant alone does not establish that a tool/operation is implemented or available; clients must also inspect the current capability surface.

The existing inference-key behavior remains the explicitly reviewed base access of this connection. Delegated management is an additional layer, not an implicit privilege attached to a model wildcard. Pool/event/evaluation handlers must enforce their respective grants on the backend and recheck authority in their write transaction where necessary. Do not expose generic administrator route forwarding.

## Workspace model pools versus platform supply pools

Use a customer-owned workspace policy resource for model choice. Its candidates are public model aliases, not Provider credentials or procurement routes. It has a readable workspace-local slug, name, description, enabled flag, revision, priority/weight candidates and the existing validated rule language. Its saved history is immutable. Platform supply pools and their historical billing/ownership semantics remain distinct.

Agent management lives at `/v1/pools`, with scoped collection/read/write/history and non-dispatching configuration preview. Reads require `pools:read`; writes require `pools:write`. Store writes revalidate current key and approving-operator authority inside the transaction and lock those rows. The same transaction verifies current model grants, compares the expected pool revision and writes configuration plus history. Previously authenticated but reduced/revoked authority must not authorize a mutation.

Runtime integration must select an allowed concrete model before entering its ordinary inference, guardrail and billing pipeline. The key must permit that concrete candidate; a pool cannot expand model grants or invent a customer tariff. Retain pool name/revision and selected model as routing evidence, distinct from whether inference completed or what charge settled. Do not conflate a persisted configuration or preview with live model qualification. Cross-model retries require an explicit verified policy; existing protocol-specific bounded Provider failover must preserve its current limits.

Selection evidence is recorded before dispatch and linked to the resulting operation and attempt when those references exist. A rejection may have an operation without an attempt; a process interruption can leave response evidence incomplete. The recorded response status describes the returned HTTP response, not terminal streaming completion or task acceptance. Retrieve the associated execution diagnostics for terminal state, usage and customer charge coverage. Never replay a possibly paid request just to fill a diagnostic gap.

The response identifies the workspace pool slug/revision and concrete selected model; the normalized response model remains the concrete model so existing customer pricing and diagnostic semantics stay intact. Failure to attach evidence after dispatch must not discard a successful or streaming result. Mark the evidence gap explicitly and preserve the pre-dispatch record for reconciliation. Selection history and policy revisions are inputs to later quality/value evaluation, not quality scores themselves.

This separation reuses validated candidate/rule semantics and existing inference/accounting behavior while allowing customers to organize permitted models without platform authority. It does not expose or mutate Provider supply arrangements, prices or margin audit projections.

### Non-dispatching policy preview

Preview accepts the proposed configuration and optional request context: protocol, feature flags and bounded token estimates. Bare configuration bodies retain configuration-only validation. Contextual preview shares rule selection and candidate rejection helpers with runtime selection. It reports the matched rule, default rejection or disabled state, candidate exclusions and the selection-weight distribution within the highest eligible priority. A zero denominator means there is no selection; no random draw is presented as a prediction.

This is policy and declared-metadata simulation. It does not validate a complete protocol input, verify credentials upstream, reserve capacity, estimate customer charges or prove task quality. Runtime admission and execution must still recheck current state. Preview writes neither policy history nor execution selections and performs no inference. Keep these limits in MCP, SDK and generated contract descriptions.

## Workspace resource events

Agent subscriptions are workspace resources, separate from the server-side observer plugin. Reads require `events:read`; configuration, test delivery and revocation require `events:write`, revalidated in write transactions. A subscription binds its destination and signing credential to the authorizing key. New delivery attempts must stop when that delegation expires, is revoked, or loses its approving operator's authority; a request already in flight cannot be recalled. Reauthorization updates the subscription under a new explicit grant; saved enabled state alone does not establish delivery readiness.

The first producer is `pool.changed`, recorded in the same transaction as a saved pool revision. Events carry stable identity, workspace-local sequence, schema version, resource slug/revision and observation time, without prompts, outputs, credentials or procurement economics. A workspace event counter serializes allocation with transaction commit; a cursor cannot silently skip a late-committing lower sequence. Event reads and subscription delivery are scoped independently of model invocation. `evaluation.recorded` commits with a first immutable run insert and adds the run slug to its evaluation identity/revision. Identical run replay emits none. Subscriptions select one or both supported resource types; both candidate discovery and claims filter them. Targeted test events remain limited to their named subscription. Filters do not backfill events before the processed cursor. Referenced evidence still requires its own read authority.

Use a durable event log and per-subscription delivery state. New subscriptions start after the current stream head. Destination/signing-key changes and enable-state transitions restart at the current head without replaying history; metadata-only edits preserve the acknowledged cursor. Configuration updates cancel old-revision pending leases. An already transmitted request may still have been received, so cancellation does not establish non-delivery. Deliver at least once with stable event identity, bounded retries, inspectable failures and an explicit replay/reconciliation path. Preserve resource history separately from the event delivery window. Define and expose the window before pruning; an expired cursor must report a gap rather than an empty successful reconciliation.

Webhook destinations require public HTTPS, no embedded credentials or query secrets, no redirects, and address validation/pinning for each attempt. Sign the exact body with a timestamp, stable event reference and per-subscription secret; consumers verify the signature, bound timestamp skew and deduplicate the event identity. Keep secrets encrypted with a separate domain and exact workspace/subscription binding, expose a new secret only once, and rotate it when changing destination. Never persist response bodies or arbitrary upstream errors in customer delivery diagnostics. Tests use local fixtures without enabling private-network destinations in production.

A delivery receipt establishes receiver acknowledgement, not that an inactive coding agent was awakened or that its task succeeded. Host hooks remain local lifecycle mechanisms. Notifications confer no new authority to spend, evaluate or change model policy.

### Event delivery state and evidence boundaries

The implementation checkpoint records one event atomically with each saved workspace pool revision and preserves an immutable event log. No event pruning or finite retention window is enabled at this checkpoint. A claimed delivery has a 30-second lease, stable event/delivery identity and at most eight automatic attempts. Retries use bounded exponential delay. Lease recovery changes the lease token; a late worker cannot overwrite the newer outcome. An eighth in-flight attempt keeps its lease until expiry; an abandoned final lease becomes an exhausted failure with unknown HTTP outcome, never an invented acknowledgement.

Terminal delivery or exhausted failure advances that subscription's acknowledged/processed cursor so later events can proceed. Consumers reconcile a failed event through its sequence and stable identity in the event log; a failure is not an automatic authorization to change a model policy. The sender rechecks current delegation immediately before transmission, restricts destinations through the existing public-only upstream transport, signs `timestamp + "." + exact body bytes` using HMAC-SHA256 and the UTF-8 subscription secret, and treats only 2xx as receiver acknowledgement. `x-niu-signature` uses `t=<epoch seconds>,v1=<hex digest>`. Event and delivery references are separate headers. Receiver processing, task completion and agent wake remain unproven by an HTTP acknowledgement.

Subscription REST/MCP/SDK surfaces share these storage/worker semantics. One-time credential delivery, targeted test events, runtime delivery and human review are separate qualification layers; the dated verification record and Beads establish their evidence rather than this architecture document.

## Continuous evaluation records and matched inputs

An evaluation definition is a named, workspace-scoped, versioned resource containing a protocol, task/rubric and bounded named sample fingerprints. Runs retain evaluator identity/version, per-sample acceptance judgments and request references. Agent-submitted records identify the submitter as a delegated agent credential; they cannot assert an authenticated human acceptance. Recording a result does not invoke a model or authorize another paid test.

Explicitly tagged inference can bind an attempt to an evaluation revision/sample before dispatch. Fingerprint the normalized public request under a versioned domain, excluding the model and transport/correlation-only fields. Keep protocol and effective request parameters in the digest. The definition's sample digest must match before admission, and the binding must commit with the attempt. Do not retain prompts or outputs as part of this binding, and do not add hashing/writes to ordinary untagged inference. Guardrail-transformed input must not be silently treated as the original sample.

Historic untagged requests can retain attributed judgments, but their input match remains unverified. Matched comparisons must exclude unverified or mismatched samples, require equal sample fingerprints and rubric semantics, and report coverage rather than claiming task quality from HTTP success. Request/configuration changes belong in provenance. Evaluation and policy history remain immutable; reevaluation creates a new run and preserves the earlier baseline.

Capture customer-safe execution/usage/timing and customer charge evidence from existing reporting projections. Include every attempt in the evaluated operation so a failed/retried predecessor is not omitted from cost. Never use Provider cost, upstream expense or platform margin. Preserve money and branded-unit dimensions separately; owner-funded upstream expense is unknown rather than zero. Compute cost per accepted result only with complete matching charge coverage and an explicit acceptance count; no accepted results, pending/unknown charges, incompatible currencies/units or unmatched inputs must not produce an optimistic ratio.

A retained run is evidence observed at its capture time, not a promise that later reconciliation/refunds cannot change current accounting. Record observation time, underlying request/configuration revisions, evaluator provenance and coverage. New runs can revalidate old results without repeating inference. An evaluation event carries resource/revision identity only; notification is not automatic promotion, paid sampling or an agent wake guarantee.

Tagged inference must also be discoverable by evaluation/sample after an uncertain client response. Provide scoped attempt discovery with stable pagination and diagnostic references so the agent can inspect execution/charge state instead of repeating a possibly paid call. Do not make response possession or a human copying Logs identifiers a prerequisite for reconciliation.

Fingerprint version 1 is domain- and protocol-bound canonical JSON. It excludes only top-level `model`, `stream`, `stream_options`, `metadata` and `user`; request parameters and task content remain in the digest. The binding observes the effective public request at admission, after input policy handling and before protocol-adapter/upstream transformations. It does not prove hidden Provider prompts, internal model weights or undocumented upstream revisions. Preserve configuration fingerprints and observation time rather than inventing that provenance.

DeepSeek Harness joins the first integration batch by user direction on 2026-10-31. Its native Cordis bundle composes the host MCP bridge and a separate bundled-skill provider; it shares Niu task/login contracts, uses a host-specific private credential file, and does not replace host inference or unrelated profile rows. Exact release compatibility and lifecycle qualification belong to Beads niu-y4q.11.

## Current contract ownership map

| Journey | Human responsibility | Agent responsibility | Enforced contract/source |
| --- | --- | --- | --- |
| Connect | Sign in, match code, select workspace and consent | Install host package, run bounded login, save private credential, probe key/models | `/api/v1/auth/agents` and token exchange; `apps/gateway/src/admin/agent_authorizations.rs`, storage authorization grants |
| Model policy | Set task/model authority and review revisions | Discover candidates, preview policy, save with expected revision, read back | `/v1/pools`; pool storage and MCP contracts |
| Task evaluation | Set acceptance and bounded spending authority | Fingerprint effective samples, inspect attempts, submit attributed judgment, compare coverage | `/v1/evaluations`; immutable definition/run and input-binding contracts |
| Event response | Authorize receiver and important policy changes | Configure subscription, retain signing secret, reconcile failures, retrieve evidence | `/v1/events`; durable event/subscription/delivery contracts |
| Review and recover | Inspect saved policy, judgments, charges, delivery and revoke access | Supply readable review destinations; re-read state without human data relay | Member Read `/api/v1/workspaces/{workspace}/pools`, `/evaluations`, `/events`; `workspace_review.rs` |

The member review projection does not borrow an agent key or its inference
authority. Operator membership authorizes customer-safe reads; write grants
remain enforced by the resource contract. Public machine entry points are
`install.md`, `agents.md`, `pools.md`, `evaluations.md`, `events.md` and `llms.txt`
under `/docs/`. Packaging copies the shared references into each host artifact.
Implementation and release acceptance remain separate from architecture approval.
