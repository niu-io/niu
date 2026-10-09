# Product workflow audit: gateway-first cost optimization

Status: historical workflow audit, superseded on 2026-09-29 by [product focus](product-focus.md) and the [current release matrix](../releases/first-release.md). Task-economics requirements below are no longer Niu release obligations. Gateway evidence and accounting cautions remain useful, but this audit does not amend the current scope. R-row references refer to the [legacy release plan](../releases/first-release-legacy.md).

## Root cause

The previous plan described a standalone metadata-import workflow as the first
delivery, called imported task investigation complete, and treated gateway
inference as a separate optional path. The dashboard could therefore satisfy its
written requirements with a JSON importer and basic configuration tables while
failing the product's central job: route model calls through Niu, retain their
usage and cost evidence, and help the user make better decisions about complex
agent work. R09 also asked for management screens without requiring those
screens to complete a usable request-to-analysis journey. R20's narrow API smoke
was mistaken for proof that the dashboard made that journey simple.

These were specification errors. The corrected product is gateway-first.

## Current delivery order

Finish the platform workflow before building coding-agent connectors: provider
and model setup, a project-scoped key, Playground comparisons, a real client
request through Niu, and automatically visible request activity with useful
history. Keep the interface direct; short labels, defaults, and clear next
actions should explain routine steps. Agent routing, subscription-preserving
routes, external collection, and task-level economics remain later phases.

## Product workflow

1. An administrator connects a provider and publishes model aliases.
2. The user creates a project-scoped Niu API key.
3. A custom application sends its model requests to Niu's endpoint using that
   key. Coding-agent routing and collection are deferred until the platform
   workflow passes its release gate.
4. The gateway automatically retains request metadata and the corresponding
   attempt, usage, latency, route, status, and settled cost. Request/response
   content stays out of the record by default.
5. The dashboard analyzes those records without asking the user to export or
   upload logs.

## Reference product review and decisions

Reviewed the official LiteLLM Admin UI, OpenRouter quickstart, and OpenRouter
Activity materials on 2026-09-27.

