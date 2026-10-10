# Frontend customer-pricing administration contract request

Publication authority is now available, but a complete cross-company Admin
selling-price editor cannot yet rely on that grant alone. The existing billing
and tariff-history GET handlers check workspace read scope independently through
`permits_project`. That restriction is appropriate for customer billing and must
not be relaxed to expose balances, statements or request content to a pricing
administrator. An administrator who also has the relevant workspace read grant
can inspect its current tariff; this does not establish global administration.

Before shipping a global customer text-pricing section, provide a platform-only
configuration read contract that discovers named pricing targets and returns
current customer text tariffs and immutable tariff revisions without customer
usage, balances, statements, prompts, credentials or procurement data. Preserve
exact decimal amounts, nullable cached rates, fixed fees, minimum charges,
expected-revision conflicts and explicit pagination. Do not make the frontend
require pasted internal workspace identifiers or copy an installation token.

The first implementation slice is available:
`GET /admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs/{model}/history`
and SDK `getPlatformCustomerTariffHistory`. It uses explicit platform authority,
returns only selling-price revisions with the existing `before` / `limit`
pagination, and sends `Cache-Control: no-store`. Ordinary customer read scope is
not expanded. The generated handler OpenAPI contains its response schema.
Named discovery uses `GET /admin/v1/pricing/targets` (SDK
`listPlatformPricingTargets`). Rows contain `organization_id`,
`organization_name`, `workspace_id` and `workspace_name`; display the names and
retain IDs only for requests. Current prices use
`GET /admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs`
(SDK `listPlatformCustomerTariffs`). Both accept `limit` (1–100, default 50) and
`after`; pass the returned `next_after` unchanged, stopping at null. Targets are
ordered by workspace UUID, prices by model alias. Refresh from the first page
after changes; pages are separate snapshots. A missing cursor returns 409.
Current-price rows include revision, model alias, currency, exact rate strings,
nullable cached rate, fixed fee, minimum charge and creation time. Valid empty
workspaces return an empty page; invalid company/workspace pairs return 404.

These configuration contracts preserve the independent customer read boundary.
The frontend must implement the named
target selection, existing-price editing, conflict reload and saved-history
restoration in Admin, separately from Supplier purchase prices and customer
read-only Rates. Actual ordinary platform-administrator browser qualification
remains pending; the demo account's combined customer/admin access cannot prove
that the platform grant alone permits these reads.
