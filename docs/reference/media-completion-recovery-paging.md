# Media completion recovery candidate paging

The financial recovery worker now selects at most 100 media job bindings before
checking whether their attempts need completion recovery. It advances the durable
cursor for every candidate, including already completed jobs. Only attempts still
marked `may_have_executed` inspect success and failure observations. The existing
requirement for a success observation and absence of a failure observation is
unchanged.

Scalar observation probes use the unique `(attempt_id, status)` key rather than
allowing a hashed `EXISTS` alternative to materialize unrelated observation
history. Existing per-row savepoints and the financial worker ownership mechanism
remain in use; this change adds neither a worker nor a database connection.

## Current-input verification — 2026-10-11

A stopped copy of the restored development database retained five actual media
jobs. The previous query scanned successful observation history despite returning
no recovery candidates. The new query returned the five candidate bindings with
no completion work required, and its execution plan entered no observation scan.
Both queries agreed on the eligible recovery set for this retained history.

The rebuilt native worker advanced its durable stage timestamp and retained the
completed sweep cursor. Gateway restart preserved the ledger and media jobs.
Independent reopening checked the saved query hash, execution plans, stage
progress, media job fingerprint and ledger fingerprint. No customer media charge
was created. Format, compilation and Clippy checks completed separately; fixture
outcomes are not evidence.

The binary included shared working-tree changes. This checkpoint covers traversal
of actual completed history. Other financial stages retain their own query and
verification boundaries.

## Actual pending video recovered after restart

A subsequent current-input run submitted one real video using the owner's saved
personal OpenRouter credential. A temporary database trigger blocked only the
attempt's transition to `confirmed_completed`; the actual upstream success
observation and result reference were durably retained. The attempt remained
`may_have_executed` while that fault was installed.

The original workspace key was revoked, the Gateway stopped, and the temporary
fault removed. With upstream polling disabled and one admission-pool connection,
the restarted Gateway recovered the pending attempt through the paged completion
worker. Transport record counts did not increase during recovery. A newly issued
scoped reader then fetched the real video; a second restart retained completion.
Both keys were revoked after verification.

An independent process reopened the stopped database and checked one generation
submission, one attempt, its real success observation, completed state, encrypted
result reference, revoked keys, removed fault trigger and absence of customer
charges. It independently matched the downloaded file's SHA-256 receipt and fully
decoded the video with FFmpeg. Private evidence pins the binary and recovery-query
hashes; the binary includes shared working-tree changes.

This is one nonempty pending recovery case, not more-than-100-job pagination,
sustained capacity, a global one-connection limit or customer-funded video
settlement. Personal upstream spending is separate from the customer ledger.

## Bounded atomic query persistence — 2026-10-12

Applying an authenticated video query commits its evidence, model attribution,
status observations and encrypted result references together. Previously this
transaction had no lock/statement deadlines. Current-input HTTP runs on retained
clean `ab6f2ff` used an actual completed personal video and genuine upstream query
responses. Exclusive locks on the evidence table and, separately, the result
reference table left persistence waiting beyond 1.60 seconds. Release allowed
each refresh to finish; no new generation was submitted.

Committed `1b209f7fb1472b914a7ce69c2a47951b7fb83c0b` reuses the existing bounded
recording initializer for this transaction. Identity validation, atomic evidence/
result storage and later financial recovery are unchanged. Its limits are 250 ms
per lock wait and two seconds per statement; they do not bound upstream query
latency, all prerequisite reads or the entire HTTP request.

On the digest-verified clean committed binary, both actual refreshes returned 503
while their respective locks were still held. From the independently observed
PostgreSQL lock wait, refusal arrived in approximately 231 ms at evidence insertion
and 208 ms at result insertion. Whole HTTP durations were approximately 1,795 ms
and 492 ms because they also include the upstream query. These timings are not a
capacity benchmark or a 250 ms request-wide guarantee.

Each refusal preserved the pre-query fingerprints of saved evidence, job
observations, result references and attempt state. The result-table case checks
rollback after earlier evidence/status writes. Actual query transport timing was
recorded before persistence, so transport success describes the network phase and
does not imply the complete refresh succeeded. A caller receiving 503 must retain
the saved job and may retry its read-only refresh after contention resolves; it
must not resubmit generation as a status-recovery action.

Release/retry returned the original succeeded job. Restart preserved all final
fingerprints, and revocation denied the next scoped read. Independent reopening
matched the saved artifacts to PostgreSQL, verified lock-timeout diagnostics at
both insertions, the recorded query counts and one retained completed attempt.
There was no additional generation, customer media charge, balance entry, funding
receipt, invoice payment or open customer reservation. Only actual status queries
were repeated; personal upstream spend was not converted to a customer charge.

Before native replacement, a fresh private backup restored with matching business
and encrypted-identity fingerprints. The exact replacement and previous retained
binaries were checked. Graceful update preserved original configuration, encrypted
credential revisions and durable counts on schema 278; authenticated routing
configuration remained consistent. No fixture outcome is evidence. This qualifies
these real query-persistence contention/recovery paths, not positive customer-paid
media settlement, every preflight storage wait or high-load worker throughput.
