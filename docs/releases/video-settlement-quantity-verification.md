# Historical video settlement quantity checkpoint

Reviewed 2026-10-07. Customer Billing API/SDK subset; full historical explanation,
rendered diagnosis and live qualification remain open.

Video billing now returns `settled_usage` separately from current `usage`.
For posted charges it contains the immutable receipt's measured quantity,
billable quantity, named meter and Reported provenance. Minimum billable
quantities remain distinct from measured usage. Later conflicting observations
leave current usage unresolved and the reconciliation warning intact, while
preserving the original quantity behind the posted debit.

Before release, the projection recalculates the saved receipt with the pinned
customer pricing snapshot and compares the full receipt and exact charged
amount. Invalid historical evidence fails rather than inventing an explanation.
Unposted liability and owner-funded jobs return no settlement quantity. Receipt
revision IDs, Supplier prices and procurement information are excluded from this
customer projection. No migration or new charge is introduced by the read.

Fresh evidence:

- Twelve PostgreSQL media-job tests passed, including late usage/terminal
  conflicts after settlement and preservation across store reconstruction.
- Five gateway video scenarios passed, including exact measured/billable
  quantities and Reported provenance on a settled customer response.
- All 142 SDK tests passed; exact quantity strings beyond JavaScript's safe
  integer range remain intact.
- Gateway/storage Clippy and dashboard type checking passed. OpenAPI resolves
  163 local references; public-boundary and scoped whitespace checks passed.

The dashboard must still expose these distinctions in its historical charge
explanation. Qualified live generation, full Ledger/Logs/Usage traversal and
packaged lifecycle acceptance remain required.
