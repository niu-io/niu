# Intelligent Routing

Feature request, 2026-11-04. Tracking: `niu-ycg8`. This describes proposed capabilities, not shipped behavior.

## Purpose

Let an authorized agent configure how Niu selects models for a workload, using explicit task requirements, capability constraints, customer prices and observed performance. The agent owns acceptance criteria and quality/cost decisions; Niu validates and executes the selected policy and exposes evidence.

## Deterministic foundation

The first increment extends existing rule matching and priority/weight selection rather than introducing a classifier. Both workspace and platform routing use the shared request-capability predicate before choosing a candidate. Required vision and reasoning need explicit catalog declarations; unknown optional support is not eligible. Supplied input/output token traits are checked against declared route bounds, completion limits and combined context capacity. These traits are estimates, not exact tokenization or proof of live upstream support. Unknown token bounds remain unknown and admission still applies.

Price-based selection, semantic Auto and a structured System 1 endpoint are separate increments tracked under the feature in Beads. This foundation alone does not implement those capabilities or general cross-model retries.

## Invocation and policy

Support independently configured decision and generation policies:

- **System 1:** structured decision workloads, such as classification, scoring and typed judgments. Define input/output schemas and eligible model capabilities; do not treat arbitrary generated text as calibrated probabilities.
- **System 2:** generation, reasoning and tool-calling workloads with their own eligible models and execution constraints.
- **Auto:** a unified entry point that applies an explicitly configured strategy to select the appropriate execution path and model. Its contract must define compatible outputs and escalation conditions. Typed decisions and generated chat responses must not be silently substituted for each other.

System 1 and System 2 are workload roles, not fixed model sizes or reasoning toggles. A decision model used internally to choose a generation model is distinct from a caller requesting a structured decision result. Auto does not require every request to invoke a classifier: caller-supplied task context and deterministic rules may suffice.

Policies define eligible models, protocol and tool requirements, latency/spending limits, selection rules, bounded fallback and escalation. Keep a stable invocation reference across versioned policy changes. Validate and preview before activation; support authorized rollback without rewriting historical execution evidence.

## Evidence and acceptance

Expose candidate exclusions, selected policy revision, execution path, selected model, bounded decision rationale and fallback history. Distinguish configuration preview from observed runtime execution. Record decision overhead, model latency, usage and customer charges separately. Customer-facing evidence must not expose procurement prices or platform margins.

Verify explicit paths and Auto, incompatible output contracts, missing capabilities, stale revisions, unavailable models, exhausted budgets, bounded retries and permission failures. Measure end-to-end cost and latency, including classification and retries; make no optimal-value or task-success guarantee. Associate external task-quality evaluations with execution evidence without treating routing confidence as task correctness.

## Boundary

This feature does not require a coding-agent plugin and must be usable through the supported API and management contracts. Host hooks are specified separately in [Coding-agent decision plugins](coding-agent-decision-plugins.md). No implementation or release scope is approved by recording this request.

## Foundation verification — 2026-11-04

For `niu-ycg8.1`, the shared predicate now checks declared vision/reasoning support and known token bounds before priority/weight selection. Thirteen configuration tests passed, including three new routing regressions covering missing capability declarations, token boundaries, and exclusion of an incompatible higher-priority candidate. The isolated PostgreSQL HTTP test `workspace_pool_api_enforces_delegation_scope_preview_and_revisions` passed with added vision, reasoning, completion-limit and combined-context preview cases. Formatting and whitespace checks passed.

These are local controlled tests, not live Provider capability, exact tokenization, latency, quality or deployed-release qualification. Request-trait extraction across protocols remains separately tracked as `niu-ycg8.5`; price strategies, semantic Auto and the System 1 API remain proposed. No UI changed and no paid requests were made.
