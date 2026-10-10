# Platform administration of customer text prices

`POST /admin/v1/organizations/{organization}/projects/{project}/billing/tariffs`
now accepts either an installation credential or a durable operator with an
explicit active platform-administrator grant. This uses the same platform
configuration authority as customer media rates. A normal company/workspace
owner or administrator does not acquire selling-price authority from that role.

The change is limited to text tariff publication. Invoice/payment recording,
company credit policy and customer-scoped reads keep their existing independent
permission checks. A platform configuration grant does not grant general customer
content access. Grant revocation is checked again on the next request.

Existing immutable revisions and expected-revision conflicts are unchanged.
Requests retain their admitted price revision; later edits cannot reprice old
usage. The server still validates configured models, exact rates, currency and
supported token categories. Use the existing `publishCustomerTariff` SDK contract.

## Current-input verification — 2026-10-11

A fresh isolated native run reproduced the old 403 response even after an audited
platform grant to a workspace owner. With the updated gateway, an ungranted owner
was denied, then the explicitly granted operator published a replacement rate.
A stale revision was rejected. The grant/revocation used the existing audited
database-administrator mechanism in this isolated database.

One real personal OpenRouter completion preceded the edit and one followed it,
using internal customer rates and approved verification credit. Each returned
its requested marker and reported usage. Independent reopening confirmed two
immutable tariff revisions and two completed attempts. Their charges and balance
debits exactly matched separate calculations from their respective old/new rates.
Customer holds were released; no duplicate price revision, charge or debit was
created. Restart retained the current price pointer.

The same granted operator still received 403 for credit-policy modification and
invoice issuance. Revoking the platform grant denied its next price write; the
temporary operator and inference key were then revoked. Independent records
retained one credit policy and no invoices. No commercial Supplier agreement or
external funding was claimed. Original development data and encrypted identity
were unchanged. These observations do not qualify every platform role, cross-
company price administration, concurrent grant revocation or the browser editor.
No fixture outcome was used as evidence.

### Cross-company configuration scope

A separate fresh native HTTP run gave an operator an explicit audited platform
grant and exercised four invalid targets: each direction of a mismatched
company/workspace pair, a nonexistent workspace, and a nonexistent company.
All returned HTTP 409; the original tariff and its single revision were unchanged.
The same granted operator then published a tariff for a valid workspace in the
second company. This installation-wide configuration authority is independent
of the operator's ordinary workspace membership. It does not grant customer
content access.

Restart preserved both independent price pointers. Revoking the platform grant
made the next second-company price write return HTTP 403. Independent reopening
found exactly two tariffs and two revisions, each attached to the correct
company/workspace, with the grant removed. No attempts, customer charges, balance
entries or reservations were created. This checks configuration scope and
revocation, not cross-company inference or the browser price editor.

### Concurrent publication conflict

A fresh native run submitted eight simultaneous actual HTTP tariff writes using
the same expected revision and distinct proposed prompt rates. Exactly one
returned HTTP 200; the other seven returned HTTP 409. Restart retained the
winning revision, and another write with the stale original revision also
returned HTTP 409.

Independent reopening found one tariff and exactly two immutable revisions:
the unchanged original rate and the winning rate, with the current pointer on
the winner. There were no inference attempts, charges, balance entries or
reservations. This checks concurrent optimistic publication on one gateway;
it does not qualify multi-gateway contention or concurrent inference repricing.

A follow-up fresh native run started two independent gateway processes against
one isolated PostgreSQL database. Eight simultaneous writes, four directed to
each gateway, again produced one HTTP 200 and seven HTTP 409 responses. After
stopping the second gateway and restarting the first, the winning pointer
remained and the old revision still conflicted. Independent reopening confirmed
the original rate and exactly one new winning revision, with no inference or
financial records. Both gateway processes stopped. This extends publication
conflict verification to two processes; concurrent inference repricing and
sustained contention performance remain unqualified.

### Rate publication during an actual request

A fresh native run started a real personal OpenRouter completion, observed its
admitted attempt, and published the new customer tariff before that completion
returned. Database observations immediately before and after the successful
price write both showed `may_have_executed`, not completed. The first response
then delivered its requested marker; a subsequent actual request also completed.

After restart, independent database reopening matched both responses' reported
usage to their attempts and calculated each charge from its pinned revision:
the in-flight request used the original rate and the later request used the new
rate. Both exact debits were present and both holds released, with no duplicate
charge or tariff revision. This establishes the exercised in-flight price-change
ordering; it is not a sustained rate-edit stress test or a claim about every
protocol's admission path.

## Platform-only history reads

`GET /admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs/{model}/history`
and SDK `getPlatformCustomerTariffHistory` expose the existing immutable selling
history under explicit platform authority. The response uses the same exact
amounts, nullable cache rate, fixed fees and `before` / `limit` cursor contract
as customer tariff history, with `Cache-Control: no-store`. It includes no usage,
balances, invoices, request content, credentials or procurement prices. Customer
history and billing permissions remain unchanged.

A fresh native HTTP run verified that an explicitly granted operator could read
a tariff in a second company while the customer history route still returned
404. The response fields matched the selling-history contract. A foreign tariff
cursor returned 409, a zero page size returned 400, and an inference key returned
401. Revoking the platform grant made the new read return 403. Independent
database reopening retained exactly the two configured tariffs/revisions and no
inference or financial entries. Named target discovery and current-price
pagination are described below; browser price administration remains a separate
acceptance task.

## Named targets and current-price pages

`GET /admin/v1/pricing/targets` returns named company/workspace pairs under
explicit platform authority. `GET
/admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs`
returns current selling-price configurations for the chosen pair. SDK methods
are `listPlatformPricingTargets` and `listPlatformCustomerTariffs`. Both use
`after`, `limit` (1–100, default 50) and nullable `next_after`. Target order is
workspace UUID ascending; tariff order is model alias ascending. Each page uses
one database snapshot, with an extra row for continuation detection. Restart
from the first page after changes; a missing cursor returns 409. IDs are routing
references, not display labels. Customer data permissions remain separate.

Fresh native HTTP verification created two companies/workspaces and four tariff
configurations. One-row pagination returned both named targets and all three
prices in the second workspace, with exact rate/fee strings and distinct null
and configured cache rates. Invalid page sizes returned 400, missing cursors 409,
mismatched company/workspace pairs 404, inference credentials 401 and revoked
platform grants 403. Customer-scoped history remained inaccessible to the
cross-company platform operator. Restart retained identical directory pages.
Independent reopening found precisely the four scoped tariffs/revisions, no
attempts, charges, balance entries or reservations, and the platform grant
removed. Large-directory performance, concurrent pagination edits and frontend
editor acceptance remain unverified.

### JavaScript SDK editing chain

A separate fresh native run used the built JavaScript SDK over actual HTTP to
discover both named targets and traverse all three current prices in the chosen
workspace one row at a time. It published a replacement price while preserving
the explicit cache rate, minimum and fixed fee. Repeating the old expected
revision returned 409. Two one-row history pages returned the new revision and
the original revision, with no further cursor. The same operator's customer
history read still returned 404.

Independent database reopening retained four tariffs and exactly five immutable
revisions, with no inference or ledger mutations and the temporary platform
grant removed. This exercises the SDK method paths and exact-value serialization
against the native server, not just TypeScript compilation. It does not qualify
the frontend editor or charge requests during that SDK update.
