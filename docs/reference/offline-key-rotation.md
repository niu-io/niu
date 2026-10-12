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

## Excluded locally generated asset-management records

The earlier asset-management run saved two successive revisions with locally generated random access/secret values for a local verification project. Their provenance does not establish real user-saved or externally issued credentials. Its authentication, rotation, startup and revision outcomes are excluded from genuine business acceptance; they cannot qualify the asset-management credential domain or substitute for missing actual asset-result data. Retained command history does not change this exclusion.

See [encryption and configuration acceptance](encryption-configuration-acceptance.md) for the corrected inventory and genuine-domain evidence. The closed implementation still supports this optional configuration target; no unused domain needs a fabricated record or external activation merely to raise a coverage count.

## Clean committed rotation with a real unresolved stream — 2026-10-12

A current-input run used the digest-verified clean committed Gateway
`ab6f2ff1832af753b05c674651883c2fdedaf3db`. Its isolated database copy retained
240 actual completed stream charges and a separate actual tool-argument stream
disconnect: that request had unknown usage/execution, no charge or debit and one
unreleased customer reservation. The original raw partial SSE and its hash were
retained; no fault trigger or invented usage was needed.

Offline rotation completed with one credential-envelope replacement. Source-only
encryption inspection failed; destination-only inspection and startup succeeded.
The original cancelled attempt and reservation fingerprints, and all 240 prior
charge/debit records, remained unchanged. Maintenance did not reconcile uncertain
usage, create an invoice payment or release an unresolved liability.

A newly scoped key then made an actual structured stream through the re-encrypted
credential. The response delivered its fresh marker, native usage and `[DONE]`.
44 input and 9 output tokens at the bound customer tariff produced exactly
**14,321 USD nanounits** and one matching debit in the original bound account.
Restart preserved the original unknown request and hold, all historical accounting
and the new completed request. The temporary key was revoked.

Independent reopening parsed both partial and completed SSE artifacts and checked
request quantities, hashes, original-account attribution and exact billing against
PostgreSQL. A separate AES-GCM implementation authenticated the old and new
envelopes to identical plaintext under the original vendor identity, with unchanged
business metadata. The old key and changed identity failed authentication against
the new envelope. One completed operation and one matching replacement authority
remained. The authorization digest check initially used the database's default
timezone; it was corrected to the documented UTC/hexadecimal audit settings and
rerun on the same stopped database, without repeating rotation or inference.

There were 242 total attempts, 241 charges/debits and exactly the original one
open customer reservation, with no external funding or invoice payment. These are
actual retained/generated records, not fixture outcomes. Original source databases,
deployment configuration and encryption identity were not changed. Personal
OpenRouter access and explicit internal verification prices do not establish
commercial Supplier supply or discounts.

This adds clean committed evidence for credential rotation, genuine unresolved
liability preservation and subsequent actual streaming/accounting. Nonempty
image/asset-result and legacy credential transitions, populated Supplier qualification
preservation and large-inventory capacity remain unverified. They are separate
optional/provenance states, not requirements to activate unused products. The finite
current backend capability boundary is recorded in the linked encryption acceptance;
this historical genuine stream checkpoint does not establish production capacity.

## Clean committed retained-video and Billing checkpoint

A further current-input run on the same clean `ab6f2ff` binary rotated a separate
isolated database containing an actual generated, unexpired personal video.
Destination-only startup, authorized result retrieval and restart preserved its
original URL, identity and retention metadata. Independent AES-GCM authentication,
original artifact hashes, full FFmpeg decoding and reopened PostgreSQL checked
the result. No generation or polling was repeated and no customer charge, funding
receipt, invoice payment or reservation was introduced. Scoped Billing remained
explicitly owner-funded with no invented settlement quantity; foreign access and
revoked credentials were denied. The detailed
[video checkpoint](../releases/video-settlement-quantity-verification.md#current-committed-retained-video-checkpoint)
records the exact projection, client correction and remaining customer-paid
settlement limits. Original source databases and deployment identity were not changed.
This strengthens retained-video evidence with clean committed provenance; it does
not fill the separate image/asset-result or commercial qualification gaps.
