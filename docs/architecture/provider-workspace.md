# Supplier business workspace

Niu's public runtime includes supplier businesses, explicit memberships, versioned model payout offers, an earnings ledger and external payment reconciliation. See [billing](billing.md) for calculation rules and limits.

## Product boundaries

| Area | Audience | Purpose |
| --- | --- | --- |
| Customer workspace | Model consumers | Discover models, use Chat and application keys, review usage and customer invoices |
| Supplier workspace | Explicit supplier members | Review earnings, unpaid balances, traffic, model offers and recorded settlements |
| Installation administration | Platform operators | Configure providers, grant supplier membership, agree payout rates, set customer selling rates and reconcile external payments |

An upstream API key is a technical connection, not a supplier business. Developer logos identify model origins, not supplier membership. Customer charges, upstream expenses and supplier earnings are independent ledgers.

Customer onboarding and model discovery do not require provider setup. Upstream connections remain installation-only at the compatible `/workspaces/{workspace}/vendors` route. The Suppliers rail opens supplier management at `/providers` for installation operators and `/providers/{provider}` for supplier members independently of customer workspace selection.

## Authorization

The session API returns active `provider_memberships`. Ordinary customer owner, admin and viewer roles confer no supplier access. Installation credentials also do not impersonate a supplier; administrators have a separate oversight endpoint.

- A supplier **viewer** can read that supplier's dashboard, offers, earnings and recorded payments.
- A supplier **manager** can additionally pause or resume existing offers. They cannot set their own payout rates or declare themselves paid.
- Only installation administrators can create businesses, grant/revoke memberships, publish agreed payout rates and record completed external settlements.

Every request revalidates credentials and membership. Server queries enforce supplier ownership. Revocation immediately blocks subsequent API reads/writes; the client clears rejected data and refreshes membership discovery. Membership is not inferred from an upstream connection or customer role. Supplier responses exclude customer identities and upstream credentials.

## Offers and earnings

Each model alias can belong to one supplier offer. The offer retains its vendor binding; route changes cannot silently transfer earnings. New requests pin immutable rate revisions before dispatch. Paused, changed or mismatched offers fail admission. Already dispatched work retains its agreed rate.

Supplier qualification is a separate, installation-administered gate. Businesses and offers start unqualified; the qualification migration disables existing offers. An installation operator records SHA-256 fingerprints for the Supplier's supply-rights, supply-capability and data-handling evidence, then records per-rate-revision fingerprints for model identity, a versioned protocol test matrix, data handling, availability and agreed rates. Review records have an explicit expiry and can be revoked. A rate change invalidates the prior offer review. Database triggers and both priced and unpriced dispatch paths reject offers that are inactive, expired, revoked, tied to an old rate revision, or missing either review level.

`PUT /admin/v1/providers/{provider}/qualification` records the Supplier-level review. `PUT /admin/v1/providers/{provider}/offers/{offer}/qualification` records model- and rate-specific review and requires the current rate revision. Installation-only `POST .../qualification/revoke` routes revoke the latest Supplier or offer review and pause the affected offers. The API accepts lowercase SHA-256 fingerprints, not procurement documents; retain the original evidence in the platform's confidential procurement system. Qualification status is returned without evidence fingerprints. These APIs record an administrator's review; they do not independently authenticate the documents or prove the Supplier's assertions.

The installation-only Suppliers dashboard provides the qualification review workflow. It accepts fingerprints and review expiry dates, shows current Supplier and offer status, and lets installation administrators revoke reviews; it does not collect procurement documents. No discount comparison is published by these records: any future customer-price claim still needs a current, model-specific public-price baseline and matching conditions. OpenRouter catalog presence or model-check success alone is not evidence of resale rights, protocol qualification, discounted pricing or equivalence.

The dashboard supports 7, 30 and 90 day views, per-currency balances, verified usage, unresolved requests, current offers, consumption and earnings grouped by model and agreed rate in the period, and the latest 100 recorded settlements. Balances include the full ledger, not just the displayed rows. Rates are explicit per offer, with no assumed platform fee or customer-revenue percentage.

A settlement records a completed external payment against an exact set of earned requests. It derives the amount from those entries, requires one currency and prevents settling an entry twice. It does not execute a bank transfer. There is no automatic payout schedule, bank-account onboarding, reserve policy, tax calculation or dispute workflow in this version.

## Ownership

These features ship in the public Niu repository and work without private source. The hosted distribution can compose payment adapters under the same `niu.io` domain. Follow [repository ownership](repository-ownership.md); public billing must not depend on the marketing repository or enterprise implementation.

## Consumer and supplier isolation

The **Suppliers** rail destination is the supplier interface. Its navigation and account menu contain no customer organizations, workspaces, tasks, application keys or consumer usage links. Suppliers see only their model offers, aggregate consumption, earnings and settlement records. The supplier dashboard API omits raw gateway request identifiers; request-level settlement reconciliation is available only to installation administrators.

