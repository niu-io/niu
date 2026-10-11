# Priced admission during active content cleanup

## Current-input checkpoint — 2026-10-11

Two native gateways ran against an isolated restoration containing 15 naturally
expired request payloads and three expired video-result references. Each gateway
used a shared database pool limited to two connections, plus its separate
single-connection retention pool. These are per-process limits, not a global
one-connection bound.

An isolated payload-delete trigger delayed active cleanup. Database observations
recorded both a retention transaction in `PgSleep` and a newly dispatched priced
attempt at the same observation time. Two actual personal OpenRouter requests,
one through each gateway, returned their fresh markers and completed with known
usage and exact customer verification charges. Rates and approved credit were
explicit internal verification settings; no cash receipt or commercial Supplier
qualification was fabricated.

After removing the delay, the payload backlog cleared. A separately faulted media
row remained in durable retry state while other expired media cleared. Restart
preserved that retry. Removing the row fault allowed recovery; repeated cleanup
then changed nothing.

An independent process reopened the stopped database and compared both retained
upstream responses with their stored usage, original key/workspace attribution,
exact charges and corresponding ledger debits. Both reservations were released.
The new requests' unexpired payload records remained present. Cleanup audit rows
matched all 15 original payloads and three media references exactly once, with no
duplicate successful mutation. Expired media ciphertext was absent, tombstones
remained, retry queues were empty, and the temporary API key was revoked.

This verifies foreground admission during an observed active cleanup transaction
and recovery of this retained backlog. It does not establish sustained throughput,
a latency target, interrupted-image coverage, all asset domains, or a global
connection cap. The original development database and encryption identity were
untouched. No fixture result contributes to this conclusion.
