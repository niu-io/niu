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

This is a requested contract, not an implemented endpoint. Backend ownership
remains with the backend workstream. The frontend must then implement the named
target selection, existing-price editing, conflict reload and saved-history
restoration in Admin, separately from Supplier purchase prices and customer
read-only Rates. Actual ordinary platform-administrator browser qualification
remains pending; the demo account's combined customer/admin access cannot prove
that the platform grant alone permits these reads.
