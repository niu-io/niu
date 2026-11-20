# Story-led product design

Design proposal, 2026-11-04. This document specifies intended behavior, not shipped capability or release verification. It derives the product from user outcomes. Existing screens and APIs require subsequent mapping against it. Execution state belongs to Beads `niu-z05j`.

## Product purpose

Niu is The Model Platform for Agents. A person authorizes access and spending. Their agent discovers available models, evaluates relevant evidence, configures authorized model use and verifies results. Niu supplies consistent access, trustworthy operational evidence and enforceable controls across upstream services.

The test of value is the work removed from a real task. Adding a second service should not require a second integration, separate credential distribution or manual reconstruction of failures. A person must also be able to try models and investigate results directly.

The external agent owns task planning, output judgment and model selection within its authority. Niu owns accurate resource information, enforcement, execution of configured policies and observable operation results. Task success and universally optimal model selection cannot be promised.

## Design rules

Use familiar navigation, lists, details, settings and contextual actions. Each page has one recognizable purpose. Tabs preserve the resource header and change their own panel. Resource lists show facts needed to choose an action. Advanced configuration appears when that task requires it.

Every required input must represent a decision the user alone can make. Supported Provider endpoints, adapters, model discovery and default connection preparation are platform work. Saving configuration never implies successful execution.

Humans review consequential decisions. Agents obtain structured information and operate directly under scoped authorization. A human should not copy model lists, diagnostic JSON or secrets between systems.

Every operation includes a persisted result, verification and recovery. An unknown result remains unknown until reconciled. Money-affecting operations must support safe reconciliation before retry.

## People and scope

An individual connects an agent and uses models. A workspace member uses approved resources. A workspace administrator controls membership, access and spending. A platform operator maintains upstream supply and hosted service operations. An optional commercial operator sells access. A Provider representative manages only their own agreed commercial relationship.

An organization owns membership, workspaces and the billing relationship. A workspace scopes work, credentials, model access, policies and activity. Personal use receives a default context without mandatory organization setup. Organization creation and switching are available through the account context, with management inside settings. Selecting an organization never silently changes the scope of an unfinished operation.

These ownership rules are proposed product semantics requiring authorization and billing verification before implementation. Administrator-managed upstream credentials and end-user BYOK are different capabilities. This design requires the former. The latter requires a separate authorization design.

## User stories and responsibilities

Each row describes a complete task. Detection names the responsible observer. Recovery must remain available on return, in another browser and through the agent interface when authorized.

