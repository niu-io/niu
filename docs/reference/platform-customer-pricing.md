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

### Target directory traversal and short read measurement

A fresh native run created 105 workspaces through actual management HTTP and
traversed the named target directory in 50-row pages. Every created workspace
appeared exactly once. Forty first-page HTTP reads at four workers each returned
50 rows and a continuation cursor. Measured local client round-trip times were
p50 1.27 ms, nearest-rank p95 8.38 ms and maximum 9.38 ms. Restart preserved the
first page. Independent reopening matched all 105 stored workspace identities
to the traversal and found no read-induced tariff, inference or financial writes.

These are short local configuration-read observations with an eight-connection
gateway pool, not inference throughput, saturation, a production latency target
or a large-directory capacity claim. They do not measure concurrent directory
changes or current-tariff pages at comparable scale.

A separate current-tariff run created 105 model mappings and price configurations
through management HTTP, then traversed their directory in 50-row pages without
omission or duplication. Forty first-page reads at four workers measured local
round-trip p50 1.75 ms, nearest-rank p95 9.41 ms and maximum 10.43 ms. Restart
retained the first page. Independent reopening matched all 105 tariff aliases to
the traversal and exactly 105 immutable revisions; the 104 added configurations
retained their fixed/minimum fees, and 52 retained explicit cache rates while
the others remained null. No inference or financial records were created.
This extends bounded directory coverage, not sustained capacity qualification.

## Populated native integration checkpoint

A dedicated, explicitly labeled internal-credit verification company/workspace
now retains two actual tariff publications in the native development service.
The second publication replaced the first using its expected revision; replaying
the stale write returned HTTP 409. A real nonce-bound OpenRouter completion used
the second tariff, produced an exact customer debit and was included in a paid
statement. Internal verification rates are not a commercial offer or received
payment. The route was private and was disabled after verification; its temporary
key was revoked. Existing workspaces and Supplier encrypted identities were kept.

Independent SQL matched returned usage to the completed attempt, recalculated
the charge/debit and confirmed the reservation was released. Actual platform
current-price/history reads returned one current tariff and both immutable
revisions; the billing read returned the paid statement for the exact amount.
This leaves populated backend data available for frontend integration without
fabricating history or a payment. Browser history rendering, editing and conflict
recovery still require frontend acceptance on that populated target.

## Prepare prices after a draft Supplier offer — 2026-10-12

On digest-pinned native runtime `606f863eee3fb87d0813d42b172748cf1f570f69`, actual HTTP now permits platform customer-price preparation after a registered shared model's draft/unqualified Supplier offer is created. The previous live-catalog-based price check returned 400 in that order. Registration is now checked independently of inference availability, while preserving pool → managed → static alias shadowing and personal ownership boundaries. This does not qualify supply or publish an unavailable route.

An isolated stopped-database copy retained two credential/model configurations, four actual prior requests and 74,324 nanounits of customer charges. The current-input workflow created a draft offer first, then published a customer tariff (200), rejected stale revision (409) and ordinary-owner publication (403), retained two immutable history entries and identical history after restart. Disabled registered shared models and shared pools accepted price preparation; unknown aliases and same-owner/foreign personal models and pools returned 400.

The customer catalog continued to hide the unqualified and disabled aliases. New key grants for the unqualified alias remained refused (400); an existing allowed key's actual inference attempt returned a safe pre-dispatch 503. No new upstream generation or debit occurred. Independent final PostgreSQL reopening checked saved response digests, executable SHA-256, old/new tariff rates, paused/unreviewed offer state, false route availability, absent personal tariffs and unchanged full attempt/financial fingerprints.

This closes the demonstrated draft-configuration ordering blocker. S02-3's successful authorized commercial review → eligible activation → positive dispatch remains unverified and is not inferred from prepared pricing. Static-only registration follows the same source rule but was not separately exercised by HTTP in this checkpoint. No commercial qualification or rights were fabricated.

The native Gateway was subsequently refreshed to `606f863e` on its existing database and listener. Readiness returned HTTP 200; the exact saved configuration, encrypted Supplier credential identities and revisions, and retained workspace, video and financial record counts were unchanged. This deployment preserves the verified draft-pricing behavior without qualifying commercial supply.

## Current finite preparation and populated reads — 2026-10-13

Two stopped genuine native database copies were run on retained Gateway
`8bfdef10003eebe9402401247aa52cd69d3a398f`, SHA-256
`6f5290d182c9bf51de1f2bb8d469067351c9f9771150235adc2917b1d39c6900`,
with compiled JavaScript SDK `ce97f3b0116570dfd2a487b802d2d2de18efbf39`.
Automatic payment polling is disabled. Original databases, configuration and
master encryption identity are untouched. No inference or merchant request,
new cash receipt or commercial qualification is created.

The actual draft-first workflow again saves a Supplier draft offer before
customer-price publication (200). Stale publication returns 409 and ordinary
customer-owner publication returns 403. Current SDK price-history reads match
HTTP history; both immutable prices remain identical after restart. Unknown
aliases, personal models and personal pools remain refused (400). Disabled
registered shared models and shared pools accept price preparation, independently
of dispatch eligibility.

The unreviewed draft remains inactive and unavailable. Customer catalogs continue
to hide the alias; a new key grant is refused (400), and an existing allowed key's
actual request receives safe pre-dispatch 503. Independent final PostgreSQL checks
raw response digests, frozen prior/new rates, unavailable route state, absent
personal tariffs and unchanged complete request/financial fingerprints. Four
original actual requests and their total 74,324-nanounit charges remain unchanged.
The temporary owner and key are revoked and copied processes stopped.

A separate current read-only API workflow uses a copy of the genuine populated
internal-credit pricing checkpoint. Current SDK current-price/history reads
return the existing current revision and both immutable revisions. Invoice
history and the actual invoice's line read return the genuine saved statement;
request detail and billing remain identical after restart. Independent native
reopening recomputes original reported usage against its frozen customer rates,
checks the exact positive charge and matching negative debit, and confirms no
open reservation. Eleven complete financial, tariff and invoice-table fingerprints
remain unchanged. The statement's `paid` state means its existing customer
balance debit settled it; it is not received cash or a processor receipt.

This establishes current preparation, conflicts, history, publication/eligibility
separation, authorization and populated read/restart behavior over genuine
records. It does not re-execute the historical generation or manufacture a
commercial review/activation. External Provider or merchant activation is not a
backend-readiness prerequisite; missing lawful commercial rights are never
substituted with fabricated eligibility. No new implementation gap is established
by these finite workflows. The implemented configured-model/customer-price/eligibility journey is accepted
within these finite scopes: separately documented historical actual internal-credit
completion and exact debit/paid statement, plus the pinned-current preparation,
conflict and unavailable-route protections. The historical generation is not
assigned the current read executable pin, and this run does not claim a fresh
positive generation. Lawful commercial qualification and every external channel
remain unverified. S02-3 status remains owned by the fixed release checkpoint.
Fixture outcomes provide no evidence.
