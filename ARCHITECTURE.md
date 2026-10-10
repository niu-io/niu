# Niu architecture

Status: current public runtime, 2026-10-10. This document describes the gateway in this repository. [Product focus](docs/product/product-focus.md) sets scope. [The release matrix](docs/releases/first-release.md) tracks qualification. Specialized contracts are listed at the end; they do not replace this description.

## Runtime

Hosted Niu uses one domain, `niu.io`, and one public gateway process. There is no application subdomain. Marketing, documentation, the model catalog, the dashboard, and the APIs are paths on that origin. Community builds use the same process and the same paths; without a marketing artifact, `/` redirects to `/workspaces/default/`.

PostgreSQL is the only required external service. The gateway applies its own migrations at startup. The default pool is 10 connections per process (`NIU_DATABASE_MAX_CONNECTIONS`, from 1 to 256).

The process serves inference, management APIs, member sessions, health checks, static files, and in-process recovery. Static files are built artifacts read from disk (`NIU_SITE_DIR`, `NIU_DOCS_DIR`, `NIU_CATALOG_DIR`, `NIU_DASHBOARD_DIR`). They do not use the database. Serving them from this process does not justify splitting domains. A CDN in front of the same host can cache public files; the gateway remains the origin for `/v1/`, `/admin/v1/`, `/catalog/v1/`, and payment callbacks.

Enterprise, when composed, keeps this listener as the only public bind. Private modules use build-time manifests and Unix sockets. See [Enterprise composition](docs/architecture/enterprise-composition.md) and [repository ownership](docs/architecture/repository-ownership.md).

## Layout

```text
apps/gateway     Rust process: inference, management, static files, recovery
apps/dashboard   Workspace UI, built to static files
apps/docs        Developer documentation, built to static files
apps/catalog     Public model catalog, built to static files
contracts        OpenAPI and versioned wire contracts
crates/storage   PostgreSQL persistence and ledger operations
crates/metered-cost
                 Integer media pricing
crates/cost      Imported floating-point text estimate; not the ledger
crates/execution Compatibility vocabulary for imported task records
crates/extension-api
                 Versioned extension traits; the gateway does not load them
vendor/litellm-rust
                 Pinned provider and protocol modules
```

Storage and HTTP names predate the product language. `organizations` are the company billing accounts. `projects` are workspaces. `vendors` are Supplier credential configurations. Earnings APIs use `providers` for Supplier businesses. Product UI says workspace, Supplier, and company. New customer-facing names stop at that boundary; existing columns and routes stay.

## Request path

A model request authenticates a workspace API key, resolves one enabled route, and commits attempt intent before any provider call. A database commit is not atomic with the upstream network call. After a crash, unknown execution is not treated as free or safe to send again.

Shared unpriced admissions are queued in batches of up to 64, with at most four batches in flight. Personal routes use their own admission path. Priced admission commits the operation, attempt, selected managed route, token bound, inspected guardrails, provider, customer tariff, Supplier offer, reservation and dispatch intent in one transaction. A price-cache miss may publish its immutable revision before that transaction. Policy denials retain their audit; other pre-commit errors roll back the new attempt. A failed commit acknowledgement does not authorize releasing a hold or resubmitting. See [atomic admission evidence and limits](docs/reference/priced-admission-atomicity.md).

Personal routes reject commercial pricing. A company with a balance account rejects an unpriced shared model instead of dispatching it without a bound.

Route pools can choose among enabled supply mappings for one public alias by priority and weight. That selection is not generic failover. A second upstream submission for the same customer operation is not implemented. Video jobs stay on the route that created them. See [model routing](docs/architecture/model-routing-evolution.md).

Attempt rows record execution certainty (`not_sent`, `may_have_executed`, `confirmed_completed`, `confirmed_not_executed`), usage confidence, and settlement separately. Provider-reported usage requires confirmed completion and nonnegative token counts. Missing usage stays unresolved. Process-local attempt counters reset on restart and are not the ledger.

The gateway owns this admission path. `niu-extension-api` is not loaded. Provider adapters must not add a hidden retry or a second model.

## Money

Three amounts stay independent:

| Ledger | Meaning |
| --- | --- |
| `cost_entries` | Installation upstream-cost accounting |
| `customer_charges`, `customer_media_charges` | Customer text or media price for one attempt |
| `provider_earnings` | Amount owed to the Supplier |

No ledger is derived from another. Customer APIs do not return Supplier cost or platform margin.

Prepaid company balance is what admits paid traffic. Available capacity is balance plus the approved credit limit, minus outstanding customer liabilities. A known unsettled media charge counts at least its original reservation and can exceed it; already posted debits are not counted again. The balance row is per organization and currency. Workspace and key caps limit their own usage and do not create a second balance. A missing customer tariff does not become a zero price.

