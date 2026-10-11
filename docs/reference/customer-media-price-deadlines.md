# Customer media-price transaction deadlines

Customer media-price publication, replacement and retirement now share the bounded
recording initializer used by billing and Supplier media prices. Transaction-local
`lock_timeout=250ms` and `statement_timeout=2s` apply before domain queries.
They bound database waits, not pool acquisition or the whole HTTP request.
Replacement remains atomic, and existing identity, qualification, immutable-history
and overlap checks are unchanged.

The affected installation-administrator endpoints are:

- `POST /admin/v1/organizations/{organization}/billing/media-rates`
- `POST /admin/v1/organizations/{organization}/billing/media-rates/replace`
- `POST /admin/v1/organizations/{organization}/billing/media-rates/{revision}/retire`

## Current-input verification (2026-10-12)

Three separate native runs copied the stopped database from 240 actual streaming
model requests. Normal APIs created an organization in each copy. Structurally
valid negative inputs named unconfigured vendor/rate identities; they did not
invent qualified rates or permission to dispatch paid media.

An independent PostgreSQL session locked the vendor table for publication and
the customer media-rate table for replacement and retirement. Previous committed
gateway `40b5aa4` left each HTTP request pending beyond 1.6 seconds until release.
Clean committed gateway `ef77d30ea1f4084c10d89f6716431df18be6db1c` returned a
sanitized 503 with the locks still held, in approximately 256 ms for each path.
After release, all three restored their expected 409 conflicts. Gateway restart
preserved the conflicts and unchanged record counts.

A separate process reopened each stopped database and verified unchanged customer
rate, retirement, billing-audit, attempt and balance-entry counts. All original
240 charges and debits remained, with no open customer holds or funding receipts.
Private artifacts retain responses, binary hashes and observations. The original
development database, configuration and encrypted identity were unchanged.

This verifies negative configuration contention and rollback, not successful
qualified-rate publication, populated replacement, customer-paid media or external
settlement. Release compilation is a separate static check. No fixture outcome is
evidence.

## Native runtime refresh

The existing development listener was subsequently updated to the exact retained
`ef77d30` binary. A fresh schema-278 backup restored into a new isolated database
with matching full-row fingerprints for organizations, workspaces, encrypted
vendors, financial entries, video jobs and transport timings. The previous
`40b5aa4` binary remains retained.

Graceful replacement preserved the original environment, port, configuration and
secret-file hashes, encrypted credential revisions and durable business counts.
Readiness returned 200; authenticated routing matched the published configuration;
schema 278 remained unchanged. Three actual requests to the updated customer
media-price endpoints returned expected 409 conflicts for unconfigured identities.
Rate, retirement, billing-audit and balance-entry counts were unchanged. This
refresh does not establish positive paid-media acceptance.