| Story and desired outcome | Work Niu removes compared with direct upstream use | User decision and platform work | Detection and recovery | Observable acceptance |
| --- | --- | --- | --- | --- |
| 1. Understand whether Niu helps my agent | Avoid studying a management manual before trying it | Person chooses an agent connection or a direct model trial. Niu explains access, spending responsibility and current integration support | Niu identifies missing access before installation. Resume from the missing prerequisite | A newcomer reaches a working trial or a specific actionable prerequisite without understanding internal objects |
| 2. Connect my coding agent | Avoid writing integrations and relaying configuration manually | Person authorizes workspace, capabilities and limits. Supported host integration or MCP discovers capabilities and verifies connection | Integration reports authentication, scope and version failures. Reauthorize or reconnect without duplicate resources | Agent can discover permitted models, perform one authorized operation and read its result. Unsupported hosts are identified honestly |
| 3. Bring an upstream account | Avoid configuring adapters, endpoints, model inventories and basic routing | Select a supported Provider and enter its key. Niu discovers models and prepares usable access automatically. Any chargeable verification states its bounded cost and obtains applicable authorization | Niu distinguishes key saved, discovery success and successful invocation. Upstream refusal is shown immediately with evidence. Replace key or retry the failed check | An unusable key cannot appear verified. A valid key leads to a usable model without mandatory resale or manual model entry |
| 4. Start with hosted access | Avoid owning upstream accounts | Person accepts customer prices and funds or joins an authorized paying organization. Niu supplies permitted inventory and checks eligibility | Niu detects exhausted credit, absent billing authority or unavailable inventory before use. Link directly to the responsible action | A member knows who pays and can invoke a permitted model without seeing procurement data |
| 5. Find models for a workload | Avoid normalizing vendor names, capabilities and limits | Agent receives task constraints and inspects model capabilities, access, price provenance and freshness. Human can browse the same meaningful information | Niu exposes missing or stale evidence. Agent can refresh or choose a supported alternative | Agent distinguishes catalog existence from actual workspace access and verified capabilities |
| 6. Try and compare models | Avoid separate playgrounds and manually matching results | Person or agent chooses inputs and bounded trial budget. Niu preserves model/settings/results and attributed usage evidence | Failed or partial runs remain visible. Retry selected runs safely. External agent judges task quality | Comparison includes failures and unknown costs, and survives navigation and browser changes |
| 7. Make a reusable model choice | Avoid editing every application when model supply changes | Agent proposes or applies a named model pool under authority. Niu validates access and policy, previews effects and versions changes. Simple use gets a prepared default | Validation catches unavailable candidates. Failed changes preserve the previous working version. Rollback restores configuration without falsifying history | The caller uses a stable target, can inspect effective configuration and verify the published revision |
| 8. Connect an application | Avoid vendor-specific authentication and request setup | Person or agent creates scoped access and obtains a compatible endpoint and runnable example | Niu reports protocol or model-access failures. Revoke, rotate or correct access with a verified example | First request succeeds through the documented normal entry point and access cannot escape its workspace |
| 9. Use Chat or media generation directly | Avoid separate vendor interfaces while trying permitted capabilities | User chooses an available model and supplies relevant inputs. Niu persists sessions, outputs and attachments and presents capability-specific inputs | User sees actionable failure beside the affected request. Uncertain completion is reconciled before another potentially charged attempt | Reload and a second browser retain history. Composer remains usable in empty, busy and failed states |
| 10. Keep service working | Avoid discovering supplier failures through end-user complaints | Niu observes real requests, classifies connection/model failures and executes only configured fallback policies. Synthetic checks are bounded and explicitly configured | Caller gets request outcome. Responsible administrator receives deduplicated incident notifications. Agent receives events only through a supported subscription | Revoked credentials raise an actionable incident. A successful fallback does not conceal degraded supply. Recovery requires fresh successful evidence |
| 11. Investigate a bad or expensive request | Avoid joining upstream logs and application traces manually | Person or agent starts from a request or incident. Niu correlates attempts, routing, timing, usage and authorized charge evidence | Niu separates upstream rejection, Niu policy rejection and uncertain execution. Correct cause and verify a subsequent request | Authorized investigator can explain what happened without seeing unrelated tenant data or private procurement |
| 12. Control spending | Avoid manually watching multiple accounts | Administrator sets explicit limits and recipients. Niu enforces defined scope and presents remaining allowance and accounting delay | Niu warns before thresholds and reports enforcement immediately. Authorized person adjusts allowance or waits for reset | Concurrent use respects documented reservation/enforcement semantics. Unknown expense is never displayed as zero |
| 13. Improve cost and performance | Avoid gathering incomparable evidence | Agent inspects workload evidence and proposes model/pool changes within quality, latency and spending constraints. Niu previews policy effects and records changes | Niu reports observed regressions against configured conditions. Agent or person reviews and rolls back within authority | No automatic scope or spending expansion. Improvement claims state observation period and evidence limits |
| 14. Invite and govern a team | Avoid distributing shared vendor secrets | Administrator invites people, assigns roles and workspace access. Members use approved models without receiving upstream keys | Invite expiry, insufficient authority and lost access are explicit. Resend, change role or revoke with impact preview | Removal prevents future access across UI, API and agent interfaces while preserving authorized history |
| 15. Work across organizations and workspaces | Avoid separate accounts and accidental cross-team actions | User selects a named context. Niu scopes every operation, saved view and authorization to it | Niu detects stale context and rejects unauthorized resource access. Unsaved work prompts a meaningful choice before switching | Switching does not leak previous activity, billing, credentials or cached results. Shared links resolve only after authorization |
| 16. Pay and reconcile customer charges | Avoid matching vendor statements to team use | Billing administrator sees customer charges, invoices, payments and allocation by permitted workspace | Payment failures notify billing authority. Reconcile uncertain payment status before retry, then restore access under explicit policy | Amounts match customer ledger and currency. Members cannot see procurement expenses or change billing authority |
| 17. Replace or remove a connection safely | Avoid finding hidden dependencies by breaking production | Administrator rotates a key or retires supply. Niu identifies affected pools and verifies replacement before cutover | Failed verification retains the working path where possible. Compromised keys can be revoked immediately with explicit impact | Routine rotation preserves access and history. Emergency revocation overrides availability without concealing disruption |
| 18. Sell model access when explicitly enabled | Avoid building customer authorization, price publication and metering | Commercial operator chooses eligible supply, publishes customer prices and grants customer access. Niu validates actual supply and required approvals | Niu identifies the precise missing commercial prerequisite in this workflow. Pause sales, correct price or restore supply with a versioned result | Internal use works independently. Credential presence alone cannot establish sellable inventory. Customer charges use the authorized published price |
| 19. Reconcile Provider obligations | Avoid assembling usage and agreed rates manually | Authorized finance user reviews Provider-specific amounts due and records or reconciles payments. Niu labels whether it records payment or actually initiates it | Disputes and mismatches remain unresolved until reviewed. Corrections preserve audit history | Provider sees only their relationship. Recording a payment cannot imply that Niu transferred money |
| 20. Operate a Niu installation | Avoid discovering deployment and integration failures through customer complaints | Operator sees service health, installed version, failed background work and integration delivery. Niu supplies correlated evidence and safe retry controls | Operational monitoring identifies Niu failures independently of upstream incidents. Repair service, reconcile jobs and confirm recovery | About shows a real build version. Failed notification delivery is visible even when the affected agent is offline |
| 21. Return after interruption or an uncertain write | Avoid guessing whether a change succeeded | Niu persists operation identity and authoritative state. Agent or person reconciles before replay | Disconnects, conflicts and partial completion preserve recoverable intent. Reload reads current state and offers a safe next action | Repeated save, refresh or agent reconnect cannot duplicate grants, price changes, charges or other consequential operations |
| 22. Leave or revoke an integration | Avoid hunting for residual credentials and subscriptions | User revokes agent grants, removes access or exports permitted durable records. Niu explains ownership and active dependency impact | Niu detects incomplete revocation or remaining delivery. Retry cleanup and verify denial | Removed integration cannot continue operating. Organization-owned records remain governed by retention and membership policy |

