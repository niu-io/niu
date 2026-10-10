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

## Revocation preserves financial history

A separate actual run on 2026-10-10 using backend `5a2449d` completed the two-call
credit workflow, created its paid statement, exercised the key cap and posted an
idempotent balance refund. It then revoked the inference key through management
HTTP. Inference with that credential returned 401 both immediately and after a
gateway restart; the database still contained exactly the two original attempts.

Installation-authorized request listing and individual details continued to
return both original customer charges. The saved statement retained their full
original total, while the refund remained a separate ledger event. Independent
database and reconciliation reads found no missing, mismatched, unexpected or
duplicate debit and no settled open reservation. No external funding evidence was
created, and isolated processes were stopped without changing the original
database or encrypted credential identity.

This verifies completed text-request history after key revocation. It does not
establish mid-stream revocation behavior, ordinary-role history access, or media
retrieval with a revoked key.

## Balance transaction pagination

On 2026-10-10, a fresh isolated native run created two actual upstream completions
and independently verified their charges. Normal refund API calls against those
charges then produced a nonempty multi-page ledger without creating funding
receipts or modifying charge records.

The first 109 entries were returned as 100 and 9 entries, in exactly the order
read independently from PostgreSQL. An additional one-nanounit refund inserted
between page reads appeared on a refreshed first page; the older page still
matched the original remaining nine entries. Unknown and other-company cursors
returned HTTP 409. Reading after the oldest entry returned an empty page and a
null cursor. After gateway restart, a complete traversal matched all 110 database
entries by order and identity, with no duplicates and the same signed amount sum.

This verifies the documented live-view pagination behavior for actual charge and
refund entries. It does not establish snapshot export semantics, large-ledger
performance or externally settled funding reversals. The original development
database and encrypted credential identity were unchanged.

## Shared company credit across workspaces

A fresh isolated current-input run on 2026-10-10 configured two workspaces with
independent API keys and the same customer tariff under one company. Approved
credit equaled exactly one request's configured maximum liability, using its
input bound and forwarded output limit. Two concurrent actual requests competed
for that capacity: one completed with the requested marker and the other returned
HTTP 402.

Independent database reads found exactly one durable dispatch and one charge.
The charge matched integer arithmetic from the successful response's reported
tokens. No active reservation remained. Only the winning workspace's billing
included that charge; the shared company balance and available capacity matched
it exactly. Restart preserved the single charge and company balance. Both keys
were revoked afterwards, and the original development identity was unchanged.
This verifies the exercised two-workspace admission boundary, not a throughput
limit or every combination of workspace/key caps. No settled funding receipt or
commercial Supplier qualification was introduced.

## Key rotation during an actual stream

A fresh isolated current-input run on 2026-10-10 rotated a workspace API key after
the first content chunk of a real stream, while its full customer liability was
still reserved. The old secret then returned HTTP 401. Its replacement inherited
the reservation and returned `key_spending_limit_exceeded` (402) for a competing
request. Increasing only the temporary spending cap exposed the independent
shared concurrency limit: the replacement returned `key_concurrency_exceeded`
(429), with no second durable dispatch.

The original stream delivered the requested marker and all 500 ordered values,
terminal stream evidence and reported usage. Independently calculated charges
matched exactly one ledger debit; the hold was released. After lowering the cap
to its original value, a new full-bound request using the replacement returned
402 because the earlier charge still consumed allowance. Restart preserved the
remaining allowance, one customer charge and one durable dispatch. Temporary
keys were revoked and the original development identity remained unchanged.

This covers the exercised in-flight rotation, consumption and concurrency
combination. The output was an ordinary text stream; combined structured-output
streaming remains unsupported and was separately rejected before dispatch. No
external funding receipt or commercial Supplier qualification was introduced.

## Rolling token window across rotation and real-time expiry

A current-input isolated run on 2026-10-10 enabled a finite token-per-minute
policy before one actual stream. While the stream was in flight, the API showed
zero known tokens and a positive reserved total matching the independently read
saved token bound. Rotation retained that policy and shared accounting identity.

After completion, known tokens matched the upstream-reported input plus output
tokens and independent attempt records; reserved tokens became zero, with no
unbounded requests. The run then waited for the real 60-second completion window
without changing clocks or stored timestamps. The API's known and committed
window totals reached zero when independent completion-time queries no longer
found a row in that interval.

Expiry did not erase the customer charge or reset cumulative monetary allowance.
A full-bound request still hit the spending cap, and restart preserved the exact
charge and remaining monetary allowance. This verifies the exercised known-usage
transition and expiry; unresolved/unbounded token usage has different retention
semantics and was not qualified by this run. No browser behavior is claimed.

## Structured streaming

The [structured Chat streaming checkpoint](structured-output-streaming.md) adds
actual `json_schema` and `json_object` streams with credit-backed accounting,
plus an actual incomplete JSON stream whose delivery failure retained one exact
charge and durable diagnostic across restart. Partial output is provisional;
terminal schema validation and accounting are separate decisions.

## Actual company-credit overrun and refund recovery — 2026-10-10

