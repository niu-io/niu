# Intelligent Routing

Feature request, 2026-11-04. Tracking: `niu-ycg8`. This describes proposed capabilities, not shipped behavior.

## Purpose

Let an authorized agent configure how Niu selects models for a workload, using explicit task requirements, capability constraints, customer prices and observed performance. The agent owns acceptance criteria and quality/cost decisions; Niu validates and executes the selected policy and exposes evidence.

## Deterministic foundation

The first increment extends existing rule matching and priority/weight selection rather than introducing a classifier. Both workspace and platform routing use the shared request-capability predicate before choosing a candidate. Required vision and reasoning need explicit catalog declarations; unknown optional support is not eligible. Supplied input/output token traits are checked against declared route bounds, completion limits and combined context capacity. These traits are estimates, not exact tokenization or proof of live upstream support. Unknown token bounds remain unknown and admission still applies.

Price-based selection and semantic Auto are now implemented as explicit workspace-policy strategies (below), and the structured System 1 decision endpoint is implemented as a separate explicit capability (below). This foundation does not implement general cross-model retries.

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

These are local controlled tests, not live Provider capability, exact tokenization, latency, quality or deployed-release qualification. At that checkpoint, request-trait extraction across protocols remained separately tracked as `niu-ycg8.5` (addressed in the 2026-11-06 record below); price strategies, semantic Auto and the System 1 API remained proposed then (addressed later in this document). No UI changed and no paid requests were made.

## Protocol trait normalization — 2026-11-06

For `niu-ycg8.5`, preview and dispatch now share one normalized `RequestTraits` value and one trait-to-requirements conversion in `apps/gateway/src/routing_traits.rs`. Dispatch extracts traits from each native request body; both routing previews accept the same normalized traits as explicit context. A protocol that cannot express a trait rejects the native request and the equivalent preview context with the same explicit error instead of silently dropping the trait.

| Protocol | Image input | Tool declarations | Structured output | Reasoning controls | Streaming | Input/output token bounds |
| --- | --- | --- | --- | --- | --- | --- |
| Chat Completions | Supported | Supported | Supported (`response_format` JSON modes) | Supported (`reasoning`, `reasoning_effort`, `include_reasoning`) | Supported | Supported (`max_completion_tokens`/`max_tokens`) |
| Responses | Unsupported by this adapter | Unsupported by this adapter | Unsupported by this adapter | Unsupported by this adapter | Supported | Supported (`max_output_tokens`) |
| Messages | Unsupported by this adapter | Supported (native client tools) | Unsupported by this adapter | Unsupported by this adapter | Supported | Supported (`max_tokens`) |
| GenerateContent | Unsupported by this adapter | Unsupported by this adapter | Unsupported by this adapter | Unsupported by this adapter | Unsupported (buffered action only) | Supported (`generationConfig.maxOutputTokens`) |
| Embeddings | Unsupported | Unsupported | Unsupported | Unsupported | Unsupported | Preview token bounds accepted; dispatch does not yet estimate embedding tokens. Dimensions/base64 supported |

Native extraction covers the same fields the adapters validate: Chat content parts and tool history; Responses `input` item content, `tools`, `text.format`, `reasoning`/`include` and `instructions`; Messages content blocks, `tools`, `thinking` and `output_config`; GenerateContent parts, `tools`, `generationConfig` response/thinking fields. Estimated input tokens remain a conservative character-based estimate (`ceil(chars / 4)`, minimum 1), not exact tokenization. Messages no longer uses the requested output bound as its input estimate, and GenerateContent now supplies both input and output bounds instead of routing with empty requirements.

Verification: five `routing_traits` unit tests cover the support matrix, native fixture extraction for supported and unsupported cases, preview/dispatch requirement equality, rejection-message parity and candidate-filter parity across fixture models. Three platform-preview tests cover protocol names, explicit rejection and native-normalization parity. The extended PostgreSQL `workspace_pool_api_enforces_delegation_scope_preview_and_revisions` test exercises HTTP preview/dispatch message parity for unsupported Responses tools, Messages images and GenerateContent tools, plus unsupported preview contexts. No upstream Provider call was made.

