# Offline encryption key rotation

The command re-encrypts retained Supplier credentials, asset-management credentials,
EPay configuration, legacy credential records and encrypted media/asset/image
content. Current implementation and verification boundaries are recorded in the
[rotation architecture](../architecture/master-key-rotation.md). This is offline
maintenance, not an online key change.

1. Back up the database and retain its current key separately. Use the binary
   matching the complete applied migration set. Apply needed migrations through
   the normal upgrade procedure before starting rotation.
2. Stop **all** Gateway processes, cleanup workers and other writers. The command
   does not stop or fence existing processes. Keep them stopped through completion.
3. Supply `NIU_DATABASE_URL`, the original `NIU_VENDOR_ENCRYPTION_KEY`, and a
   distinct, high-entropy `NIU_VENDOR_ENCRYPTION_KEY_NEXT` through the protected
   deployment environment. Each key must meet the existing minimum of 32
   characters. Do not place keys in command arguments, shell history or Git.
4. Run with the explicit offline acknowledgement:

   ```sh
   NIU_ENCRYPTION_MAINTENANCE_OFFLINE=1 niu-gateway --rotate-encryption-offline
   ```

5. After successful completion, configure `NIU_VENDOR_ENCRYPTION_KEY` to the
   destination value and remove `NIU_VENDOR_ENCRYPTION_KEY_NEXT` and the offline
   acknowledgement from the normal Gateway environment. Run
   `niu-gateway --check-encryption` using only the destination key, then start the
   Gateway and verify your actual API workflow.

The command performs no migration, configuration bootstrap or upstream request.
Only one maintenance command can own a database session at a time. It uses at most
two database connections: one for ownership and one for bounded inventory/writes.
It preserves identities, business revisions, qualification, retention and erasure
metadata; previously erased content is not recreated.

If interrupted after any committed replacement, keep both original input keys and
rerun the same command with the same source/destination environment. It discovers
the unfinished operation, validates its key binding and skips envelopes already
authenticated under the destination key. Normal startup refuses unfinished
maintenance. Do not manually complete/delete its database record or choose a new
destination while resuming. Repair a reported data problem or restore the backup
with its matching key before restarting ordinary service.

An initial authentication preflight failure does not create a new maintenance
record or rewrite ciphertext. Failure after replacement begins leaves maintenance
unfinished. Keep the source key for as long as retained backups require it; a
completed live database rotation does not re-encrypt historical backups. A full
completed-operation rerun can record an additional zero-replacement operation;
completion history alone is not proof of upstream service health.

## Nonempty asset-management credential revisions

A current-input native run on 2026-10-11 created a disabled direct-Ark
configuration and saved two successive asset-management credential revisions
through the administrator HTTP API. The fresh local credential values exercise
storage and cryptographic lifecycle only; they are not claimed issued or
validated by an external asset service. Both responses kept dispatch unavailable.
No upstream inference or asset operation was sent.

With the Gateway stopped, the offline rotation command re-encrypted the vendor
and both historical asset-management envelopes. Destination-only encryption
inspection, startup, configuration reads and another restart succeeded. Inspection
with only the old master key failed. Revision, project and creation metadata
remained identical; the management API still exposed no credential values.
Captured Gateway and CLI outputs contained neither supplied credential values
nor either master secret.

Independent reopening used a separate AES-GCM implementation with the documented
master-secret derivation and envelope layout. Both revisions decrypted to their
exact original submitted values under the destination key and original
vendor/revision/project associated data. The source key, changed vendor identity
and changed project binding failed authentication. Metadata matched the retained
pre-rotation record and there were zero inference attempts. The verifier initially
used raw hexadecimal key bytes rather than Niu's SHA-256 master-secret derivation;
that verifier error was corrected before assessing the result.

This covers nonempty asset-management credentials, including superseded revisions.
It does not qualify upstream asset authorization or the separate encrypted asset
lookup/list/read/update result domains.
