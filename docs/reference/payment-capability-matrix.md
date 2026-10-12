# Payment integration capability matrix

This is the finite backend interface inventory for acceptance item S06-2. It describes implemented integration mechanisms, independently of merchant activation. It does not certify received funds, production payment acceptance, or complete the payment business end-to-end acceptance in S06-3.

The supported integrations are classic EPay, Stripe and native Zhifux. The authoritative contracts are the [root OpenAPI contract](../../contracts/openapi.yaml), [billing contract](../../contracts/billing.openapi.yaml) and [handler operations](../../contracts/generated/handler-operations.json). The implementation lives in [payment handlers](../../apps/gateway/src/payments.rs), [payment adapters](../../crates/payments/src/lib.rs) and [durable top-up storage](../../crates/storage/src/topups.rs). See [payment integration records](payment-aggregators.md) for actual verification scopes and remaining evidence.

## Exact interfaces

| Method | Path | Contract operation / responsibility |
| --- | --- | --- |
| GET | `/admin/v1/platform/payments/integrations` | `listPaymentIntegrations`: platform capability inventory; does not require an active merchant. |
| GET / PUT | `/admin/v1/platform/payments/epay` | Platform-owned EPay configuration and revision-controlled replacement. Credentials are write-only. |
| GET | `/admin/v1/organizations/{organization}/billing/payment-methods` | `getCustomerPaymentMethods`: locally enabled methods for existing company currency accounts. |
| POST | `/admin/v1/organizations/{organization}/billing/topups` | `createCustomerTopup`: create or recover an identical durable checkout intent. |
| GET | `/admin/v1/organizations/{organization}/billing/topups` | `listCustomerTopups`: company-scoped saved order history. |
| GET | `/admin/v1/organizations/{organization}/billing/topups/{order}` | `getCustomerTopup`: saved status without contacting the merchant. |
| POST | `/admin/v1/organizations/{organization}/billing/topups/{order}/reconcile` | `reconcileCustomerTopup`: installation-only independent merchant query; never creates checkout. |
| POST | `/payments/zhifux/notify` | `receiveZhifuxNotification`: signed form receipt, followed by independent query before funding. |
| GET | `/payments/epay/notify` | `receiveEPayQueryNotification`: signed query-string evidence. |
| POST | `/payments/epay/notify` | `receiveEPayFormNotification`: signed form evidence. |
| POST | `/payments/stripe/notify` | `receiveStripePaymentNotification`: raw-body signed webhook. |

Checkout requires company-wide owner/admin write access or installation authority. A workspace-scoped role cannot create company funding. Status/history reads enforce company scope. Reconciliation is installation-only. Callback routes authenticate signed payment evidence rather than a customer bearer token. Platform configuration requires platform authority.

## Supported mechanisms and limits

| Capability | Classic EPay | Stripe | Native Zhifux |
| --- | --- | --- | --- |
| Checkout | Local deterministic signed checkout saved with the intent. | Remote Checkout Session creation, durably claimed before contact. | Remote merchant order creation, durably claimed before contact. |
| Account currency and amount | CNY; positive exact fen. | Configured supported USD or CNY; positive exact cent/fen. | CNY; positive exact fen. |
| Signed notification | GET query or POST form; saved merchant/order, method, amount and paid state verified. | Signature over original raw bytes with timestamp checks; paid Checkout Session evidence matched to saved intent. | POST form; configured merchant, saved order, requested amount and success signature verified. |
| Notification effect | Verified identity is bound; funding commits atomically once. | Verified session/event evidence permits atomic funding once. | Immutable receipt commits before acknowledgement; receipt alone never funds. |
| Query recovery | Explicitly unsupported: reconciliation returns 501. Signed notifications remain supported. | Queries an already bound saved session; uncertain unbound session creation is not silently recreated. | Original configured merchant query for the saved order; paid evidence funds, closed evidence closes without funding. |
| Background recovery | No advertised merchant query worker. | Saved-session reconciliation scope; not a generic checkout recreation service. | Traverses saved pending orders; an unresolved order does not permanently starve subsequent orders. |
| Refund initiation | Unsupported. | Unsupported. | Unsupported. |

Amounts are decimal integer strings in account-currency nanounits. Supported two-decimal currencies require divisibility by 10,000,000. No implicit foreign exchange, account creation, approved credit or balance credit occurs when checkout is created. An explicit integration selection never falls through to another integration. Omitted selection retains the existing runtime-priority compatibility behavior.

## Idempotency, evidence and recovery boundaries

An identical intent under the same idempotency key recovers the original saved order. Changed amount, currency, method or integration conflicts. Remote creation is claimed durably before contact and is not automatically repeated after an uncertain response. EPay can complete a previously saved intent whose checkout link was not recorded; a new local checkout transaction failure rolls back its new intent.

Funding requires verified evidence matching the immutable saved intent and its merchant/provider identity. Repeated notifications cannot produce repeated balance credit. A conflicting provider reference cannot replace the identity established by the first verified evidence. Browser return URLs, customer assertions, and unsigned extra fields never authorize funding. Callback processing failures must not be treated as successful payment acknowledgements.

Zhifux and EPay callback bodies are limited to 8 KiB; Stripe raw webhook bodies are limited to 256 KiB. Zhifux and EPay post-body processing has a two-second deadline. Reconciliation uses bounded query admission and preserves the original saved merchant binding. A 200 saved-status or reconciliation response is not by itself proof of payment: inspect its durable status. Pending or `reconciliation_required` is not spendable funding.

This inventory is based on source and published-contract inspection. It makes no new positive merchant-payment claim. Existing actual HTTP and independently checked database records retain their individual scopes in the linked verification document; fixture results provide no acceptance evidence. Live received-cash funding and positive callback/query settlement evidence remain unverified where those records explicitly say so. External activation is a deployment condition, not a prerequisite for documenting the implemented integration capability.
