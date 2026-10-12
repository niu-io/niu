# Inference failure acceptance

This records fixed S03-3 progress for actual timeout, cancellation, uncertainty and bounded fallback. Current pinned evidence covers the supported OpenRouter Responses authentication-rejection fallback. It does not turn a narrow retry policy into arbitrary Provider/status failover or declare every supported protocol's current failure path verified.

## Current-input run

Gateway `1212ea3b68f934c22fff6c62696475d2f628fc6a`, PostgreSQL schema 283 and a stopped native database copy exercise two bounded personal OpenRouter generations. The copy reuses existing approved verification credit and saved internal tariff rates; no cash funding, merchant success or commercial Supplier qualification is created. The original database, configuration, prices and encryption identity remain unchanged.

A three-candidate private verification pool uses an intentionally invalid first credential and two separately saved configurations of the existing personal credential. These are distinct local configurations, not independent upstream accounts. Each generation requests at most 32 output tokens. The invalid credential's real OpenRouter 401 is the only refusal that authorizes the narrow fallback.

| Actual input | Observed outcome | Durable financial state |
| --- | --- | --- |
| Close the streaming client after an actual `response.output_text.delta` | First candidate: real 401, `confirmed_not_executed`; second candidate: `may_have_executed`, unknown usage, `response_stream_cancelled` | First hold released; second retains exactly 284,445 customer-charge nanounits; no guessed debit |
| Configure a one-second request deadline and issue a small buffered Responses request | First candidate: real 401, `confirmed_not_executed`; second candidate: actual timeout, `may_have_executed`, unknown usage, `upstream_timeout`; client receives HTTP 502 | First hold released; second retains exactly 284,445 nanounits; no guessed debit |

Outcomes are observed, not assumed from the injected client behavior or configured timeout. There are four native attempts: two authentication refusals and two actual successor generations. The third candidate has zero dispatches. No uncertain attempt is replayed.

## Independent native checks

Reopened source/final databases and saved raw artifacts verify:

- Exactly two attempts per operation, ordinals one and two, with the second pointing to the rejected first attempt. The immutable policy is `openrouter-responses-auth-rejection-v1`, with maximum attempts two.
- Original public pool identity/revision, selected private aliases and credential identities agree with native route bindings. Both attempts in each operation retain one frozen customer tariff revision.
- Native reservation bounds are 2048 input and 32 output tokens. Independently applying the frozen customer rates and fee/minimum fields gives each retained hold of 284,445 nanounits; account and currency bindings agree.
- Both uncertain attempts retain null aggregate quantities, no customer charge or debit, and an open bounded hold. Confirmed authentication rejection retains no open hold.
- Original twelve attempts and complete original financial row fingerprints remain unchanged. There is no new customer charge, debit or funding receipt. The verification key is revoked and the copied Gateway/database are stopped.
- Actual Logs and CSV agree on attempt/operation associations, failure reasons, unknown usage and absent charges. Recursive customer-report checks exclude Supplier expenses, procurement rates and platform margins.

The saved partial SSE contains actual content and no terminal `response.completed`. Cancellation delivery has HTTP 200 with `timing.complete = false`. Timeout returns a fully delivered HTTP 502 error body: public error type is `upstream_error`, while the native diagnostic reason is `upstream_timeout`; its delivery timing is complete. A complete error-body delivery is not successful model execution.

## Existing uncertainty recovery

The associated current protocol matrix independently verifies two native Messages requests whose initial missing cache-creation quantity caused unknown usage and one hold each. The existing reconciliation API obtains real canonical records for those already executed generations. Repeat receipts and restart yield exactly one supplemental charge/debit per attempt, zero final holds and retained original unknown state. Missing cache-creation quantity remains null. This verifies a supported receipt-based recovery path without another generation or arbitrary SQL meter insertion.

It does not authorize forcing cancelled/nonterminal upstream results into completed execution. Unknown liability must remain explicit when the canonical evidence cannot establish a billable completed result.

## Historical artifacts and remaining scope

Retained actual Chat cancellation/timeout, native Messages cancellation during tool fragments, and Chat preparation-timeout databases were independently reopened again. Their saved responses/native failure, hold, charge and timing states match. The Chat preparation case retains no operation, dispatch, charge or hold; the native tool-fragment cancellation retains unknown state and its hold.

Those older Chat/Messages cancellation artifacts do not have a recoverable source revision pin. They are historical evidence and do not independently qualify every current-1212 protocol path. No fixture result is used as evidence.

S03-3 remains active for the remaining current supported-protocol failure matrix. The pinned Responses cases close the exercised authentication-refusal fallback, actual timeout, cancellation and no-uncertain-replay checks. Direct Anthropic/Gemini positives and arbitrary HTTP-status fallback are not inferred from this result; additional external activation is not added to this task.
