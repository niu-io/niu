# Customer invoice and Supplier accounting capability checkpoint

This bounded S05-3 checkpoint verifies current invoice serialization and Supplier negative accounting boundaries. It distinguishes implemented capability from unavailable positive earning/media evidence, rather than making external partner activation the implementation gate.

## Current actual invoice reads

Native `8bfdef10003eebe9402401247aa52cd69d3a398f` (SHA-256 `6f5290d182c9bf51de1f2bb8d469067351c9f9771150235adc2917b1d39c6900`), schema 293, and public compiled SDK `ce97f3b0116570dfd2a487b802d2d2de18efbf39` ran against an isolated stopped-database copy of [the genuine invoice checkpoint](invoice-payment-boundary-acceptance.md). Payment and video polling were disabled. No invoice was newly issued, no model/merchant/Provider was called, and no commercial agreement, tariff, earning or funding receipt was manufactured.

The actual SDK `getCustomerInvoiceLines` and `listCustomerInvoices` returned the existing invoice: four aggregated text lines representing twelve real charges totaling **132,227 nanounits**. Its paid status reflects existing posted customer debits, not a cash payment receipt. The customer request CSV had twelve rows with the same exact total. The current invoice lines equaled the original saved actual response, including immutable rates, nullable token categories, fee fields and currency. Media lines remained empty.

Gateway restart returned the same SDK detail/history. The customer viewer received 403 on procurement access; customer JSON and CSV retained their customer-facing charge boundaries. Both temporary readers were revoked, with subsequent HTTP 401. No Supplier purchase price, credential, margin or procurement field was substituted for a customer charge.

## Current Supplier negative boundaries

An existing Supplier in this real accounting copy had no earnings or settlements. Platform GETs returned the explicit empty history. The workspace viewer was denied Supplier earning/settlement access. A settlement selecting an absent unpaid earning returned 409; repeating the identical unconfirmed negative request still returned 409. The workspace viewer's settlement write returned 403. No earning, settlement, settlement entry or payment audit was created by those refused requests.

These are actual authorization and refusal results. An empty history does not verify nonempty serialization, pagination, accrual, payment recording, currency totals or successful settlement. The separate [Supplier history checkpoint](supplier-settlement-history.md) retains its active Supplier-membership/read/revocation evidence; this run did not repeat that positive membership branch.

## Independent final state

A separate reader reopened both stopped source and final databases. All seventeen retained request/customer invoice/financial/Supplier/Provider/model table fingerprints matched exactly. Native records retained twelve charges totaling 132,227, twelve invoice entries, zero cash invoice payments, zero Supplier earnings and zero Supplier settlements. Current invoice fields equaled the original actual receipt. Both new readers were independently confirmed revoked and the copied services were stopped. No original database, configuration or encrypted identity was replaced.

## Implemented transitions and remaining proof

Source review found the following existing mechanisms, without a demonstrated defect requiring speculative changes:

- Earning accrual uses the original pinned Supplier offer, confirmed completion and reported required token categories or the separate Supplier-media pricing path. Required missing categories remain unresolved; recovered earnings do not reprice earlier attempts.
- Settlement recording is platform-only and does not transfer money. It locks the selected Supplier, selects only its unpaid earnings, requires one currency, computes the total with checked arithmetic, and atomically records immutable settlement links and an audit event. Identical idempotency replay returns the existing identity; changed selections/reference and duplicate payment references conflict. Storage waits are bounded.
- Customer invoices use customer charge projections and immutable historical rates. Supplier earnings use a separate platform history, and active Supplier members may read only their own settlement history. Customer workspace authority does not grant procurement or settlement-write authority.

These inspected mechanisms are implemented contracts, not positive execution proof. Remaining positive evidence is nonempty Supplier text/media earning accrual and serialization, an already confirmed external-payment settlement recording/replay with genuine selected earnings, and a positive customer-media invoice with exact reported meter/charge/debit. No payment transfer is required to implement the recording interface, but a fabricated receipt cannot verify successful recording. [Reported media acceptance](reported-media-meter-acceptance.md) separately verifies genuine nonzero video-token metadata with unknown pricing, without treating it as a customer charge.

S05-3's positive evidence boundary remains explicit. External account activation and human/partner approval are separate from interface capability. Fixture outcomes provide no evidence, and this checkpoint does not claim frontend rendering or complete accounting acceptance.
