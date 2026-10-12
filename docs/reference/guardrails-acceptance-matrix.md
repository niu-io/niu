# Guardrails acceptance matrix

Reviewed 2026-10-12. This records S04-3, with current native implementation
`1212ea3b68f934c22fff6c62696475d2f628fc6a` and retained executable SHA-256
`f299e3c484bb1a724fe5e4e9e581d45ef552cf1da496a65ff5dd7fae5868e553`.
S04-3 remains open: configured external processing and its failure paths are not
accepted by this checkpoint. Fixture outcomes provide no evidence.

## Supported scope and evidence

| Surface | Implemented behavior | Actual evidence and boundary |
| --- | --- | --- |
| Local Chat input | Inspect supported text; block matching patterns; refuse unsupported input | Current HTTP refused matching text and image-containing input with 403 `guardrail_denied`, before dispatch. Unsupported content is not a successful inspection. |
| Local Responses input | Inspect supported text | Current HTTP refused matching text with 403 before dispatch. This run does not qualify every Responses input shape. |
| Local embeddings input | Inspect supported textual input | Current HTTP refused a matching string array with 403 before dispatch. No embedding was purchased. |
| Messages, GenerateContent and video input | Separate local extraction paths exist | Not exercised by this current matrix. Protocol implementation alone is not evidence of complete enforcement. |
| Buffered Chat output | Inspect supported completed text; withhold a block; redact a match | Reopened historical real Chat records establish a block with reported usage and an exact charge/debit, and a separately exercised redacted delivered response. Historical binary pins are absent; these are not a new pinned-current generation. |
| Buffered Responses output | Inspect supported completed textual envelopes | Reopened historical real Responses records establish delivered redaction and exact reported-usage accounting. Broader output/envelope coverage remains unverified here. |
| Observe-only Chat/Responses output | Record a match without altering delivery | Reopened historical real responses retain their requested marker, match observations and exact individual charges/debits. Observation does not enforce a block or redaction. |
| Required output with unsupported protocol/mode/content | Fail closed rather than claim inspection | See [preparation and output refusals](guardrail-preparation-errors.md). This checkpoint does not qualify every streaming or native-protocol combination. |
| External text/image inspection | Require configured processing declarations, current consent and workspace authorization | Current HTTP refuses an unconfigured text binding and an unconsented installation preview. No configured service, real external inspection or image approval was fabricated. Successful transport, timeout, stale fingerprint, response mismatch and service-failure behavior remain unverified in this matrix. |

[Mandatory workspace/key access composition](parallel-core-backend-acceptance.md)
and the separate S04-2 acceptance cover key controls. This checkpoint does not
replace those results or expand them into content inspection.

## Current local workflow

A stopped copy of a database containing actual personal OpenRouter completions
was started with the retained current executable. A new workspace and scoped key
received a local text-block policy through the real management API. Chat,
Responses and embeddings requests containing the fresh pattern each returned a
safe refusal. An image-containing Chat request also refused unsupported input.
Independent reopening found the corresponding preparation decisions, the checked
policy revisions and no extra upstream attempt or financial entry.

The current source and final database fingerprints matched for all original
attempts, charges, ledger entries, funding receipts, reservations, expenses and
Supplier earnings. This is preservation of actual records, not an empty-page or
fixture claim. The temporary key and reader were revoked and isolated processes
stopped. Personal OpenRouter testing and internal approved credit do not establish
commercial supply or paid merchant funding.

## Preview, revisions and rollback

Actual policy preview reported model/Provider access without claiming route
availability or saving a policy. Local input preview returned a synthetic blocked
result for each exercised protocol. Output preview used a retained, independently
verified actual upstream response: block, redact and observe-only previews returned
their distinct outcomes. These calls verify preview contracts only; they are not
new output enforcement or upstream execution. Input/output previews returned
`Cache-Control: no-store` and `enforcement: false`.

Activation created revision 1. A stale expected revision returned 409. A changed
policy created revision 2; rollback to revision 1 created revision 3 with the
original policy, preserving immutable history. An invalid future rollback target
returned 400. Gateway restart preserved the restored policy and its actual input
refusal. An invalid local regular expression returned 400 before activation.

A scoped reader could read but not change the policy. An inference key could not
read management policy, and a scoped reader could not use installation-only
external detector discovery. Unconfigured external policy activation returned
400; missing external processing consent returned 400; an unknown configured-name
lookup/consented preview returned 404. These refusals do not exercise a configured
external detector.

## Failure behavior

An independently observed exclusive lock on the policy table remained held while
a current inference request returned a safe 503 within the transaction-local
lock bound. No request bypassed the policy, dispatched or charged. After the
locking PostgreSQL session was explicitly terminated and lock release confirmed,
the same input again returned its ordinary 403 refusal. Restart preserved it.
This covers the exercised database read failure; it does not qualify every pool,
worker saturation or diagnostic-write failure.

A pre-dispatch refusal is distinct from post-dispatch output withholding. Real
output generation can still be charged when its delivery is blocked. Preserve
known usage, uncertainty and reservations; do not automatically retry withheld or
possibly executed work. See [output accounting](guardrail-preparation-errors.md#post-dispatch-output-withholding).

## Historical output provenance and remaining work

Independent readers reopened the original stopped databases, inspected retained
complete delivered responses, matched their actual reported usage and immutable
local tariffs, recalculated debits, and checked saved output decisions/observations
and released reservations. These are real personal-upstream records, not a
substituted transport or fixture response. Their evidence documents do not retain
a trustworthy executable commit/hash pair, so this page does not assign an
inferred binary pin to them. The current output-preview response has separate
verified provenance from pinned implementation `3fdc669c`; replaying it into a
preview is still not a new model call.

The current matrix's Guardrails handler, local inspection and policy storage
sources were unchanged between its `1212ea3b` implementation and the reviewed
`dde36895` documentation head. This source comparison is static continuity, not
proof that every historical output artifact ran that code.

Remaining acceptance is explicit: configured external consent/inspection/failure
paths; protocol/mode coverage outside the exercised matrix; and a retained binary
pin for any newly qualified output enforcement. Do not declare complete F09 or
S04-3 acceptance from this partial matrix. Deployment may leave an external
integration disabled; enabling one must not imply its unverified guarantees.
