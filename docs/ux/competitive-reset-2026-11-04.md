# Competitive product reset

Started 2026-11-04. Durable review charter and initial evidence. Current execution belongs to Beads `niu-ya50`. This is an ongoing review, not a completed audit or implementation authorization.

## Long-term objective

Make Niu worth choosing for agent-led model management through demonstrably lower setup and operational burden, trustworthy evidence, bounded authority and recoverable operations. Basic inference compatibility is an entry requirement. Existing implementation effort does not justify retaining a capability or boundary.

## Completion conditions

Account for the whole story set in `docs/product/story-led-platform-design.md`, including human, agent, team, commercial and installation roles. Record actual outcome evidence, reasonable role knowledge, required internal knowledge, errors and recovery. Unverified branches remain explicit.

Compare equivalent tasks with direct upstream use and established alternatives. Distinguish published documentation from operated product evidence. Measure required decisions, manual steps, human handoffs, time to first verified outcome and failure recovery burden without inventing numeric targets before obtaining a baseline.

Diagnose ownership and value failures before navigation, interaction and visual symptoms. Each systemic finding identifies affected stories, evidence limits, a disposition for current capabilities, target behavior and observable acceptance. Reconcile existing Beads rather than duplicating historical findings.

Deliver an internally coherent product blueprint and implementation specifications covering dependencies, migration, authorization, accounting boundaries, durable state and verification. Implementation follows the reviewed countermeasures within authorized scope. Completion requires journey evidence, not issue closure counts.

## Initial competitive evidence

OpenRouter's quickstart documents unified model access, programmatic model listing and standard request examples. This establishes a published onboarding baseline, not operated comparative performance. Source https://openrouter.ai/docs/quickstart accessed 2026-11-04.

LiteLLM's Proxy CLI documents management of models, credentials, keys, teams and users, with a first model-listing request and agent launch support. Therefore command-line access to model administration alone cannot substantiate Niu's differentiation. This is an inference from published capability documentation, not a hands-on quality judgment. Source https://docs.litellm.ai/docs/proxy/management_cli accessed 2026-11-04.

The attempted Portkey documentation URL was inaccessible through the research tool. No capability or competitive conclusion is established for Portkey by this attempt.

## First hypothesis to test

Niu's potential value is a complete authorized management cycle that an external agent can discover, execute, verify and recover, while people retain meaningful control without carrying machine-readable information. This is a competitive hypothesis requiring comparison, not an assertion that competitors lack the capability or that Niu currently delivers it.

Provider setup is one dependency of that cycle. Broader review must include model evidence, trials, pool publication, application access, operational incidents, spending control, collaboration, commercial separation and installation health.

## Goal tooling limitation

The thread goal service still contains a paused unfinished historical review objective. A request to create the newly authorized objective was rejected because an unfinished goal exists. The historical goal has not been falsely marked complete. Beads `niu-ya50` records the new objective and ongoing work independently of that tool limitation.

## Current-state evidence, first inspection

The staging homepage was inspected through the browser on 2026-11-04. Initial navigation timed out, but reselecting the same tab confirmed a loaded page. The timeout did not establish service failure.

The page currently advertises Niu 0.3 host integrations, browser authorization, agent-managed workspace pools and authorized pool/evaluation events. Its primary copied instruction points to https://niu.io/docs/install.md even on staging. This is an observed environment handoff requiring verification, not yet a confirmed defect. Inspect whether the installation discovers the intended deployment before drawing conclusions.

Current source `sdks/mcp/src/pools.ts` declares list, read, preview, set, history and selection tools. Preview explicitly excludes proof of live access or task quality. Set uses expected revisions and advises reconciliation. Therefore the older blanket statement that MCP has no pool-management capability is obsolete for this worktree. Source availability does not prove deployment or successful authorized use.

The current homepage promises more than the earlier historical capability baseline. Review must trace each promise to installation, scoped authorization, an actual operation, readback and recovery. Neither homepage copy nor tool declarations establish the complete cycle.

A command-line fetch of the staging installation document failed with a TLS connection error. Browser access to the homepage succeeded. Treat these as distinct transport observations and continue through the working browser rather than claiming the document is missing.

Existing onboarding beads found include niu-098 (member sign-in handoff) and niu-287.23 (Chinese guide translation). Revalidate their actual journeys before updating or duplicating them.

## CR-01 — First-value promise is separated from distribution readiness

**User task.** Connect my coding agent to the hosted service without learning Niu internals or building development packages.

**Evidence.** The inspected homepage offers the install prompt as its primary action. Current `apps/docs/public/install.md` requires a published non-draft GitHub `v0.3.0` release and verified marketplace/Harness assets before automatic setup. On 2026-11-04, `gh release view v0.3.0 --repo niu-io/niu --json tagName,isDraft,isPrerelease,assets,publishedAt,url` returned `release not found`. The source verification record and closed niu-y4q.9 explicitly qualify local packages and retain publication limits. A direct browser Markdown navigation was blocked by the browser client, so deployed Markdown bytes were not verified in this pass.

**Impact and root-cause hypothesis.** The primary first-value path depends on a distribution prerequisite that is not satisfied by local implementation evidence. Completion has been divided by technical component rather than delivery of the user's outcome. This is a release-and-experience ownership gap, not evidence that native integration code is absent.

