# Documentation for agents

Normative authoring direction, agreed 2026-10-31. Follow the [agent-oriented product principles](../product/agent-oriented-principles.md). Decision record: `niu-aw8`. This document defines the target information architecture; it does not claim the existing docs site has already been reorganized.

## Audience and entry points

Keep the required human reading path to one or two short pieces: product orientation and agent-led onboarding. A user gives goals and constraints to the agent, reviews necessary changes, and inspects results in Niu. Manual setup remains available as a fallback, not the default assignment to the person.

Write the remaining reference library primarily for coding agents. Its purpose is to let an agent discover, configure, execute, verify and recover using Niu. Do not require a person to read chapters or relay model listings, JSON, screenshots or request diagnostics to the agent. An agent should retrieve those directly when authorized.

Preserve model trials, saved results, Logs and performance/cost tracking as direct exploration paths for people. Do not replace a usable product interaction with more explanatory prose. Do not delete reference routes or useful manual workflows merely to reduce article count.

## Capability-oriented reference

Provide a stable, compact entry index that identifies capabilities, applicable scopes, access methods and links to authoritative contracts. Make task-specific detail independently retrievable. Prefer plain Markdown, structured schemas and machine-readable results over information available only in a screenshot, interactive widget or rendered navigation tree. Choose concrete discovery artifacts during implementation; a file named `llms.txt` alone would not establish agent usability.

For each operation or coherent capability, describe:

| Contract | Required meaning |
| --- | --- |
| Purpose and availability | What it does; implemented, experimental or planned; version and deployment limits |
| Scope and authority | Resource ownership, required grants, user/admin separation and relevant approval boundary |
| Inputs and discovery | Types, units, bounds, prerequisites, defaults and how to obtain valid resource references |
| Effects and costs | Reads versus writes, paid inference, reservations/charges, external recipients and other consequential effects |
| Outputs and evidence | Schema, durable state, timing boundaries, provenance, freshness and unknown/missing fields |
| Failure and recovery | Error classes, conflicts, partial/uncertain results, idempotency and when retry is safe |
| Verification | How to read back the result and distinguish configuration, attempted execution and verified success |
| Human handoff | A concrete review destination, what the person must decide and how the agent resumes |

Examples must use real supported operations and mark synthetic results as illustrative. Include representative failure and recovery behavior where it materially changes safe use. Never embed secrets, private Provider economics or installation credentials in examples. Document unsupported behavior directly.

## Teach contracts, not generic agent reasoning

Agents already know that completing the task and managing cost matter. Niu documentation supplies missing product facts and control semantics. It should not prescribe a universal model ranking or optimization policy, promise the best price/performance, or turn application examples into long general development courses.

Task recipes can show how to retrieve model information, perform an authorized bounded comparison, propose a pool, verify a configuration or diagnose a request. Keep acceptance criteria tied to Niu behavior. The user's task quality and value judgment remain with the user and agent.

A model-selection recipe must connect decision evidence to an authorized configuration workflow. Show how the agent obtains the relevant capabilities, customer prices and evaluation evidence; inspects its grants and existing pool; previews a scenario-specific candidate and routing policy; applies a permitted revision or requests a concrete approval; and reads back the saved configuration. Then show how execution evidence informs a later revision. Identify the actual operations and current limits at each step. A model comparison that ends with a recommendation alone does not demonstrate this management workflow.

Document the continuing feedback path as well as the first successful call: how to retrieve execution measurements, associate quality evaluations, compare with a prior baseline, inspect charge coverage and freshness, and verify an authorized policy change. State sampling and spending limits before describing recurring evaluation. Keep measured facts, evaluator judgments and inferred recommendations distinct in examples and schemas; an HTTP success or a lower token price does not establish task value.

## Shared source of truth

Generate API references and tool schemas from maintained contracts where feasible. Keep MCP, SDKs, host-plugin guidance and docs aligned with those contracts. Do not hand-maintain conflicting operation catalogs or imply that the existence of a REST operation makes it available through MCP.

Host-specific pages contain only installation/configuration differences, supported versions, permissions, lifecycle behavior and limitations. Share task semantics across host integrations. Distinguish host hooks from Niu event delivery. State current secure authentication and review procedures; do not document a planned OAuth or approval flow as available.

Retain stable routes, anchors and redirects during restructuring. The dashboard links to the standalone `/docs/` artifact, and the Gateway redirects legacy `/help/` bookmarks. Preserve repository ownership and independent community builds.

## Verification

Validate links, generated contracts, copyable examples and rendered content. For agent-facing workflows, qualify an agent starting with only the entry point and a task, using bounded authorized fixtures. Confirm that it discovers the right operation, respects scope, handles an error, verifies the outcome and performs a concrete human handoff only where needed.

A build, a large reference corpus, an MCP tool count or a machine-readable index alone does not establish this outcome. Record exact host/version and evidence limits. Publishing a planned workflow or testing only a synthetic upstream is not live qualification.
