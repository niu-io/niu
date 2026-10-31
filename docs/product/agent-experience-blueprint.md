# Agent-oriented experience blueprint

Refactoring baseline, 2026-10-31. Governing direction: [product principles](agent-oriented-principles.md). Execution and acceptance live in Beads (`niu-y4q`). Existing product navigation has already been inspected; this model is derived from responsibilities rather than its current menu.

## Target release: 0.3.0

The agreed target is **0.3.0**, replacing the unpublished 0.2.31 candidate. This is a release objective, not a declaration of completion or authorization to publish. The publication hold remains in effect.

The first host integrations target **Claude Code, Codex and DeepSeek Harness**, using each host's supported extension mechanisms. Acceptance centers on agent-led installation and capability discovery, secure scoped access, task-relevant model evidence, authorized operations and concrete human review/readback. Keep human reading to orientation and onboarding; make the technical reference discoverable to agents. Preserve model trials and performance/cost inspection for direct human use.

Reuse existing backend APIs initially. Record any missing management operation or authorization boundary explicitly before expanding implementation. Native integrations and changed UX must be verified in their actual hosts and rendered surfaces; source packages, schemas and a version bump alone do not qualify 0.3.0. Existing release gates continue to apply.

## Task and ownership model

| Task | Actor and scope | Primary home | Current boundary and refactoring direction |
| --- | --- | --- | --- |
| Understand Niu and delegate a first task | Person, chosen workspace | Short orientation and onboarding | Combine human entry around two documents; retain manual references as optional expert access |
| Connect and discover capabilities | Agent host, scoped credential | Native host integration and shared capability entry | Current MCP is usable; qualify native packages independently, preserve other host integrations |
| Select models using task evidence | Agent, permitted catalog and test budget | Model discovery/comparison tools | Retain MCP comparison; quality and value judgments remain agent-owned |
| Continuously reassess model use | Agent and person, explicit evaluation and change authority | Linked execution evidence, evaluations and policy history | Compare task acceptance, performance and customer charges against a retained baseline; bound sampling and paid tests, preserve provenance and rollback |
| Organize model resources | Agent proposal; authorized resource owner publishes | Pool configuration and review | Preserve administrator scope; do not expose privileged mutations through a workspace-key wrapper |
| Understand or approve a change | Person with appropriate authority | Relevant resource review surface | Keep scope, evidence and consequences visible; support state readback instead of human data relay |
| Try models or investigate results | Person or agent, permitted workspace data | Generations and request/performance views | Retain direct trials and diagnostic drilldowns; combine related evidence, not commercial roles |
| Respond to resource changes | Agent integration and authorized subscriber | Event subscription lifecycle | Define platform delivery separately from host hooks; current observer plugin is not qualification |
| Find exact operation semantics | Agent | Capability index and generated references | Move technical detail below human entry; preserve routes and machine-readable source contracts |

An alternative of making Chat the universal entry would obscure installation, delegated management and administrator authority. Retain specialist trial, management and audit surfaces, connected by resource context and review handoffs. Do not remove dashboard functionality merely because agents become primary operators.

## Knowledge boundaries

People know their goals, acceptable results and spending tolerance. They should not need to know MCP configuration paths, endpoint names, internal resource IDs or accounting state machines. The host integration discovers its configuration and Niu capabilities. Niu exposes resource scope, prices, limits, missing evidence and actionable failures. Agents know how to plan and assess tasks, but cannot infer undocumented Niu semantics or privileges.

## First complete journey

Human expresses goal and constraints → agent establishes a secure connection → agent discovers available operations and grants → agent obtains task-relevant model evidence → agent proposes or performs an authorized action → person reviews a consequential change if required → agent verifies persisted state → person tries or inspects the outcome.

Qualification must include missing configuration, insufficient permission, bounded paid evaluation, a failed or uncertain operation, review/readback, restart/revisit and uninstall/revocation as applicable. Synthetic execution and source inspection are evidence only for their stated boundaries.

## Host integration structure

Use one shared Niu capability and task-semantics layer with small host-specific packages. Each native package owns supported host versions, installation/configuration, capability discovery, secure credential references, lifecycle behavior and review/resume integration. Avoid separate optimization policies per host. Existing server plugin manifests remain independent.

Do not describe a universal login, approval or background notification capability before verifying the host and Niu contracts together. A management operation absent from the current credential scope remains unavailable, even when the agent knows the REST route.

## Documentation structure

Human entry: orientation and Build with Niu. Agent entry: a compact capability map linking MCP, generated API/SDK contracts, management scope, diagnostics and recovery semantics. Existing articles remain addressable while the entry hierarchy changes. Generated references remain generated; no manual duplicate operation catalog.

## Evidence baseline

The principle decision records current MCP and administrator pool boundaries. No native host plugin, event subscription lifecycle or complete new human/agent journey is qualified by this blueprint. Review changed surfaces against NN/g recognition, task continuity and status/recovery principles, plus applicable WCAG keyboard/reflow requirements. Preserve Niu tokens and installed primitives.