Remaining uncertainty: character-based estimates can under- or over-admit borderline requests; tool definitions and JSON schemas are not tokenized exactly; upstream models are not proven to honour declared traits; the Responses adapter still rejects non-string text input shapes after trait filtering; Codex routes do not use workspace pool selection; and preview context describes normalized traits rather than validating a complete native request envelope.

## Customer-price strategy — 2026-11-06

For `niu-ycg8.2`, a customer-owned workspace policy can explicitly select a
versioned `customer_price` strategy instead of the existing priority/weight
selection. The strategy is optional; omitted legacy configurations resolve to
version 1 `priority_weight` and keep their existing behavior.

```json
{
  "strategy": {
    "version": 1,
    "mode": "customer_price",
    "customer_price": {
      "currency": "USD",
      "unit": "nanounits_per_million_tokens",
      "input_tokens": 1000000,
      "output_tokens": 100000
    }
  }
}
```

The schema is closed: unknown fields and unsupported versions are rejected
instead of being ignored. `customer_price` is required exactly for
`customer_price` mode and forbidden for `priority_weight` mode. `currency` must
be an uppercase ISO-4217 code, `unit` must be
`nanounits_per_million_tokens`, `input_tokens` must be between 1 and 10,000,000,
and `output_tokens` must be between 0 and 10,000,000.

**Price source.** Only customer selling prices participate: the same workspace
prices returned by customer model discovery (`Store::customer_model_prices`),
including the currently selected workspace tariff, enrollment or promotion.
The strategy never reads Provider offers, procurement rates, cost entries,
margins or credentials. Owner-funded personal routes are excluded from customer
price comparison because they have no Niu customer selling price.

**Estimate.** The configured `input_tokens` and `output_tokens` are explicit
request-size assumptions, not measured usage. The estimate selects one
whole-request context tier using `input_tokens`, prices aggregate input at the
ordinary prompt rate and completion at the ordinary completion rate, rounds the
combined token amount up once, adds `request_fee_nanos`, and applies
`minimum_charge_nanos`. Cached-prompt and reasoning-completion discounts are not
assumed, so they cannot improve a candidate's rank. Amounts are integer
currency nanounits and are exposed in preview only as decimal strings.

**Ranking and tie-breaks.** Only candidates that already passed rule matching,
the requesting key's model grants, protocol support, declared capability and
token bounds, ownership and supply eligibility participate. Known comparable
estimates select the lowest charge; ties use higher priority, then higher
weight, then byte-wise alias order. The result is deterministic for a given
policy revision and price snapshot. The existing priority/weight selection is
preserved when the strategy is `priority_weight`.

**Unknown and incomparable prices.** A candidate with no customer price, a price
in another currency, a non-comparable unit, a malformed price, or a request
running under Credits billing remains explicitly unknown. Unknown candidates are
never assigned zero, are never ranked, and are never selected merely because
their price is missing. If at least one eligible candidate has a comparable
price, only those candidates are eligible to win the price ranking. If no
eligible candidate has a comparable price, selection falls back to the existing
priority/weight rules and preview reports
`selection_basis: "priority_weight_fallback"` with
`fallback_reason: "no_comparable_customer_price"`. A Credits installation
reports `billing_mode_not_comparable` because this version supports only fiat
`nanounits_per_million_tokens` selling prices.

**Preview/runtime agreement.** Workspace preview (`POST /v1/routing/preview`) and
runtime selection (`pool/<slug>`) call the same
`evaluate_customer_price_selection` function. Preview exposes the resolved
strategy, assumptions, per-candidate `estimated_customer_charge_nanos`,
`price_unknown_reason`, `selection_basis`, deterministic
`selected_candidate` (null for priority/weight fallback), and
`fallback_reason`. Preview never dispatches inference, probes a Provider,
reserves funds or proves live upstream access. Runtime loads the same customer
price surface at selection time; a price or promotion change between preview and
a later request can change the estimate, while admission still pins the concrete
tariff revision that actually bills the request. This strategy does not promise
optimal value, task success or an exact final charge.

