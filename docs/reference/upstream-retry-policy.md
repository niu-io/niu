# Upstream retry policy

The shared `niu-upstream` HTTP client explicitly configures
`reqwest::retry::never()`. The pinned reqwest implementation otherwise retries
some protocol-level negative acknowledgments that it considers safe to retry.
This change makes the transport policy explicit: application retries should be
decided alongside durable attempt state, not added invisibly by that policy.
It is not evidence that the previous default duplicated a paid execution.

Redirects remain disabled. A transport error after dispatch is not proof that
the Provider did no work. Unknown execution and its outstanding liabilities
must remain visible until independently resolved. A downstream disconnect does
not authorize another generation submission. Video status polling is a query of
an existing job and must not be confused with resubmission.

This policy applies to callers using the shared client. It does not establish
the retry behavior of every native adapter or third-party dependency, nor does
it guarantee that an upstream service itself never retries internally.

## Bounded Chat authentication-rejection failover

Chat candidate pools can make at most two submitted attempts under one operation.
The first selected route must use the `openrouter` adapter and canonical
`https://openrouter.ai/api/v1` endpoint. Only an immediate HTTP 401 classified as
`upstream_http_error` can select a different credential. The storage transaction
requires durable `confirmed_not_executed` evidence, unknown usage, no charge and
released customer/procurement holds before appending its single successor.

The operation pins policy revision `openrouter-chat-auth-rejection-v1`, the API
key, a maximum of two attempts and a deadline. The successor preserves workspace,
public model, task attribution, customer tariff and funding source. It selects
from currently eligible pool candidates excluding the previous credential,
rechecks grants/Guardrails and admits its own procurement/customer reservations.
Both dispatches count toward key request limits. An operation lock and unique
chain position/predecessor prevent competing successors from both committing.
An expired deadline cannot authorize dispatch. A second rejection is returned;
a third candidate is never submitted by this policy.

No fallback occurs after a stream has been returned, for transport uncertainty,
other HTTP statuses, other first adapters/endpoints, direct aliases, or video
jobs. Restart does not resume or resubmit an incomplete retry chain. Failed or
uncertain commits do not authorize another submission. Missing eligible routes
preserve the original rejection; a new admission denial is returned with the
existing operation correlation headers.

Request list/detail metadata includes nullable `retry` with `ordinal`,
`predecessor_attempt_id`, `maximum_attempts` and `policy_revision`. The operation
filter returns both attempts. The predecessor keeps its upstream failure and
observed elapsed timing; it has no invented downstream header/output timing or
HTTP status when its rejection was replaced by a successor. Final response
headers identify the operation and last dispatched attempt. This is a narrow
adapter-specific policy, not generic status-code retries or circuit breaking.

## Current-input verification — 2026-10-10

After optimized compilation and restarting the gateway with its existing
database and encryption identity, a fresh temporary workspace key made an actual
personal OpenRouter streaming Chat request. The response returned HTTP 200,
nonempty content, reported token usage and the final `[DONE]` marker. Independent
PostgreSQL inspection found exactly one dispatched attempt for that key, with
confirmed completion and prompt/completion counts matching the received usage.
The temporary key was revoked.

Formatting and Clippy completed. This verifies the ordinary streaming path on
the updated binary. No protocol-level negative acknowledgment occurred in this
run, so retry suppression during that fault remains unverified. A single durable
attempt does not independently prove the number of network transmissions or
upstream internal executions. No fixture result is used as evidence.

## Existing nonexecution classification and current verification

`Store::save_request_failure` already recognizes one limited case: an immediate
OpenRouter text HTTP 401 recorded as `upstream_http_error`, with unknown usage and
no asynchronous media recovery binding. It records `confirmed_not_executed` and
releases eligible customer and procurement reservations. Stream failure recording
has no upstream HTTP status and therefore cannot enter this branch. Other
providers/statuses and transport uncertainty retain their existing semantics.
This classification is not a generic retry authorization or a fallback loop.

A fresh native current-input run with operation tariff binding enabled sent an
actual request using a deliberately invalid credential in an isolated OpenRouter
configuration. The gateway returned a sanitized 401 without exposing either the
invalid or saved real credential. Independent records showed nonexecution, no
customer charge, released customer/procurement holds, zero procurement reserved
amount and zero committed key allowance. After correcting only that isolated
configuration and restarting, a new request completed with the requested fresh
marker and an exact usage-based debit. The two separate requests produced two
attempts but only one customer charge; reconciliation had no discrepancy. Original
configuration and encrypted identity were preserved and isolated processes stopped.

