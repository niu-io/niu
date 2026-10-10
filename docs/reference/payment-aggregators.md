# Payment aggregator integration

Status: supported adapter inventory and implementation checkpoints. Reviewed 2026-10-09.

## Supported integration list and readiness boundary

Niu separates supported payment integrations from the methods enabled on a
particular installation, following the structure of
[New API payment settings](https://docs.newapi.pro/zh/docs/guide/console/settings/payment-settings).
Supporting an adapter does not require opening a merchant account or completing
a real transaction with every payment operator. Merchant onboarding and live
collection are deployment-specific checks, not prerequisites for internal backend
readiness or performance work.

| Integration | Configuration required | Implemented scope | Deployment-specific checks |
| --- | --- | --- | --- |
| Classic EPay-compatible gateways | API address, merchant PID/key, callback/return addresses, enabled channel identifiers | Checkout creation and signed notification handling for saved CNY orders; encrypted administrator configuration | Operator compatibility, enabled Alipay/WeChat or other channels, public callback delivery |
| Stripe | Merchant configuration alias, API and webhook secrets, explicit test/live mode, return address, enabled methods | Checkout creation, signed notifications and bound-session query recovery | Merchant eligibility, enabled methods/currencies and live webhook delivery |
| Native Zhifux / PaymentFM | Native API address, merchant credentials, checkout origins, enabled payType values and callback configuration | Native order creation, signed notifications and order-query reconciliation | Merchant API entitlements, enabled channels and callback delivery |

The native Zhifux adapter is separate from EPay compatibility; neither establishes
that the other interface is enabled for a given merchant. Other New API gateways
are references, not supported Niu adapters unless implemented here.

Administration may list supported integrations even before configuration.
Customer checkout exposes only explicitly enabled, completely configured methods.
Listing an integration never grants balance or claims a successful live payment.
Internal acceptance still requires configuration validation, authorization,
protocol handling, durable order identity, exact amount/currency validation,
signed evidence, duplicate protection and safe failure/recovery behavior. Browser
returns never authorize funding. Unsupported refund or recovery capabilities
remain explicit; fixture outcomes do not establish readiness. Historical
checkpoints below describe implementation work, not blanket acceptance.


The preferred domestic candidate is 支付FM (zhifux.com), using signed merchant channels. Its [official compatibility documentation](https://docs.zhifux.com/read/zhifufm/api-epay) explicitly describes an EPay-compatible interface. The existing Zhifux code uses its native API; the generic classic EPay protocol foundation is separate and has not been qualified against Zhifux’s compatibility interface. Its [product guide](https://docs.zhifux.com/read/zhifufm/paytype) distinguishes signed merchant channels from monitoring-based personal collection methods. Merchant eligibility, actual enabled methods, settlement and end-to-end acceptance still require qualification.

The initial release targets two integrations: an EPay-compatible domestic gateway for Alipay/WeChat Pay and RMB top-ups, and Stripe for international payments where merchant eligibility permits. EPay denotes a gateway interface, not a specific payment operator. Choose and qualify the actual domestic operator before enabling collection. Customer checkout displays payment methods, not protocol names. Both routes fund the same company prepaid ledger only after verified server-side payment evidence. Display only methods enabled and qualified for the configured merchant; do not imply universal availability.

Stripe also supports Alipay and WeChat Pay, so customer methods can overlap. Merchant onboarding, settlement currency and availability determine which integration to use. See [Stripe merchant availability](https://stripe.com/global), [Alipay](https://docs.stripe.com/payments/alipay), [WeChat Pay](https://docs.stripe.com/payments/wechat-pay), and [New API’s EPay configuration explanation](https://docs.newapi.ai/zh/docs/guide/feature-guide/admin/system-setting-advanced).

Existing gateway code supports native Zhifux and Stripe creation, signed callbacks and reconciliation subsets. Classic EPay now has a callback route at `/payments/epay/notify`, accepting bounded GET queries or POST form notifications against saved CNY orders. It requires both `NIU_EPAY_PID` and `NIU_EPAY_KEY`; malformed or incomplete configuration fails startup. Durable merchant checkout creation is implemented; original-merchant query recovery, refunds and full live EPay payment acceptance remain open. Preserve exact amounts, currency matching, durable idempotency and callback replay protection across adapters; browser returns never grant balance.

## Classic EPay protocol boundary

### Current-input inventory and inactive-installation check — 2026-10-10

An actual gateway process using backend `5a2449d` and a separate native
PostgreSQL database was started without merchant configuration. Through HTTP,
installation administration listed EPay, Stripe and native PaymentFM support.
The returned inventory explicitly reported no refunds, unsupported EPay query
recovery, Stripe bound-session recovery and native PaymentFM saved-order recovery.
An ordinary company owner received 403 for the platform inventory; an invalid
credential received 401.

The company owner separately requested each integration through customer method
discovery. All returned unavailable, with no methods and no selected gateway.
Explicit checkout requests were refused. Independent database reads confirmed
zero top-up orders, provider bindings, funding receipts and balance entries.
After stopping and restarting the gateway, the support inventory was unchanged
and no order had appeared. Temporary access was revoked and the isolated
processes stopped; existing merchant configuration and databases were untouched.

This verifies the separation between supported integrations and enabled customer
payment methods on an unconfigured installation. It does not verify positive
checkout, signed payment acceptance, merchant activation or funding recovery.
No external payment or fixture response was used. Historical fixture outcomes
below are not evidence of integrated correctness or readiness.

Callback parsing regression verified on 2026-10-07: malformed raw percent escapes
are rejected before form decoding, even when the permissively decoded fields
would have a matching signature. Correctly percent-encoded literal percent values
remain accepted when all saved-order and signature checks pass. All 21 payment
tests and all-target Clippy passed. This does not qualify merchant query recovery
or live payment collection.

The original `niu-payments::epay` module implements the classic checkout and
callback conventions used by [go-epay v0.0.4](https://github.com/Calcium-Ion/go-epay/tree/v0.0.4/epay),
the library referenced by New API. No upstream source was imported. This is a
bounded protocol subset, not universal EPay operator compatibility.

Checkout uses HTTPS, a fixed `submit.php` path, exact two-decimal CNY, the saved
merchant order and configured notification/return URLs. The secret is never
included in the checkout URL. Callback verification sorts decoded fields for the
classic MD5 signature, rejects duplicate fields and checks merchant, saved order,
payment method, exact amount and `TRADE_SUCCESS`. Signatures are compared in
constant time. Empty/short secrets, malformed signatures, unknown fields and
ambiguous parameter values are rejected. The verified receipt contains the
platform reference; it does not fund an account. Browser return handlers must not
use it to credit balance.

Fresh payment tests passed on 2026-10-07: all 20 tests, including an independently
computed classic signature vector, tampering, correctly signed wrong-order/method/
amount/state evidence, duplicate fields and HTTPS checkout bounds. Payment Clippy
passed with warnings denied. The gateway verifies saved merchant/order/method/amount
before binding the immutable provider payment reference and using the durable
funding ledger. The isolated PostgreSQL/router acceptance test passed on 2026-10-07:
signed wrong amounts and duplicate fields cannot bind a payment; an injected ledger
failure produces no settlement; reconstructed application state and concurrent
POST retries plus GET replay produce exactly one funding entry. This is local
state reconstruction, not live merchant collection or process-restart qualification;
original-merchant query recovery, refunds and live collection remain unfinished.
Durable checkout creation is covered by the subsequent checkpoint below. No EPay payment method is exposed in the customer UI yet.

The expanded callback acceptance also passed on fresh PostgreSQL: correctly
signed evidence for a different saved adapter or merchant is rejected before
binding, and reusing a provider payment reference for a second saved order returns
conflict with no second binding or credit.

Classic EPay merchant checkout storage is now separate from payment identity:
migration 0148 allows its immutable URL to reference the saved intent before a
provider reference exists. Other adapters still require a provider binding at
insertion. `save_epay_merchant_checkout` accepts only scoped CNY EPay intents and
bounded HTTPS `submit.php` URLs; the trusted integration must validate its configured
gateway origin and signed fields before calling it. Saving the URL grants no funds.
The PostgreSQL acceptance passed for concurrent identical saves, reopening storage,
foreign-company denial, URL replacement rejection, zero credit before identity,
and hiding the checkout from history after verified settlement. This storage
foundation now supports gateway checkout creation when `NIU_EPAY_ENDPOINT`,
`NIU_EPAY_NOTIFY_URL`, `NIU_EPAY_RETURN_URL` and comma-separated
`NIU_EPAY_METHODS` are all configured with the merchant credentials. Supported
method identifiers are `alipay` and `wxpay`; actual merchant entitlement remains
unqualified. The existing company top-up route saves a deterministic signed URL
and returns the immutable order on retry. No upstream creation request occurs.
Both EPay gateway PostgreSQL acceptance tests passed: repeated initiation saves
one pending order with exact signed amount and no provider binding or funding;
callback isolation, rollback and concurrent replay still pass. Customer UI, simultaneous
multi-currency checkout UI, original-merchant query recovery and live
collection remain open. Discovery returns one currency per response and now accepts
an optional uppercase `currency` query. It selects only a matching configured
gateway; unsupported currencies return their own explicit unavailable state.
Omitting the query retains the default behavior. The JavaScript SDK exposes this
query without changing transport cancellation or existing calls. All 145 SDK tests
passed; fresh gateway PostgreSQL tests passed for CNY availability and USD
unavailability with only EPay configured, alongside initiation/callback checks.
Simultaneous live domestic/international acceptance remains unqualified.
Configuration acceptance passed for omitted integration, missing credentials,
callback-only credentials, incomplete checkout fields, valid checkout and rejected
HTTP endpoints. Checkout settings without credentials now fail startup instead of
being silently ignored. Commented setup fields are documented in `.env.example`.
Gateway all-target Clippy passed with warnings denied; public-boundary checks passed.
Expanded initiation acceptance passed using an ordinary organization owner:
invalid credentials and a foreign company are denied, zero and fractional-cent
amounts are rejected, identical retries retain one order, and changing the amount
under the saved idempotency key returns conflict. No rejected case creates a
second top-up, payment binding or funding entry. Callback acceptance still passes.

Migration 0149 aligns EPay provider references with the verifier's bounded ASCII
alphanumeric/underscore/hyphen format (1–128 characters). Stripe and other adapters
retain their existing constraints. All ten top-up PostgreSQL tests passed, including
funding/replay after reopening with an EPay reference containing punctuation and
direct database rejection of empty, slash-containing and non-EPay punctuated
references. This is protocol/storage consistency, not additional merchant qualification.

The public billing OpenAPI contract now documents both classic EPay notification
methods and is referenced by the root contract. It specifies signed fields,
bounded input, saved-order validation, conflict/retry responses and the no-store
acknowledgment. Both YAML documents passed duplicate-key parsing and all 238
references traversed from those documents resolved. The contract describes the
implemented callback subset; it does not establish live merchant compatibility.

Currency-contract correction: discovery and the JavaScript SDK no longer declare
every response to be CNY. Top-up documentation now distinguishes domestic CNY
precision from Stripe's configured currency and records the unresolved shared-method
routing priority. Both YAML documents parsed with duplicate-key validation; all 145
SDK tests passed. This corrects the public contract, not the remaining gateway-choice
or multi-currency UI workflow.

Top-up creation now also accepts optional uppercase `currency`. Gateway selection
filters on it before saving any intent; a requested non-CNY currency cannot fall
through to domestic CNY creation. Omission preserves existing default behavior.
The saved order still binds its integration, merchant, currency, amount and method;
no conversion or account provisioning occurs. The SDK allowlists this field and
rejects malformed currency before transport. Both EPay gateway PostgreSQL tests
passed, including explicit CNY initiation, USD/lowercase rejection before extra
intent creation, immutable retries and callback recovery. All 145 SDK tests passed.
Explicit selection between gateways sharing the same currency/method and
the complete multi-currency checkout UI remain unfinished.

Explicit integration selection is now implemented: discovery queries and top-up
creation accept optional `payment_gateway` (`epay`, `stripe`, `zhifux`) alongside
currency. Explicit selection cannot fall through to another integration; omitted
selection preserves compatibility priority. The SDK forwards only these allowlisted
selectors and rejects unknown gateways before transport. Both EPay PostgreSQL
tests passed, including unavailable-Stripe rejection without an EPay order,
unknown gateway rejection, explicit EPay initiation and unchanged callback replay.
All 145 SDK tests passed at this checkpoint. Subsequent positive simultaneous-gateway
acceptance is recorded below. Customer UI selection, merchant reconciliation and
live qualification remain open;
the earlier same-method API limitation above is superseded by this increment.

Discovery now also returns nullable `payment_gateway` with its currency and
methods. A configured EPay or Stripe result identifies that integration; native
Zhifux identifies itself when it matches; no matching integration returns null.
Clients should freeze this identity and currency with their selected method when
creating a top-up, rather than rediscovering adapter priority during submission.
This exposes no merchant credentials and is not a customer-facing method label.
All seven payment PostgreSQL cases and 146 SDK tests passed, including explicit
CNY EPay/USD Stripe discovery with the same `alipay` method. The SDK type check
and billing schema parse passed.

The customer top-up dialog now freezes discovered gateway, currency, method,
exact amount and receipt together. CNY/USD labels follow discovery, and an
available response without a known gateway is rejected. All 15 focused dialog
tests and dashboard type checking passed. An isolated browser fixture using the
production component verified the existing dialog and open menu at desktop and
390px widths, with bound CNY intent submission at both widths; no merchant
request, saved configuration change or funds transfer occurred. The temporary
fixture was removed.

For companies with multiple existing supported balances, Settings now passes
their currencies to funding and shows a CNY/USD choice beside Add funds. Choosing
a currency clears the unsubmitted draft, reloads matching methods and rejects a
discovery response for another currency. The choice is disabled while the dialog
is open or a mutation is running; submission retains the discovered gateway.
Single-currency accounts omit the extra choice. This does not provision accounts
or perform FX. All 37 billing tests and dashboard type checking passed. Desktop
and 390px isolated browser checks covered the open currency menu, switching to
USD, updated dialog labels and a USD/Stripe intent. The fixture was removed;
no merchant request or funds transfer occurred. Gateway configuration,
merchant-query recovery and live payment acceptance remain open.

Positive simultaneous integration acceptance passed on fresh PostgreSQL: one
company has existing CNY/USD accounts, EPay and Stripe are both configured with
`alipay`, and explicit discovery returns each gateway's matching currency/method.
Repeated explicit initiation retains three CNY EPay orders and three USD Stripe
orders. Stripe creation occurs exactly three times despite retries, and its
paid/pending/expired lifecycle checks remain valid. EPay checkout creates zero CNY
funding entries. Stripe traffic uses a controlled authenticated local HTTP fixture;
this does not qualify live collection or Settings UI selection.

EPay post-input processing now has a two-second deadline for both notification
methods. Fresh PostgreSQL acceptance held the company row lock, received retryable
HTTP 502 within the test's four-second outer bound, and confirmed no payment binding
or credit. After releasing the lock, settlement failure recovery and concurrent replay
still produced exactly one funding entry. The deadline covers verification/database
processing after body/query extraction; it is not a complete connection/read timeout
or live delivery qualification. The callback contract records retry behavior.
All nine top-up storage integration tests passed on fresh PostgreSQL, including
the existing Stripe reference limits, immutable checkout, closure, receipt replay
and settlement rollback cases.

## Zhifux protocol boundary

The original `niu-payments` implementation follows the documented [order creation](https://docs.zhifux.com/read/zhifufm/startorder), [callback](https://docs.zhifux.com/read/zhifufm/notify) and [merchant-order query](https://docs.zhifux.com/read/zhifufm/querybyoutno) protocols. No vendor demo code was copied.

Creation uses an exact two-decimal CNY amount, a saved merchant order reference and a configured HTTPS notification endpoint. The callback signature covers success state, merchant identity, merchant order and requested amount. Actual paid amount and platform order identity are not included. Niu therefore requires independent authenticated server-query evidence before funding: merchant, both order identities, payment method, paid state, requested amount and actual amount must match the saved order. Query access requires merchant-side enablement. Differences require reconciliation rather than silently funding the requested amount.

The protocol module creates encoded request parameters and verifies evidence. The separate transport module performs bounded server requests; neither module performs accounting writes. Its credential type is not serializable or Debug. Decimal conversion uses checked integer arithmetic; signatures are compared in constant time. Signed callback evidence alone is not permission to fund an account.

## Required end-to-end implementation

- Durable storage now saves company-owned top-up intent in an existing currency account, with exact amount, merchant, aggregator, method and idempotency key. Immutable provider identity binds the platform reference. Pending intent grants no capacity. Gateway authorization, merchant configuration revisions and checkout orchestration remain required.
- Bounded HTTPS transport is implemented with certificate verification, checked/pinned public DNS addresses, no proxies, no redirects, explicitly disabled retries and safe errors. Creation responses require a configured HTTPS checkout origin. Gateway orchestration must preserve uncertain creation for reconciliation instead of creating another payable order.
- Verify callback signatures and independently query the saved order before invoking settlement. Storage commits funding, a globally unique receipt and immutable order settlement atomically; concurrent replay returns the original entry. The HTTP callback must acknowledge only after durable processing.
- Offer top-up and status recovery in global Settings → Payments. Browser return URLs only navigate; they cannot mark payment successful.
- Establish CNY account/customer-price configuration explicitly. Existing USD accounts cannot receive CNY credit without an approved, versioned conversion design. No implicit exchange rate is implemented.
- Qualify actual merchant methods, callbacks, pending/failed/expired payments, retry recovery, reversal/refund handling and restart durability before enabling production checkout.

Live qualification requires a configured merchant API endpoint, merchant credentials, enabled payment methods, query permission and a publicly reachable HTTPS callback. Keep these outside the public repository. Current local protocol tests do not establish merchant access, real collection or F05 acceptance.

Verification: all four protocol tests passed, including independently calculated creation/query/callback signatures, exact amount boundaries, unsuccessful payment states, altered identities and partial payment rejection. Clippy passed with warnings denied; public source/build-input boundary checks passed. No live payment was initiated or account credited.


Durable-storage verification: isolated PostgreSQL fixtures prove concurrent intent/settlement replay, immutable identity, cross-company rejection, no account creation for an unsupported currency, provider-reference collision and rollback after injected settlement failure. A preexisting funding receipt cannot be credited again through an order. This is controlled integration evidence, not an actual payment or complete callback acceptance.

Callback integration can resolve saved intent only under its configured aggregator and merchant identity, then recover the immutable platform reference within the saved company scope. These internal reads do not authorize funding. Fresh PostgreSQL checks passed for missing orders, incorrect merchant/aggregator scope, cross-company identity reads and persistence across store reopening; all 15 billing/top-up integration tests passed with none ignored. All-target storage Clippy passed with warnings denied. HTTP orchestration remains unfinished.

Order creation now has an immutable, durable claim that must commit before the external request. Only one concurrent caller can acquire it; a subsequent process must reconcile the saved order instead of creating another payable order. A saved provider identity also suppresses creation for older bound orders. A crash before dispatch intentionally requires recovery; the claim does not prove that the aggregator received a request. PostgreSQL fixtures verify concurrent acquisition, process replacement, foreign-company rejection and claim immutability. The gateway must still invoke this contract and implement reconciliation before checkout is qualified.


## HTTP transport checkpoint — 2026-10-06

The transport uses a three-second connection bound and five-second request/body deadline, with a 64 KiB decoded response cap. Production endpoints require HTTPS without URL credentials, query or fragment; private/non-global resolved addresses are rejected and DNS results are pinned for the client instance. Rebuild the client when endpoint/DNS configuration needs refresh. Checkout origins are explicit trusted merchant configuration; no browser-provided callback or provider-response host can redefine them.

Provider status/body/URL errors become fixed messages without signatures, merchant secrets or raw response bodies. The client explicitly disables the HTTP library's default retries. A failed or ambiguous creation is a reconciliation event for the saved order. Independent queries accept funding evidence only for matching paid orders with a known exact actual amount; pending, closed, missing-amount and partial payments fail verification.

Controlled loopback HTTP fixtures cover accepted/foreign/insecure checkout URLs, real redirects without following, failed status, malformed and oversized responses, chunked body limits and delayed-body timeout. These fixtures bypass HTTPS only through private test construction; production exposes no insecure-client constructor. Real merchant TLS/API entitlement, public callbacks, durable worker recovery and complete checkout remain unqualified.

Verification: all nine payment tests passed, and all-target Clippy passed with warnings denied. The public source/build-input boundary check passed for 1,015 files. No live payment was initiated.

Uncertain-creation recovery now queries the saved merchant order without issuing another creation request. A matching authenticated paid response can supply a previously unknown platform identity; saved merchant order, merchant, method and both exact amounts still must match. Already bound orders reject a different platform identity. The recovered reference must be durably bound before settlement. Ten payment tests and all-target Clippy passed, including altered identity/method/amount/state rejection; these loopback fixtures do not qualify real merchant recovery or the gateway worker.

## Gateway reconciliation checkpoint — 2026-10-06

`POST /admin/v1/organizations/{organization}/billing/topups/{order}/reconcile` is an installation-only recovery operation. It reads company-scoped saved intent, requires its original Zhifux merchant and CNY currency, independently queries by the saved order's 32-character merchant reference, binds the authenticated platform identity and atomically settles funding. Browser-supplied paid flags, amounts or platform references are not used. The response reports paid status only after storage commits; it does not expose ledger identifiers, credentials or procurement information.

The optional `NIU_ZHIFUX_CONFIG_FILE` points to private JSON containing `api_root`, `merchant`, `secret`, `checkout_origins`, `notify_url` and `payment_methods`. Notification configuration requires a HTTPS URL without query/fragment or URL credentials. List only merchant-enabled, qualified methods (one to sixteen, without duplicates). Keep the file outside the public tree, readable only by its owner on Unix. Symlinks, oversized files, malformed/unknown fields and insecure transport configuration are rejected. Configuration must retain the original merchant for unresolved orders. Each gateway instance serializes reconciliation queries. PostgreSQL additionally admits at most one query start per aggregator/merchant every three seconds across replicas, using database time. Failed requests consume the slot; restart does not clear it. No unbounded queue waits for admission.

A fresh PostgreSQL gateway test proves unauthenticated rejection, company-owner rejection, safe unconfigured-integration errors, zero balance change and no provider binding. All-target gateway Clippy passed with warnings denied. Successful merchant query-to-ledger processing is not yet qualified as one end-to-end integration test or actual payment. Merchant configuration version retention, checkout creation/status, callback acknowledgment and complete worker restart/merchant qualification remain required. This endpoint does not close F05.

Shared-query admission verification: all 16 billing/top-up PostgreSQL tests passed, including concurrent independent store callers, restart-equivalent reopening, separate merchant/aggregator scopes and expiry/reacquisition. All-target gateway/storage Clippy passed with warnings denied. This is a database admission check, not actual merchant traffic or complete checkout acceptance.

## Background recovery checkpoint — 2026-10-06

A separate gateway worker now traverses unresolved claimed or bound orders for the configured merchant, one keyset-selected order per five-second tick. Unsent intent alone is excluded; successful settlement removes an order from recovery. Unresolved orders do not starve later orders, and completing a traversal resets the cursor. Restart begins a new traversal from durable records. The worker independently queries and settles; it never creates a payable order. Shared database query admission still governs replica traffic. Shutdown aborts this worker independently from customer-charge recovery.

All 16 billing/top-up PostgreSQL tests passed after migration 0093, covering recovery selection before/after claims, merchant scope, cursor exclusion, settled-order exclusion and a reopened store recovering an older bound order. Gateway/storage all-target Clippy passed. This proves durable selection and compilation, not successful merchant-to-ledger worker processing or a real process-restart payment journey. Expired/closed order lifecycle, configuration retention, checkout and callbacks remain unfinished.

Private configuration loading now checks the opened file descriptor and bounds the actual read to 16 KiB plus an overflow byte. Unix opening uses no-follow and nonblocking flags, preventing path replacement from turning the read into a symlink or blocking special-file read. A filesystem test passed for owner-only permissions, symlinks, directories, missing files, oversize input, malformed JSON and unknown fields. Errors include neither fixture credentials nor source paths. All-target gateway Clippy passed. This check does not qualify merchant entitlement or payment processing.

## Durable checkout checkpoint — 2026-10-06

Validated platform identity and checkout URL can now commit atomically. Checkout URLs are immutable, company-scoped and backend-owned; exact replay succeeds, while replacement identity/URL and cross-company writes fail. Storage rejects insecure URLs, URL credentials and fragments; the trusted integration must still validate the configured checkout origin before writing. A checkout response grants no spending capacity.

All 17 billing/top-up PostgreSQL tests passed after migration 0094. The checkout fixture proves concurrent replay, persistence across store reopening, foreign-company rejection, immutability, zero funding and rollback of provider binding after injected checkout-write failure. All-target storage Clippy passed. Customer checkout browser recovery and live endpoint qualification remain unfinished; this is durable storage evidence rather than a working self-service payment flow.

## Customer endpoint checkpoint — 2026-10-06

Company-scoped `POST /admin/v1/organizations/{organization}/billing/topups` accepts exact `amount_nanos`, an enabled `payment_method` and `idempotency_key`. Company-wide billing write permission is required. It uses the existing CNY account, commits a durable creation claim before contacting the aggregator and saves the validated platform identity/checkout URL atomically. Repeated intent returns saved status; an uncertain creation is never automatically reissued. No account, credit or FX conversion is created implicitly.

Company-authorized `GET /admin/v1/organizations/{organization}/billing/topups/{order}` reads durable status without an upstream request: unresolved, pending checkout or paid. Paid orders withhold the checkout URL. The API retains the order identifier for routing and excludes merchant, platform and ledger identity from the customer response; product displays must not render internal identifiers.

Gateway fixtures verify company-owner status access, cross-company rejection, unconfigured creation failure and unresolved/pending/paid transitions backed by real PostgreSQL records. Funding in the status fixture is an explicit trusted storage operation, not actual collection. Live creation/replay, full callback qualification, status history, configuration retention and browser checkout remain unqualified. F05 remains open.

## Signed notification receipt checkpoint — 2026-10-06

`POST /payments/zhifux/notify` accepts the configured `post_form` callback with an 8 KiB body limit. The handler verifies signed success state, configured merchant, the exact saved merchant-order reference and requested amount, then commits an immutable receipt before returning `success`. Post-body processing has a two-second deadline; rejection, timeout or storage failure returns no successful acknowledgment. Unsigned actual amount, platform identity and method are ignored. Receipt means accepted for reconciliation, not paid or funded.

A verified receipt makes the order eligible for the existing durable worker. Independent authenticated query evidence still establishes actual amount and platform identity before atomic funding. Concurrent replay preserves one receipt. A fresh PostgreSQL fixture uses an independently calculated signature and checks altered state/amount/merchant/signature rejection, wrong configured merchant, zero funding, no unsigned provider binding, durable recovery selection and immutable receipt. An injected receipt-write failure prevents acceptance and permits retry after repair.

The actual gateway router was also exercised against that database: a valid form returns exactly `success` without authentication or funding; a changed signed amount returns 400; an oversized form returns 413; JSON returns 415; GET returns 405. An injected receipt-write failure returns 503 without acknowledgment. Holding an exclusive database lock triggers the handler's two-second processing deadline, returns 502 within three seconds, and permits a valid retry after releasing the lock. The transport is configured but sends no upstream request in this test. All three gateway payment tests passed on a fresh database through migration 0095. Public network delivery timing and complete merchant callback-to-query settlement remain unqualified; F05 is still open.

## SDK checkpoint — 2026-10-06

The JavaScript SDK exposes `createCustomerTopup` and `getCustomerTopup`, with exported input/status types. Creation requires exact positive CNY nanounit strings in whole cents, a valid method and UUID idempotency key. It forwards only supported intent fields, preserves cancellation and never retries an uncertain creation automatically. Status is a bodyless company-scoped read. All 89 SDK tests passed, including values above JavaScript's safe integer range, rejected coercion/overflow/precision, excluded funding flags and single-attempt failure. A fresh npm archive includes the methods and types; controlled transport exercised both from the extracted package. No real payment or live installed checkout was performed.

## Verified lifecycle transport — 2026-10-06

The authenticated query transport now distinguishes pending, paid and closed results using the [documented query states](https://docs.zhifux.com/read/zhifufm/querybyoutno). Every result must match the saved merchant, merchant-order reference, requested amount and payment method, with a valid platform reference. Missing or unknown state and mismatched identity remain unresolved errors. Pending/closed results convey no funding authority; paid results additionally require the exact actual payment amount. Existing paid-only callers continue rejecting pending and closed results.

All 11 protocol/transport tests passed, including both non-paid states with missing actual amount, altered identity/amount/method/platform reference and missing/unknown states. Payment and gateway all-target Clippy passed. These tests use controlled upstream responses; this checkpoint does not close F05.

## Durable closure checkpoint — 2026-10-06

The recovery worker now uses verified lifecycle evidence. A matching closed query binds the immutable platform identity and records closure; pending remains eligible for a later query. Immutable closure excludes the order from recovery and prohibits settlement. Storage serializes closure and funding with the same company/order lock order, and database triggers additionally reject contradictory terminal records. A late paid/closed contradiction requires investigation rather than replacing either immutable result. Notification alone and errors never close an order.

Company status returns `closed` and withholds the checkout URL without exposing merchant/platform details. Retried creation for a closed intent returns its saved status without issuing another checkout. The installation reconciliation response reads the resulting durable status, rather than always claiming payment succeeded. The JavaScript SDK type includes `closed`.

Fresh PostgreSQL tests through migration 0096 passed: all 18 billing/top-up tests and all three gateway payment tests. Closure tests cover missing/bound identity, company scope, immutable replay, reopening, exclusion from recovery, paid-first/closed-first outcomes and a concurrent closure/settlement race. The gateway verifies customer closed status and withheld checkout. All 89 SDK tests passed. Actual merchant query-to-closure worker execution, process restart and complete checkout/paid lifecycle remain unqualified. F05 remains open.

## API contract checkpoint — 2026-10-06

The composed OpenAPI contract now includes company top-up creation/status, installation-only reconciliation and the public signed notification endpoint. Schemas preserve exact string amounts, idempotency, all four saved statuses and nullable checkout URLs. Authorization descriptions keep company billing separate from installation reconciliation; the callback explicitly overrides bearer authentication, documents ignored unsigned fields and returns plain `success` only for a durable verified receipt. Missing merchant configuration, storage failure, timeout and uncertain creation remain errors rather than fabricated payment success.

Both changed YAML documents parsed with duplicate-key rejection; 165 local references resolved, including all four new paths. Explicit checks verified the callback's unauthenticated signed boundary, exact acknowledgement and closed-status enum. Public-boundary and whitespace checks passed. This is contract structure verification alongside the preceding gateway fixtures, not complete OpenAPI conformance testing or live payment qualification.

## Checkout availability checkpoint — 2026-10-06

Company-authorized `GET /admin/v1/organizations/{organization}/billing/payment-methods` reports the configured checkout method codes only when integration exists and the company has a CNY account. Missing integration or account produces an explicit unavailable reason and empty choices. It performs no upstream query, creates no account and exposes no merchant credentials or account identifiers. Discovery requires company billing read access; creation still independently requires write permission and rechecks configuration/intent. Availability is not live collection qualification.

Fresh PostgreSQL gateway fixtures verify configured CNY availability, missing CNY account, unavailable integration, unauthenticated rejection, foreign-company rejection and absence of merchant/secret fields. All three payment gateway tests passed; all 90 SDK tests passed, including the new bodyless scoped discovery method, cancellation and invalid-route rejection. The exported SDK type and OpenAPI operation match the response. YAML and 167 local references passed. Customer checkout UI and actual merchant collection remain open; F05 is not complete.

## Backend checkout recovery history — 2026-10-06

Company-authorized `GET /admin/v1/organizations/{organization}/billing/topups` returns saved intents with creation dates, customer amounts, status and pending checkout URLs. It uses bounded 100-row keyset pages; `next_cursor` is passed as `before`. Foreign/missing cursors fail. The backend remains the source of truth across reconnecting and browser changes; no browser storage is needed to rediscover unfinished checkout. Paid/closed orders withhold checkout URLs. Internal routing/cursor references remain API-only values, not product labels; merchant/platform identity and procurement data are excluded.

All 19 billing/top-up PostgreSQL tests and three gateway payment tests passed. The history fixture creates 101 company orders plus a foreign order, verifies the 100/1 page split, exact cursor exclusion, foreign/missing cursor rejection, reopened-store checkout recovery and closure hiding. Gateway fixtures check company-owner list access and foreign-company rejection. All 91 SDK tests passed; storage/gateway all-target Clippy passed. Both YAML documents and 168 local references passed. No customer checkout UI changed: the existing global settings pattern and actual OpenRouter Credits page were inspected, but browser checkout, live merchant settlement and complete F05 remain open.

## Packaged recovery example — 2026-10-06

The npm package includes `examples/inspect-topups.mjs`, a read-only company checkout availability/history client. It preserves exact customer amounts, follows explicit bounded cursors with `--all` and omits internal references, checkout URLs and unrecognized confidential fields from output. Missing dates, contradictory terminal checkout links, invalid amounts, missing continuation and pagination loops fail without successful partial output. Authorization failures publish the HTTP status without the private response body. This client creates no order and claims no external payment reconciliation.

All 96 SDK tests passed. A fresh npm archive was extracted and all five recovery-example tests passed against its packaged example and runtime using controlled local HTTP responses. The archive contains the availability/history methods, types, README and executable example. No live merchant request or customer browser checkout was performed. The standard development service was stopped during this checkpoint; global Billing & payments UI wiring and rendered acceptance remain open.

### Global funding UI checkpoint — 2026-10-06

Global Settings → Payments reads payment availability and saved company top-ups. Authorized customers can enter an exact CNY amount, choose a configured payment method and create one checkout. An uncertain response never automatically reposts the creation request; customers can inspect saved orders and resume a pending checkout. Status checks read the selected saved order, terminal orders have no payment link, and observed paid orders refresh account balance and transactions. History pagination remains company scoped. Internal identifiers and merchant details are not displayed.

All 273 dashboard tests across 48 files passed, including six funding tests for exact amounts, configured choices, pending recovery, uncertain responses, read-only/unavailable states and paid status refresh. Type checking passed. The live global settings dialog was inspected at desktop and 390px: unavailable funding offers no fabricated Add funds action, the close control is reachable, and document width stays within the viewport. A source copy change appeared in the same open dialog without navigation or reload, verifying development HMR on port 2566.

Configured Add funds, its open payment-choice menu and pending checkout were inspected at desktop and 390px using a clearly labelled, isolated UI fixture mounting the real component. The temporary fixture was removed. This proves rendering and controlled interactions only: no merchant payment was made and no production balance was fabricated. Live merchant collection, paid settlement, worker/process restart recovery, refunds and complete F05 acceptance remain open.

### Pending-order identity recovery — 2026-10-06

Merchant query recovery now persists the verified platform reference even when the order is still pending. Previously this evidence was discarded until a paid or closed response arrived. The shared query-evidence application path now rejects any later platform-reference substitution before settlement or closure; a pending response still grants no funding authority.

All four gateway payment tests passed on fresh PostgreSQL through migration 0096. The new test applies controlled, already-verified query evidence to the production persistence path: pending identity survives reopening, mismatched paid and closed identities produce neither settlement nor closure, and repeated matching paid evidence creates exactly one settlement. Existing authorization, private configuration and durable callback tests also pass. Gateway all-target Clippy passed with warnings denied. This is controlled query-evidence and database coverage, not real merchant HTTPS traffic or process-restart payment qualification; F05 remains open.

## Stripe authentication foundation — 2026-10-07

The original `niu-payments::stripe` module authenticates exact raw webhook bytes using HMAC-SHA256, the endpoint secret and Stripe’s `t`/`v1` signature header. It accepts multiple rotation signatures, uses constant-time MAC verification and enforces a five-minute past/future timestamp window, a 256 KiB body cap and bounded header/signature counts. Safe errors omit payloads and credentials. Protocol behavior was checked against [Stripe’s webhook documentation](https://docs.stripe.com/events/manage-webhook-endpoints) and [official Python implementation](https://github.com/stripe/stripe-python/blob/master/stripe/_webhook.py); no upstream source was copied.

Authentication alone does not fund an account. Checkout creation, saved session/order and merchant binding, paid amount/currency validation, test/live separation, durable event deduplication, settlement, reconciliation and refunds remain required. The module is not yet exposed as a gateway callback and no live Stripe payment has been qualified.

Verification: all 13 payment-module tests passed, including an independently calculated Stripe signature vector, rotation, exact-byte tampering, incorrect secrets, stale/future timestamps and bounded malformed inputs. Payment-module all-target Clippy passed with warnings denied; public boundary checks passed. These checks establish authentication behavior only, not checkout or collection.

The Stripe protocol module also verifies signed paid Checkout events against saved session identity, client order reference, exact USD/CNY amount and currency, payment/complete/paid state and matching test/live modes. Amount conversion uses checked integer arithmetic. Connected-account events are rejected until explicit account binding is implemented. Only completed or asynchronous-success events can produce opaque paid evidence; that evidence still requires durable event deduplication and company-scoped settlement. See the [Checkout Session contract](https://docs.stripe.com/api/checkout/sessions/object).

Paid-event verification: all 14 payment tests and all-target Clippy passed. Signed fixtures reject wrong session/order, partial amounts, amount overflow, currency/mode changes, unpaid/open/subscription sessions and unbound connected accounts; asynchronous paid completion succeeds. No account was credited and no live checkout was initiated.

Stripe storage compatibility: migration 0145 permits bounded `cs_` Checkout references only for Stripe orders; legacy adapters retain their alphanumeric reference rules. The existing immutable identity and atomic funding/receipt/settlement transaction are reused. All eight top-up PostgreSQL tests passed in an isolated database, including concurrent Stripe settlement replay, reopened-store identity, partial-amount rejection and legacy reference rejection. This is trusted storage integration evidence; the Stripe HTTP handler and Checkout lifecycle are not yet connected.

Stripe gateway callback implementation: `/payments/stripe/notify` is bounded to 256 KiB and verifies raw signatures before reading an order reference. Trusted server environment configuration uses `NIU_STRIPE_MERCHANT` (a stable alphanumeric configuration alias), `NIU_STRIPE_WEBHOOK_SECRET` and explicit `NIU_STRIPE_MODE=test|live`. The endpoint loads only Stripe orders for that alias, requires a previously bound session, verifies paid evidence against saved amount/currency/reference and commits through the existing atomic settlement contract before HTTP 200. Session receipts suppress duplicate funding. No checkout creation is exposed yet; callback integration/restart fixtures and live merchant qualification remain required.

Stripe callback checkpoint: an isolated PostgreSQL router integration test passed for invalid-signature, signed-unpaid and wrong-merchant rejection without funding, followed by concurrent valid callback replay producing HTTP 200 and exactly one funding entry. This exercises the actual gateway route and storage commit. Checkout creation, process-restart delivery recovery, rollback injection, refunds and live merchant collection remain unqualified.

Callback rollback/recovery verification: the router/PostgreSQL fixture now injects a settlement-write failure, observes HTTP 503 with zero funding entries, removes the failure and reconstructs gateway/store state before concurrent callback retry. The retry commits exactly one funding entry. This is in-process state reconstruction, not a real process-restart qualification.

Checkout request parameters now derive one fixed prepaid line item from the saved 32-character order reference and exact USD/CNY minor units, with supported method and trusted HTTPS return validation. All 15 payment tests and all-target payment Clippy passed, including rejection of fractional minor units and insecure return URLs. Creation transport, uncertain-response reconciliation and customer initiation remain unfinished. See [Stripe Checkout creation](https://docs.stripe.com/api/checkout/sessions/create) and [idempotent requests](https://docs.stripe.com/api/idempotent_requests).

Stripe creation transport checkpoint: the fixed `https://api.stripe.com/v1/checkout/sessions` client uses explicit matching test/live API credentials, a deterministic saved-order idempotency header, disabled proxies/redirects/retries, a three-second connection bound, five-second request/body deadline and 64 KiB response limit. Returned session identity, order reference, amount, currency, mode and state must match; hosted checkout must use the Stripe HTTPS checkout origin. No accounting writes occur. All 17 payment tests and all-target payment Clippy passed, including an actual local HTTP fixture checking request parameters/idempotency and changed-response amount rejection. This does not qualify real Stripe access. Gateway initiation remains unwired. Migration 0146 now stores Stripe hosted URLs up to 8 KiB with their fragments, restricted to the exact HTTPS checkout origin; other adapters retain the 2 KiB/no-fragment rules.

Stripe hosted URL storage verification: all eight top-up PostgreSQL tests passed after migration 0146, including preservation of the checkout fragment across store reopening, rejection of deceptive origins/embedded credentials, immutable identity, concurrent settlement and legacy adapter behavior. Customer initiation and uncertain creation reconciliation remain unfinished.

Stripe customer initiation implementation: optional `NIU_STRIPE_API_KEY`, `NIU_STRIPE_CURRENCY=usd|cny`, trusted `NIU_STRIPE_SUCCESS_URL` / `NIU_STRIPE_CANCEL_URL` and explicit comma-separated `NIU_STRIPE_PAYMENT_METHODS` configure Checkout. The existing company-authorized top-up POST selects Stripe for its configured methods, validates whole minor units, saves intent and commits the creation claim before calling Stripe. A claimed uncertain order is not recreated. Saved paid/closed/checkout state is replayed from storage. Discovery accepts an explicit gateway and currency and returns one matching integration per request. Without a gateway selector, matching checkout configurations use EPay, then Stripe, then native Zhifux priority. Explicit gateway selection never falls through to another adapter. Simultaneous CNY EPay and USD Stripe discovery has local acceptance evidence above; the customer UI still needs currency/integration selection. Without an API key, the runtime is callback-only and advertises no Stripe checkout methods. Real creation-to-callback acceptance and uncertain creation reconciliation remain unqualified.

Stripe bound-session recovery: the existing installation-only reconciliation endpoint now routes saved Stripe orders to authenticated fixed-origin session retrieval. It requires the original configured merchant alias and stored session, shared database query admission, exact saved order/amount/currency and test/live mode. Confirmed paid sessions reuse atomic settlement; verified expired/unpaid sessions close the order; pending sessions grant no balance. Retrieval never creates another checkout. All 18 payment tests and payment Clippy passed, including real local HTTP lifecycle/mismatch fixtures. Gateway recovery wiring still requires an end-to-end transport/database fixture; unknown session identity after uncertain creation, actual process restart and live collection remain open.

Bound-session gateway recovery verification: an isolated PostgreSQL test passed through Niu’s reconciliation route and a local authenticated merchant HTTP fixture. Paid state creates one funding entry; pending state persists its hosted URL without funding; expired/unpaid state closes the order without funding. The fixture implements only retrieval, so no creation request can succeed. Payment Clippy and public-boundary checks passed. Loopback injection is restricted to the explicit `test-fixtures` crate feature enabled by gateway dev-dependencies; normal distribution must omit that feature and retains the fixed Stripe API origin. This does not prove live merchant behavior, process-restart recovery or unknown-session reconciliation.

Creation/lifecycle integration verification: the gateway/PostgreSQL fixture now exercises customer top-up POST → local merchant creation → durable checkout → repeated POST → authenticated lifecycle reconciliation. Three saved orders produce three creation requests despite six initiation calls. Checkout alone grants no funds; paid/pending/expired reconciliation retains the existing verified behavior. This is a local controlled fixture, not live merchant acceptance, actual restart or uncertain-response recovery.

## Administration support inventory API

`GET /admin/v1/platform/payments/integrations` returns the three supported adapter
identifiers, display names, configuration mechanisms and capability boundaries.
Use `admin.listPaymentIntegrations()` in the JavaScript SDK. Installation credentials
and members with an explicit platform-administrator grant can read this inventory.
A company owner or viewer without that grant cannot inspect platform payment
administration. It does not read merchant secrets or require upstream access.

`query_recovery` is `unsupported` for EPay, `bound_session` for Stripe and
`saved_order` for native Zhifux. `refunds` means initiating refunds, which is not
implemented by these adapters. The inventory is not the customer checkout menu:
continue to use company `payment-methods` for enabled methods. No inventory flag
claims merchant activation or a successful real transaction.

Current-input verification used the built SDK against the restarted gateway:
installation access returned exactly the documented fields and three adapters;
company owner/viewer access returned 403 and an invalid credential returned 401.
The company balance was unchanged before/after and temporary operators were
revoked. This verifies inventory serialization and authorization, not settlement.

### Unsupported reconciliation routing

The installation reconciliation endpoint dispatches only native Zhifux orders to
its native runtime and Stripe orders to bound-session recovery. Saved EPay orders
return HTTP 501 with `unsupported_operation_error` before native runtime access;
other unsupported adapter identifiers also return 501. Authentication and saved
order lookup precede this decision. EPay signed notifications remain the available
settlement mechanism. This aligns the endpoint with the support inventory rather
than reporting a missing native merchant configuration as an EPay upstream fault.

The implementation and contract were inspected and compiled. The current local
database has no saved top-up orders, so the new EPay order branch has not been
verified by a current-input end-to-end run. No fake paid order or fixture outcome
is used to claim that verification.

## Platform grant and EPay secret lifecycle checkpoint

On 2026-10-10, a current native run exercised EPay configuration with a company
viewer explicitly granted platform administration by a database administrator.
The same member session could save a disabled configuration, retain its key by
sending an empty key field, change a supported method, restart the gateway, and
explicitly replace the key. All three configuration events retained that member's
audit identity. Independent AES-GCM decoding of the saved database ciphertext
confirmed original-key retention and replacement; response inspection found no
secret values. The supplied keys were fresh private configuration inputs, not
asserted activated merchant credentials.

Before the grant, both the viewer and an ordinary company owner were denied
configuration reads. After grant revocation, both reads and writes through the
same viewer session were denied again. Denied writes left the saved revision and
ciphertext hash unchanged. Independent database reads found three configuration
events, no checkout orders and no balance entries. Original development data and
credentials were preserved; isolated processes were stopped.

This verifies the actual local configuration, encryption, audit and authorization
workflow. It does not establish merchant eligibility, upstream payment success,
callback delivery or external settlement, and none was required for this check.

### Platform-member inventory consistency — 2026-10-10

A current native request reproduced a permission mismatch: a company viewer with
an explicit platform-admin grant could use platform payment configuration but
received 403 from the support inventory. The inventory now uses the same shared
platform authorization helper. Customer company roles alone still grant no
platform access, and no merchant configuration is included in the inventory.

On a fresh isolated gateway/database, a viewer initially received 403. After an
explicit database-administrator grant with its immutable event, the same session
received 200 and exactly the installation-visible adapter/field inventory.
Restart retained access. Revoking the grant with its event immediately restored
403 for that session. Independent database reads confirmed both grant events,
zero top-up orders and zero balance entries. The original development database
and encrypted credential identity remained unchanged. This verifies the exercised
permission and serialization boundary, not payment activation or settlement.