**Exposed surfaces.** The workspace policy schema, preview evidence and
acceptance are reflected in the generated OpenAPI contracts, the JavaScript SDK
types, the MCP pool tools and the workspace Routing UI. Platform supply pools keep
their installation-owned priority/weight selection because they are not scoped to
a customer workspace's selling prices or key grants; this increment does not add
customer-price ranking there. Setting a pool remains a configuration operation;
it does not grant models, add balance, raise spending caps or enable price-aware
selection globally.

Verification: `cargo test -p niu-storage --lib routing_strategy` passed 11 tests
covering legacy defaulting/version validation, formula and context tiers, missing prices,
currency and unit mismatch, credits billing, deterministic ties, fallback and
non-conversion of currencies. `cargo test -p niu-gateway routing_prices` passed 4
tests covering the customer-price document shape, grant/cap pre-filtering,
unknown-price fallback and identical preview/runtime evaluation. The PostgreSQL
HTTP test `workspace_pool_customer_price_strategy_is_explicit_and_keeps_unknowns_unknown`
passed locally: it publishes customer tariffs, previews price selection and
fallback evidence, persists a versioned strategy, dispatches to local fixture
upstreams only, and verifies that model grants, declared completion caps and a
workspace spending cap are enforced after price-aware selection without an
upstream call for the denied attempt. The JavaScript SDK build and pool tests
passed, including strategy pass-through and unknown-price evidence; generated
contract checks and the MCP pool contract-schema test passed. The full MCP test
suite still has one unrelated pre-existing resource-count failure. Dashboard
typecheck, i18n new-copy audit, lint and production build passed, and the new
strategy draft unit tests passed. No paid request or external Provider call was
made.

Browser verification used the packaged local stack at `127.0.0.1:2566`: the
Routing create/edit dialog renders the single-choice strategy menu with the
selected check on the right, explicit currency and input/output assumption
fields, a strategy-aware policy summary and guidance, and a 390 px stacked
layout without overflow. The saved customer-price policy loaded correctly into
the edit dialog, and Escape closed the menu. The local stack had no published
supply model, so saving a new policy was verified through the PostgreSQL HTTP
test and SDK rather than through the UI.

Remaining uncertainty: the input/output assumptions are not measured token
counts and can mis-rank borderline requests; context-tier thresholds and
promotion selections are read from current customer data, so preview and a later
request may see different prices; Credits-denominated plans always fall back in
version 1; this increment does not compare latency, quality or procurement
margin; and the local tests do not establish a deployed release, live Provider
pricing or long-run traffic fairness.

## Semantic Auto strategy — 2026-11-06

For `niu-ycg8.3`, a customer-owned workspace policy may explicitly select a
version 2 `auto` strategy. Auto is optional and additive: omitted policies keep
version 1 `priority_weight`, and existing version 1 `customer_price` policies
keep their behavior and payload rules. A version 2 policy requires `auto`; it
cannot carry a customer-price payload. Unknown versions, modes or fields are
rejected rather than downgraded to another strategy.

```json
{
  "version": 2,
  "mode": "auto",
  "auto": {
    "paths": [
      {
        "id": "deep",
        "name": "Deep reasoning",
        "description": "Multi-step architecture and debugging work",
        "response_type": "text",
        "candidates": ["deep-model"],
        "task": ["architecture", "debugging"]
      },
      {
        "id": "quick",
        "name": "Quick answers",
        "response_type": "text",
        "candidates": ["fast"],
        "task": ["chat"]
      }
    ],
    "decider": {
      "model": "fast",
      "currency": "USD",
      "timeout_ms": 800,
      "max_calls": 1,
      "max_input_tokens": 1024,
      "max_output_tokens": 32,
      "max_spend_nanos": 5000000,
      "min_confidence": 0.6,
      "on_abstain": "fallback",
      "on_failure": "fallback"
    }
  }
}
```

