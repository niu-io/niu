# Bounded Guardrails policy snapshot reads

Verified 2026-10-12 against clean committed Gateway `3fdc669c` and native
PostgreSQL 17. This is current-input HTTP and independently reopened database
evidence for specific paths, not complete Guardrails or release qualification.
Fixture outcomes provide no evidence.

## Behavior

Public policy snapshot reads now use the shared bounded read-only transaction:
transaction-local 250 ms lock and 2 s statement limits. A storage wait failure
returns sanitized 503; it does not substitute an empty policy or permit access.
The existing query, authorization, policy composition and dispatch recheck remain.
The helper used inside caller-owned dispatch transactions is unchanged. These
bounds exclude authentication, pool acquisition, total request time, detector
services and other Guardrails reads/writes.

## Actual expired-video retrieval

A stopped database copy contained a real completed personal OpenRouter video
whose encrypted reference had naturally expired and been erased. Its authorized
download normally returned 404. Holding an exclusive lock on workspace policy
heads reproduced the old `a56cfe0d` snapshot waiting until lock release: the
request remained pending for 1.6 seconds and completed with 404 at 1,645.797 ms.
The new executable returned 503 at 257.415 ms while the lock remained held.
After release and restart, the expired download still returned 404. Revocation
returned 401. No refresh, resubmission or new video charge occurred.

Independent source/final PostgreSQL reopening compared full original credential,
mapping, policy, attempt, media job/observation/reference/timing and financial
fingerprints. The successful execution and erased reference were unchanged.

## Actual text admission and recovery

A separate isolated copy retained four real requests from the two-Gateway
Supplier workload, with internal verification tariffs and administrator-approved
credit. Holding the same policy-head lock caused an actual Chat request to
return 503 at 256.459 ms, before any additional upstream dispatch or charge.
After release, a new request using the same scoped key and personal upstream
credential produced the requested nonce with reported usage. Its exact customer
charge was 9,013 nanounits, bringing the retained five-request total to 83,337.
Restart preserved that total; the verification key was revoked.

A separate reader checked the saved response digest/content/usage against native
completed attempt data, reconstructed the charge from the original rates, and
matched the complete debit total. Original credential/model/policy/attempt and
financial rows matched the source after excluding the one new request. There
were five dispatched attempts and five charges, no funding receipt or open
customer/procurement hold. Personal testing and internal tariffs do not qualify
commercial Supplier supply or an externally funded payment.

## Limits

These observations cover expired-video authorization and one buffered Chat
recovery. Other protocol/media/detector combinations, policy-management wait
bounds, contention capacity and production latency require separate evidence.
Original installation data/configuration/encryption identity were preserved;
native refresh used a fresh backup with independent seven-table restoration.