- LiteLLM's setup flow connects a provider, selects a model, tests the
  connection, then issues a virtual key and sends a Playground request. Niu
  should keep this order: test the provider/model route, publish its alias,
  create a project-scoped key, and then show the client setup. See the
  [LiteLLM Admin UI quickstart](https://docs.litellm.ai/docs/proxy/docker_quick_start).
- OpenRouter starts client setup with an API key, base URL, and model slug, and
  its quickstart supports standard SDKs. Niu should show a copyable gateway
  base URL, selected alias, and working client example alongside the scoped
  key. See the [OpenRouter quickstart](https://openrouter.ai/docs/quickstart).
- OpenRouter Activity connects overview and trend metrics to grouped usage and
  individual request logs. Niu should make request history filterable, show
  totals for the loaded date range, and let users open the requests behind a
  usage or latency change. See [OpenRouter Activity](https://openrouter.ai/blog/announcements/activity-dashboard/).
- Taken together, the quickstarts demonstrate sending a request to a selected
  model. Niu adopts their direct prompt and model controls but makes a shared
  prompt across two to four model aliases its primary Playground action. Show
  each response, time, tokens, request count, and known or unknown cost
  together. Task benchmarks require matched inputs and acceptance evidence; a
  response alone cannot establish task quality or savings.

Gateway-routed requests remain the default source for Niu request activity.
Future route mode may configure a supported agent to use the Niu endpoint and
attach a stable `X-Niu-Task-ID` where the agent allows it. If subscription
authentication must remain in the provider header, a verified connector can
use a separate project credential that Niu strips before forwarding. No such
coding-agent route is part of the current platform release.

Future collect mode leaves the agent's provider connection and authentication
untouched. It sends documented telemetry or explicitly selected local activity
to Niu off the agent's request path. Such records remain labeled as
agent-reported, with source and coverage; they are not gateway requests. An
agent adapter can add tool actions, validation, and acceptance evidence, which
a model gateway cannot observe from request traffic alone. Neither mode should
ask the user to upload a run JSON file as the normal setup path.

Provider-side quota, invoice, or subscription-capacity data is a separate
collection problem. A supported provider connector may collect that evidence
and link it to gateway attempts where the provider exposes a reliable identity.
Such collection supplements the automatic request ledger. A versioned manual
import endpoint may remain for migration, tests, and unsupported external
sources, but it is not a normal setup step or the primary Tasks experience.

## What the product must help decide

The unit of value is an accepted complex task, not an isolated token price. A
task may include multiple iterations, model calls, tool actions, retries,
parallel work, and validation. The user needs to see which work accumulated,
how much time elapsed, what evidence is missing, and what cash/API-equivalent
cost is known. A model strategy only saves money if it meets the same acceptance
and quality bar; a lower-priced call that causes more retries can cost more per
accepted task.

The interface must distinguish:

- **Task**: the requested piece of work.
- **Model step**: a request routed through Niu and captured automatically.
- **Agent/tool step**: local work added by an agent adapter; unknown until
  instrumented.
- **Attempt/iteration**: one pass at completing the task, including retries or
  revisions when the adapter can identify them.
- **Outcome**: agent claim, deterministic validation, or human acceptance,
  each shown with its source.
- **Cost**: settled gateway charges, API-equivalent charges, subscription cash,
  and provider quota remain separate. Unknown values remain unknown.

Do not infer task boundaries, elapsed task time, tool work, or acceptance from
gateway request traffic alone. When a task ID or agent event is absent, show
captured model requests as ungrouped activity and say what evidence is missing.

## Dashboard acceptance rules

- The clean-install path connects a provider/model, creates a project key,
  configures a client or supported agent to use Niu, completes a request, and
  finds the automatically captured result in the dashboard.
- The user gets the Niu base URL, the project-key purpose, a usable model alias,
  and the exact next action in the relevant screen. The installation admin
  credential is never presented as an application key.
- Tasks and Usage & cost read from gateway-owned records by default. They do not
  open on a JSON editor or tell the user to import a run.
- Model management helps select and route useful models; it is not just a CRUD
  table of aliases. Every screen connects configuration to a concrete next
  action or decision.
- If the gateway cannot serve requests, block inference-dependent actions with
  a recovery message. Do not make a healthy gateway look like a disconnected
  external service that users should disconnect from.
- A coding-agent adapter is a first-party setup and instrumentation path. It
  offers an explicit gateway-routing mode and a separate external-activity
  collection mode when those capabilities are supported. It reports local tool
  and outcome events when observable and labels each source. Do not imply these
  events already exist before a connector implements them.
- Keep import/collector administration available only as an explicitly
  secondary path for supplemental provider evidence or migration.

## Matrix corrections

- **R09** must require a complete provider-to-request-to-automatic-analysis
  workflow and decision-oriented model, task, benchmark, and cost screens; CRUD
  completeness alone is not acceptance.
- **R16** covers supplemental provider quota/capacity/invoice collection. It
  must not make users collect or upload their own gateway request logs.
- **R17** combines gateway-native model request records with agent-adapter
  task/tool/outcome events. Imported fixtures validate the schema but do not
  complete the product workflow.
- **R19** evaluates matched task outcomes using gateway records and adapter
  evidence; synthetic fixtures validate evaluator behavior but cannot prove
  savings.
- **R20** is the first-use request path and automatic visibility check. It does
  not require a task ID, agent adapter, benchmark, pricing table, budget, or
  metadata import.

R20's clean-install gateway path has now passed end-to-end against a local
OpenAI-compatible provider fixture. Starting with no configured providers or
models, the dashboard created the provider route, model alias, first workspace,
project, and scoped key; a standard request returned provider usage and appeared
automatically in Tasks with its task ID, latency, copyable Niu base URL, and
model alias. No execution import was used. Pricing was unset, so cost remained
explicitly unknown, and the validation key was revoked after the request. This
is functional local-fixture evidence, not live upstream qualification. R09
remains partial for its broader dashboard and operational requirements. R17 also
remains partial pending broader adapter runtime and causal-link coverage plus
matched-task cost/quality analysis.
