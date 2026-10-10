# Customer text tariff history

`GET /admin/v1/organizations/{organization}/projects/{project}/billing/tariffs/{model}/history`
reads immutable customer selling-price revisions. It uses the same management
read authorization as workspace billing. The JavaScript SDK exposes
`getCustomerTariffHistory(scope, model, page, options)`.

The response includes `current_revision`, `data`, `has_more` and `next_before`.
Each row contains the model alias, revision, currency, token/cache rates, minimum,
fixed request fee, `created_at` and `is_current`. All amounts are decimal strings.
Token rates are currency nanounits per million tokens; minimum and fixed fees are
currency nanounits per known completed request. Procurement amounts and upstream
credentials are absent. Internal revision UUIDs are cursor/API values, not labels
for product UI. No actor identity is inferred from the existing historical data.

Rows sort by descending `(created_at, revision)`. `limit` defaults to 50 and must
be 1–100. Follow `next_before` as the exclusive `before` cursor. A single SQL
statement observes the scoped tariff, current pointer, cursor and page. Publishing
between pages does not introduce the newer row into the existing continuation;
refresh the first page to see it. This is keyset pagination, not a frozen snapshot
across all page requests. Timestamp/UUID order is not a claim of commit order.

An inaccessible workspace or missing model tariff returns 404. A missing cursor
or one belonging to another model/workspace returns 409. Malformed or unknown
query parameters and invalid limits return 400. Reads neither publish a revision
nor recalculate charges. Migration 0230 adds the scoped chronological index only.

## Current-input verification

The current native gateway reopened an isolated database containing actual model
consumption and price changes. Nine existing revisions were read two at a time
and compared with independently ordered SQL rows, including exact fixed/minimum
amounts. A new revision was published after the first page: continuation returned
exactly the original nine without duplication, while a fresh first page returned
the new current price.

Unknown and foreign-workspace cursors returned 409, a foreign scoped owner was
denied with 404, and invalid pagination/query inputs returned 400. The built SDK
returned the same page as HTTP. Restart retained the page and current pointer;
the four existing actual customer charges remained recorded. This qualifies the
exercised scoped history/read path, not every role, large-history query plan or
frontend interaction.
