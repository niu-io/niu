# Supplier membership directory

`GET /admin/v1/provider-memberships` returns the signed-in operator's complete
active Supplier memberships as `{ data: [{ id, name, role }] }`. Roles are
`manager` or `viewer`. Only explicit Supplier memberships are included; company
membership alone grants no Supplier access. Installation sessions return an empty
array because platform authority is separate from Supplier membership.

The existing non-paginated compatibility contract keeps its response shape and
orders results by Supplier name, then internal routing ID. It no longer silently
stops at 100 records. Revoked operators, inactive memberships and deleted Suppliers
are excluded. The response uses `Cache-Control: no-store`; authorization is checked
on every request. IDs remain API routing references and must not become UI labels.

Use `NiuAdminClient.listSupplierMemberships()` in the JavaScript SDK. The handler
annotation supplies the generated OpenAPI contract and docs reference; the root
and Supplier-specific specifications reference that same operation. This is the
Supplier-member portal directory, not a new Members page in platform purchasing.
The installation Supplier directory remains a separate endpoint.

## Current-input verification — 2026-10-11

A fresh isolated native gateway/PostgreSQL run created 106 Supplier records and
106 explicit alternating viewer/manager grants through the normal APIs. HTTP and
the built SDK returned all 106 names, routing references and roles in order. The
installation session and a second company operator with no Supplier grants both
received empty membership arrays. The response carried `no-store`.

Deactivating the 106th membership removed it from the directory and denied its
Supplier dashboard. The remaining 105 grants were identical after gateway
restart. Revoking the operator rejected the next directory request with HTTP 401.
A separate verifier reopened the stopped database and matched all 106 recorded
names and roles, the one inactive grant, operator revocation and absence of grants
for the second operator. No attempts, earnings, settlements or customer balance
entries were created. Existing runtime configuration and data were not replaced.

Release compilation, Clippy, SDK compilation and generated-contract checks
completed. The built docs site returned the matching generated JSON and operation
reference. Fixture outcomes were not used. This verifies the membership-directory
workflow, not the complete Supplier business lifecycle, frontend navigation or
large-directory throughput. A future paginated contract must expose continuation
explicitly rather than silently truncating this compatibility response.

## Installation directory member counts

The installation Supplier directory (`GET /admin/v1/providers`) now counts only
active memberships whose operator has not been revoked. It uses the same
effective revocation rule as member detail; historical membership rows are kept.
No response fields or permission rules change.

An actual isolated native/API run reproduced the previous discrepancy: after
revoking an operator, member detail returned `active: false, revoked: true` but
the Supplier directory still counted one member. On the updated binary, normal
API creation/grant/deactivation/regrant/revocation produced the expected zero/one
counts, and revocation reduced the directory count to zero. The revoked token
returned 401; a live Supplier member could not read the platform member list.
Process replacement preserved the correct count and member history.

Independent reopening of the stopped database confirmed the retained grant,
revoked operator, zero effective members and absent inference/financial entries.
The existing native service was replaced with configuration, encrypted identity
and durable business counts preserved. Build and static checks completed; fixture
outcomes were not used. This verifies directory/member lifecycle consistency,
not Supplier commercial qualification or earnings settlement.
