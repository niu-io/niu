# Current-input credit-backed billing workflow

Date: 2026-10-10. Backend revision: `b1223c0`.

## Scope

This run used a separate native PostgreSQL database and local gateway, created
through normal migrations. Management APIs created a private model mapping,
workspace, customer tariff, procurement budget, API key and an administrator-set
USD 1 credit limit. No financial rows were inserted directly. No top-up receipt,
external invoice payment or Supplier qualification was fabricated.

The upstream calls used the owner's personal OpenRouter credential and
`openai/gpt-4.1-mini`, solely for internal self-funded verification. The isolated
mapping was not published to a catalog and had no commercial Supplier offer.
Its configured customer and expense rates were deliberately distinct verification
inputs, not asserted market prices or an external Supplier invoice. This does not
establish supply rights, discounts, resale readiness or Supplier earnings.

The existing development database and original credential identity were preserved.
The isolated servers were stopped afterward. Private artifacts contain the
requests' usage, output hashes, financial observations and retained database.

## Actual execution and independently checked results

Before granting credit, a strict-schema request returned HTTP 402 and left no
attempt. After the explicit credit policy change, two real upstream requests
completed. The second followed a gateway restart.

| Request | Reported input tokens | Reported output tokens | Customer charge, USD nanounits |
| --- | ---: | ---: | ---: |
| Strict JSON schema with a fresh marker | 48 | 11 | 16,791 |
| Streamed text after restart | 16 | 7 | 8,889 |

The configured customer rates were 123,456,789 input and 987,654,321 output
nanounits per million tokens. A separate integer calculation rounded the combined
charge upward once. Independent database reads matched each result to its
immutable customer charge, negative balance entry and reported usage. Configured
expense amounts were checked independently and were not substituted for customer
charges. Both balance holds were released.

The balance API returned a negative balance of 25,680 nanounits, zero reserved
amount and available capacity equal to credit minus that balance debt. The
reconciliation API matched original expected and posted charges, with zero
missing, mismatched, unexpected or duplicate sources and no settled open hold.

The initial verification script incorrectly requested an interval starting at
the Unix epoch. The API rejected that interval because it exceeded 366 days.
A fresh complete run used the actual dispatch interval and observed:

- An invoice totaling 25,680 nanounits; repeating the same creation request
  returned the same invoice. Text lines summed to the exact invoice total.
- Invoice status `paid` and `due_nanos: "0"` because balance debits already
  settled the statement. The account debt remained in the balance ledger.
- A new external-payment record for that balance-backed invoice returned 409;
  no external payment was recorded.
- Setting the API key's spending cap to its consumed amount caused the next
  request to return 402 with `key_spending_limit_exceeded`. The attempt count
  remained two.
- Reversing the first debit through the administrator API and repeating the same
  idempotency key created one refund. The remaining balance debt was 8,889
  nanounits; the original invoice did not reopen as a new obligation.
- Another gateway restart preserved two customer charges and two original
  debits, with no duplicate accrual or reopened invoice debt.

The temporary API key was revoked and the isolated mapping and Supplier disabled.
No fixture outcome is used as evidence.

## Customer reporting with actual positive charges

A separate current-input run on 2026-10-10 at backend revision `59922df` checked
the customer/procurement boundary using two new upstream completions and distinct
internal customer and expense rates. Independent usage-based arithmetic and
database reads established customer charges of 17,902 and 9,877 USD nanounits,
totaling 27,779. These configured expense rates are verification inputs, not a
claim about an external Supplier invoice or commercial margin.

Both a workspace-scoped viewer and the installation administrator read the same
customer-facing APIs:

- Logs and each request detail exposed the corresponding customer charge, USD
  currency and `charged` state. Aggregate input/output usage matched the two
  client responses, and the customer-charge summary totaled 27,779.
- The billing overview, paid invoice lines and two-row CSV export agreed on that
  total. Structured responses and CSV headers contained no procurement amount,
  expense-rate, internal price-revision or margin fields checked by the verifier.
  Installation access did not add those fields to the customer views.
- The dedicated platform cost endpoint returned the independently checked
  internal expense amounts to the installation administrator. The customer
  viewer received HTTP 403 on that endpoint, demonstrating that the customer
  views' omission was not caused by absent expense records.
- A viewer scoped to another workspace received HTTP 404 for the first
  workspace's Logs, request detail, CSV, billing, invoice and procurement routes.

The same run completed key-cap enforcement, idempotent balance refund and restart
preservation with zero charge-reconciliation discrepancies. Temporary viewer
credentials and inference access were revoked, the test mapping disabled, and
the isolated gateway/database stopped. The original database and encrypted
credential identity remained unchanged.

This is positive text-charge evidence for the listed APIs and roles. It does not
qualify Chat persistence, media receipts, every authorization role, frontend
rendering or all possible serialized fields. No fixture outcome supports it.

## Limits

This qualifies the described credit-backed text/structured-output workflow with
real current upstream output and persisted financial artifacts. It does not
qualify verified merchant top-ups, cash collection, positive Supplier earnings,
media charges, mixed historical receivables, concurrent settlement recovery,
lost commit acknowledgements, frontend presentation or sustained performance.
The refund was an internal balance reversal, not an upstream or bank refund.
