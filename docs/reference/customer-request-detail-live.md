# Customer request detail: current persisted diagnostics

## Integration contract

`GET /admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}`
requires workspace read permission and returns `{ "data": ... }` with
`Cache-Control: no-store`. The legacy path parameter `project` identifies a
workspace. See the [request OpenAPI contract](../../contracts/request-observability.openapi.yaml)
for fields and authorization/error responses. Internal identifiers are API
correlation values, not product display labels.

The endpoint reads persisted request metadata, observed usage, customer charges,
timing and safe failure classification. It does not contact the upstream or
change billing. Payload content is a separate authorized endpoint; missing or
expired payloads must not erase metadata. Customer charge fields never substitute
Supplier procurement cost. Missing finish reasons, usage and amounts remain null.
Delivery status and upstream execution confirmation have different meanings.

## Current-input verification — 2026-10-12

Digest-verified clean implementation `a5f2f3b` served an isolated stopped-database
copy of the current [1,600 actual-stream dataset](two-gateway-text-load.md).
An ordinary workspace viewer fetched every request detail through eight client
workers. All 1,600 responses matched their list rows. Independent reopening
hashed every retained detail response, re-parsed the original SSEs and matched
native finish reasons, token quantities, stored phase timing and exact customer
charges to PostgreSQL. Original-rate charges and matching account debits totaled
26,879,148 USD nanounits. No additional attempt or financial entry was created.

All checked details had completed HTTP 200 delivery, confirmed execution and
native terminal finish observations. Responses omitted prompt/response content
and the checked procurement/credential fields. A foreign-workspace viewer was
denied detail access; a revoked reader received 401. Restart preserved the full
summary and byte-identical CSV, and 16 detail samples retained identical content.
This is not a claim that all 1,600 details were read again after restart.

A second stopped copy retained two actual upstream HTTP 401 refusals from the
failure-recording contention workflow. The same current executable served both
list and detail to an ordinary company viewer. One attempt retained execution
uncertainty, a pending customer charge and null failure classification because
its failure-recording transaction had not committed. The other had durable
confirmed nonexecution, `not_charged`, and an `upstream_http_error` classification
with upstream HTTP 401. Both retained complete HTTP 401 delivery timing and null
usage, finish reasons and customer amount. CSV quantities/amounts remained blank.

Independent reopening matched both detail responses to native timing, actual
saved refusal artifacts and retained liability states. No customer charge,
account debit or funding receipt existed; the unresolved attempt's holds remained
unresolved. Restart preserved both details/list/export; foreign-company readers
were denied each detail and reader revocation returned 401. This read verification
did not generate new upstream failures or reinterpret the original uncertainty.

## Qualification limits

These runs verify metadata/detail consistency and authorization for the stated
successful and refused histories. They do not qualify browser presentation,
payload lifecycle, every error/protocol, concurrent settlement updates, arbitrary
scale or sustained detail throughput. Saved personal upstream access and approved
internal credit are separate from commercial supply and received cash. Fixture
outcomes supply no evidence. The original installation, identity and source
artifacts remained unchanged.
