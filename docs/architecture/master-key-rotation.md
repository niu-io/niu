# Master-key rotation implementation boundary

Status: implementation planning, not an available rotation procedure. Replacing
`NIU_VENDOR_ENCRYPTION_KEY` alone is not supported. Retain the existing key and
back it up separately from the database. This inventory follows the current
`apps/gateway/src/vendors/crypto.rs` encryption domains and storage migrations.

## Encrypted domains

| Stored domain | Binding that rotation must preserve |
| --- | --- |
| Supplier inference credential | Vendor identity |
| Asset-management credential revision | Vendor, revision and upstream project |
| Payment gateway configuration | Existing payment-configuration domain |
| Media result reference | Tenant scope, job and result kind |
| Asset listing and lookup result | Tenant scope and operation identity |
| Asset group read result and update patch | Tenant scope and operation identity |
| Inspected image source | Exact storage-provided associated data and binary bytes |
| Retained private OAuth connection | Existing account binding, if such records remain |

The last domain is inventory only; rotation must not expand or reactivate retired
agent features. Nullable erased ciphertext must stay erased. Unknown adapters
must not cause credential rows to be skipped. Domain-specific payload validation
and associated data must remain identical across encryption generations.

## Storage constraints to resolve before writes

The asset-management credential trigger allows revoked-secret erasure, but not
arbitrary ciphertext replacement. Asset result and patch tables similarly permit
erasure only. A migration must separate immutable business identity from mutable
encryption representation without allowing modification of logical content,
retention timestamps, approvals or revocation state. Disabling triggers globally
is not an acceptable rotation mechanism.

Updating `vendors.credential_ciphertext` currently invalidates Supplier route
qualification through `supplier_configuration_requires_new_review`. Rewrapping
the same secret must not masquerade as an upstream credential change. The design
must preserve qualification evidence while retaining invalidation for a genuine
credential, adapter or endpoint replacement.

## Required execution model

Use a dedicated maintenance operation with exclusive coordination against all
Gateway writers. Define that coordination explicitly before allowing online
rotation; a process-local mutex cannot fence another Gateway. Back up first.
Accept old and new keys through deployment secrets, never CLI arguments,
PostgreSQL records or logs. Validate both configuration inputs before writes.

Process bounded pages with durable progress. For each row, authenticate the old
ciphertext using its exact domain binding, encrypt under the new key, authenticate
the result and commit the replacement atomically with progress. A crash must leave
either representation recoverable. Resume must distinguish completed rows from
old rows and must fail on corruption instead of treating decryption failure as a
reason to skip. Concurrent erasure must never resurrect secret content.

Before declaring completion, independently scan every retained encrypted domain
using only the new key. Until that scan succeeds, do not serve a mixed-key database
as healthy with only the new key. Keep the old key until completion and backup
retention requirements are satisfied. Existing startup credential scans alone do
not prove that retained media or asset content has been migrated.

## Verification still required

Use isolated native databases and disposable encryption keys. Include actual
management writes and an actual upstream dispatch after restart with only the
new key. Verify persisted content independently. Interrupt between committed
pages and resume; inspect erasure, qualification and revision invariants. Exercise
wrong keys, truncated ciphertext and cross-identity substitution without logging
secret material. Fixture results are not acceptance evidence. No rotation runtime,
crash-resume behavior or complete encrypted-domain coverage is qualified yet.
