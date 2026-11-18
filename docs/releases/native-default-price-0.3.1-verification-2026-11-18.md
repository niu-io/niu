# Native default-price and database restore verification — 2026-11-18

Tracking: `niu-nrcn.7`, `niu-nrcn.10`.
Source: `18178194c24f1ea932165ee53a72cdc45f49207d`.

## Actual execution

An exact Git archive of the candidate was compiled with its full source identity.
The executed native binary reported `niu-gateway 0.3.1` and that same commit.
A fresh PostgreSQL database, organization and workspace were created through the
actual application. This was a local source build, not a published native package.

A temporary hosted key restricted to the existing DeepSeek model, with a zero
customer spending cap and 15-minute expiry, authorized a real upstream connection.
The isolated local installation used that actual connection. Its platform standard
price was 1,000,000 input and 2,000,000 output nanounits per million tokens, with a
10,000-nanounit minimum and zero fixed request fee. No staging global price changed.
The workspace's independent enrollment read returned version zero, platform
pricing and a non-null price identity: no explicit compatibility enrollment was
created. The local account received 1,000,192 nanounits of explicitly noncash
verification credit, and the local restricted key had that exact spending cap.

The first setup observation read enrollment before funding an account on an
installation without a payment gateway. It returned the explicit
`payment_setup_required` response before any inference. Its hosted key was
revoked and returned 401. A fresh isolated run funded the account first.
This was corrected setup ordering, not an inference failure or product defect.

One actual request returned exactly `NATIVE_DEFAULT_031_20261118`, with 44 input
and 47 output tokens. Independent local and hosted inventories each contained
exactly one completed attempt. The calculated token charge was 138 nanounits,
so the configured minimum charged 10,000. Balance and ledger both ended at
990,192 with no held reservations. An independent SQL read confirmed the charge,
token counts, ledger sum and one dispatched attempt. No model request was repeated.
Local and hosted task keys were revoked; direct reuse returned 401.

## Actual backup and independent reconciliation

After local key revocation, the gateway stopped and `pg_dump` created a custom
format archive. `pg_restore` loaded it into a separate database. The same binary
and original runtime configuration started against that restored database.
Actual restored balance and request APIs returned the retained transaction.
The archive is 1,684,176 bytes, SHA-256
`c5a921b373820df9696501ffa50eb61660d4fd3e298c2cb4e91b78a998998c7f`.
It contains private verification configuration and is not a public artifact.

The initial whole-record API comparison stopped because the first request read
preceded asynchronous timing persistence: its timing field was null, while the
restored read contained completed timing. Every other request field matched.
A separate subsequent SQL observer compared the complete charge, balance-entry,
request-timing and key-revocation records in the original and restored databases;
they were identical. Both databases retained one revoked local key. The independent
SQL charge remained 10,000 for 44 input and 47 output tokens; ledger sum remained
990,192. This establishes data preservation for the observed records.

A later API reinspection process lacked the original vendor-encryption key and
was rejected at startup with the explicit credential-decryption error. That
verification tool had not preserved the runtime secret. It did not establish a
product defect, and no database bypass or credential rewrite was used. Subsequent
reconciliation was read-only SQL. This run does not claim a complete portable
configuration-and-secret restore, restored live upstream invocation, or a 401
request after restore. The earlier pre-backup 401 and independently preserved
revocation row are recorded separately.

## Evidence limits

This is current-input default positive pricing through a real upstream, plus
scoped native database backup/restore evidence. It is not merchant payment,
Provider invoice verification, hosted default-price mutation, published package
retrieval, Linux installation or upgrade qualification. Original credentials are
revoked and temporary database services stopped. Remaining case requirements
stay open in Beads. No fixture outcome is used as evidence.
