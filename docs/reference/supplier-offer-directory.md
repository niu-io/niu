# Current Supplier offer directory

`GET /admin/v1/providers/{provider}/offers` pages the current offers of one
Supplier. Platform administration or explicit active membership of that Supplier
is required. Company membership alone grants no access. Missing or unauthorized
Suppliers return 404. Every response is `no-store`.

Use `limit` from 1 to 100 (default 100), and pass the prior `next_after` as `after`.
The response contains `data` and nullable `next_after`. Ordering is ascending
canonical model alias, scoped to the Supplier. Missing or foreign cursor aliases
return 409; invalid limits or unknown parameters return 400. A page uses one SQL
statement snapshot for cursor validation, current revisions and its bounded
lookahead. Migration 0242 adds a Supplier/alias index. There is no offset or total
history cap. Separate pages are not a frozen multi-request snapshot; restart at
the first page to discover inserts before the current cursor.

Each record has `id`, `model_alias`, `revision`, `active`, `qualified`,
`route_ready`, `rate_kind`, `currency`, `prompt_rate`, `completion_rate` and
`cached_prompt_rate`. Rates are exact decimal integer strings or null. Text rates
are currency nanounits per million tokens; media offers use separate rate cards
and leave these text-price fields null. Records may be paused or unqualified;
listing a draft does not establish commercial supply or enable paid inference.
The response contains no customer, workspace, request, credential or endpoint
information. IDs are routing references, not UI labels.

The existing dashboard still returns at most 1000 current offers, with the new
`offers_has_more` boolean identifying a truncated preview. It uses the same SQL
projection on its existing repeatable-read transaction. Its other aggregate and
history contracts are unchanged. The page API must be used for a complete offer
directory rather than treating the preview as complete.

The JavaScript SDK exposes `listSupplierOffersPage(supplierId, { after, limit })`.
Existing `listSupplierOffers(supplierId)` now follows all pages automatically and
retains its array return type. It supports cancellation between requests and does
not convert failed pages into partial success. It requires a server exposing the
new GET operation; it does not fall back to an incomplete dashboard preview.

## Current-input verification — 2026-10-11

Normal APIs on a fresh isolated native gateway/PostgreSQL database created 1005
model mappings and explicit internal draft rate revisions under one Supplier.
The configured credential stayed disabled, all offers remained unqualified and
inactive, and no upstream inference or commercial qualification was claimed.

After the first page, another API publication inserted an alias before its cursor.
The remaining pages traversed exactly the 1005 original offers without duplicates
or omissions. A fresh built-SDK traversal returned all 1006 offers. Every captured
revision, currency and rate matched its actual publication; active, qualified and
route-ready values were false. The management dashboard retained 1000 entries and
reported `offers_has_more: true`.

Invalid limits, unknown query fields, missing and foreign cursors were rejected.
An operator without Supplier membership could not read the page; the Supplier
member could not read a different Supplier. The complete SDK result was identical
after restart. Membership deactivation denied further reads, and operator
revocation returned 401. A separate process reopened the stopped database and
matched all 1006 current draft revisions and amounts against the HTTP/SDK artifacts,
checked the valid directory index and confirmed no attempts, earnings, settlements
or customer balance entries existed.

Release compilation, Clippy, SDK compilation and generated-contract checks
completed. The docs build and served generated reference were checked separately.
Fixture outcomes were not used. This evidence qualifies current text-draft offer
traversal and authorization, not qualified commercial supply, nonempty Supplier
settlements, media-price traversal, frontend display or maximum directory capacity.
