# Supplier offer history

`GET /admin/v1/providers/{provider}/offers/{offer}/revisions` lists immutable
procurement quotes for one Supplier offer. Installation administrators and active
members of that Supplier may read it. Company/workspace ownership alone grants
no access. Procurement prices must remain outside customer workspace pages and
billing APIs. Reading history never activates, qualifies or reprices an offer.

Use `limit` from 1 to 100 (default 50) and pass `next_before` as `before` while
`has_more` is true. Unknown query fields are rejected. Rows are ordered by
`created_at` and revision UUID descending, with an exclusive cursor. This is
creation-time ordering, not transaction commit order. A single SQL statement
keeps each page and its `current_revision` pointer coherent; separate pages do
not share a database snapshot. Refresh the first page to see new publications.

The response contains `current_revision`, `data`, `has_more` and `next_before`.
Each entry has the individual quote fields plus `is_current`. Text rates are
exact integer strings in currency nanounits per million tokens. A nullable cached
rate means flat input pricing. Media quote text rates and currency are null;
media purchase cards remain in the separate rate-card API. No credentials,
endpoints or customer prices are returned. Internal identifiers are references
for API calls and must not become UI labels.

Missing or inaccessible Supplier/offer identities return 404. A cursor absent
from this exact offer returns 409, even if it exists for a different offer.
Invalid limits or malformed inputs return 400. The JavaScript SDK method is
`listSupplierOfferHistory(supplierId, offerId, { before, limit })`, returning
`SupplierOfferHistory`. Individual quotes remain readable through
`getSupplierOfferRevision`.

The additive database index supports Supplier-offer filtering and reverse-time
cursor traversal. It does not change saved rates, qualification or financial
records. Actual workflow verification is recorded separately from compilation.

## Current-input verification

An isolated native run created an unconnected Supplier credential/model and
published seven real configuration revisions through HTTP, including flat and
separate cached prices. Reading two rows per page, then publishing an eighth
revision between pages, preserved the original seven-row continuation without
duplicates. A fresh first page returned the new current revision. Every entry
matched the individual quote API and independent SQL prices.

Unknown and foreign-offer cursors returned 409. Invalid limits and unknown query
fields returned 400. Company owner/viewer credentials were denied; an explicitly
granted Supplier viewer read the same page as installation administration, and
revoking membership denied that read again. Temporary credentials were revoked.
The built SDK returned the same page, and restarting the gateway preserved it.

Independent verification reopened the stopped PostgreSQL database and compared
the saved HTTP artifacts with all eight target revisions and their exact rates.
The new index was present; no inference attempts, Supplier earnings or customer
ledger entries existed, and offers remained inactive. This qualifies text quote
configuration/history and these reader boundaries. Media quote history, large
histories, query-plan performance and frontend interaction remain unverified.
