# Agent authorization and key boundaries — 2026-11-14

Related review: `niu-mm90`, `niu-mm90.28`. These observations use actual current
staging inputs and independent final reads. Fixture outcomes are not evidence.

## Discovery and management approval

On hosted core `3ab183db`, a new anonymous Codex request asked for Routing and
event-subscription reads and supplied a self-reported review task. The browser
showed a code to compare, the reported client name, the signed-in account,
workspace selection, requested access, finite lifetime and an explicit consent
checkbox. Requested management operations were described before approval;
Advanced options showed the task and fixed scope. The model-call checkbox
remained unchecked. The visible explanation said that this did not authorize
inference charges.

The reviewer selected the existing zero-budget, deny-all review workspace and
approved through the UI. It confirmed Authorization approved and linked to the
scoped API keys page. One actual device exchange returned 200 and created
exactly one new key, independently identified against the before/after key
directory. Actual model discovery, Routing and event reads each returned 200.
No model call or paid estimate was sent. The key detail showed Blocked
(management only), finite expiry and the applicable workspace policy.

The key was revoked through its ordinary detail-page confirmation. A separate
owner read returned 200 with revoked true and invocation_allowed false; using
the old credential for model discovery returned 401. The independent review
workspace request directory returned 200 with no records. Private device and
credential values were removed after cleanup; only audit identifiers remain.
No existing key was rotated or otherwise changed.

Expiry by waiting, paid invocation, and every host/plugin integration are
outside this run.

## Previously issued workspace keys

The earlier actual hosted run recorded in `niu-mm90.28` verified repeated
retrieval of a retained active secret, a distinct password sign-in, UI Copy
after reload, and exact clipboard equality without printing the value. A
temporary read-only member could list metadata but received 403 for reveal;
that member was revoked and its credential subsequently returned 401. Lists
did not include full secret fields and successful reveal used no-store.

The new revoked management key supplied an additional current-state check at
390px. Its status, rejection explanation and Create replacement key were
visible without horizontal overflow, while Copy key was absent. This is the
supported recovery boundary in
[key mutation recovery](../reference/key-mutation-recovery.md). The older
review criterion asking for copying inactive secrets is rejected: revocation
clears the retained value, and the UI must not imply that it can retrieve or
reactivate it. Legacy active keys without retained secrets likewise require
explicit rotation or replacement.

[Render's Postgres documentation](https://render.com/docs/postgresql-creating-connecting#encryption),
rechecked on this date, specifies AES-256 storage encryption for managed
databases, replicas and backups. That assurance is specific to Render-managed
staging. It does not establish application-layer encryption or secure storage
for every community deployment. This UX review makes neither broader claim and
introduces no credential-retention or cryptographic change.

A separate read-only control-plane check matched staging's configured core
database connection to exactly one available managed Postgres resource. No
connection string, credential or customer record was printed or published.
