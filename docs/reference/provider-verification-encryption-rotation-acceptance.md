# Provider verification envelope rotation acceptance

This closes the focused nonempty Provider-verification encryption-rotation check. It contributes evidence to [encryption and configuration acceptance](encryption-configuration-acceptance.md); the overall S10-2 criterion remains open. It does not establish human verification, an available authentication link, or acceptance for unpopulated encryption domains.

## Actual input and execution boundary

The run uses retained Gateway `ef29c2929ceba22bc590faa8787946dbb78b62b5`, binary SHA-256 `8982dda8bd5c09ed7132fec199f772120ef8ca1391bee85f6afb37aeecd3f267`, and PostgreSQL schema 293. The exercised encryption inventory, cipher, startup audit, rotation implementation and migration remain unchanged at documentation checkpoint `3513917a`.

A fresh isolated database copy contains one genuine upstream-created verification session from the earlier purpose-only API integration. Its encrypted envelope contains the actual private session token and H5 URL. No human identity or successful human verification is claimed.

The session has naturally expired before this run. Its stored status remains `waiting_user`, while the API correctly projects `expired` and rejects its link with HTTP 409. Neither its expiry nor the system clock is modified. The retained ciphertext remains eligible for the complete startup and offline-rotation inventory despite expiry.

The source database, deployment configuration and original master-key identity are untouched. All Gateway writers for the isolated copy are stopped during the supported offline rotation command. There are no upstream requests, H5 navigation, result queries, new asset mutations or video generations. One local workspace read key is created and revoked solely to read the existing session through the real API.

## Actual inventory

| Populated domain | Envelopes rotated and independently authenticated |
| --- | ---: |
| Retained inference credentials | 89 |
| Actual video result reference | 1 |
| Provider verification session | 1 |
| Total | 91 |

Nine other registered domains have no retained ciphertext in this copy: asset-management credentials, legacy Codex credentials, EPay configuration, asset-listing results, asset-lookup results, asset-group read results, asset-group update patches, inspected-image source content and workspace-material content. Their empty scans provide no positive domain acceptance evidence.

## Rotation and independent final-state verification

The real `--check-encryption` command first accepts the source inventory. With the required offline-maintenance setting, `--rotate-encryption-offline` replaces all 91 envelopes and completes one durable rotation operation. Afterwards source-key inspection fails and destination-only inspection succeeds.

A separate verifier reopens the stopped final PostgreSQL copy and checks its actual persisted ciphertext, business metadata and rotation audit. Independent AES-GCM authentication confirms that every populated envelope decrypts to exactly its original bytes under its original associated-data binding. Every replacement rejects the old key, and every original envelope rejects the destination key.

For the verification session, associated data retains the original organization, workspace, creation key and session identity. The replacement contains the identical schema-version-1 token and H5 URL, including the URL from the earlier genuine SDK link response. Changing any of those four associated identities causes authentication of this actual replacement envelope to fail.

The verifier independently reconstructs the 91 old and new complete-record hashes using PostgreSQL's typed records, UTC timestamps and hexadecimal bytea representation. They match the supported rotation authorization audit exactly. It also verifies the operation's source and destination HMAC bindings and completed status. No unfinished rotation remains.

All non-ciphertext metadata and row counts across the twelve registered domains remain unchanged. Original model configuration, workspace assets, asset groups and their acknowledged creation operations also retain complete fingerprints. Seven whole financial/request fingerprints match both the source and final databases: attempts, customer charges, balance entries, funding receipts, customer balance reservations, cost reservations and Supplier earnings.

## Restart and expiry behavior

Destination-only Gateway startup succeeds twice. Actual session GET responses remain identical and report `expired`; actual link GET responses remain identical HTTP 409 responses before rotation, after rotation and after restart. Rotation preserves the encrypted historical token and URL without reviving the session or granting a verified group.

Command, Gateway and PostgreSQL logs contain neither master key, the private token nor the H5 URL. The original identity file remains unchanged, the local read key is revoked, and all temporary Gateway processes and the final PostgreSQL copy are stopped.

This is evidence for a real retained, expired Provider-verification envelope and the populated inventory listed above. It does not replace missing evidence for the remaining supported domains, uninterrupted production operation, H5 completion or a verified person. Fixture outcomes are not used.
