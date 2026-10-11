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
