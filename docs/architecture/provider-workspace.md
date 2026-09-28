# Provider business workspace

Niu's public runtime includes supplier businesses, explicit memberships, versioned model payout offers, an earnings ledger and external payment reconciliation. See [billing](billing.md) for calculation rules and limits.

## Product boundaries

| Area | Audience | Purpose |
| --- | --- | --- |
| Customer workspace | Model consumers | Discover models, use Chat and application keys, review usage and customer invoices |
| Provider workspace | Explicit supplier members | Review earnings, unpaid balances, traffic, model offers and recorded settlements |
| Installation administration | Platform operators | Configure providers, grant supplier membership, agree payout rates, set customer selling rates and reconcile external payments |

An upstream API key is a technical connection, not a supplier business. Developer logos identify model origins, not supplier membership. Customer charges, upstream expenses and supplier earnings are independent ledgers.

Customer onboarding and model discovery do not require provider setup. Upstream connections remain installation-only at the compatible `/workspaces/{workspace}/vendors` route. The Providers rail opens supplier management at `/providers` for installation operators and `/providers/{provider}` for supplier members independently of customer workspace selection.

## Authorization

The session API returns active `provider_memberships`. Ordinary customer owner, admin and viewer roles confer no supplier access. Installation credentials also do not impersonate a supplier; administrators have a separate oversight endpoint.

- A supplier **viewer** can read that supplier's dashboard, offers, earnings and recorded payments.
- A supplier **manager** can additionally pause or resume existing offers. They cannot set their own payout rates or declare themselves paid.
- Only installation administrators can create businesses, grant/revoke memberships, publish agreed payout rates and record completed external settlements.

Every request revalidates credentials and membership. Server queries enforce supplier ownership. Revocation immediately blocks subsequent API reads/writes; the client clears rejected data and refreshes membership discovery. Membership is not inferred from an upstream connection or customer role. Supplier responses exclude customer identities and upstream credentials.

## Offers and earnings

Each model alias can belong to one supplier offer. The offer retains its vendor binding; route changes cannot silently transfer earnings. New requests pin immutable rate revisions before dispatch. Paused, changed or mismatched offers fail admission. Already dispatched work retains its agreed rate.

The dashboard supports 7, 30 and 90 day views, per-currency balances, verified usage, unresolved requests, current offers, consumption and earnings grouped by model and agreed rate in the period, and the latest 100 recorded settlements. Balances include the full ledger, not just the displayed rows. Rates are explicit per offer, with no assumed platform fee or customer-revenue percentage.

A settlement records a completed external payment against an exact set of earned requests. It derives the amount from those entries, requires one currency and prevents settling an entry twice. It does not execute a bank transfer. There is no automatic payout schedule, bank-account onboarding, reserve policy, tax calculation or dispute workflow in this version.

## Ownership

These features ship in the public Niu repository and work without private source. The hosted distribution can compose payment adapters under the same `niu.io` domain. Follow [repository ownership](repository-ownership.md); public billing must not depend on the marketing repository or enterprise implementation.

## Consumer and supplier isolation

The **Providers** rail destination is the supplier interface. Its navigation and account menu contain no customer organizations, workspaces, tasks, application keys or consumer usage links. Suppliers see only their model offers, aggregate consumption, earnings and settlement records. The supplier dashboard API omits raw gateway request identifiers; request-level settlement reconciliation is available only to installation administrators.

The consumer workspace has **Usage** (request counts, tokens and timing) and **Billing** (customer charges and invoices). Upstream costs and cost budgets remain installation-only accounting APIs, not consumer or supplier navigation. The single Providers entry at the bottom of the rail owns provider configuration, model offers, consumption and earnings, access, and settlements. Provider configuration lives at `/providers/configuration`; the former workspace vendors route redirects there. Configuration and supplier business share the zone sidebar, while their API permissions remain separate. Consumers cannot call the upstream cost/budget APIs or inspect wholesale cost evidence in request or execution reports. An identity may hold independently granted consumer and supplier permissions; membership in one does not grant the other.

### Provider zone navigation

The Providers rail opens a dedicated zone with its own persistent, responsive sidebar. Supplier pages have addressable routes: overview at `/providers/{provider}`, model offers at `/providers/{provider}/models`, consumption and earnings at `/providers/{provider}/consumption`, and settlements at `/providers/{provider}/settlements`. Navigation is route-based and survives refresh, browser history and direct links. The zone does not use the consumer workspace sidebar.
