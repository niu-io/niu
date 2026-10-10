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
