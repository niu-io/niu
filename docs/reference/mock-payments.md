# Mock payment service

Issue: [#99](https://github.com/niu-io/niu/issues/99).

The built-in `plugins/mock-payments` plugin is an opt-in simulated merchant for local and hosted installations. It uses the existing Stripe-shaped checkout, signed notification, reconciliation and top-up settlement paths. It never connects to Stripe or writes Niu balances directly. Hosted merchant sessions, enablement and notification attempts persist in the plugin-owned PostgreSQL `mock_payments` schema; local development may use SQLite; Niu orders and ledger entries remain in PostgreSQL.

## Local use

Start the normal development stack with `pnpm dev`, then open **Admin → Payment gateways → Mock payments → Configure**. Enable mock payments and save. New development installations start with this gateway disabled. The selection persists across service restarts and can be turned off from the same dialog. Disable other payment gateways before enabling it.

The local launcher prepares the internal merchant service automatically. Release builds can include the same plugin with `--features mock-payments`; users decide whether to enable it through the configuration dialog. An already running stack from before this feature needs one normal restart to load the new gateway capability; no separate launch mode is needed afterward.

**Only payment collection is simulated. LLM requests still incur real upstream Provider charges. Simulated funds do not pay for upstream usage.** This warning appears in the gateway configuration dialog, active dashboard, top-up dialog and payment sandbox. The backend-reported activation state controls the dashboard warning.

Simulated successful payments create ledger entries through the ordinary authenticated settlement path. The merchant is recorded as `NiuMockPayments`; top-up API responses and history retain a `simulated` flag even after the plugin is disabled. Disabling the gateway stops new checkout creation; already queued notifications continue so existing test orders can finish. The independent availability controls below simulate outages without changing the saved enable/disable selection.

Use Account Settings → Credits → Add credits. The configured platform currency is read when the gateway starts (USD before currency setup). Only the already-supported USD/CNY top-up units are simulated. Restart after initial platform currency configuration; this is not another currency setting. Other active merchant integrations must be disabled before enabling mock payments. A missing currency balance account remains an ordinary prerequisite; the mock does not create customer accounts or grants.

The checkout shows the exact saved amount, a **Test environment** label and a scenario menu. No card details or real money are collected. Returning to Niu is not proof of settlement: check the saved top-up status and ledger. For a fresh isolated test database rather than your normal development data, use the verification script below.

## Scenarios

| Scenario | Merchant evidence | Expected Niu behavior |
| --- | --- | --- |
| Successful payment | Signed completed/paid event | Credit once after order, amount, currency and mode checks |
| Payment declined / customer cancels | Expired unpaid session; non-paid event | No credit; administrator-authenticated reconciliation closes the order |
| Payment timeout | Open unpaid session; no event | Pending, no credit; no automatic duplicate checkout |
| Delayed confirmation | Paid event scheduled 15 seconds later | Credit from verified callback or authenticated query, never merely browser return |
| Duplicate confirmation | Same event delivered twice | One settlement and one balance credit |
| Out-of-order events | Paid event followed by stale unpaid failure | Reject unsupported stale evidence; never undo the settled credit |

Once selected, a scenario is immutable. Repeating it is idempotent. Create a new test top-up to try another result. Delivery failures are retried up to eight times with bounded backoff; the checkout displays attempts/acceptance. Unsupported non-paid callbacks may be rejected by Niu: cancellation/failure recovery uses the administrator-only `POST /api/v1/organizations/{organization}/billing/topups/{order}/reconcile` session-query path. The customer status read does not itself query the merchant or close the order. The timeout intentionally stays pending rather than inventing a merchant decision.

The service's authenticated `POST /control` accepts `{"readiness":"ready"}`, `unconfigured`, or `unavailable`. `GET /healthz` reports the current persisted state and returns 503 unless ready. Non-ready states prevent checkout creation and merchant queries; queued callbacks are not discarded. These are test signals for the planned global payment gate, **not an implementation of that gate**. Niu's current integration inventory still describes local configuration, not verified operational readiness.

## Boundaries

- Gateway availability requires a build with `--features mock-payments` and `NIU_MOCK_PAYMENT_URL` pointing to the internal loopback HTTP merchant. There is no debug-build or environment-name restriction. Availability does not enable the gateway: the persisted user selection does.
- The mock service itself binds only `127.0.0.1`; its callback uses that explicit loopback address; the browser return URL may use the configured hosted HTTPS origin. It rejects unexpected Host headers and cross-origin checkout mutations. Management and Stripe-shaped endpoints require the private test API key. Checkout tokens authorize only that order's test result and are never logged.
- `NIU_MOCK_PAYMENT_KEY` must begin `sk_test_`, and `NIU_MOCK_PAYMENT_SECRET` must begin `whsec_`; both require at least 32 characters. The launcher persists generated values outside the repository. Never reuse real merchant credentials.
- Real Stripe API/checkout URL restrictions remain unchanged in ordinary builds. Mock orders retain a protocol-shaped HTTPS placeholder in storage; the gateway rewrites only mock-owned checkout capabilities to its configured public checkout URL, or to the local merchant in development when presenting detail/history in explicitly configured mock builds. The placeholder is never navigated in the test flow; no database URL constraint is relaxed.
- The mock does not qualify a real merchant, prove production payment readiness, transfer money, or bypass normal account/authorization/ledger checks. Enabling the plugin supplies simulated payment readiness; it does not claim real merchant verification.

Standalone service flags are listed by `python3 tools/mock-payments/service.py --help`. Build its UI with `pnpm --dir apps/dashboard exec vite build --config mock-payments/vite.config.ts`. The service requires explicit test credentials; select a private persistent `--state` directory.

## Verification

```sh
python3 -m unittest discover -s tools/mock-payments -p 'test_*.py'
cargo test -p niu-payments
cargo test -p niu-payments --features mock-payments
cargo build --locked -p niu-gateway --features mock-payments
python3 scripts/native-mock-payments.py
```

The native test creates and removes its own PostgreSQL cluster, mock database and random test secrets. It executes actual gateway HTTP checkout and callbacks, checks persisted settlements/credits, rejects forged or mismatched evidence, verifies duplicate/stale events, and restarts both services with a delayed event pending. `--hold` starts an isolated live-source dashboard and keeps it and the checkout available for twenty minutes. It prints the dashboard URL, test login name and a private password-file path. This enables account-to-checkout browser verification without stopping an existing development stack; interruption cleans up the fixtures. No production records or customer credentials are used.

Fixture-test results do not establish correctness. Verify current-input checkout, signed notification delivery and final order/ledger artifacts independently, including duplicate delivery and restart recovery.

The checkout composition follows the inspected [Stripe Checkout full-page pattern](https://docs.stripe.com/payments/checkout): order/amount summary beside the action, stacked on narrow screens. The test-only interaction follows [Stripe's testing separation](https://docs.stripe.com/testing), with explicit simulation choices instead of collecting unnecessary payment details. Shared Niu shadcn primitives and theme tokens supply the controls and appearance. These references do not imply full Stripe API compatibility.

## Developer workflow and diagnostics

The payment sandbox presents the saved order amount, scenario behavior and expected Niu outcome before execution. Event deliveries show a durable per-attempt timestamp and HTTP response, current retry state and the next scheduled delivery. Transport errors are reported as connection failures, not fabricated HTTP codes. The page preserves the last known result during a disconnection and keeps failed action feedback visible.

After eight unsuccessful automatic attempts, **Resend notification** queues the original signed event payload again. A new timestamp/signature is generated for transport; the event identity and payment evidence remain unchanged. Original attempts remain visible. Repeated requests to resend the same exhausted delivery are idempotent. This cannot change the scenario, generate a new payment intent, or directly credit a balance.

Use the development control command to simulate merchant availability without copying secrets into terminal arguments:

```sh
python3 tools/mock-payments/control.py status
python3 tools/mock-payments/control.py unavailable
python3 tools/mock-payments/control.py unconfigured
python3 tools/mock-payments/control.py ready
```

The command reads the launcher's private credentials file. `--url` and `--credentials` support separate local fixtures; URLs remain restricted to loopback HTTP. Restore `ready` after an availability test. These controls affect checkout creation and authenticated merchant queries, while already queued notifications continue to exercise recovery independently.

The delivery detail and resend behavior follow the inspected [Stripe webhook delivery workflow](https://docs.stripe.com/webhooks#view-event-deliveries). Niu shows only supported diagnostic information and does not expose internal payment identifiers or secrets.

## Activation API

`GET /api/v1/platform/payments/mock` returns `data.available`, `data.enabled` and, when the merchant is reachable, `data.readiness`. `PUT` on the same route accepts only `{ "enabled": true }` or `{ "enabled": false }`. Both operations require platform administration authority. Activation requires a configured plugin and is refused while another payment gateway is active. Settings contain no merchant secrets.

`GET /api/v1/payments/environment` exposes only the public `data.mock_payments` boolean needed for the application warning. Merchant connection failures return an error rather than incorrectly claiming that mock mode has been disabled; clients retain their last known warning. This is a simulation-mode signal, not an installation readiness check or a replacement for the global payment admission requirement in UX-04.

## Hosted composition

The public plugin source is `plugins/mock-payments`; the existing dashboard mock-checkout build supplies its UI using Niu primitives. The merchant implements the existing Stripe-shaped payment transport, without ledger access. This is a payment integration, not a dynamically loaded extension. Cloud distributions package the plugin, UI and `launch.py` process supervisor with their pinned core artifact.

Configure runtime secrets outside source control:

- `NIU_MOCK_PAYMENT_URL=http://127.0.0.1:2570`
- `NIU_MOCK_PAYMENT_PUBLIC_URL=https://your-host/api/plugins/v1/mock-payments`
- `NIU_MOCK_PAYMENT_KEY`: private `sk_test_` credential, at least 32 characters
- `NIU_MOCK_PAYMENT_SECRET`: private `whsec_` signing secret, at least 32 characters
- `NIU_MOCK_PAYMENT_DATABASE_URL`: persistent PostgreSQL connection for plugin-owned tables

Build the checkout with `NIU_MOCK_PAYMENT_UI_BASE=/api/plugins/v1/mock-payments/`. The host forwards only bounded checkout capability paths and static assets, checks the browser Origin for mutations, and never exposes merchant credentials, control or Stripe-shaped merchant API endpoints. New merchant state starts disabled; saved selections survive replacement containers. Disabling prevents new checkouts but allows existing signed notifications to finish. Simulated credits are not real collected funds.

### 2026-10-24 current-input verification

A production dashboard bundle and running gateway/merchant were exercised with newly created payment intents, backed by PostgreSQL. After saving an intent, both processes were restarted before choosing duplicate confirmation. Independent ledger queries found two accepted deliveries but exactly one settlement and one matching credit. A declined payment added no credit. A delayed confirmation settled after merchant restart while activation remained disabled. The saved paid-order API retained `simulated: true` after disabling. These observations are local integration evidence, not a substitute for hosted acceptance.

The checkout and configuration dialog were inspected at desktop, 900px and 390px, including the open scenario menu and Escape dismissal. Measured document width matched the narrow viewport. The existing Stripe full-page composition and Niu shadcn controls were preserved; simulation labeling, save feedback and historical provenance were reviewed separately from accounting results.

Hosted v0.2.25 was subsequently verified through fresh browser and API checkout flows. Duplicate notifications produced one matching transaction; success, out-of-order and delayed scenarios each credited once, while declined, cancelled and timed-out scenarios added no credit. Independent final balance and transaction reads matched the successful intent amounts and preserved other-currency balances. A service restart preserved the disabled selection and saved orders; simulated provenance remained visible. Public control paths returned 404, cross-origin mutations 403, and unauthenticated administration reads 401. No upstream model calls or real payments were made.

Terminal unpaid customer recovery remains a separate limitation: declined and cancelled orders stay pending, and the browser administrator cannot use the installation-only reconciliation API. See [#114](https://github.com/niu-io/niu/issues/114), tracked as `niu-0gj`; hosted support and its acceptance evidence are recorded in [#99](https://github.com/niu-io/niu/issues/99), tracked as `niu-2m3`.