## Agent operation contract

Every management capability must expose scope, prerequisites, required authority, expected effect, cost implications, evidence freshness and current support. Discovery must reveal unsupported operations before the agent plans around them.

The agent reads current state, proposes a change where needed, obtains consequential approval through a linked review surface, applies the authorized operation and reads the resulting revision. Approval binds to a specific scope and proposed effect. A changed proposal requires renewed authority when it exceeds that approval.

Results distinguish completed, rejected, pending, partial and unknown outcomes. They carry a durable operation reference, resulting revision and actionable next step. Expired authorization, concurrent edits and disconnected execution have explicit recovery. Human-facing text explains the outcome without displaying internal identifiers.

Subscriptions are an intended capability, not evidence of current support. Events require stable identities, tenant filtering, delivery history, retry and deduplication. An agent reconciles current state after missed events. Delivery failure remains visible to the owner. Receiving an event grants no additional authority and does not guarantee an inactive agent can be awakened.

## Capability grouping and proposed information architecture

Group functions only after the stories above. A compact workspace navigation serves daily work.

| Destination | User purpose | Contents |
| --- | --- | --- |
| Models | Find and try usable models | Access-aware catalog, model details and trials |
| Generations | Work with models and revisit results | Chat, media results and durable sessions |
| Connections | Connect an agent or application | Supported setup, scoped access, integration status and revocation |
| Activity | Understand outcomes and fix failures | Requests, incidents, performance and permitted usage evidence |
| Settings | Govern the workspace | Membership/access, model pools and policies, spending controls and notifications |