**Countermeasure.** Couple the primary connection action to verifiable deployment and artifact availability. When available, provide a deployment-bound host setup and successful scoped readback. When unavailable, disclose the limitation before sending the person into installation and offer only genuinely available trial/access paths. Respect the existing publication hold. Building from source is an explicit developer alternative, not a silent substitution for hosted onboarding.

**Implementation requirements.** Establish authoritative availability from selected release assets and deployment capabilities. Keep package and deployment versions distinguishable. Preserve the selected origin through authorization. Define one owner for artifact availability through first successful connection, including failures and reconnect. Exercise missing release, missing asset, integrity mismatch, unsupported host, denied/expired approval and successful connection. A copied prompt alone cannot close acceptance.

**Disposition.** Retain secure host integration and device authorization. Combine release availability, deployment eligibility and setup feedback into one first-use journey. Reuse existing niu-287.30 rather than create a duplicate. Closed local-package tasks retain their bounded evidence and do not certify hosted onboarding.

## CR-02 — Resource-change events do not close operational management

**Task.** A supply owner delegates connection monitoring to Niu and learns about access loss before manually investigating customer complaints. An authorized agent can obtain the incident and evidence and propose a bounded remedy.

**Source evidence.** `sdks/mcp/src/events.ts` and `crates/storage/src/workspace_events.rs` accept only pool.changed and evaluation.recorded subscriptions. Qiniu account_chat_banned classification exists in `provider_rejections.rs`, inference common handling and vendor import/verification handling. Therefore error propagation has implementation evidence, while these event contracts do not supply a connection-incident lifecycle. This is a source-scoped finding. No current live credential failure or absence across every deployment has been proven.

**Root cause.** The product exposes records of configuration/evaluation changes without establishing operational ownership of supply failures. A notification transport cannot substitute for defining which failures become incidents, who owns them, how impact is determined and what proves recovery.

**Required countermeasure.** Retain current resource events and specific sanitized caller errors. Introduce durable incident ownership across connection and model scope, with first/latest occurrence, grouped cause, active/recovering/resolved state, observed impact and evidence freshness. Definitive credential refusal warrants immediate owner attention. Transient request failures remain request evidence until bounded persistence or impact conditions justify an incident. Explicit model rejection must not disable an entire account by inference.

An incident must remain visible when fallback succeeds. Tenant members see their request/service consequences, while supply owners see authorized connection remedies. Notification delivery has its own inspectable failure state. Agent events carry stable identities and reconciliation references without expanding authority. Resolution requires a relevant successful observation after repair, not saving a key or acknowledging an alert. Synthetic verification must respect explicit spending policy and must not replay unknown charged outcomes.

**Implementation sequence and contracts.** Define sanitized failure taxonomy and scope first. Persist grouped observations and incident transitions atomically with bounded deduplication. Connect existing failure producers without bypassing inference accounting. Derive affected authorized consumers from actual dependencies. Add owner review, delivery/event integration and readback. Define reopening and retention. Verify restart durability, concurrent failures, recipient revocation, cross-tenant access denial, fallback visibility and per-model recovery. Link historical requests without retaining raw upstream secrets.

**Acceptance.** Inject a deterministic credential refusal into a previously working fixture connection. The caller receives an actionable outcome, the owner sees one durable incident, repeated requests update its evidence, the authorized observer can reconcile it and failed delivery remains visible. Replace credentials, verify a relevant successful request, and observe resolution. Repeat with one-model rejection, transient timeout and working fallback. These are required tests, not completed results.

**Competitive value hypothesis.** Users should spend less effort discovering, attributing and recovering from supply failure than with direct upstream logs. Existing competitor incident capabilities still require comparison before claiming differentiation.

## CR-03 — Task delegation defaults to broad inference authority

**Task.** Connect an agent to discover models or inspect/manage configuration, then authorize paid trials only within the task's limits.

**Source evidence.** `apps/dashboard/app/features/connect/page.tsx` posts allowed_models wildcard and ttl_seconds 3600. Approval copy explicitly states all available models, including newly added models during that hour, request evidence and possible charges under existing workspace limits. Additional management rights are listed independently. This is disclosed broad authority, not hidden permission escalation. No current browser approval was submitted during this audit.

**Impact.** A user cannot express a narrower model/inference grant in this connection form. A request to inspect or manage resources is coupled to potential paid invocation. Existing workspace limits may be much broader than a single experiment. The user must understand or separately repair credential policy before obtaining the intended delegation.

**Competitive baseline.** OpenRouter's documented authorization-code creation supports a credit limit for the resulting key. LiteLLM documents model restrictions and per-key budgets/duration. These are published controls, not hands-on comparative UX results. Niu must establish comparable bounded delegation before claiming an advantage from browser approval alone. Sources accessed 2026-11-04 https://openrouter.ai/docs/api/api-reference/o-auth/create-auth-keys-code and https://docs.litellm.ai/docs/proxy/virtual_keys.

