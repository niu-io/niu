# Request diagnostics during graceful shutdown

Request timing and payload capture finish after the response body is consumed or
dropped. These writes are now registered synchronously with a shared Tokio task
tracker before being spawned, including timing for a predecessor replaced by a
qualified retry. Completed tasks release their tracker entries immediately.

After HTTP serving and financial writer drain finish, graceful shutdown closes
the diagnostic tracker and waits up to ten seconds for outstanding writes. This
is an additional diagnostic drain window, not a ten-second limit for the entire
shutdown sequence or for in-flight inference. If the window expires, the gateway
logs `request_diagnostics_shutdown_timeout` and the pending task count, then
continues shutdown. Secrets, payload content and endpoints are not logged.

This adds lifecycle coordination; it does not retry upstream requests, alter
settlement, reset payload retention, or restore explicitly deleted content.
Diagnostic persistence is still asynchronous. A database write error retains its
existing sanitized warning; the tracker does not convert it into a successful
save or synthesize missing timing/content.

## Actual failure and verification

A fresh native gateway made an actual strict-JSON OpenRouter request with a
current marker and internal customer pricing/credit. PostgreSQL locks held both
`request_timings` and `request_payloads`; the client still received its complete
response and exact usage-based customer charge. Independent activity inspection
observed both actual diagnostic INSERTs waiting for those locks.

The previous binary exited immediately on SIGTERM. After releasing the locks
and restarting, neither the timing nor payload row existed. Independently
reopening the database confirmed the missing diagnostics while the completed
attempt, reported usage, charge and debit remained present.

With the updated binary, the same current-input workflow remained alive after
SIGTERM while the locks were held. Releasing them allowed both records to commit
before exit. After restart and independent reopening, the stored request and
response matched the actual HTTP content; timing reported complete HTTP 200;
usage matched the completed attempt; and exactly one customer charge and debit
remained with no outstanding customer reservation. No extra attempt was created.

A further actual request kept both locks until the diagnostic drain timed out.
The process exited within the verifier's bounded wait and emitted the stable
shutdown-timeout reason. After releasing the locks and restarting, independent
inspection found neither diagnostic row in this run, while the completed usage
and exact charge/debit remained intact. The missing records were not fabricated
on recovery, and no additional attempt appeared.

These are real API requests and database lock faults, not fixture outcomes. The
upstream account was personal and self-funded; internal credit/rates do not
qualify a commercial Supplier or merchant receipt. The ordinary development
database, configuration and encryption identity were preserved.

## Limits

SIGKILL, host loss, database failures and a diagnostic write still blocked beyond
the drain deadline can leave missing records. Logs explicitly identify deadline
expiry; they are not proof that every pending transaction failed to commit.
Inspect persisted state after restart. Missing diagnostics remain unknown and
do not authorize resubmission or erase a financial liability. This change does
not establish crash-durable payload spooling, new retry behavior, or ownership
coordination for all background workers.
