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