Text rates are integer nanounits per million tokens. One currency unit is 1,000,000,000 nanounits. The charge rounds up once:

```text
ceil((uncached_input * input_rate + cached_input * cached_rate + output * output_rate) / 1_000_000)
```

Without a cached rate, the whole input uses the ordinary input rate. A cached rate requires a known cached quantity no larger than the input. Public JSON sends amounts as strings.

Video estimates use `niu-metered-cost` integer arithmetic. `niu-cost` can estimate from floating-point rates; those estimates are not reservations and not ledger entries.

Financial recovery and content maintenance have independent five-second schedules in the gateway. Financial recovery claims one database transaction owner across instances, uses one idle connection from the existing pool and persists per-stage UUID progress. Each batch reads at most 100 eligible attempts; savepoints isolate record errors, and the ledgers commit independently. Content expiry uses a separate ownership key. Both groups use a 250 ms lock timeout and a 2 s statement timeout; they skip acquisition when the pool has no idle connection. Claim checks briefly use connections in competing processes. Payment/video recovery and interrupted ingestion work remain outside these ownership groups. This does not reserve admission capacity or qualify paid backlog recovery. See [financial recovery](docs/reference/financial-recovery-coordination.md) and [content retention](docs/reference/content-retention-recovery.md).

Customer invoices summarize `customer_charges`. Issuing or marking an invoice paid does not credit prepaid balance or grant spending capacity. Invoice totals and status share a settlement read model: exact balance debits and invoice receipts discharge the invoice obligation without double-counting. Credit-backed account debt remains in the balance ledger. Positive paid-path verification remains open. Supplier settlement records an external payment against earnings; it does not send that payment.

Configured Stripe, EPay, and Zhifux checkouts can credit a company balance after a verified top-up. Currency conversion, automatic Supplier payout, and a credit-note API are not implemented.

Details: [billing](docs/architecture/billing.md), [Supplier workspace](docs/architecture/provider-workspace.md).

## Configuration

Managed Supplier credentials and model mappings live in PostgreSQL and take effect without rebuilding the image. A static TOML route remains only when no database row owns that alias, including a disabled row. Credentials are AES-256-GCM ciphertext bound to the vendor id. `NIU_VENDOR_ENCRYPTION_KEY` is not in the database and cannot be rotated in place. See [vendors](docs/architecture/vendors.md).

Dashboard sign-in is a member password session. The installation administrator token is a separate credential. A development seed member is refused when the process is not bound to loopback. OIDC and SAML are not implemented.

## Outside the current product

These surfaces still exist. They are not the product boundary in [product focus](docs/product/product-focus.md):

- `POST /admin/v1/benchmarks/compare` and the dashboard benchmarks page analyze an uploaded paired dataset. The analyzer does not scope that dataset to the caller’s stored traffic.
- Execution-record import stores metadata-only task observations. Importing one does not create an attempt or a charge.
- The extension crate and its reference extension are tested alone. The gateway does not load extensions, and it does not run a task sandbox.

## Open implementation and qualification work

This is a gap inventory, not an implementation order. The product focus and release matrix govern sequencing.

- Qualify successful paid admission/debit, lost commit acknowledgements and nonempty recovery across restart.
- Qualify connection contention and backlog capacity across gateways, including payment/video and interrupted-ingestion workers.
- Qualify the invoice settlement read model with actual paid and mixed-settlement business flows.
- Fail over to another supply mapping with a distinct attempt, a new bound, and no resubmit after uncertain execution.
- Re-encrypt stored credentials under a new master key.
- Publish one compiled configuration snapshot for file routes and database routes.

## Further contracts

| Topic | Document |
| --- | --- |
| Paths and repositories | [repository ownership](docs/architecture/repository-ownership.md) |
| Image, migrations, encryption-key backup | [container deployment](docs/architecture/container-deployment.md) |
| Supplier credentials and static routes | [vendors](docs/architecture/vendors.md) |
| Route pools and failover limits | [model routing](docs/architecture/model-routing-evolution.md) |
| Customer charges, prepaid balance, invoices | [billing](docs/architecture/billing.md) |
| Supplier earnings | [Supplier workspace](docs/architecture/provider-workspace.md) |
| Enterprise modules | [Enterprise composition](docs/architecture/enterprise-composition.md) |
| Attempt evidence and retries | [capability and execution](docs/architecture/capability-execution-contract.md) |
| Extension traits | [capability contracts](docs/architecture/capability-contracts.md) |
| Imported task records | [execution observation](docs/architecture/execution-observation.md) |
| Private Codex supply | [private Codex supply](docs/architecture/private-codex-supply.md) |
| Supplier account registry | [supplier accounts](docs/architecture/supplier-accounts.md) |
| Quota observations | [quota observation](docs/architecture/quota-observation.md) |