A fresh native gateway/database used the saved personal OpenRouter credential,
explicit internal customer tariffs and only 1,000 USD nanos of approved company
credit. Input was priced at zero and output at 1,000 nanos per reported token.
No received-money funding, commercial Supplier agreement or external refund was
asserted. This run had no API-key spending cap, isolating company admission.

A real strict-schema stream requested one output token but completed with the
requested marker and 11 reported output tokens. The original 1,000-nano hold was
released; independent SQL confirmed an immutable 11,000-nano customer charge and
matching debit. Before and after restart, actual balance responses reported
`balance_nanos: "-11000"`, `available_nanos: "-10000"`, credit `"1000"`, and zero
open reserved/outstanding liability. Further inference returned HTTP 402
`budget_exceeded`, leaving the original attempt count unchanged.

An administrator refunded the original charge through the normal balance reversal
API. Replaying the same refund identity produced only one 11,000-nano refund.
The account then reported balance zero and available capacity 1,000. A new real
request was admitted and returned `OK`; its response reported two output tokens,
so its customer charge and debit were both 2,000 nanos. The requested output bound
was again one token; the short visible response was not substituted for measured
usage. The raw response was retained and independently parsed.

After another restart, SQL retained exactly two attempts, two immutable charges
and one refund. Net balance was -2,000 nanos. Reconciliation matched the full
13,000 nanos of original charges to original debits without subtracting the
separate refund, and showed no missing/duplicate/mismatched charges or settled
open holds. No funding receipt existed. Temporary access was revoked and the
isolated processes stopped; original development data and encrypted identity
were preserved.

An earlier run's verifier incorrectly assumed that `OK` must be billed as one
output token and stopped. Its state was retained; it is not the evidence for the
completed run above. The completed run retained actual response/usage artifacts
and calculated both charges from reported quantities.

This verifies the exercised text overrun, company refusal, idempotent internal
refund and restored admission. It does not qualify bank refunds, received-cash
funding, customer-funded media overruns or simultaneous overrun settlement.

## Complete customer tariff discovery

A current-input native management run created 1,003 customer tariffs through HTTP.
Independent SQL confirmed the saved count, while the prior binary's workspace
billing overview returned only 1,000. Both the overview and model-price lookup
used a silent storage row cap despite exposing no continuation cursor.

The corrected reads return the complete matching tariff set. A fresh run returned
all 1,003 in database alias order; an inference key's `/v1/models` response carried
the same revision and exact input/output rates for every saved tariff. Both reads
were unchanged after gateway restart. No inference attempt was created, isolated
processes stopped and the original encrypted identity remained unchanged. The
responses retain their existing unpaginated format and proportional memory use;
this does not qualify arbitrary-size price directories or change pricing math.
Minimum per-request text charges were separate from that directory correction; the subsequent [minimum-charge implementation](text-minimum-charges.md) records its contract and actual evidence.

## Two currencies and workspace statement isolation — 2026-10-11

A fresh native database configured one company, separate USD/EUR balance
accounts with explicitly approved internal credit, and two workspaces. Each
workspace had a distinct customer tariff for the same private model. The saved
personal OpenRouter credential supplied two actual strict-JSON completions with
fresh markers. Procurement configuration remained USD; the independent customer
prices were test inputs, not an exchange rate or a commercial price claim.

For each workspace, invoice issuance and same-key replay returned one statement.
The complete history contained only that workspace's matching currency/amount,
with `paid` status. The opposite-currency filter returned no rows. Overview
charged/paid totals matched the exact statement amount, with zero invoice debt
and zero unbilled amount. A workspace-scoped viewer could read its own history
but received 404 for the other workspace. A cursor from the other workspace
returned 409 even under platform authority. Restart retained both histories.

Independent reopening checked each response's reported tokens against its
completed attempt and recalculated the customer amount from the pinned rates.
Both charges matched their original debits and the correct currency account.
Exactly two invoice entries linked the two charges in their original workspace
and currency. Customer holds were released. There were exactly two attempts,
charges, debits and invoices, with no funding receipt, invoice-payment record or
Supplier earning. No fixture result was used as evidence.

This establishes the exercised positive two-currency, two-workspace text
statement isolation and invoice replay. It does not qualify FX, mixed-currency
settlement, every account combination, external funding, media billing or
browser presentation. Isolated processes stopped and original development data
and encrypted identity were preserved.

### Role boundaries against the retained two-currency ledger

A subsequent current-input HTTP run reopened the same actual USD/EUR billing
database without submitting more inference. Workspace-scoped owners/viewers and
an organization-wide viewer received 404 for company balance access. Company
administrators and owners received the same complete balance response as the
installation credential. All five operator identities received 403 when attempting
to modify installation-only credit policy.

Each workspace-scoped reader could retrieve its own real statement but received
404 for the other workspace. Organization-wide readers retrieved both matching
statement histories. Revoking each temporary operator made its next account read
return 401. Independent reopening confirmed all five operators were revoked,
policy-history counts were unchanged and both original currency/workspace charge,
debit and invoice relationships still matched reported usage. No new inference,
funding, debit or invoice was created. This qualifies the exercised role matrix,
not every administrative permission or concurrent revocation race.