The account menu presents identity, current context, context switching, personal settings and sign out. Organization management and billing live inside organization settings. They receive prominent contextual links when a task needs them.

Platform administration has separate sections for upstream connections, optional commercial operations, operational health and Admin Settings as its final item. Provider connection details contain connection status, discovered models and key management. Commercial rates and amounts payable belong to commercial/finance work with appropriate authority. Ordinary API key management contains key lifecycle, scope and restrictions.

This is a proposed purpose map, not a final page count or an assertion that every destination needs a separate screen. Labels and grouping must be validated with complete journeys. Secondary details use familiar tabs, stable headers and contextual actions. Desktop management uses available width and existing Niu tokens and primitives.

## Health and recovery model

Configuration, credential verification, model discovery, successful invocation, current incident and commercial eligibility are independent facts. Present the facts needed for the current decision with timestamps and scope. A successful check for one model cannot certify all models. Historical success cannot imply continuous health.

Incidents group related failures by affected connection or capability, show first and latest observations, affected workspaces and mitigation, and distinguish active, recovering and resolved states. Notification severity follows impact and persistence. An isolated transient error is visible on its request without causing repetitive administrator alerts. Definitive credential refusal triggers immediate connection-owner attention.

Recovery actions sit beside the affected outcome. Replacement key, retry verification, inspect failed request, select authorized alternative and contact billing owner are task-specific remedies. Retry of a potentially charged inference requires reconciliation or explicit disclosure of uncertainty. Recovery updates the incident and notifies subscribers under their configured policy.

## Commercial and authority boundaries

Direct upstream payment is the default connection story. Optional resale introduces customer prices and commercial authorization only for those operating that business. The organization paying Niu and the account paying the upstream Provider must be clearly identified.

Customer-facing charges, owner-funded upstream expenses and confidential platform procurement have different audiences and provenance. Backend authorization and serialization enforce those boundaries. A platform administrator using a customer workspace does not gain permission to mix procurement data into that customer view.

Budget scope, approval authority, trial spending authorization and organization billing ownership require explicit policy. Defaults must never silently expand an agent's access or spending.

## Product acceptance

Evaluate complete stories through normal human and agent entry points. A successful page save alone cannot satisfy a story.

Run first use with hosted access and with a supported upstream key. Test valid, rejected and discovery-only keys. Ask a fresh user to obtain a real successful response and understand who pays without reading internal documentation.

Connect an agent with restricted authority. Discover models, perform a bounded trial, propose a pool change, approve it, verify the persisted result and reconnect after interruption. Repeat with an expired grant and a conflicting edit.

Revoke previously working upstream credentials during use. Confirm immediate caller feedback, an owner-visible incident, bounded deduplicated notification and evidence-based recovery after replacement. Repeat with fallback enabled and notification delivery unavailable.

Exercise concurrent budgets, membership removal, organization switching, shared links and another browser. Verify denied cross-scope access, durable history, correctly attributed customer charges and safe recovery after uncertain writes.

Exercise internal use without commercial configuration, then optional resale with its approvals and customer pricing. Verify finance separation and the distinction between recording payment and initiating a transfer.

Only after these journeys work should interface verification judge hierarchy, density, tab stability, keyboard use and responsive layouts. Visual work uses established product patterns and retained Niu branding. This design document does not claim rendered or live verification.

## Decisions requiring implementation discovery

Automatic discovery varies by upstream and needs an honest unsupported-service path. Verification cost and scheduling need bounded policy. Budget enforcement depends on reservation and accounting semantics. Agent event delivery depends on host support. Organization migration requires preservation of existing membership, billing and bookmarks. These are technical discovery obligations with user-visible outcomes already defined above.

This proposal has not been user-tested or mapped exhaustively to current implementation. Its release criteria describe desired behavior. Existing capability support must be recorded during implementation discovery rather than inferred from this specification.
