# System Duo routing reference for Niu for Agents

Reviewed 2026-11-04. Reference: [System Duo](https://app.vllm-sr.ai/).
Review record: `niu-ucn5`. This is a proposed design direction, not an approved
implementation plan or a change to the paused release.

## Evidence and limits

The hosted product and the broader open-source Semantic Router have different
scopes. System Duo presents a small public entry experience; the project also
publishes a richer management/control plane. Do not attribute every project
capability to the hosted application.

The hosted homepage offers a stable routed model alias and presents a sequence
from request through signals, decision, model/effort and response. Its separate
System One API exposes typed decisions. These are complementary paths, not proof
that every Niu request needs a new classification call. See the [homepage](https://app.vllm-sr.ai/).

The [hosted API reference](https://app.vllm-sr.ai/docs#routing-headers) documents
selected-model, selected-decision and routing-latency response headers. An opt-in
debug mode adds matched signals, reasoning selection, algorithm and ranking.
This is an inspectable execution contract; it does not independently establish
quality, savings, probability calibration or latency under Niu workloads.
The [public inventory](https://app.vllm-sr.ai/pt/api/info) was readable and reported
one routed alias backed by a bounded set of models. No key was created, terms
accepted, plugin installed or inference invoked. Direct browser navigation failed
with a connection error, so no rendered interaction or live demonstration was
verified. Findings rely on retrieved official page content and contracts.

The open-source [system overview](https://vllm-sr.ai/docs/overview/semantic-router-overview/)
separates policy selection from ingress and replica selection. Its
[management API](https://vllm-sr.ai/docs/api/apiserver/) exposes policy validation,
planning, routing previews and operational evidence directly to agents. Those
project contracts are relevant references, not confirmed Niu capabilities.

## Independent task and ownership model

The task is to give an application or agent a stable model interface whose
execution follows an explicit policy and whose outcomes can improve that policy.
Humans specify objectives, limits and authority. Coding agents interpret the task,
select and evaluate policies, and propose authorized revisions. Niu validates and
executes those policies and retains evidence. Runtime selection delegated by an
agent is consistent with that boundary; autonomous global optimization or task
success guarantees would exceed it.

| User task | Actor and scope | Proposed primary home | Current Niu foundation | Direction |
| --- | --- | --- | --- | --- |
| Invoke a workload without hardcoding a physical model | Application/agent; workspace access | Stable routed model endpoint | Stable routed invocation and candidate model authorization (legacy API alias: `pool/<slug>`) | Retain; make the workload policy legible alongside the endpoint. |
| Define eligible models and execution constraints | Authorized agent; versioned workspace policy | Routing policy | Routing rules, declared capabilities, priority/weight candidates | Combine these into the main routing journey; preserve platform supply ownership separately. |
| Understand a proposed request's path | Agent or reviewing human; same policy authority | Preview/trace within the policy | Routing preview and exclusion evidence (legacy MCP identifier: `preview_pool`) | Retain; distinguish static preview from authorized probes and observed runtime evidence. |
| Understand an actual selection | Agent and human reviewer; scoped execution | Route-linked execution detail | Routing selections and operation/attempt references | Develop a clear selection explanation, policy version and separate routing/model timing. |
| Improve quality, cost and latency | Agent with task acceptance criteria; bounded evaluation | Policy evaluation and comparison | Evaluation/event contracts and execution records | Relate evidence to policy revisions; keep outcome judgment outside transport success. |
| Connect and maintain model supply | Installation/Provider administrator | Provider management | Provider adapters and supply configuration | Keep as supporting infrastructure with its own authorization and commercial confidentiality. |

This grouping is a proposal derived from the user task. It is not a new menu
specification. Existing supply, payment and settlement contracts keep their scopes.

Niu product terminology is **Routing**. References to `pool` in existing API aliases, MCP identifiers or file paths are compatibility names, not a separate product concept.

## Proposed routing-centered experience

A person provides a workload, examples, acceptable results and spending/latency
constraints. The coding agent discovers usable models and existing evidence,
prepares a policy, previews representative inputs, and runs only authorized
bounded trials. Human review shows the proposed change and evidence. Activation
records a revision; later observations and outcomes support comparison and
rollback. The stable invocation endpoint survives changes behind the policy.

The main demonstration should explain one routed request end to end:

`Request → eligible candidates and exclusions → policy match → selected model and effort → response → measured outcome`

Provider setup, model inventory, policy composition, evaluation and execution
inspection serve that journey. A model list alone cannot explain when a route
will be selected or whether it helps the workload.

The existing workspace routing contract is a useful foundation, not evidence of a
shipped semantic classifier. Current MCP tools expose revision-aware routing reads,
preview, writes, history and selections. The current agent routing guide describes
request traits, capability filters and priority/weight selection. Automatic
semantic signals, effort adaptation, learned policies and quality-based escalation
need separately designed contracts and verification before being advertised.

## Two decision loops

The outer loop belongs to the agent: task outcomes and measurements inform a
proposed policy change, followed by validation, authorization and activation.
The inner loop belongs to Niu: execute the active policy for an individual call,
record the selection and return its outcome. The outer loop may change the inner
loop's rules; a classifier's suggestion must not silently rewrite policy or expand
access or spending.

Agents often already know the task stage, required capabilities and constraints.
Niu should accept trustworthy, scoped request context where supported rather than
requiring every call to pay for rediscovering that information. Semantic routing
can be an explicit strategy with its own timeout, cost, provenance and failure
behavior. An integration with a qualified external router is an option; this
reference does not imply that Niu must train or host its own decision model.

Routing execution should account for model eligibility, protocol and tool
compatibility, context limits, session continuity and explicit effort support.
Unknown effort support must not be silently treated as equivalent behavior.
Fallback and escalation need attempt limits and uncertain-outcome recovery;
changing models must not erase an executed or possibly billed attempt.

Evaluate end-to-end economics: decision-model expense, routing overhead, retries,
verification and cost per acceptable outcome. Classifier confidence is evidence
about classification, not a task-quality score. Preserve the workload, baseline,
quote provenance, policy revision and measured coverage when comparing results.

## Design judgment

The reference gives a strong basis for elevating routing to Niu's primary product
journey. Stable invocation, previewable policy, inspectable selection and measured
feedback connect the agent-friendly, economic and performance goals. The core
principle remains that Niu executes authorized decisions and exposes evidence;
the agent and user own the objective and its acceptance rule.

This follows the task-based grouping and recognizable feedback criteria in
[NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).
No visual quality or full interaction conformance is asserted without rendered
browser evidence. No runtime, product navigation, Landing copy or release state
was changed by this review.
