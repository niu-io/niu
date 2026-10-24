# Mock payments

A built-in, opt-in simulated merchant for local and hosted Niu installations.
Users enable or disable it in Admin → Payment gateways → Mock payments.

The plugin owns merchant checkout sessions, scenario selection, notification
scheduling, retry history and activation state. It uses Stripe-shaped requests
and signed callbacks. Niu core owns authorization, order binding, reconciliation
and the authoritative ledger; this plugin never writes ledger tables.

`service.py` runs on a private loopback port. The gateway exposes only checkout
capabilities and assets under `/api/plugins/v1/mock-payments/`. `storage.py`
provides persistent PostgreSQL storage in `mock_payments`; SQLite remains
available for local development. `launch.py` supervises the merchant and gateway
in a composed single-container deployment. Hosted state starts disabled and
persists across deploys. The checkout UI is built from
`apps/dashboard/mock-payments` to reuse the installed Niu shadcn controls.

See [configuration and scenarios](../../docs/reference/mock-payments.md).
No real funds are collected. Simulated credits do not pay real upstream costs.
