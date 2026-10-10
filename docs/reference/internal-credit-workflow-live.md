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

## Priced stream disconnected before terminal usage

A current-input run on 2026-10-10 at backend revision `59922df` deliberately
closed a real GPT-4.1-mini streaming response after receiving its first content
event. It used another isolated database, the same explicit internal rates and
credit setup, and a 512-token output limit. The API key's spending limit equaled
the configured maximum reservation: **758,519 USD nanounits**.

Independent database and management API reads established:

- One dispatched attempt remained `may_have_executed`, with `unknown` usage,
  absent input/output token totals, no customer charge and no balance debit.
- The balance stayed zero, reserved capacity stayed 758,519 and available credit
  stayed 999,241,481. Logs showed `pending` customer charging with no amount and
  incomplete response timing. Its initial HTTP 200 did not imply full delivery;
  no upstream failure cause was fabricated.
- A further request returned HTTP 402 `key_spending_limit_exceeded`, without
  another attempt. Rotation revoked the old secret (HTTP 401) but did not reset
  the replacement's reservation or spending limit.
- After restart and more than one recovery interval, the same unknown state,
  pending charge, hold and key-cap refusal remained. Revoking the final key also
  did not release the hold. No elapsed-time assumption converted uncertainty
  into a free request or an estimated debit.

The temporary mapping was disabled and the isolated processes stopped while
preserving the unresolved record for diagnosis. The main database and original
encrypted identity were unchanged. This verifies conservative handling of one
actual interrupted priced stream; it does not determine the Provider's final
bill, qualify later reconciliation without Provider evidence, or establish every
cancellation race. No fixture outcome supports this result.

## Limits

This qualifies the described credit-backed text/structured-output workflow with
real current upstream output and persisted financial artifacts. It does not
qualify verified merchant top-ups, cash collection, positive Supplier earnings,
media charges, mixed historical receivables, concurrent settlement recovery,
lost commit acknowledgements, frontend presentation or sustained performance.
The refund was an internal balance reversal, not an upstream or bank refund.
## Customer tariff changes on a running gateway

A current-input run on 2026-10-10 using backend `5a2449d` verified price changes
through the actual management and inference APIs in a separate native database.
After an actual structured completion, administration published a new customer
tariff with the prior revision as its optimistic precondition. Replaying that
stale update returned HTTP 409. Without restarting the gateway, a subsequent
actual streamed completion used the new tariff.

Independent arithmetic used each response's reported input/output usage and its
applicable rates. The first rates were 123,456,789 / 987,654,321 USD nanounits per
million input/output tokens; the new rates were 234,567,891 / 876,543,219. Database
reads confirmed two distinct immutable charge revisions, with the original
request still bound to its original revision. Procurement rates were unchanged
and their separate arithmetic was checked too.

The first response reported 46 input / 10 output tokens and cost 15,556
nanounits; the second reported 15 / 6 and cost 8,778 nanounits.

The statement contained two revision-specific lines whose sum equaled the exact
customer debits. No reservation remained and reconciliation reported no
discrepancy. The same run verified consumed-key-limit rejection, idempotent balance
refund, and preservation of both charges and invoice settlement after restart.
No external funding receipt or commercial Supplier qualification was created.
Temporary access was revoked and isolated processes stopped; the original
credential revision and encrypted identity were unchanged.

This verifies sequential tariff publication and historical attribution for these
two real requests. Concurrent publication during dispatch, cached-token tariff
changes, media rates and multiple gateway instances are outside this run.
