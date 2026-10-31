# Provider administration and access

Current product direction, clarified 2026-10-31; implementation and verification
are tracked in `niu-3b1`.

## Current audience

Provider supply, procurement, financial records, settlements and statistics are
managed by platform administrators. There is no Provider login role or external
Provider portal in the current product. A future restricted finance/statistics
portal is a possible capability, not implemented or authorized by this direction.
Administrators can prepare billing information for a Provider externally when
needed; exporting information and sending it remain separate authorized actions.
This change does not introduce a new exporter or automatically send bills.

Customer workspaces expose the customer's model access, requests and charges.
Provider purchase prices, upstream expenses, procurement budgets and platform
margins remain confidential platform information. Neither a customer workspace
role nor a retained Provider membership grants access to these records.

## Roles and browser access

An account with explicit platform eligibility can select **User** or **Platform
administrator** in its account menu. A password sign-in starts in User mode.
The server returns available roles and effective authority and saves selection
in the durable session. Workspace Owner/Admin/Viewer permissions remain scoped
to their existing organization and workspace; they are not platform identities.
See [upstream vendor management](vendors.md) for activation, expiry and explicit
grant contracts.

Only active platform administration exposes the Admin navigation and Provider
management. Retained `/providers/{provider}` and `/suppliers/{provider}` browser
bookmarks redirect to their administration equivalents, where the normal platform
authorization boundary applies. There is no membership-based rail or account-menu
entrance. Provider API reads independently require platform administration,
including dashboard, quote, rate and settlement compatibility endpoints.

`provider_memberships` in session identity is retained as an empty compatibility
field. The old membership directory is restricted to platform administration and
returns an empty directory. Stored historical membership rows, foreign keys and
audit history remain intact; they do not enable login, data access or a new role.

## Business, configuration and financial boundaries

An upstream API credential is a technical connection, separate from its Provider
business. A business can own multiple credentials, model mappings, agreed text
and media offers, qualification reviews, earnings and settlement records.
Credential presence is not sellable supply: current qualifications, offers,
rates, enabled routes and credential readiness must be checked independently.
Customer selling tariffs and authorization remain workspace-specific.

The administration directory aggregates configuration and offer counts without
claiming upstream verification. Personal owner-funded routes remain distinct
from commercially qualified supply. Procurement positions compare pinned
customer charges, Provider payables, settlement links and known upstream costs;
missing evidence remains unknown, and charges are not merchant cash receipts.
See [billing](billing.md) and [Provider integrations](provider-integrations.md).

## Explicit configuration ownership

Installation administration reads or establishes ownership with `GET` and `PUT
`/admin/v1/vendors/{id}/supplier`. The write accepts `supplier_id` and
`expected_revision`; it advances the configuration revision and records audit
atomically. Repeating the same association is idempotent; changing the business,
using a stale revision or conflicting with an existing offer is rejected.
Names never infer ownership, qualification or commercial terms. Filtering
`/admin/v1/vendors?supplier=...` returns only explicitly associated configurations.

`POST /admin/v1/vendors` with `create_supplier: true` can atomically create the
Provider business, encrypted credential configuration, ownership and audit.
Omission retains configuration-only behavior. Saved credentials remain write-only.
Historical supplier-named API fields and storage contracts remain compatible;
**Provider** is the product term.