**Countermeasure and implementation requirements.** Separate management rights, model invocation rights and paid execution authority in the grant model and approval summary. A discovery-only task should not require paid inference permission. Provide meaningful task defaults with recognizable model choices and bounded expiry. Show which payer and accounting boundary apply. An authorized agent can propose a scope increase but cannot approve it. A fixed model set must remain fixed when inventory grows. Reuse backend policy enforcement and key limits where correct, rather than add a parallel budget ledger.

Evaluate one cumulative experiment allowance across all attempts and retries against existing workspace/key accounting semantics. A conversationally agreed amount is not proof of hard enforcement. Owner-funded upstream expenses may lack reliable pricing, which must be explicit. Strict monetary guarantees require documented reservation and unknown-price behavior before enabling them.

Preserve existing credential semantics and history through migration. Verify enforcement across protocols, simultaneous requests, expired grants and revoked memberships. Keep agent-readable grant inspection and actionable review handoffs. Review the selected scope in the browser before delivery. This is a design specification, not a completed implementation.

## Coverage boundary at this checkpoint

The 22-story design baseline remains the intended scope. Current fresh evidence covers homepage entry, distribution requirements, source-level pool/event/evaluation availability, source-level approval scope and login entry. Authenticated staging redirected to login, so workspace rendering and ordinary-member journeys are unverified in this pass. Historical fixture evidence is useful for locating capabilities and cannot replace fresh live or current-source acceptance.

The next review must continue through task evaluation and cost provenance, team/scope ownership, commercial separation, durable uncertain-operation recovery and human navigation before the target blueprint is settled. This paragraph records evidence limits rather than reducing scope to the findings already gathered.

## CR-04 — Organization governance inherits a workspace filter

**Task and knowledge boundary.** An organization administrator expects Members to describe the organization's people and their access. They can reasonably understand organization/workspace roles, but cannot be expected to know that a reused directory initializes a hidden narrower scope.

**Revalidated source.** OrganizationSettings passes initialWorkspace from the active workspace or first entry into OperatorsView. OperatorsView initializes project from initialWorkspace and excludes other workspace-scoped members. Organization-wide members remain included. Thus the issue is a mixed organization/current-workspace view, not a proven cross-tenant disclosure. Existing niu-z2r already captures the cause.

**Countermeasure.** Organization Members defaults to organization coverage, with explicitly selected workspace filters and visible effective scope for each person. Workspace Members defaults to that workspace and labels inherited organization access. Reuse one authorized data contract while keeping task-specific defaults. Member creation must explicitly distinguish organization and workspace roles and corresponding billing authority. Verify same-name workspaces, cross-organization switching, membership revocation and direct links through ordinary member accounts. Backend access isolation requires separate tests and cannot be inferred from this UI finding.

**Related handoff.** niu-098 remains open for recipient onboarding. Renaming role copy does not establish a supported recipient sign-in path. Retain its remaining acceptance rather than close it with administrator-side evidence.

## CR-05 — Recovery is designed separately by form rather than by operation lifecycle

**Task.** Return after a disconnected consequential change and learn whether it completed before attempting another change.

**Source comparison.** API key mutation recovery has a server request-status endpoint and a browser hint. However, savePendingKeyMutation refuses to send if browser storage is unavailable. The browser therefore becomes a prerequisite for beginning the operation even though authoritative results live on the server. Existing niu-zz4 records that lockout problem. Retail standard pricing stores attempted publication and its idempotency key in component state/ref. Closing can preserve a mounted recovery flow, but this alone does not prove recovery after refresh or another browser.

**Root cause.** Individual forms own uncertain-result handling without a shared product requirement for discovering recent operations in the authorized scope. Each form adds defensive ceremony, while continuity remains dependent on the initiating browser or mounted component.

**Countermeasure.** Define a durable operation receipt for consequential writes, discoverable by authorized actor and resource scope. Retain existing correct idempotency and revision semantics. A receipt distinguishes pending, completed, rejected and unresolved outcomes and links to the resulting revision. Browser hints accelerate lookup but are disposable. Lost credential secrets require explicit rotate/revoke recovery rather than revealing secrets again. A newly chosen form draft is distinct from retrying the original operation.

**Acceptance.** Suppress the write response after server commit, reload with browser storage unavailable, and inspect the authoritative result before replay. Repeat in another authorized browser and after membership revocation. Confirm no duplicated effect or secret replay, preserve historical actor/scope and reconcile conflicts against current revision. Apply to key issuance/rotation, price publication and other consequential writes according to their real semantics. Source inspection identifies uneven recovery mechanisms, not proof that every existing write duplicates effects.

## Task-to-boundary decisions

This is the independent intended boundary compared with the inspected implementation. Familiarity with existing pages is disclosed. An alternative grouping is a task-centred workspace home with contextual links into resources instead of dedicated Models/Connections/Activity destinations. Test findability before selecting labels. Neither grouping warrants a new parallel shell.