This verifies rejection and explicit operator correction, not an automatically
selected successor, same-operation append or a retry after uncertain execution.
Future failover must preserve the qualified adapter/endpoint rejection contract
and durable predecessor evidence rather than generalizing any HTTP 401 into
permission to resubmit.


## Actual bounded failover qualification

Fresh native current-input runs used three isolated OpenRouter credential
configurations: the highest-priority key was deliberately invalid, and lower
candidates used the owner's saved personal test account. Internal credit/rates
exercise accounting, not commercial Supplier qualification or received funding.

- Ordinary and streamed Chat each received a real upstream 401 and completed on
  the second credential. Independent SQL and scoped request APIs showed one
  operation, two linked attempts, nonexecution/no charge for the predecessor and
  exactly one usage-calculated charge/debit for the completion. Both reservation
  types were released, reconciliation matched and restart retained the chain. The
  issued statement contained only completed successor charges, excluded all
  authentication rejections and remained identical after restart.
- Changing the current retail tariff while the successor waited on a credential
  lock preserved the original operation's old price. A later operation used the
  new rate. Two actual calls independently reconciled to their pinned rates.
- Two real authentication rejections exhausted the cap despite an available
  third valid credential. No third submission or rejection charge was created.
  A new key with RPM one allowed the initial rejection, then returned HTTP 429
  for successor admission without another dispatched attempt or retained hold.
- A personal pool also completed on its second credential after a real 401. The
  funding source stayed personal, with no customer/procurement entries or holds,
  an unchanged one-nanounit procurement budget, and stable records after restart.
- A valid first candidate streamed initial content before a deliberate client
  disconnect. With an eligible alternate present, the operation retained one
  attempt, unknown usage and its minimum-charge reservation. Rotation and restart
  did not release that hold or cause another attempt.

A separate current-input request received a real 401, then its successor waited
on a credential lock until the persisted four-second deadline expired. Releasing
the lock returned HTTP 503 without another dispatch, charge or outstanding hold.
Restart did not resume the expired operation.

A retained database with two earlier actual paid-pool calls also upgraded without
creating retry permissions for its old operations. Their request metadata retained
null `retry`, and customer report/CSV values and charges remained unchanged across
restart. No additional inference or charge was created by that upgrade.

Original encryption identities were unchanged and isolated processes stopped.
These observations do not qualify generic statuses/providers, competing successor
transactions across multiple gateways, every uncertain-commit failure, broad
capacity or circuit-breaker recovery. No fixture outcome supports these claims.


## Concurrent bounded-failover checkpoint

A fresh native run used four workers, an eight-connection gateway database pool,
a 60-second admission window and at most 30 operations per worker, with no client
retry or warm-up. The highest-priority credential was deliberately invalid; the
next credential used the owner's real OpenRouter account. Every operation asked
for a strict JSON stream containing a fresh marker and integers 1 through 200,
with a 1,024-token output bound. This is internal credit-backed accounting
verification, not commercial supply or proof of received funding.

The run completed 54 operations in 63.821 seconds including drain: 0.846 completed
operations/second. Completion P50/P95/maximum was 4.531/5.272/6.982 seconds;
first-content P50/P95 was 1.832/2.623 seconds. These times include the actual
upstream rejection, candidate transition and generation. They do not isolate
Niu overhead or establish a causal comparison with earlier single-attempt runs.

Independent final-artifact inspection verified every saved marker/integer sequence;
the live stream reader recorded terminal completion for every response. Reopening the stopped retained PostgreSQL database confirmed
108 attempts linked in 54 two-attempt chains, 54 recorded authentication refusals,
and exactly 54 customer charges/debits. Every charge and configured procurement
expense matched independently calculated token arithmetic. Customer charges
summed to 22,543,356 nanounits; no customer/procurement hold remained. The earlier
rejection retained observed elapsed timing without fabricated downstream stages;
completed successors retained complete HTTP timing. Restart preserved the chains
and debit count without resubmission. Original encrypted identity was unchanged,
and isolated processes stopped after both the run and independent inspection.

The gateway's 63 process samples reported RSS between 22,896 and 34,656 KiB and
maximum observed `ps` CPU of 9.2%. PostgreSQL resource usage was not measured.
This is a scoped concurrent business/accounting checkpoint, not maximum capacity,
a long soak, multi-instance qualification, competing successors for one operation,
or a guarantee against every failure mode. Those boundaries remain open.