The consumer workspace has **Usage** (request counts, tokens and timing) and **Billing** (customer charges and invoices). Upstream costs and cost budgets remain installation-only accounting APIs, not consumer or supplier navigation. The single Suppliers entry at the bottom of the rail owns provider configuration, model offers, consumption and earnings, access, and settlements. Supplier configuration lives at `/suppliers`; the former workspace vendors route redirects there. Configuration and supplier business share the zone sidebar, while their API permissions remain separate. Consumers cannot call the upstream cost/budget APIs or inspect wholesale cost evidence in request or execution reports. An identity may hold independently granted consumer and supplier permissions; membership in one does not grant the other.

### Supplier zone navigation

The Suppliers rail opens a dedicated zone with its own persistent, responsive sidebar. Supplier pages have addressable routes: overview at `/suppliers/{provider}`, model offers at `/suppliers/{provider}/models`, consumption and earnings at `/suppliers/{provider}/consumption`, and settlements at `/suppliers/{provider}/settlements`. Navigation is route-based and survives refresh, browser history and direct links. The zone does not use the consumer workspace sidebar.

## Product terminology

Use **Supplier** for the business supplying model access, model offers, earnings, membership and settlements. OpenRouter and OpenAI are labeled **Suppliers** in the product. Provider remains an internal adapter/API compatibility term, not a separate navigation feature. Existing `/providers` routes, API fields and storage identifiers remain compatibility names; translate business-facing labels to Supplier.


## Supplier selection

The supplier sidebar owns the switcher, including when only one supplier exists. OpenRouter is one supplier, not a fixed navigation item. Installation business pages carry selection in the `supplier` query parameter; member pages use the authorized supplier route ID. Add supplier is available from the switcher.

Backend integration is incomplete: an installation-only ownership association now explicitly links configured upstream APIs to Supplier businesses. Existing configurations remain unassociated until an administrator chooses a business; names never infer ownership or a fallback. The compatibility directory is installation-wide when no Supplier filter is supplied. A Supplier query scopes it to explicitly owned configurations; unknown businesses return an empty result rather than unrelated configurations. Complete the remaining creation and navigation integration before describing every Supplier workflow as qualified.


## Purchasing-side navigation

The installation Suppliers area manages businesses Niu buys model access from. Its sidebar is Overview, Models & pricing, Usage and Billing. Endpoint and credential fields belong in New supplier and Supplier properties dialogs in the switcher menu, not a standalone API access/configuration page. Supplier Properties loads the explicitly owned configuration and saves endpoint changes and optional credential replacement using its current revision. A blank replacement field preserves the stored credential. Multiple configurations require choosing the intended API on the Suppliers page; the dialog never chooses an arbitrary one.

There is no Members page in this purchasing workflow. Consumer model entitlements and budgets belong to workspace configuration; API keys inherit workspace model access by default, with optional tighter restrictions. Existing supplier-member APIs serve a separate authorized supplier portal and must not be mistaken for consumer access or deleted by a navigation change.

## Explicit configuration ownership

Installation administration can read or establish configuration ownership using `GET` and `PUT /admin/v1/vendors/{id}/supplier`. The write body is `{ "supplier_id": "<business-id>", "expected_revision": 1 }`. Association advances the configuration revision and writes an audit event atomically. Retrying the same association is idempotent; selecting a different business conflicts. Invalid business/configuration references and stale revisions fail without partial changes. The read returns only business identity and name, with no credentials or procurement values. Customer inference keys cannot access either operation.

This association neither creates a business nor qualifies its offers, rates or supply rights. It is a backend foundation: the configuration switcher and business pages still require UI integration and scoped reads/writes before the commercial journey is complete.

Ownership also constrains agreed offers: association refuses any existing offer bound to the configuration under a different business, and offer publication refuses a different business once ownership is established. Configuration row locks serialize these operations. Legacy unassociated configurations still require explicit reconciliation; this guard does not manufacture ownership or qualify an offer.

The installation configuration listing accepts `GET /admin/v1/vendors?supplier=<business-id>` to return only explicitly associated configurations. Unassociated records and other businesses' configurations are excluded; omitting the filter retains the installation-wide compatibility listing. Filtering does not grant Supplier members access to API credentials or installation configuration management.


## Atomic Supplier creation

Installation administrators may opt into business creation with `create_supplier: true` on `POST /admin/v1/vendors`. The business name, encrypted configuration, explicit ownership link and audit records share one database transaction. A failed write leaves no orphan business. Omission retains the existing configuration-only API behavior. The dashboard Create supplier action opts into this transaction; it does not infer ownership from an existing name, qualify offers or establish customer prices.
