# Upstream cost recovery candidate paging

Upstream cost recovery now traverses at most 100 held procurement reservations
before checking execution and usage. It uses the pending-reservation partial
index introduced in migration 265. Settled and released reservations are excluded
from the candidate page. Unknown or in-flight attempts advance traversal without
being treated as eligible settlement or release work.

Eligibility is unchanged: a confirmed non-executed attempt can release its
reservation; a confirmed completed attempt with provider-reported usage can enter
the existing cost settlement function. That function remains responsible for
validating the actual accounting inputs.

All six financial recovery stages now return the same four fields: attempt,
organization, workspace and eligibility. The worker no longer adapts an exceptional
three-column query. Cursor advancement, per-row savepoints, ownership and
connection handling are shared; this does not make their business acceptance
evidence interchangeable.

## Current-input verification — 2026-10-11

An isolated copy of retained actual development history contained settled
procurement reservations and no held procurement candidates. Both old and new
queries returned no work. The rebuilt native worker advanced its durable stage
timestamp, and restart preserved exact reservation, attempt and customer ledger
records. An independent process reopened the stopped database and checked those
records, the query hash, saved plans, worker progress and valid partial index.

The binary included shared working-tree changes. Format, compilation and Clippy
completed separately; fixture outcomes are not evidence. This verifies the empty
pending sweep over retained history. The nonempty release case below adds a
separate boundary; Supplier earnings and sustained capacity remain unverified.
The [101-admission checkpoint](balance-release-recovery-paging.md#actual-1001-pending-reservation-traversal)
separately verifies exact 100+1 procurement candidate pages and durable cursor wrap
while preserving unknown liabilities. No new commercial qualification, upstream expense or
customer charge is inferred.

## Independent release failures with actual upstream rejection

A new request under explicit internal verification rates received an actual
OpenRouter 401 and the supported text nonexecution classification. A temporary
trigger blocked procurement reservation release. The customer reservation still
released, while the procurement reservation remained held across Gateway restart.
After revoking the key and removing the fault, the paged worker released that
reservation and reduced reserved procurement budget by its exact original amount.
Another restart preserved the released state and unchanged customer ledger.

Independent database reopening checked the actual 401 record, nonexecution,
reservation amount/state, exact budget decrement, released customer reservation,
revoked key, single attempt and removed trigger. No customer charge was created.
A reciprocal actual-request run blocked customer release and confirmed procurement
release still completed while the customer hold remained; removing that fault
then allowed customer recovery without a ledger debit.

These isolated runs establish independent recovery for this explicit authentication
rejection policy. They do not generalize nonexecution to arbitrary errors or
qualify commercial Supplier earnings. Positive cost recovery is covered separately
below.

## Actual completed request recovered after a cost-write fault

A new real OpenRouter completion returned its fresh marker and reported usage.
Two isolated Gateways retained that response while a temporary trigger blocked
cost-entry insertion. Procurement remained held across restart. A separate fault
left the customer cache-write category unknown, so no customer charge could be
created and its customer reservation remained held.

Removing only the cost-write fault allowed the paged procurement worker to settle
the saved reported usage, while the unknown customer category still prevented
customer charging. After removing the category fault and supplementing only the
categories from the saved actual response, customer settlement produced one exact
charge and debit and released its reservation. Repeated supplementation and
restart did not change the customer ledger.

Independent reopening reconciled the new response and the retained prior real
request against their immutable procurement rates and customer tariffs. Each cost
entry's amounts and token counts matched independent integer calculations;
procurement budget spent equaled their sum, reserved budget was zero, and both
cost reservations were settled. Customer debits, restored categories, released
customer holds, response hashes and removed fault triggers were checked
separately. The new run pins its shared-working-tree binary hash privately.

This establishes a populated cost-recovery case using explicit internal
verification rates, not an external Supplier invoice, paid top-up or Supplier
earning/settlement agreement. Two final accounting rows include one retained prior
request and one new generation; they are not a concurrent load qualification.