**Paths and compatibility.** Each path declares a `response_type`
(`text`, `structured` or `embedding`) and references aliases declared by the
policy's top-level candidates. A path can never add a model, expand a caller's
grants or change the response contract. For each request, Auto derives the
required response type from the protocol and structured-output trait, then keeps
only paths with the same response type and at least one candidate that survived
rule matching, grants, protocol support, declared capability and token bounds.
Embeddings requests can only use `embedding` paths; structured-output requests
may only use `structured` paths. An unknown or incompatible decider result is a
failure, never a silent substitution.

Existing rule matching still runs first. A matching enabled rule narrows the
request's candidate set, and Auto paths can reference only top-level policy
aliases. A rule whose candidates are absent from every compatible path therefore
causes a deterministic priority/weight fallback; Auto does not bypass rules,
grants, protocol or capability filtering, or admission.

**Caller context first.** Callers may send an optional bounded JSON header on
inference requests:

```http
x-niu-routing-context: {"task":"architecture","stage":"implementation"}
```

Only `task` and `stage` are accepted; values are trimmed, lowercased and limited
to 64 characters of `a-z`, `0-9`, `.`, `_` and `-`. The body is limited to 512
bytes; repeated headers, unknown fields, empty objects and malformed values are
rejected before selection. The header is not forwarded upstream. A configured
decider receives only the validated context and declared path metadata, never
conversation content. The JavaScript SDK exposes the same bounded value as
`routingContext` on per-request options. When a compatible path declares a
matching `task`/`stage` keyword set, Auto selects the first such declared path
and makes **zero** model calls. Context cannot force a path that is not response-compatible or has no
eligible candidate.

**Optional decider and typed decision.** When context does not select a path and
a decider is configured, Niu invokes that concrete workspace Chat model once
with the caller's key. The decider must return only:

```json
{"path": "deep", "confidence": 0.82}
```

The document is closed: `path` must be a declared, request-compatible path id or
`null`; `confidence` must be a finite number in `[0, 1]`. Prose, code fences,
unknown fields, unknown path ids, incompatible response types and out-of-range
confidence values are decision failures. `null` path or confidence below
`min_confidence` is an abstention. Confidence is evidence about path selection,
not calibrated task quality.

**Bounds.** `max_calls` is fixed at one decision round per request. The gateway
constructs a bounded prompt from path metadata and caller context and rejects
the call before dispatch if a character-based estimate exceeds
`max_input_tokens`. `max_output_tokens` is passed to the model and rechecked
against reported or estimated completion tokens. `timeout_ms` bounds the call;
cancellation or a dropped request does not manufacture a result. The spend
ceiling is denominated by an explicit `currency`. A comparable customer selling
price in the supported `nanounits_per_million_tokens` unit is required to verify
the ceiling before calling; a missing, foreign-currency or non-comparable price
leaves the bound unverifiable, so no paid call is made. Reported usage can
exceed the estimate; a resulting charge above the ceiling is recorded as a
failure and the configured action applies. A decision call consumes ordinary
workspace grants, spending authority and billing, and its charge is separate
from the selected generation.

**Abstention, failure and fallback.** `on_abstain` and `on_failure` accept
`fallback` or `reject`. Fallback uses the existing deterministic priority/weight
selection over the request's eligible top-level candidates; it does not treat an
unknown decision as a preferred path. Reject returns
`routing_decision_rejected` before generation. Cancellation aborts the request.
Context selection is not a failure and never invokes the decider. Preview never
calls the decider and reports zero calls.

**Observable overhead.** Auto decision evidence records `outcome`
(`context_match`, `decider_selected`, `priority_weight_fallback`, `rejected` or
`cancelled`), selected path, `fallback_reason`, failure kind, `calls`,
`input_tokens`, `output_tokens`, `latency_ms`, whether token counts are
estimates, and the estimated customer decision charge when the price is
comparable. It is persisted with the immutable workspace selection and returned
by `GET /v1/routing/{slug}/selections`. Live responses also expose bounded
`x-niu-routing-decision`, `x-niu-routing-path`,
`x-niu-routing-decision-calls`, `x-niu-routing-decision-latency-ms`,
`x-niu-routing-decision-input-tokens`,
`x-niu-routing-decision-output-tokens`,
`x-niu-routing-decision-charge-nanos` and
`x-niu-routing-decision-reason` headers. Evidence contains no prompts, model
content, Provider identifiers, procurement prices or internal references. A
decision model call is an ordinary gateway inference operation with its own
operation/attempt records and customer billing; it does not inherit the outer
request's task-correlation header, and this increment does not add a separate
decision-operation label.