| Task family | Actor and scope | Intended primary home | Inspected current evidence | Decision and rationale |
| --- | --- | --- | --- | --- |
| Connect and delegate | Person authorizing an external agent, workspace | Connection and approval | Install contract, ConnectAgent approval | Combine availability, scoped grant and readback into one outcome. Keep consequential approval distinct from routine use |
| Discover and evaluate | Agent or investigator, accessible models | Models and evaluation evidence | Catalog/resources and evaluation tools | Retain discovery and task-specific evidence. Compare real task outcomes, not a universal winner. Live evidence still required |
| Configure reusable access | Authorized agent or administrator, workspace pool | Workspace policy with history | Pool MCP contract and agent review tabs | Retain model pools and immutable history. Prepare defaults for simple use. Expert policy editing is optional depth |
| Use and revisit results | Person or application, workspace sessions | Generations and linked request | Existing historical fixture records only in this pass | Retain durable trial surfaces. Fresh normal/failure/persistence verification remains open |
| Keep supply working | Supply owner and affected members, separate scopes | Incidents with contextual connection remedies | Failure classification and limited event schema | Add operational ownership. Preserve separate sensitive supply evidence and member-visible impact |
| Control task spending | Approver and agent, workspace and scoped grant | Approval plus spending policy | Broad connection default, workspace limits component | Separate invocation authority from management and show the payer. Reuse accounting enforcement |
| Govern membership | Organization administrator and workspace administrator | Settings at each ownership scope | OrganizationSettings and OperatorsView filter reuse | Correct scope defaults and distinguish inherited access. Low frequency does not justify prominent daily navigation |
| Pay and reconcile | Organization billing authority | Organization billing | Shared-funds explanatory copy | Retain billing ownership, verify enforcement independently. Avoid repeating account finance under every workspace |
| Operate commercial service | Commercial operator and Provider representative | Separate authorized commercial area | Earlier design evidence, fresh runtime unverified | Keep selling prices/obligations out of ordinary connection setup. Actual selling prerequisites remain necessary within sales |
| Recover uncertain operations | Original actor with current authority | Affected resource and recent operation evidence | Key recovery helper versus component-local pricing attempt | Normalize observable lifecycle and scope, preserve operation-specific semantics and secret boundaries |
| Operate installation | Installation operator | Operational health and Admin Settings | Prior release/version findings, fresh runtime unverified | Retain specialist administration. Distinguish deployment failures, supply incidents and notification-delivery failures |

Judgments above are proposed countermeasures with bounded source evidence. Complete visual and interaction review and backend isolation verification remain required before implementation delivery.

## CR-06 — Default funding path lacks the expense evidence needed for its value promise

**Task.** An individual or internal team brings an upstream account and asks its agent to compare accepted outcomes against actual or estimated spending.

**Current evidence.** The direct-upstream-payment product decision makes owner-funded internal use a default story. `crates/storage/src/evaluation_summary.rs` aggregates customer charges and explicitly treats owner_funded attempts as unknown. Its test refuses cost-per-acceptance claims for those attempts. MCP evaluation tools similarly expose customer-charge evidence only. Existing niu-9ju.4 records quote versions and estimation implementation but explicitly leaves request-linked automatic expense evidence and account-scoped expense UX incomplete.

**Judgment.** Unknown is the correct current representation. The product gap is that a central default-use promise cannot be fulfilled by those current evaluation receipts. The user or external agent must still reconstruct upstream expenses independently. Confidential procurement must never be substituted to fill this gap.

**Countermeasure.** Complete owner-authorized expense observation as a distinct evidence channel. Attach immutable quote snapshot, units, currency, coverage, time and calculation provenance to actual attempts. Preserve Provider-reported expenses independently from estimates and customer charges. Include retries and failed attempts when their expense is known. Preserve unknown billable dimensions and incompatible currencies. Expose only the owning account's authorized evidence to its agent and human review.

Evaluation comparisons must choose an explicit basis, such as customer charge, owner estimate or Provider-reported expense. Do not mix bases into a winner or silently relabel an advertised quote as an actual charge. Stale or incomplete evidence remains visibly incomplete. An agent can compare quality and latency even when expense evidence is missing, but cannot claim a verified cost improvement.

**Implementation acceptance.** Reuse niu-9ju.4 for immutable request-linked observation and owner-scoped readback. Verify one priced attempt, cached-input pricing, a retry, unpriced units, stale quotes, changed quotes after execution, mixed currencies and cross-tenant denial. Compare evaluation receipts before and after a quote change and prove historical amounts remain stable. Validate owner-funded and customer-funded tasks separately. Public catalog metadata or a passing quote parser alone cannot close this story.

**Boundary decision.** Retain strict procurement confidentiality and current honest unknown handling. Connect authorized expense evidence to evaluations and activity. Keep platform purchasing agreements outside the customer workspace and external agent response.

## Review method correction

The prior review found many symptoms already tracked in Beads. The competitive reset must add causal value by linking them to an outcome and a coherent repair, not count rediscovered beads as new progress. CR-01 through CR-06 now identify delivery ownership, operational ownership, delegation boundaries, governance scope, recovery continuity and expense evidence. Each still requires verification at the user's normal entry points before it becomes a delivered improvement.

## CR-07 — Empty discovery hands internal setup work to the newcomer

**Fresh browser evidence.** On 2026-11-04 the staging public model catalog finished loading and displayed zero published models. Its next-step copy asks whether the user needs model aliases enabled, linking to workspace keys and routing documentation. This verifies the empty-state journey, not that the installation has no private inventory or that the API failed.

