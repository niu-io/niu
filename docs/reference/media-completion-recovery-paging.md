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