**Preview.** `POST /v1/routing/preview` accepts optional `task`/`stage` in the
request context. For Auto it reports the selected context path, or that runtime
would require the decider, fall back or reject, including compatible paths and
the configured decider bounds. It performs the same grant, comparable-price and
input-bound checks without calling the model. Preview is not proof of decider
availability at a later request time.

### Verification — 2026-11-06

Implementation is local and fixture-only; no paid model request or external
Provider call was made.

| Check | Result |
| --- | --- |
| `cargo test -p niu-storage --lib` | 61 passed, 5 ignored, 0 failed |
| `cargo test -p niu-storage --lib routing` | 20 passed (Auto schema, context, abstention, failure, incompatibility, cancellation input, evidence) |
| `cargo test -p niu-gateway routing_auto` | 7 passed (context bounds, response types, path compatibility, prompt privacy/bounds, strict decision document, timeout/cancel) |
| `cargo test -p niu-gateway` | 201 passed, 186 ignored, 0 failed |
| Auto PostgreSQL HTTP fixture | `workspace_pool_semantic_auto_is_explicit_bounded_and_falls_back` passed |
| Existing customer-price PostgreSQL HTTP fixture | passed unchanged |
| `cargo fmt --all -- --check` | clean |
| Gateway Clippy (`--all-targets`, `-D warnings`) | clean |
| Storage library and pool-test Clippy | clean |
| Handler OpenAPI generation + entrypoints | 423 operations and 343 paths current |
| `pnpm check:api` | current |
| Docs `check` | 0 errors, 0 warnings |
| JavaScript SDK `build` and tests | 231 passed, including Auto strategy/context pass-through |
| MCP build and tests | 24 of 25 passed; the remaining pre-existing suite fixture expects 50 tools while the unmodified snapshot registers 51 |
| Dashboard `check`, `build`, and new-copy i18n audit | passed; strategy draft unit tests 4 passed |

The PostgreSQL fixture covers preview context selection (zero calls), decider
required with only response-compatible paths, embedding-path exclusion,
malformed context rejection, save/read-back of the version 2 strategy,
context-only runtime selection, decider-selected runtime selection with the
exact prompt/wire evidence, persisted selection evidence, abstention,
incompatible path, malformed document, transport failure, timeout, input,
spend and output bounds, reject-before-dispatch policy, ungranted decider model
and exhausted workspace spending cap. It asserts the decider prompt never
contains conversation content or candidate aliases. Fixture upstreams only; no
production credential or external endpoint was used.

Full workspace Clippy with `-D warnings` remains blocked by pre-existing lints
in unmodified files (`payment_verification.rs`,
`request_finish_reasons.rs`, `agent_authorizations.rs`). Storage and gateway
targets containing this change pass Clippy with the two pre-existing lints in
unmodified storage files allowed. The dashboard was not browser-verified in this
checkpoint because no Niu stack was running; the UI change is limited to
preserving and summarizing an existing Auto policy, and its static checks and
unit test passed.

Remaining uncertainty: the decider receives only validated caller task/stage
context and declared path metadata, never conversation content, so semantic
selection quality under real workloads is unmeasured and may be weak; prompt
token accounting is a character estimate, not exact tokenization; a reported or
estimated actual decision charge can exceed the configured ceiling after the one
call, which is recorded as a failure but cannot undo the spend; timeout or
request-drop cancellation may leave an in-flight admission reservation or
upstream charge unresolved, recorded as unknown tokens/charge; guardrail
detector costs and latency during the nested decision call are not part of the
decision charge evidence; Credits-denominated workspaces cannot verify the
customer-price spend ceiling, so the decider is not called and Auto falls back;
the dashboard does not author Auto paths (agents use the API/SDK); preview
cannot predict the decider's actual future choice; and no live Provider,
tokenizer, deployed-release or long-run fairness qualification is claimed.


