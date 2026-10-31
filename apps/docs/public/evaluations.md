# Task-specific evaluation evidence

Availability: 0.3.0 development candidate; release is held. Storage, HTTP, native-host local workflows and human review have been qualified
with synthetic fixtures; this does not establish live model quality or production
receiver behavior. Consult install.md for
package availability. This workflow does not configure the coding agent's own
model connection.

## Authority and budget

Inspect the key first. Reading definitions, fingerprinting inputs, binding an
inference request, discovery and comparisons require `evaluations:read`.
Saving definitions and run receipts requires `evaluations:write`. These grants do
not authorize a paid evaluation budget or additional models. Obtain the user's
task criteria, candidate set, maximum requests and spending authority before paid
trials. Niu records evidence; the agent owns task acceptance and model decisions.

## Prepare and execute

1. Use `fingerprint_evaluation_request` with the exact effective protocol request
   body. This does not invoke a model or save raw input. Fingerprint v1 excludes
   only top-level `model`, `stream`, `stream_options`, `metadata` and `user`, then
   hashes canonical JSON under the protocol. Sampling/tool/system parameters
   remain significant. Protocols have separate fingerprints.
2. Use `set_evaluation` with task, rubric, protocol, named sample references and
   their request hashes. Revision zero creates; otherwise provide the current
   expected revision. Read back the saved revision; reconcile conflicts.
3. Invoke the chosen model with `evaluation: "evaluation-slug@revision/sample"`
   in the MCP inference arguments or JavaScript request options. Direct HTTP uses
   `x-niu-evaluation`. A mismatched input is rejected before dispatch. The tag is
   not forwarded to the Provider. Supported bindings cover Chat, Responses,
   Messages, Embeddings and GenerateContent. Local qualification covers native-host
   loopback requests and priced Chat reservation/charge handling; it does not
   establish live Provider quality or priced execution across every protocol.
   Untagged requests remain usable but do not
   establish verified sample equivalence.
4. Preserve response attempt/operation references. After an uncertain response,
   call `list_evaluation_attempts` for the pinned revision and sample. Follow
   `next_after`. Discovery is a lexical snapshot: restart from the first page to
   find new admissions. Absence does not prove no execution; never automatically
   replay a potentially charged request.
5. Judge the output against the pinned rubric. Submit `record_evaluation_run`
   with a readable run slug, evaluator kind (`agent` or `check`), name, version,
   and sample/attempt/verdict/reason results. Verdicts are `accepted`, `rejected`
   or `unknown`. These are attributed submitter judgments, not Niu guarantees.
   Include rejected and unknown results; do not select only successful examples.

## Receipts and comparisons

Run recording does not perform inference. Same run slug and identical submission
returns the original immutable receipt; different input conflicts. Read it with
`get_evaluation_run`. A later refresh requires a new run slug; old charge and
performance snapshots do not change after reconciliation.

A receipt includes the original input binding and routing revisions available to
Niu, selected-attempt duration, every attempt in each submitted operation,
customer-charge coverage and pool selections. It does not establish hidden
Provider model weights or system prompts. Run size is bounded to 64 unique
samples/operations and at most 32 attempts per operation. Missing evidence fails
capture rather than silently truncating retry costs.

`compare_evaluation_runs` intersects verified sample references with identical
request hashes only when task, protocol and rubric agree. It reports evaluator
changes and shared underlying operations. A repeated judgment of one operation
is not independent model execution. Unverified or unmatched samples are excluded
from the matched summaries and counted explicitly. No universal winner is emitted.

Costs include unsuccessful/retry attempts in the submitted operations. Pending,
owner-funded and unavailable charges remain unknown. Money and workspace units
are distinct dimensions; upstream procurement costs are never substituted.
Cost per accepted sample requires complete charge coverage, at least one accepted
sample and one compatible charge dimension. It is a rational numerator and
accepted-count denominator, not a rounded universal value score. Duration refers
to the evaluated attempt, not total retry wall time.

## REST and SDK

The scoped REST family is `/v1/evaluations`: `GET` list,
`POST /fingerprint`, `GET|PUT /{slug}`, `GET /{slug}/attempts`,
`GET|POST /{slug}/runs`, `GET /{slug}/runs/{run}` and
`GET /{slug}/compare?left=baseline&right=candidate`. Read the generated OpenAPI
operation for request schemas and authority. Responses are no-store; mutation
responses do not imply task success. JavaScript exposes the corresponding
`listEvaluations`, `getEvaluation`, `setEvaluation`,
`fingerprintEvaluationRequest`, `listEvaluationAttempts`, `listEvaluationRuns`,
`recordEvaluationRun`, `getEvaluationRun` and `compareEvaluationRuns` methods.

## Notifications

A first successful run capture emits `evaluation.recorded` in the same database
transaction. Identical replay emits none. An authorized event subscription may
select this type; the payload contains only evaluation slug, definition revision
and immutable run slug, not judgment text, prompts, outputs or charges. Retrieve
the receipt using current `evaluations:read` authority. Event delivery and a
receiver's 2xx acknowledgement do not establish host wake, task success or
authority to run another paid evaluation. See events.md for signed delivery,
deduplication and reconciliation.
