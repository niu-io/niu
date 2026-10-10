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
