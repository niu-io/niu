# Agent-oriented product principles

Agreed direction, 2026-10-31. These principles govern subsequent product, integration, documentation and marketing refactoring. They supersede the earlier Token Platform positioning and human-first onboarding assumptions. They do not establish shipped capabilities, close acceptance gates, authorize migrations or resume publication. Decision record: `niu-aw8`; execution state lives in Beads.

## Positioning and responsibility

**The Model Platform for Agents**

Discover and evaluate models, build model pools, and manage performance and cost—all through your agent.

The core promise is to give agents the information needed to make decisions and the authorized controls to configure Niu around their workload. A scenario-specific model pool is the connection between that decision and actual execution. Better value means meeting the task's acceptance criteria within its quality, latency, reliability and spending constraints; it is not synonymous with choosing the cheapest model.

The motivation for managing model use already belongs to the coding agent: complete the user's task while improving value within the user's constraints. Niu supplies the information and authorized management capabilities the agent needs to pursue that objective. Niu does not guarantee the best model, optimal cost, task success or a particular quality/price ratio.

Model invocation is one operation within model resource management. Discovery, evaluation evidence, access, pool configuration, routing, budgets, diagnostics and event subscriptions belong in the product model alongside inference.

| Responsibility | Owner |
| --- | --- |
| Goals, task acceptance criteria, spending tolerance, permissions and consequential approvals | Human, with explicit delegation where appropriate |
| Task planning and completion; judging outputs; balancing quality, latency, reliability and cost; proposing or applying authorized model changes | Coding agent or application |
| Discoverable model information; trustworthy usage and performance evidence; authorized model management; execution of configured routing and limits; verifiable operation results | Niu |
| General task orchestration, tools, subagents, application data and schedules | External agent host or application |

Niu may execute an explicitly selected routing strategy, including a cost-based strategy. That deterministic execution does not make Niu responsible for judging task quality or inventing the user's optimization objective. The agent can change its policy as the task changes, within granted authority.

## Three product pillars

The public narrative is **Agent-friendly · Cost-efficient · High-performance**.

- **Agent-friendly:** agents discover, authorize, configure, verify and recover directly; humans set goals and review consequential changes.
- **Cost-efficient:** agents obtain decision evidence and configure Niu for their scenario. They build and revise model pools, routing and authorized event subscriptions using task requirements, evaluation results, published customer prices and observed performance. The goal is better cost per acceptable result within the user’s constraints, not a platform guarantee of optimal value.
- **High-performance:** efficient gateway execution and inspectable latency, reliability and usage evidence support the application. Publish measured boundaries and reproducible results; distinguish gateway overhead from upstream model speed and task quality.

The feedback loop connects information to action: inspect → evaluate → configure a scenario-specific model pool → observe execution → adjust and verify. Information without authorized configuration is insufficient; configuration without trustworthy feedback is insufficient.

## Information sufficient for decisions

Expose information through structured, scoped interfaces so agents can retrieve it directly:

- Available models and pools, supported protocols and capabilities, context/input/output limits, access requirements and known qualification limits.
- Published customer prices with units, currencies, billing categories, applicable conditions and effective revisions. Keep advertised prices, estimates, reservations and settled charges distinct.
- Request and attempt outcomes, latency boundaries, usage, failures, fallback history and customer charges, with stable correlation references and provenance.
- Current configuration, grants, budgets, resource revisions and prerequisites needed to explain what an agent can do next.

Missing information remains unknown. A successful configuration save is not a live capability check; model catalog presence is not access; a low token price is not proof of lower cost per acceptable result. Do not infer task quality from transport success. Private Provider prices and platform margins never enter customer interfaces.

Agents judge value using task outcomes and these measurements. Niu supplies bounded comparison and measurement facilities; it does not own a universal agent benchmark or claim to measure the complete productivity of external agents.

## The gateway closes the feedback loop

The gateway is a continuous source of execution evidence for model management. Each call can connect the selected model and pool revision to its actual attempts, performance, usage and customer charges. Associate task-specific quality evaluations with that evidence so agents and people can revisit decisions as workloads, models, prices and observed behavior change.

The product loop is **observe → evaluate → feed back → adjust → verify**. Make the same scoped evidence directly retrievable by agents and inspectable by people. Preserve the baseline, evaluation provenance and policy revision so an authorized change can be compared and reversed. Evaluation support and trustworthy feedback are Niu responsibilities; the agent and user retain ownership of the acceptance rule and quality/cost tradeoff.

Continuous evaluation does not mean evaluating every request or starting unlimited paid tests. Sampling, evaluation spending, retained content and automated changes require explicit bounds and authority. Separate measured execution facts, evaluator judgments and inferred recommendations. Label missing, stale and incomplete evidence, and publish a continuous-evaluation capability only after its capture, retrieval and recovery paths are verified.

## Management sufficient for action

Design management operations to be usable by an authorized agent without a person relaying dashboard data or copying configuration between systems. The target includes inspecting and changing model pools, routing policies, access and spending controls, and event subscriptions within each resource's actual scope.

Mutations need an inspectable proposal or preview where relevant, explicit authority and scope, revision/conflict handling, idempotency appropriate to the operation, durable results, readback verification and recoverable failure semantics. Reject unauthorized operations on the backend. An agent plugin does not elevate a workspace credential into administrator authority.

