# OpenRouter authentication rejection and reservation release

Date: 2026-10-10. This covers immediate HTTP 401 on OpenRouter text API calls,
not arbitrary upstream errors or asynchronous media rejection.

## Actual defect

A real request through an isolated gateway with an intentionally invalid test
credential received OpenRouter HTTP 401. Niu returned a sanitized `upstream_error`
and saved the upstream status, but left the attempt `may_have_executed` with a
customer reservation. The key's entire configured allowance could consequently
remain held despite a definite authentication refusal.

OpenRouter's [error contract](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/errors-and-debugging.mdx)
identifies HTTP 401 as invalid credentials and distinguishes request rejection
from errors after model processing begins. This narrow provider-specific evidence
supports nonexecution; transport loss, timeouts and arbitrary HTTP failures do not.

## Correction

The failure journal and the `confirmed_not_executed` transition now commit
together for an unknown-usage, dispatched OpenRouter text attempt with an immediate
HTTP 401. A scoped attempt lock serializes competing observations. Completed
attempts, other providers/statuses and saved asynchronous media routes are excluded.
Neither token usage nor a zero-valued customer charge is fabricated.

Customer-balance and upstream-budget reservations are then released in separate
transactions. Each release validates persisted nonexecution and is idempotent.
If either release fails or the process stops, background recovery can finish it:
the upstream-cost stage now includes held reservations for confirmed nonexecution,
as the customer-balance stage already did. Uncertain requests remain ineligible.
Safe failure logging covers both journal persistence and incomplete release.

## Current-input verification

Two isolated native-database runs exercised actual OpenRouter rejection followed
by credential correction, restart and a real strict-JSON completion:

- The initial HTTP 401 retained its sanitized upstream diagnostic, became
  `confirmed_not_executed`, and showed `not_charged` in Logs. No customer debit or
  charge was created. Customer/key reservations and upstream-budget reserved
  capacity returned to zero, allowing the same key's next bounded request.
- Rotating the isolated configuration to the saved authorized secret and
  restarting allowed the real completion. Its returned nonce and reported usage
  were checked; an independent integer calculation matched the single debit.
  Reconciliation found no discrepancies or settled open reservations.
- The second run injected database write faults into both release paths. The
  rejection state persisted while both holds remained. After stopping the
  gateway, removing the faults and restarting, background recovery released
  both holds. The safe retry diagnostic was observed. No upstream request was
  replayed by the verifier during recovery.
- A separate actual priced-stream disconnect check retained unknown usage,
  pending billing and its reservation through rotation and restart, confirming
  that the new rejection rule did not release that uncertain request.

The original development database and encrypted identity were preserved.
Temporary access was revoked and isolated servers stopped. Formatting, all-target
Clippy, release compilation and public-boundary checks completed. No fixture
outcome supports the diagnosis or verification. Historical uncertain attempts are
not bulk-reclassified; other rejection codes/providers and every timing race
remain separate qualification work.
