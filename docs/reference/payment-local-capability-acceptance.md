# Actual payment capability and negative-path acceptance

This records a bounded S06-3 actual HTTP and compiled JavaScript SDK run, separating Niu's integration capabilities from external merchant activation. It supplements the [payment capability matrix](payment-capability-matrix.md) and [payment integration records](payment-aggregators.md). It does not certify received cash or claim that an absent paid/closed sample was exercised.

## Pinned execution and legitimate source data

The Gateway and compiled SDK both use retained committed revision `4c3def6381e839d1206d5dd13b3b42632b0ef036`. The Gateway binary SHA is independently checked. The stopped source copy has maximum applied migration 278; the actual Gateway migrates it to 287, independently verified with successful migration records. Original deployment, database, credentials and encryption identity remain untouched.

The source is an independently verified actual uncertain Zhifux checkout intent from an earlier merchant-creation refusal. Its immutable order and original durable creation claim are retained. There is no legitimate paid or closed order in the bounded source, and no settlement, closure or funding receipt is inserted to reach a terminal branch.

Thirty actual HTTP responses are recorded through compiled SDK helpers and direct callback requests. The client uses the real native Gateway, with no mocked Provider or callback success. The merchant-unconfigured phase uses no payment deployment configuration. The later local phase saves a clearly **unactivated** EPay configuration whose checkout URL targets the reserved `.invalid` domain. That URL is constructed and checked, never followed; it is not external-service success or payment authorization.

## Exercised behavior

| Actual path | Verified result |
| --- | --- |
| Integration inventory without merchant configuration | EPay, Stripe and Zhifux remain listed, all with checkout disabled. Supported integrations do not disappear because a merchant is inactive. |
| Original saved uncertain order | Company owner can read history; installation detail remains `reconciliation_required` with no checkout URL. |
| Original order reconciliation without merchant configuration | HTTP 502; the saved order and original creation claim remain unchanged, without creating another merchant request or funding. |
| Reconciliation authorization and scope | Company-owner reconcile returns 403; foreign-company detail returns 404; unauthenticated reconcile returns 401 and a missing order returns 404 before merchant configuration is used. |
| Local EPay configuration and checkout | The SDK saves revision `1`, exposing `has_key` without the secret; CNY payment-method discovery becomes available. Actual creation returns one durable `pending` intent and a local signed checkout URL. |
| Exact checkout identity and amount | Independent verification recomputes the checkout signature and checks order reference, merchant configuration, selected method and exact CNY decimal amount against native storage. No private merchant key appears in the response. |
| Identical replay and changed input | Identical SDK creation returns the same saved order; changing amount or method under the same idempotency key returns 409. |
| Pending EPay query recovery | Actual reconcile returns 501; local checkout capability does not imply supported independent EPay query recovery. |
| Unsigned EPay callback | Two initial submissions and a post-restart submission return 400. The input contains an explicit unpaid state and invalid signature, never fabricated paid evidence. Empty query and JSON-form mismatch also return 400. |
| Other unconfigured/malformed callbacks | Stripe without deployment configuration returns 502; malformed Zhifux form returns 422. Neither is acknowledged as successful payment. |
| Gateway restart | New pending checkout, identical replay and history persist. The original uncertain order remains unchanged; repeated reconciliation still returns 502 and does not resubmit merchant creation. |

## Independent final artifacts

A separate reader reopens the stopped source and final native databases. The complete original order row and original creation-claim fingerprint remain identical. Final cardinalities are exactly two saved orders, one local EPay checkout and one original remote-creation claim. Provider-order identities, verified notifications, settlements, closures and funding receipts all remain zero. The seven complete original financial/request table fingerprints remain unchanged.

The independent reader checks saved raw response SHA-256 values, customer-safe top-up projections, exact local checkout signature and amount, native idempotency identity, one accepted configuration revision/audit event and revoked temporary operators. There are zero new external payment requests and zero model generations. All verification processes are stopped.

## Terminal-state evidence gap

Current source places durable paid/closed status reads after installation authorization and scoped lookup, before requiring merchant configuration or sending a query. This is an implemented terminal-reconcile shortcut, not actual positive acceptance: the inspected installation and selected legitimate source contain no nonempty paid/closed order.

The paid and closed branches therefore remain explicitly unverified by this run. A fixture, fabricated provider reference, SQL-created closure or invented funding receipt cannot close that gap. External merchant activation is separate from the supported integration inventory and exercised local/negative capabilities; this bounded result neither requires every integration to be activated nor silently declares received-cash settlement complete.