**Competitive reference.** The actual OpenRouter Models page was inspected in the browser. The visible discovery structure includes input/output modalities, context and price filters, model descriptions, context size, priced units, comparison and model-detail links. This establishes a concrete reference for decisions supported by a mature catalog, without copying its full information density or asserting that every filter belongs in Niu. Source https://openrouter.ai/models accessed 2026-11-04. Account-specific information is excluded from this review.

**User consequence.** A newcomer cannot discover or try a published model in this staging state and is directed toward implementation concepts before identifying a useful action. Enabling an alias does not by itself establish supply or account access. The next action depends on whether the person is a visitor, a workspace member or the supply owner.

**Countermeasure.** Distinguish no published inventory, no matching results, unavailable loading and no authorized workspace access. A visitor gets an honest availability statement and a supported access/trial path when one exists. A member sees how to request access from the responsible owner. An authorized supply owner gets the shortest connection path. Existing private inventory remains private. Do not publish fabricated models to improve the empty state.

**Acceptance and existing task.** Update niu-287.4. Exercise a fresh installation, private-only inventory, public inventory with no query matches, network failure and role-specific remediation. After remediation, return to the same discovery context and complete a permitted trial. Match catalog capability claims to actual protocol and access evidence. A nonempty seeded fixture alone does not establish first-use success.

## Runtime inspection constraints

Render CLI v2.28.0 is installed and authenticated. Its selected workspace was changed from the previously active workspace to the authorized Niu workspace for service inspection. No deployment settings were changed. CLI SSH refused noninteractive execution even with a PTY, and direct SSH to the reported service address rejected available public-key authentication. This limits that inspection path but does not block source review or other authorized service access. No credentials or account-specific third-party details are included in this public record.

Authorized staging account verification succeeded through the normal browser-login API using the existing configured demo account. Credentials were retrieved privately and were not written into the repository or review output. Session readback with the documented browser-session sentinel and Origin returned HTTP 200, operator identity, read/write/member-management permissions and no active platform-administrator mode. This is API authentication evidence, not a completed browser login or user-story verification. Initial requests without the required session headers were rejected and do not establish a product defect. Private session material remains outside the repository for continued read-only review.

## Live management readback and competitive calibration

Authenticated read-only staging requests to the active authorized workspace's routing, evaluation, event-subscription and API-key collection endpoints all returned HTTP 200 with expected resource shapes. This proves deployed read endpoints and current account access. It does not prove agent-credential grants, successful model execution, populated evaluation evidence, event delivery or cross-tenant denial. Account records, names, identifiers and inventory counts are excluded from this public review.

The deployed `/docs/install.md` and `/docs/agents.md` were retrieved successfully through an alternate HTTP client. Both returned text/markdown and matched the current worktree source bytes. The installation document's published v0.3.0 prerequisite is therefore now verified as deployed, closing the earlier deployed-document evidence gap in CR-01. Browser Markdown navigation remains client-blocked and is a separate observation.

New API's official channel guide documents default model filling, individual/batch testing and automatic channel disabling after consecutive failures. These are published baseline controls, not an operated comparison or a claim that its whole UX is superior. Niu's supply validation and failure response should be evaluated as baseline management obligations rather than marketed as a unique advantage. Source https://docs.newapi.pro/en/docs/guide/feature-guide/admin/channel accessed 2026-11-04.

Vercel's official AI Gateway budget guide documents budget scopes and threshold notification choices. Bounded spending and owner notification are likewise competitive baseline requirements. They do not by themselves establish Niu differentiation. Source https://vercel.com/docs/ai-gateway/observability-and-spend/budgets accessed 2026-11-04.

## Coherent redesign direction

The primary product relationship is delegation of model-resource management to an external agent under human authority. The repeated experience is connect, obtain useful evidence, make an authorized change, verify actual outcomes and respond to changed conditions. This sequence should remain understandable across existing pool, evaluation, access and incident resources. Niu should not become a general task orchestrator.

First use ends with a verified useful outcome. A supported connection receives prepared defaults and explicit access evidence. The administrator supplies the private upstream key where appropriate. Members consume approved resources. Neither actor must assemble resale prerequisites for internal use. Catalog metadata, route configuration and invocation verification remain distinguishable evidence without becoming three mandatory setup ceremonies.

Routine model management starts from a workload goal and current authorized evidence. The external agent selects candidates and judges output quality. Niu supplies comparable measurements, explicit missing evidence, scoped controls, immutable configuration history and linked execution outcomes. People inspect the proposal and consequential changes through ordinary details and review surfaces. Resource lists remain available for direct administration without defining the primary task order.

Continued management centres on outcomes needing attention. A person should see relevant incidents, failed operations and spending constraints with ownership and remedies. The agent reads the same authorized facts directly. Configuration-change events complement observed operational failures. Delivery acknowledgement, receiver processing and host wake remain distinct.

Information architecture follows ownership. Personal identity and integration preferences belong to account settings. Organization membership and shared billing belong to organization settings. Workspace model access, pools, evaluation evidence and activity remain workspace-scoped. Platform supply, procurement, sales and amounts payable remain specialist administration. A readable scoped deep link and return path preserve context through every handoff.

