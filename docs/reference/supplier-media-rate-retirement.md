# Bounded Supplier media-rate retirement

`POST /admin/v1/providers/{provider}/media-rates/{revision}/retire` is an
installation-administrator operation. It ends a rate's eligibility without
rewriting agreed terms, attempt snapshots or historical obligations. Supplier
members and customer workspace operators cannot invoke it.

The retirement transaction now uses the shared bounded recording initializer:
transaction-local `lock_timeout=250ms` and `statement_timeout=2s` apply before
reading and locking the rate. These bounds cover database waits, not pool
acquisition or the entire HTTP request. Rate identity, effective-time validation,
idempotency and atomic retirement/audit recording are unchanged. The initial
retirement change did not bound publication or replacement; the follow-up below
extends the same initializer to those separate paths.

## Current-input verification (2026-10-12)

An isolated copy of the actual 240-request streaming database used a Supplier
created through its normal administration API. An independent PostgreSQL session
held an exclusive lock on the media-rate table. The previous committed gateway
`35b8045463` left an actual retirement request pending beyond 1.6 seconds; after
releasing the lock it returned the expected 409 for the unconfigured revision.

Clean committed gateway `c397802baea3c0b01ad611e030cd18fdb2c9cb3e` returned a
sanitized 503 in approximately 261 ms while that lock was still held. Releasing
the lock restored the same 409; restarting the Gateway preserved that result.
The binary digest and raw response were retained privately. A separate process
reopened the stopped database and confirmed unchanged rate, retirement, Supplier
audit, attempt and balance-entry counts. No retirement or retirement audit existed
for the selected Supplier. The original 240 customer charges and debits remained,
without open customer reservations or funding receipts.

The same committed binary also completed a new actual personal-account OpenRouter
text request with an internal customer tariff and approved internal credit in a
workspace containing a retained real personal video. Independent raw-response and
database inspection confirmed its exact debit and single invoice entry. Invoice
replay and restart preserved the result; the personal video remained owner-funded
with no customer media charge or new media observation.

This verifies the negative retirement contention boundary and the stated adjacent
text accounting path. It does not qualify successful retirement of a populated
rate, publication/replacement contention, customer-paid media, Supplier earnings
or external settlement. Release compilation and formatting were separate static
checks; no fixture outcome is evidence. Original development data, configuration
and encrypted identity were unchanged.

## Native runtime refresh

The existing native listener was subsequently refreshed to the exact retained
`c397802` binary after a fresh private backup. Restoring that backup into a new
isolated PostgreSQL database reproduced full-row fingerprints for organizations,
workspaces, encrypted vendors, financial entries, video jobs and transport timings.
The previous `35b8045463` binary was retained.

Graceful replacement used the original process environment and port. Readiness
returned 200; configuration and secret-file hashes, vendor ciphertexts/revisions
and durable business counts were unchanged. Authenticated routing status matched
the published configuration. An actual negative retirement request to the updated
listener returned 409 without changing rate, retirement, Supplier audit or balance
entry counts. Schema 278 remained in place. This refresh does not fill the positive
media-rate or commercial accounting verification gaps listed above.

## Publication and replacement contention follow-up

Clean committed gateway `40b5aa49cae5b26a6932bea2090d666642f7b6f1` also applies
the shared bounded initializer to Supplier media-rate publication and replacement.
Replacement still publishes the successor and retires the previous rate in one
transaction. No agreed terms, eligibility rules or qualification requirements are
relaxed.

Two separate current-input native runs used stopped copies of the actual
240-request streaming database and API-created Suppliers. Structurally valid rate
documents named an unconfigured offer/revision; they were negative configuration
inputs, not invented qualified agreements. Independent sessions locked the offer
table for publication and the rate table for replacement. The previous `c397802`
binary left both HTTP requests pending beyond 1.6 seconds until lock release.
The updated binary returned sanitized 503 responses with the locks still held,
in approximately 257 ms and 255 ms respectively. After release, both restored
their expected 409 conflicts, including after restart.

Independent reopening of each stopped database verified unchanged rate,
retirement, Supplier audit, attempt and balance-entry counts. Original customer
charges and debits were retained without open customer holds or funding receipts.
Private artifacts retain raw responses, target binary hashes and observations.
Release compilation and committed-source formatting completed separately.

This qualifies negative publication/replacement lock contention and rollback only.
It does not prove successful publication, replacement of a populated rate or media
financial settlement. These contention checks ran in isolated environments.
No fixture outcome supports these claims.

### Publication/replacement native refresh

The native development listener was subsequently updated to the retained
`40b5aa4` binary. A fresh schema-278 backup restored into a new isolated database
with matching full-row business and encrypted-vendor fingerprints. The previous
`c397802` binary remains retained.

Graceful replacement preserved the original environment, port, configuration and
secret-file hashes, encrypted credential revisions and durable business counts.
Readiness returned 200, authenticated routing matched the published configuration,
and schema 278 remained unchanged. Actual publication and replacement requests
for an unconfigured Supplier/offer returned their expected 409 conflicts with
unchanged rate, retirement, Supplier audit and balance-entry counts. These negative
checks do not establish successful qualified-rate publication or media settlement.
