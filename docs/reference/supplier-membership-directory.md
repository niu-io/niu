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

## Concurrent membership grant and Supplier deletion

The deletion API rejects a Supplier with any retained membership, while grant
and deletion both lock the Supplier row. A fresh native current-input run sent
16 concurrent grant/delete pairs through the normal APIs against newly created
Supplier records. Three grants won and thirteen deletions won; every pair had
exactly one successful mutation and one HTTP 409. A successful grant allowed its
member dashboard, while a successfully deleted Supplier returned 404 to that
operator. The installation directory retained only live Suppliers with the
correct member count.

Gateway restart preserved the directory and absence of memberships on deleted
Suppliers. Independent reopening checked every saved HTTP outcome against the
Supplier and membership rows, including both observed race orderings. No model
credentials, qualification records, inference attempts or financial entries were
created. This validates the exercised lifecycle race; no authorization relaxation
or speculative code change was needed. It does not cover every concurrent
Supplier lifecycle operation or frontend state management.


## Platform membership administration SDK

The JavaScript client exports `SupplierMember`, `SupplierMemberUpdate`,
`listSupplierMembers(supplierId)` and
`setSupplierMember(supplierId, operatorId, { role, active })`. These use the
existing provider-named GET/PUT routes and require platform administration.
A Supplier manager cannot use them to grant access or inspect platform member
history. `listSupplierMemberships()` remains the separately authorized current
operator's active Supplier directory.

Member history includes inactive and revoked operators. Its `active` field
reflects both the saved membership and operator revocation; `revoked` describes
the operator. Revoking an operator does not erase the retained membership or its
audit events. Membership roles remain `viewer` and `manager`, independently of
customer workspace roles and platform configuration authority.

Current-input SDK verification, reviewed 2026-10-12, created two Supplier
identities in an isolated copy of actual request accounting. The installation
credential granted viewer access, changed it to manager, disabled it, then
restored viewer access. The member's own membership directory reflected each
state; platform-only member-list, grant and Supplier-profile operations remained
forbidden. The unrelated Supplier acquired no membership. Restart retained the
restored grant. Revoking the operator made its subsequent membership read return
401 and its platform member-history row report inactive/revoked.

Independent reopening matched all four member-change audit actions, the retained
membership and operator revocation, and the unrelated Supplier's empty membership
state. Existing customer records remained present, with no new funding or
Supplier earning. Tested SDK source hashes matched the staged additions, built
separately from unrelated shared-worktree edits. No fixture outcome is evidence.
This covers the exercised membership lifecycle and boundaries; it does not
qualify every concurrent grant/revocation race or rendered frontend behavior.


## Atomic membership recording under contention

Reviewed 2026-10-12 on clean committed `039960a`. Member grants, role changes and
revocation now use the existing bounded recording transaction. Individual lock
waits are limited to 250 ms and individual statements to 2 seconds; pool
acquisition and whole HTTP duration are not bounded by this helper. Supplier and
operator row locks, role validation and the membership/audit commit remain in
the existing caller.

An isolated current-input API run held a Supplier row lock while attempting a
viewer grant to an actual company operator. Previously the request remained
pending until the lock was released after 1.6 seconds. With the committed change,
it returned HTTP 503 in about 264 ms while the lock remained held. Neither a
membership nor its audit record was inserted. Release and retry created the
viewer grant and exactly one audit event.

A temporary database trigger then delayed only the membership audit insert,
after the membership update executed. The statement timeout returned HTTP 503
and rolled back the attempted manager/inactive change; the viewer grant stayed
active with its original audit count. Removing the fault and retrying succeeded.
Restart retained the inactive manager record. Independent database reopening
matched its role/state and exactly the two successful member-change audits,
confirmed both timeout diagnostics and removal of the fault, and checked the
temporary operator's revocation. Existing customer charges remained present;
no Supplier earning or funding was fabricated. No fixture outcome is evidence.

Membership updates are ordinary writes, not idempotency-key operations: another
accepted repeat write can add another audit event. This checkpoint does not
qualify every concurrent grant/revocation race or uncertain commit outcome.
