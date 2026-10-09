# Video recovery after model edits — 2026-10-09

## Observed defect

Increasing the configured text-length limit on the actual personal video model
made an already completed job's result endpoint return HTTP 409. The credential,
upstream job and result were unchanged. Recovery required the current model and
schema revisions to equal the original versions and read the protocol from
mutable capabilities, so an ordinary model edit stranded saved work.

## Correction

Migration `0203` adds immutable protocol bindings. A new binding is validated
against the original unsent route and saved in its transaction; dispatch requires
it. Existing rows are backfilled only while their original credential, model,
upstream and schema revisions still match. Historical information is not invented
for already-diverged configurations. A private database backup preceded migration.

Recovery reads the original protocol and upstream identity. Scheduling likewise
uses the saved protocol. Current credential configuration revision, credential
and model enablement, original credential attachment, ownership and workspace/key
access remain enforced. This does not enable credential replacement or permit
disabled routes to contact upstream services.

## Actual verification

- With the original real job and edited text limit, the corrected gateway
  refreshed upstream status and downloaded a byte-identical result.
- Disabling the model still blocked result access with HTTP 409. Re-enabling it
  and restoring its original constraints allowed the same result again.
- A second one-second personal video was submitted through Niu to exercise new
  protocol insertion. After dispatch, the model text limit was changed and the
  gateway restarted. Automatic recovery observed queued then succeeded for the
  saved task. The result was downloaded and fully decoded with `ffmpeg`.
- Independent PostgreSQL inspection confirmed one dispatch for the new
  qualification key, the original protocol and output-schema snapshot despite
  the changed current model revision, and no customer ledger entry. Attempting
  to mutate that actual protocol record in a rollback transaction was rejected
  by the immutable-record trigger.
- Another restart and restoration of the original model constraints preserved
  the downloaded result digest. The temporary key was then revoked.

Only actual current-input requests and independent saved artifacts support these
observations. Fixture-test outcomes are not used. Compilation and lint checks
were executed. Credential rotation, legacy jobs with unavailable protocol
history, customer video charging and full release qualification remain open.