## Structured System 1 decisions — 2026-11-06

For `niu-ycg8.4`, System 1 is an independently invocable capability, not a
generation mode and not the routing-internal classifier. A caller invokes
`POST /v1/decisions` with one concrete workspace model, bounded input and a
closed output schema. The endpoint validates the returned document and returns
one typed decision or an explicit abstention. It never returns generated chat
text, and Auto never uses it to manufacture a path selection.

```json
{
  "model": "fast",
  "input": {"message": "The invoice total is wrong"},
  "output_schema": {
    "type": "object",
    "properties": {
      "label": {
        "type": "string",
        "enum": ["billing", "technical"],
        "description": "The primary support category"
      },
      "urgent": {"type": "boolean"}
    },
    "required": ["label"],
    "additionalProperties": false
  },
  "timeout_ms": 800,
  "max_output_tokens": 32
}
```

A successful response carries the validated value and bounded evidence:

```json
{
  "decision": {"label": "billing"},
  "evidence": {
    "outcome": "decided",
    "model": "fast",
    "calls": 1,
    "input_tokens": 123,
    "output_tokens": 8,
    "tokens_estimated": false,
    "latency_ms": 240,
    "timeout_ms": 800,
    "max_output_tokens": 32
  }
}
```

**Typed contract.** `input` is a UTF-8 string or JSON object, at most 16 KiB
serialized. `output_schema` is a closed object with 1-16 flat properties and a
non-empty `required` list; `additionalProperties` must be false. A property is
`string` (optional `enum`), `boolean`, `integer` or `number` (optional finite
`minimum`/`maximum`). Nested objects, arrays, nulls, references, patterns,
conditional keywords, unknown schema keywords and the reserved `abstain`
property are rejected. The schema is at most 8 KiB serialized; descriptions are
single-line and at most 200 characters; string enums have 1-32 unique values of
at most 64 characters; an unconstrained string result is at most 1024
characters. Niu validates every returned property itself and does not rely on
upstream JSON-schema enforcement. Extra fields, missing required fields, wrong
types, out-of-enum values, out-of-range numbers and prose/code-fence output are
rejections, not partial decisions.

**Abstention.** Exactly `{"abstain":true}` is an explicit model abstention and is
returned as `"decision": null` with `outcome: "abstained"`. It is a successful,
observable decision outcome. `{"abstain":false}`, a mix of abstention and
decision fields, an empty document or a missing document is invalid; it is never
promoted to a preferred label.

**Qualification.** The model must be a visible workspace Chat route with an
OpenAI-compatible protocol and an explicit declared
`supports_structured_output` capability, and it must be granted to the invoking
key. The declaration is an operator assertion, not live conformance evidence.
`pool/…` and `codex/…` aliases are rejected before any call, so workspace pool
routing and Auto cannot substitute a generated response or choose a different
response type for a decision. A missing declaration returns
`decision_not_qualified`; an ungranted or invisible model returns the ordinary
not-found result without revealing it.

**Authorization and billing.** The invocation uses a workspace API key with
invocation authority. The nested call runs through the ordinary inference
pipeline, so key grants, IP/rate/concurrency/token limits, workspace spending
caps, admission, guardrails and customer billing apply exactly once. Upstream
transport retry is disabled: one decision request is one configured model
attempt. The nested attempt keeps its ordinary operation/attempt record and
customer charges; its response headers are copied to the decision response as
`x-niu-operation-id` and `x-niu-attempt-id`. This version has no separate
per-request decision spend ceiling; the key and workspace limits are the
authorization boundary.

**Bounds.** `timeout_ms` is 50-5000 (default 2000). `max_output_tokens` is
1-1024 (default 128). The constructed prompt is checked with a conservative
character estimate against 8192 tokens before dispatch; this is not exact
tokenization. Reported or estimated completion tokens above the requested bound
are rejected. Raw model content is limited to 16 KiB. A timeout does not
manufacture a decision.