Existing branding, rail/sidebar hierarchy, installed primitives and full-width management canvas remain implementation constraints. The target is familiar resource navigation and contextual actions. A renamed menu or new overview dashboard cannot substitute for the required automation and operational ownership.

## Implementation specification ordering

First establish authoritative availability, invocation evidence and ownership. In parallel at the product level, settle grant/payer scope and enforceable trial limits. These are prerequisites for trustworthy onboarding and delegated management, not reasons to block independent review.

Then complete incident producers and lifecycle, request-linked expense provenance and durable operation reconciliation. Each has its own bounded acceptance and may reuse existing transport, accounting and idempotency. Cross-tenant and procurement boundaries apply to every new response, export and event.

Consolidate settings and navigation after ownership decisions are represented consistently. Preserve authorized legacy bookmarks through canonical resolution and keep historical meaning. Existing niu-0pt owns settings consolidation, niu-z2r membership scope, niu-098 recipient access, niu-287.30 first-use availability, niu-ya50.1 incidents, niu-ya50.2 bounded delegation and niu-9ju.4 expense evidence. Existing recovery findings remain linked to CR-05. Beads owns current execution and priorities.

Finally verify connected human and agent tasks through the normal entry points, then inspect the desktop, intermediate-width and narrow visual/interaction states. Measure human decisions and handoffs against direct upstream/reference tasks. No quantitative competitive advantage is established by this document.

## CR-03 implementation discovery — permission model constraint

Current agent approval storage and general key issuance both reject an empty model set (`crates/storage/src/agent_authorizations.rs` and `keys.rs`). Therefore a read-only connection cannot be implemented merely by adding an empty choice to the approval form. Model visibility and paid invocation need independently enforced semantics. A dummy model name would conceal the missing contract and is rejected as a design direction.

The approval record must persist the actual granted invocation authority independently of resource-management grants, model visibility and expiry. Token inspection must expose it. Credential exchange must issue exactly that approved authority atomically, with current approver membership rechecked. Existing grants retain their original meaning. Rotation must preserve the saved authority, and scope expansion must use explicit approval rather than a cosmetic client-side toggle.

Inference admission must enforce the invocation right across text protocols, embeddings, media submission, pooled model dispatch and any upstream billable management operation. Read-only discovery and authorized diagnostics must remain available when invocation is disabled. A pool reference cannot bypass the check by resolving a concrete candidate later. Existing allowed-model filtering remains an additional boundary.

A bounded paid trial additionally needs an atomically enforced allowance linked to the grant's actual accounting basis. Reuse existing spending-limit transactions where valid. Customer-charge limits cannot silently become upstream-expense guarantees in owner-funded mode. Until a safe maximum can be established, the approval must expose that limitation and must not advertise a strict monetary cap. This unresolved expense basis is related to CR-06, while separating management from invocation can be implemented independently.

Required regression scope includes management-only readback plus rejected inference across every supported protocol, pool resolution, expiry/revocation, unchanged legacy keys, rotation preservation, concurrent allowance consumption and failed exchange without orphaned broader credentials. API contracts, generated SDK/reference, native connection verification and human approval must be updated together.

## CR-08 — Funding prerequisites precede discovery and delegation diagnosis

**Task.** Connect an agent, inspect its real grants, discover potential models and prepare authorized resource configuration before deciding whether to fund paid execution.

**Evidence.** `payments/readiness.rs::customer_feature` classifies nearly all /v1 routes and workspace routes as funding-dependent, with only currency/branding exceptions. Existing funded_readiness test explicitly expects an unfunded key's model listing to return503. A new management-only protocol regression first encountered currency_required before invocation authorization, demonstrating ordering for an unconfigured fixture. Internal-use mode has a separate bypass, so this finding specifically concerns hosted/resale first-use and diagnostics, not every deployment.

**Countermeasure.** Exempt credential self-inspection, model discovery and non-inference pool/evaluation/event management from funding prerequisites. Preserve authentication, explicit resource grants, tenant scope and recipient authority at their handlers. Their success cannot establish that a subsequent paid call is permitted. Keep payment readiness and existing reservation checks for actual invocation. Do not broadly exempt every workspace route without classifying its effect.

**Acceptance.** With no configured merchant/currency, a valid management-only credential can inspect itself and read its authorized resources. An ordinary credential without management rights remains denied management access. Invalid/revoked credentials remain rejected. Invocation remains denied or payment-blocked without upstream execution. Repeat in a funded fixture to preserve normal behavior. Update the old model-list503 expectation because it contradicts the proposed first-use boundary, not because a failing test is inconvenient.

## Implementation checkpoint — delegated authority

### Named invocation scope design

The connection review's job is to let the signed-in owner recognize the requesting client, affected workspace, granted management operations, model-call scope, expiry and financial consequence before authorizing. Invocation stays off by default. Turning it on reveals a recognizable model checklist using Niu's existing API-key model-menu convention and installed menu primitives. The selection is a fixed set of concrete model aliases, never a hidden wildcard. A select-all action means the currently loaded names only; subsequently introduced names require a new authorization. Custom routing remains subject to the selected backing models, following its existing execution contract.

