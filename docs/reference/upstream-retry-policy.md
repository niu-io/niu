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

## Two-gateway shared-database checkpoint

Two native gateways on separate ports shared a fresh PostgreSQL database, each
with an eight-connection pool. Four workers were split evenly between the two
instances for a 60-second admission window, capped at 30 operations per worker.
The workload retained the preceding checkpoint's real OpenRouter rejection then
structured streamed generation, internal credit/rates, fresh markers and 1–200
integer sequences. No client retries or warm-up were used.

The gateways completed 26 and 27 operations respectively. The run completed
53 operations in 64.194 seconds including drain, or 0.826
completed operations/second. Completion P50/P95/maximum was 4.593/5.657/8.399
seconds; first-content P50/P95 was 1.910/2.542 seconds. These include upstream
latency and are not a controlled scaling comparison or a maximum-capacity claim.

Each raw SSE response was saved privately. A separate inspection re-read its
bytes, checked the saved SHA-256, terminal `[DONE]`, parsed output, fresh marker,
integer sequence and usage. Reopening the stopped retained database independently
confirmed 106 attempts in 53 two-attempt chains, 53 authentication rejections,
53 exact customer charges/debits and no remaining customer/procurement holds.
Independent token arithmetic reproduced 22,115,699 nanounits of customer charges
and each configured expense. Both gateways were stopped and restarted after the
workload; chain contents and charge counts remained unchanged. The original
runtime's encrypted identity remained unchanged; isolated processes were stopped.

Only the first gateway was resource-sampled: 64 samples, RSS 22,848–31,872 KiB,
maximum observed `ps` CPU 6.2%. The second gateway and PostgreSQL resource usage
were not measured. This qualifies concurrent distinct operations across two
gateways, not two gateways racing to append a successor to the same operation,
rolling restart during active generation, crash recovery, long soak or overload.

## Hard process crash after streamed output

A current native run sent an actual OpenRouter stream through a retry-enabled
pool with a valid alternative credential. The gateway was killed with SIGKILL
(exit status −9) immediately after the client read the first content event,
before reading terminal usage. This bypassed graceful shutdown and the normal
client-disconnect finalizer. Only the isolated verification gateway was killed.

After restart and background recovery, the request remained `may_have_executed`
with unknown token usage and a pending customer charge. Its 1,000,000-nanounit
minimum-charge reservation remained held. No charge, balance debit or successor
attempt appeared. A new request on the exhausted key returned HTTP 402 before
dispatch. Rotation retained the same constraint and invalidated the old secret;
a further restart and key revocation did not forgive the unresolved liability.

Independent inspection parsed the saved raw SSE prefix, confirming content and
absence of terminal usage in the received prefix. Reopening the stopped retained
database confirmed exactly one unknown attempt, one held reservation, no customer
charges or balance entries, and no selection of the alternative mapping. Neither
the prefix nor the database establishes whether the upstream finished after the
crash; Niu correctly retains that uncertainty. Original encrypted identity was
unchanged and the isolated processes were stopped.

This qualifies the exercised crash boundary with internal credit/rates. It does
not establish later recovery of unavailable upstream usage, rolling restarts with
another live gateway, or crashes at every financial commit boundary.

## Joining a gateway during active generation

A fresh current-input run started one native gateway and four workers. After a
worker received its first actual streamed content, SQL confirmed that request was
`may_have_executed`, its usage was unknown and its customer reservation remained
held. A second gateway then started against the same database. Once its readiness
endpoint returned success, independent SQL still showed that same live request
and reservation state. Subsequent worker requests were shared between instances.
This directly exercises a peer's startup while generation is active.

During the 20-second admission window, the first gateway completed 11 operations
and the joining gateway seven. Including drain, 18 operations took 24.304 seconds.
Every operation used the existing real authentication-rejection/structured-stream
workload with explicit internal credit/rates and personal upstream testing.
Separate raw-SSE inspection verified terminal events, outputs and usage; reopening
the retained database verified 36 attempts, 18 exact customer charges/debits
summing to 7,506,058 nanounits and no remaining customer/procurement reservations.
Restarting both gateways after completion retained the chains and debit counts.
Original encrypted identity was unchanged and isolated processes were stopped.

This qualifies peer startup during the observed live stream and subsequent shared
traffic. It does not qualify stopping the gateway that owns an active request,
zero-downtime rolling deployment, two recovery workers racing for one successor,
all financial commit failures or a capacity limit.

## Graceful termination during actual streaming

A fresh native gateway received SIGTERM immediately after the client read the
first content event of a real OpenRouter stream. SQL at that point showed
`may_have_executed` with unknown usage. The client kept reading: the response
reached its terminal `[DONE]` and reported token usage, and the gateway then
exited with status zero. This exercised normal signal-driven shutdown rather
than closing the client or forcibly killing the process.

Independent inspection re-read the saved raw SSE, matched its SHA-256 and prompt
marker, and checked terminal usage against the reopened retained database.
Exactly one attempt was `confirmed_completed` with provider-reported token counts;
its 1,000,000-nanounit fixed-only customer charge matched one balance debit.
Customer and procurement holds were released, and complete HTTP 200 timing was
persisted before process exit. Restart retained one attempt and debit. A new
request on the exhausted key returned HTTP 402 without another dispatch.

The run used approved internal credit, test rates and a personal upstream account;
there was no received-cash receipt or commercial supply claim. Original encrypted
identity stayed unchanged and isolated processes stopped. This qualifies graceful
drain of the exercised stream, not a maximum drain duration, a stalled upstream,
forced termination during drain or a full load-balancer deployment transition.
