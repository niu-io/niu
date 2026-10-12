# Workspace key authentication availability

Implemented and exercised on clean backend `e704955`, reviewed 2026-10-12.
Fixture outcomes provide no evidence.

## Verification and storage waits

Bearer-key verification and dashboard selected-key resolution use bounded
read-only transactions for the existing key lookup. Transaction-local lock and
statement limits are 250 ms and 2 s. Successful lookup preserves the current
scope, model grants, finite/no-expiration state and revocation checks. The
transaction finishes before subsequent source checks or inference admission.
Dispatch retains its separate current-access recheck.

A syntactically valid token cannot be classified while its lookup is unavailable;
the response is sanitized 503. This never grants access or creates an attempt.
Malformed key format is rejected with 401 before database lookup. After storage
recovers, an unissued token returns 401. Do not interpret storage failure as an
empty directory or definitively invalid saved credential.

Pool acquisition, installation/operator authentication, other policy reads and
the full HTTP deadline have separate limits. This change does not promise
cancellation of already authorized reads or every concurrent permission race.

## Actual current-input verification

A stopped copy retained 1,842 actual requests and their charges/debits. Management
created a normal no-expiration key and scoped owner. On preceding `0f6319b`, an
exclusive key-table lock kept authenticated model-list and dashboard selected-key
model discovery pending for at least 1.6 seconds. Each returned 200 only after
release. This diagnoses lookup availability; an empty video discovery response
is not video-workflow qualification. No upstream request or financial entry was
created by the baseline reads.

With `e704955`, the same native lock produced:

| Actual entry path | Status while lock held | Client elapsed |
| --- | --- | --- |
| Model-list key verification | 503 | 258.12 ms |
| Dashboard selected-key resolution | 503 | 253.78 ms |
| Format-valid unissued key verification | 503 | 254.50 ms |
| Chat request key verification | 503 | 253.60 ms |

Native observations confirmed the waits and retained lock at failure. Every
malformed-format probe returned 401 while the table remained locked. After
release the unissued token returned 401. All blocked/refused requests created no
attempt. A real strict-marker model completion then reported tokens producing
18,025 USD nanounits of customer charge and an equal debit under the retained
internal tariff. It also confirms the read-only setting did not prevent normal
subsequent financial writes.

A deny-all IP policy continued to return 403 before another attempt, including
after restart. Restoring the loopback policy recovered the original model-list
response. Key revocation returned 401; temporary owner access was revoked.

Independent PostgreSQL reopening checked the unissued token hash was absent,
all retained error observations, actual response hash/content/usage, exact
original-rate charge/debit arithmetic, policy history and revocations. Final
request/charge/ledger counts were 1,843 with total customer charges/debits of
34,692,720 USD nanounits. No funding or outstanding hold appeared. Original
installation data/configuration and encrypted identities were preserved; native
refresh followed a fresh isolated backup restore and authenticated configuration
comparison.

This verifies the exercised authorization lock failures, recovery, real priced
call and source/revocation behavior. It does not qualify sustained authentication
throughput, the separate 2-second statement limit, pool saturation, every token
or permission race, or commercial supply. Prior measurements retain their own
executable revisions and do not measure this implementation.