Load choices for the workspace being approved, not the dashboard's previously selected workspace. A workspace/request/identity change clears selection and consent. Loading, malformed responses, empty catalogs and failures must prevent invocation approval without preventing management-only approval. Retry clears consent and requires review of the current list. Do not substitute example model names or cached names from another workspace. The backend already validates named aliases and the key enforces them; retain legacy wildcard clients for compatibility while the normal browser flow issues fixed invocation scope.

The actual OpenRouter key-creation dialog was inspected on 2026-11-04: it groups owner, expiration and key limit before creation. No key was created or account setting changed. Account-specific records were excluded from review artifacts. This is a reference for reviewing authority at issuance, not evidence that OpenRouter uses Niu's model checklist. Niu reuses its existing model-choice control and preserves its own scope contracts. Independent trial-budget enforcement remains required separately; named model scope must not imply a monetary cap.

### Named invocation scope verification, 2026-11-04

The browser approval now issues fixed model names when invocation is enabled. Its model list uses the reviewed workspace's authorized catalog, not the shell's previous selection. Management-only approval retains discovery access with invocation disabled and does not depend on loading the model list. A failed, empty or malformed list cannot approve invocation. Workspace and selection changes invalidate consent. Organization name is visible alongside the selected workspace. Existing API wildcard clients retain their prior compatibility contract; no historical grants were rewritten.

Nine focused UI regressions pass, covering invocation off/on, exact persisted names, all-current selection without wildcard, renewed consent after changes, organization/workspace-specific loading, scope reset, failed/empty/malformed catalogs and management-only continuation. Model filtering and keyboard selection are exercised. Dashboard type checking and localization checks are recorded separately from these interaction tests.

A real approval/exchange API regression in disposable PostgreSQL approves only `fast`, then adds another configured model after issuance. The owner catalog proves the new model exists. The issued key's discovery excludes it and a real Chat request to it returns404 before execution, consistent with the existing resource non-disclosure contract. This is stronger than merely checking a mocked UI request or testing a nonexistent model. It does not establish a strict monetary trial allowance or finish all protocol/pool/rotation/revocation branches.

The actual local review page was operated with a disposable owner session and a genuine pending authorization request. No browser authorization was submitted and no upstream call was made. Workspace choice, invocation toggle, individual and all-current model choices, filtering/no matches, Escape, arrow-key movement from filter to item and Enter selection were inspected. An initial keyboard trap at the filter was found and corrected before this checkpoint.

Visual evidence covers 1280×720, 900×800 and 390×844. The narrow form measured335 px inside a375 px document client width (390 px viewport with scrollbar); document scroll/client widths matched. Open model choices remained inside the viewport and the check column aligned at the right. The page scrolls vertically to keep identity, scope, consequences and submission accessible; it is a standalone approval form rather than a bounded dashboard management canvas. This sampled composition supports recognition of the approval's scope, but long-model names, large catalogs and localized expanded states still require their own evidence. Source-backed review criteria are recognition rather than recall and error prevention, as applied through the ux-review interaction and visual-composition gates. Trial spending limits remain an explicit unsatisfied part of CR-03.

### Trial allowance accounting boundary

Source inspection confirms existing `customer_key_spending_limits` reserve and reconcile customer charges against a company balance account, keyed by a rotation-preserved spending root. Its transactional setter permits a current organization owner and rejects unavailable currencies or unresolved attribution. It does not cover owner-funded upstream expenses. Personal inference instead prepares a personal attempt, pins connection/model revisions and dispatches without creating a commercial customer tariff (`web/inference/common.rs`, `storage/vendors.rs`). Reusing the customer cap and labeling it an overall upstream-spend cap would therefore be incorrect.

Separate allowance bases in both authorization and readback. A Niu-charge allowance can reuse the existing account/root/reservation mechanism and must be installed atomically with credential exchange, before the key becomes usable. Owner-funded expense requires immutable request-linked quote/expense evidence, including currency, quantity bounds, quote revision and estimate-versus-reported provenance. Existing conditional quote estimates are not proof of a guaranteed Provider bill. Any allowance based on estimates must say so before approval, block requests without a defensible conservative estimate and retain holds for potentially executed/unknown outcomes. Do not silently admit an unpriced route or switch accounting basis when a connection's ownership changes.

The proposed approval binds amount, currency, basis, selected models, workspace and expiry; editing any of them invalidates consent. A financial owner must approve the financial boundary. An administrator's configuration role must not silently acquire ownership of company funding policy. Management-only access remains available independently. Rotation, retry, fallback, media submission and concurrent calls share the same lifetime allowance root. Consumed or unresolved amounts cannot reset through a new browser, refresh, retry or key rotation. Increasing an allowance requires a new explicit owner decision; readback must distinguish remaining, held, consumed and unknown evidence.

Required implementation acceptance includes atomic exchange rollback when policy installation fails, two concurrent requests competing for the last reservation, model/route ownership changes, missing prices/meters, stale quote revisions, usage correction, safe refusal versus possible execution, expired/revoked grants and cross-organization inspection. Customer projections must never substitute confidential procurement prices for missing customer charges. Request-linked owner expense is a real dependency for the owner-funded branch, tracked by existing `niu-9ju.4`; named-model scope and customer-charge limits must not be presented as completion of that branch.