For a model pool, the agent determines the candidate set and policy from task requirements and evidence. Niu validates the configuration, executes the selected policy, exposes which route was used, and preserves configuration and billing revisions. Pool ownership and delegation must be designed explicitly before expanding beyond the current administrator-only model.

An approval handoff should name the proposed change, its scope and consequences, and link to the relevant Niu review surface. The agent must be able to check the resulting state and resume. Approval should not require the human to carry raw JSON, model lists, logs or secrets back to the agent. Current manual handoffs remain documented until a structured replacement exists.

## Events support continued management

Agents should be able to subscribe to relevant Niu changes, rather than relying on a human to notice and report them. Candidate event domains include budgets, model availability, price/capability revisions and configured performance conditions. Each supported event needs a defined producer, observation boundary and delivery contract; this list is direction, not a declaration that those events exist today.

Niu owns event truth and delivery semantics. The agent owns the response policy. A notification is not permission to spend money, change a pool or expand access. Define authentication, tenant filtering, sensitive-field handling, stable event identity, ordering/version semantics, retries, deduplication, delivery inspection and subscription revocation. Agents need ways to reconcile missed or duplicated events with current resource state. Avoid event-triggered retry or evaluation loops that create unbounded cost.

Keep Niu platform events separate from coding-agent host lifecycle hooks. A host hook can load guidance or run a permitted local integration step; it does not establish a durable Niu event subscription or the ability to wake an inactive agent.

## Native integrations complement MCP

MCP is a shared tool/resource interface, not the whole user experience. Build integrations for different coding agents using their supported plugin or extension mechanisms, while sharing the same Niu capability contracts and authorization rules.

A host integration should package capability discovery, secure connection setup, concise task guidance, appropriate host hooks, review handoffs and upgrade/uninstall behavior where the host supports them. Document supported host versions and missing features. Do not invent a common plugin format, pretend every host supports background events, or publish installation claims before verifying the corresponding package.

Keep optimization policy with the agent. Integration guidance explains tool semantics, constraints and recovery; it should not impose a fixed model ranking, hard-coded pool or universal cost strategy. Keep MCP, API and SDK untranslated. Distinguish **coding-agent plugins** from Niu's existing server-side Plugin API; neither implies the other's capabilities.

Connecting an agent to Niu management does not require routing that coding agent's own inference through Niu. Do not intercept subscriptions, replace billing sources or collect unrelated external agent telemetry as a side effect of installation.

## Human surfaces and agent documentation

Design for a person who will not read a manual before starting. The default human reading path should require only one or two short documents:

1. What Niu provides, what the agent owns, and which decisions remain with the person.
2. Connect an agent and complete one reviewable workflow, starting from runnable source when useful. Let the agent perform installation and setup; keep manual commands as an optional fallback.

The personal assistant example illustrates use of Niu. It is not a curriculum for building assistants, and it does not prescribe the application users must want.

The remaining documentation primarily serves coding agents: discoverable, precise capability contracts and task-scoped reference material. Human readability is useful, but extensive human study cannot be a prerequisite. See the [documentation contract](../development/agent-documentation.md).

People who want to investigate should be able to try models and inspect results, request attempts, latency, usage and charges in Niu. Trials and performance tracking are useful product surfaces in their own right. Preserve them, along with configuration review, recovery and permission management; agent orientation does not mean deleting the dashboard.

The landing page should demonstrate agent scenarios and the information/control Niu supplies. Lead with connecting an agent and reaching a reviewable outcome. Technical benchmarks and manual API examples are supporting evidence, not the onboarding sequence. Label planned capabilities honestly.

## Refactoring acceptance

Assess each changed workflow against the following questions, recording evidence and outstanding implementation in Beads:

- Can a new agent discover the capability, scope, prerequisites and current limits without a human consulting internal documentation?
- Can it obtain enough trustworthy information to make the task-specific decision, including missing or stale evidence?
- Can it carry out the authorized operation and verify the persisted result, or return an actionable approval/configuration handoff?
- Can it recover from conflicts, partial results, failed delivery or uncertain charge state without blind replay?
- Can the person review important decisions and try or inspect the result without becoming a data courier?
- Are Niu's information and control responsibilities separated from the agent's task and value judgments?

Preserve durable data, commercial confidentiality, existing authorization and compatibility contracts. Reorganizing navigation or documentation is not permission to remove APIs, widen grants or delete historical evidence. Generated references and SDKs should change with their source contracts, not through manual schema copies.

## Implementation evidence at the decision date

Source inspection on 2026-10-31 establishes the following limited baseline:

- `sdks/mcp/src/tools.ts` and `resources.ts` expose key inspection, model/catalog discovery, bounded model comparison, inference and generation diagnostics, plus documented media operations. This is source evidence, not a new live qualification.
- `apps/docs/src/content/docs/configuration/models.mdx` documents administrator-managed model pools, preview and publication. The MCP tool set does not expose pool administration, key creation or budget updates.
- `plugins/webhook-audit` implements a server-side observer/delivery-inspection facet. It is not evidence of a user-configurable agent event subscription workflow.
- Native per-host coding-agent plugins and agent-managed event subscriptions have not been qualified by this decision. Historical Agent Connect prototypes are not that qualification.

Future work must revalidate this baseline. The current release matrix remains authoritative for release readiness; these principles change direction, not verification status.
