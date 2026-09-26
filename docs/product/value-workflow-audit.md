# Product workflow audit: gateway-first cost optimization

This audit corrects a conflict between the first-release plan and the product
workflow established in prior design discussions. The [first-release matrix](../releases/first-release.md)
remains authoritative, with the amendments below.

## Root cause

The previous plan described a standalone metadata-import workflow as the first
delivery, called imported task investigation complete, and treated gateway
inference as a separate optional path. The console could therefore satisfy its
written requirements with a JSON importer and basic configuration tables while
failing the product's central job: route model calls through Niu, retain their
usage and cost evidence, and help the user make better decisions about complex
agent work. R09 also asked for management screens without requiring those
screens to complete a usable request-to-analysis journey. R20's narrow API smoke
was mistaken for proof that the console made that journey simple.

These were specification errors. The corrected product is gateway-first.

## Product workflow

1. An administrator connects a provider and publishes model aliases.
2. The user creates a project-scoped Niu API key.
3. A custom application or supported agent sends its model requests to Niu's
   OpenAI-compatible endpoint using that key.
4. The gateway automatically retains request metadata and the corresponding
   attempt, usage, latency, route, status, and settled cost. Request/response
   content stays out of the record by default.
5. The console analyzes those records without asking the user to export or
   upload logs.

Every supported LLM request in this workflow goes through Niu. An agent adapter
may configure a coding agent to use the Niu endpoint and attach a stable
`X-Niu-Task-ID` to all model calls from one task. It can also report local tool
actions, validation, and acceptance evidence, which a model gateway cannot
observe from request traffic alone. The adapter enriches gateway-owned call
records; it is not a second inference route and must not ask the user to upload
run JSON.

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

## Console acceptance rules

- The clean-install path connects a provider/model, creates a project key,
  configures a client or supported agent to use Niu, completes a request, and
  finds the automatically captured result in the console.
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
  keeps model calls on Niu, correlates their task ID, and reports local tool and
  outcome events. Do not imply these events already exist before an adapter
  implements them.
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

R17 and R20 should be reported as **partial** until their end-to-end console
acceptance evidence passes. A persistence smoke or imported-fixture browser
check is useful component evidence, not proof of a simple, valuable product
flow. The most important next acceptance test starts with a clean installation,
uses the console to connect a test provider and publish one alias, creates a
scoped key, sends a request through Niu, and verifies its automatically stored
usage, latency, and cost evidence in the console without any import step.