Invocation authority now has a separate persisted field. Existing keys retain true by migration default. Browser approval starts false, resetting consent and invocation choice when workspace changes. Exchange copies the approved field atomically and rotation preserves it. Introspection and native-login feedback report actual authority, and the shared skill requires checking it before execution.

Six protocol routes were verified to reject a management-only credential with403 in an isolated funded fixture. Read-only resource management retains its own grants. Direct stored dispatch and batch admission also check authority. This checkpoint does not qualify a strict trial allowance, named-model selection, all native Provider actions or rendered browser approval. The batch admission check adds a database read and requires performance measurement before making throughput comparisons for this revision.

CR-08 implementation now exempts explicit introspection/discovery and existing non-inference pool/evaluation/event routes from payment readiness. It preserves handler authorization and invocation reservations. An unfunded-management regression and the historical funded-readiness regression must pass before acceptance. This change does not make unfunded model invocation available.

### CR-08 rendered and persistence verification, 2026-11-04

The normal local browser entry exposed a second gate in `AppLayout`: the API exceptions alone did not make the task reachable. Its initial exemption compared a full-route expression with the section-only navigation path, leaving Routing blocked. The corrected condition uses the actual pathname and explicitly enumerates the same three non-inference sections. Other workspace tools retain their existing prerequisites; this is not evidence that every existing prerequisite is justified.

With a disposable local owner account, normal User mode and no configured platform currency/payment setup, Routing, Evaluations and Event subscriptions now render their actual empty states through normal sidebar navigation. Routing's create dialog, existing model-choice menu, Escape dismissal and Cancel return were operated without making a model call. This establishes access to configuration, not live upstream usability. The rendered desktop at 1280×720, intermediate 900×800 with navigation closed/open, and narrow evaluation view at 390×844 were inspected. Narrow content width was 390 px and document scroll/client widths both 390 px. Controls remained reachable in these sampled states. This bounded prerequisite correction does not qualify the full routing editor's UX or the broader information architecture.

The task-oriented criterion is visibility and recovery access before paid execution (ux-review interaction/recovery and system-status criteria). These sampled management entries pass that criterion; overall product readiness remains unproven. Visual inspection separately found coherent header/body alignment and legible empty-state grouping in the sampled states, but it does not prove populated-table or long-content behavior. Existing request-based accounting and tenant authorization remain the authority for actual calls.

Dashboard route integration tests pass 61/61, including each of the three sections with both unconfigured and unavailable payment readiness, plus the retained payment gate/recovery test. Dashboard type checking passes. A disposable-PostgreSQL API regression successfully saves and reopens routing using an invocation-disabled delegated key with no currency, rejects an ordinary key, preserves optimistic revision conflicts, returns no foreign-workspace record and keeps inference unavailable. No external upstream request or paid test was used. Broader evaluation/event mutation, expired/revoked credentials and browser saved-state recovery are not established by this test.

Following the same owner into organization settings exposed another connected failure: member records loaded, but their workspace-name lookup returned a payment-setup error. The legacy organization workspace-directory GET must share the existing global directory's funding-independent behavior, while its handler continues to enforce organization scope. Limit this correction to the directory GET and its supported API alias; nested resource access and mutations require their own effect classification. Otherwise organization governance misleadingly appears broken before the first paid call.

The corrected local runtime was rebuilt and the normal User-mode organization page reloaded: its workspace-name lookup and member list completed without the previous payment error. Disposable-PostgreSQL acceptance now verifies own-organization directory GET returns200 and foreign organization returns404 under both API prefixes, matching the existing non-disclosure contract. The expanded agent regression also passes all three granted non-inference resource reads without currency, rejects ordinary inference-key access on all three, and retains invocation-denied403 across six protocols once payment prerequisites are configured. These checks do not qualify every organization membership operation or event/evaluation mutation.

## Incident implementation decisions and evidence limits

Existing OpenRouter safe-failure cooldown is retained. Its three-qualified-refusal policy manages temporary route selection and already survives restart. It is distinct from an owner-visible incident, notification or verified recovery, and therefore did not satisfy CR-02 by itself.

Recognized Qiniu account restrictions now retain a content-free classification through failure persistence. Unrecognized403 responses remain ordinary HTTP refusals. This classification does not establish nonexecution or release financial reservations.

A durable incident groups recognized refusals by actual connection and model, retaining its observed connection revisions and a readable incident reference. Replayed evidence from the same attempt is deduplicated. Incidents are model-scoped conservatively, so an observed text failure cannot certify an entire Provider account or disable unrelated media capabilities.

Resolution requires a later dispatched request under the current connection revision, confirmed execution completion, complete successful HTTP timing and no saved failure. A request already in flight before the last failure cannot establish recovery. Configuration edits, cooldown expiry and acknowledgement alone cannot resolve the incident. Recovery updates operational state independently of unresolved billing.

The initial read API is platform-administration-only, bounded and paginated, with no-store responses and sanitized references/times/counts. Workspace/customer projections, affected-scope notifications, transient-failure thresholds, catalog-probe observations, owner UI and external delivery acceptance remain required. This foundation is not the completed incident-management story.