**Rejection and evidence.** Invalid or missing output returns
`decision_invalid_output` (502); an over-bound completion returns
`decision_output_bound_exceeded` (502); a timeout returns `decision_timeout`
(504); an attempt cancelled before validation returns `decision_cancelled`
(503), while a disconnected client simply drops the request and cannot receive
a response. There is no fallback to a different response type. A failed decision may already have
incurred customer charges. Responses expose `x-niu-decision-outcome`,
`x-niu-decision-failure` when applicable, `x-niu-decision-calls`,
`x-niu-decision-latency-ms`, token counts, whether counts are estimates, and
`Cache-Control: no-store`. The standard error envelope and `x-niu-error-code`
remain authoritative for the rejection. Evidence contains no prompt, model
content beyond the accepted decision, Provider alias, credential, procurement
price, margin or internal prompt metadata. The nested call sends
`x-niu-log-payloads: false`, so the internal prompt and decision input are not
retained as ordinary Logs payloads; the inference attempt, usage and billing
records remain. Token counts are reported values when available and
character-based estimates otherwise, never evidence of exact tokenization or
settled charges.

**Separation from Auto.** Auto path compatibility still requires the path's
declared `response_type` to equal the request's required text, structured or
embedding type; an unknown or incompatible decider path is a failure and the
configured `on_failure`/`on_abstain` action applies. A System 1 decision
document is not a valid Auto path decision (unknown fields are rejected), and an
Auto path decision is not a valid System 1 output against a decision schema.
Auto decision prompts also opt out of ordinary payload capture. The System 1
endpoint requires a concrete model, so a request cannot enter a text/structured
Auto path and receive a substituted response.

### Verification — 2026-11-06

Implementation is local and fixture-only; no paid model request or external
Provider call was made.

| Check | Result |
| --- | --- |
| `cargo test -p niu-gateway decisions` | 11 passed (closed request/schema, valid output, malformed/incompatible/missing output, abstention, bounds, qualification, cancellation/timeout separation) |
| `cargo test -p niu-gateway routing_auto` | 9 passed (including decision-vs-Auto document separation and payload-capture opt-out) |
| Isolated PostgreSQL decision fixtures | 7 passed: valid decision and no captured payload; malformed/incompatible output and generation-field rejection; ungranted model and bounds without dispatch; structured-output qualification; nested upstream error preservation; timeout; workspace spending cap |
| `pnpm check:api` | current, 424 handler annotations and 530 generated REST operations |
| JavaScript SDK `build` and tests | 235 passed (including decision request/abstention/error coverage) |

The fixture upstreams are local HTTP servers. The valid case asserts the
forwarded request contains no internal Provider alias, credential, procurement
or margin text, and that no `request_payloads` row is retained for the nested
attempt. The spending-cap case asserts no upstream request occurs. The timeout
case uses a delayed local fixture; it does not prove upstream cancellation.

Remaining uncertainty: the model's declared structured-output capability is an
operator assertion, not a live Provider conformance test, so decision quality,
format reliability and any numeric meaning are unmeasured; Niu does not
calibrate probabilities and callers own the semantics of number/string fields;
prompt accounting is a character estimate, not exact tokenization; the flat,
bounded schema intentionally cannot express nested or array judgments; malformed
output may be more frequent because Niu validates after the call rather than
relying on upstream schema enforcement; a timeout or dropped request may leave
an in-flight Provider charge unresolved, and evidence cannot recover or refund
it; guardrail detector cost/latency during the nested call is part of ordinary
inference accounting, not a separate decision charge category; there is no
per-request decision spend ceiling, automatic retry, batch mode, streaming,
idempotency or MCP/UI authoring surface in this increment; duplicate JSON object
keys in a caller request are handled by the ordinary JSON parser rather than
rejected; and no live Provider, tokenizer, deployed-release or long-run
fairness qualification is claimed.
