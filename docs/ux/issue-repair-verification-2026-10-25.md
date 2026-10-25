# Issue repair verification — 2026-10-25

This is dated evidence, not the execution backlog. Beads epic `niu-2xp` owns
the complete GitHub issue scope; `niu-drb` owns the directional catalog repair.
The release gate remains [the release checklist](../release-checklist.md).

## Public catalog: local candidate with current hosted data

The candidate restores directional `input:` and `output:` filters while retaining
English and Chinese labels, uses installed Button controls for filter chips,
persists the query in the URL, and waits for clipboard completion before reporting
success. This addresses the catalog portion of public issue #98.

The inspected reference was OpenRouter's live Models page, including its input
modality checkbox interaction and separate output modality tabs. Directional
selection follows that distinction within Niu's existing catalog layout. The
applicable Niu requirements are reference-led design, installed shadcn primitives,
visible model-list filtering, and rendered desktop/narrow verification.

The actual browser used the changed local frontend with the current hosted public
catalog API through the development bridge. No fixture data was used. There were
26 published models. Selecting text output produced 24 aliases, exactly equal to
an independent filter of the API response's output modalities. Only output chips
were selected. Reload retained `output:text`; clearing removed the filter, and
keyboard Enter on the first input chip selected `input:text`.

Rendered inspection at desktop, 900px and 390px showed readable model hierarchy,
distinct selected chips, aligned toolbar actions and wrapping metadata. At 900px
and 390px document scroll width equaled viewport width. The narrow layout kept
the filter, refresh and clear actions accessible. Clicking Copy ID reported
Copied, and an independent system clipboard comparison matched the selected
model alias.

Catalog build and type checking were executed successfully. These are compilation
checks, not integrated acceptance evidence. Clipboard rejection recovery, the
packaged candidate and deployed behavior remain unverified. This evidence does
not close the issue or qualify the release.

## Financial receipt provenance: isolated current-input settlement

Bead `niu-zr9` tracks public issue #116. The candidate separates immutable mock
receipt channels from verified cash receipts and cash funding reversals. It
reports simulated receipts separately in the API, SDK and generated contracts.
Historical wallets whose consumption split combined simulated and real funding
are explicitly uncovered for cash and revenue attribution; their balances are
not silently substituted with a known subtotal. Customer spending balances are
unchanged. Precise attribution of mixed historical consumption is not claimed.

The reporting reference inspected was Stripe's
[Balance summary report](https://docs.stripe.com/reports/balance#report-sections),
including its categorized activity and balance distinction. The correction uses
Niu's existing statement table and preserves the installed Table primitives.
The applicable Niu rules require distinct financial meanings, no inferred
positive state without evidence, and actual responsive rendering.

A fresh isolated installation was migrated and started from the changed source.
An actual browser login configured USD, created a new $1 mock checkout, and ran
the successful-payment scenario. Its signed notification was accepted. A separate
top-up-history API read confirmed paid status, simulated provenance and
1,000,000,000 nanos. The financial API independently returned:

- Verified cash receipts and real wallet funding receipts: 0.
- Simulated funding receipts: 1,000,000,000 nanos.
- One wallet with simulated funding; verified prepaid cash and credit allocation
  unavailable, with known cash subtotal 0.

The browser then disabled mock payments through Admin. Reading the financial
API again retained the same classification. The rendered statement showed
$1.0000 simulated funding, $0.0000 verified cash, and unavailable wallet cash
attribution. The browser-produced two-page PDF was independently text-extracted
and both pages rendered and inspected: amounts, provenance explanation and
confidential platform report heading remained intact.

The initial narrow inspection exposed an existing table issue: labels prevented
the current amount from fitting on screen. The changed cash table now wraps
labels and gives current amounts priority over comparison status at narrow
widths. At 390px its table, scroll container and scroll width all measured 318px;
labels and amounts were visible together. Desktop and intermediate-width renders
were also inspected, including navigation expansion.

Rust builds (including the mock-payment feature), dashboard type checking and
API generation were executed. No fixture outcome was used as evidence. A genuine
non-simulated receipt, mixed-wallet consumption/refunds, production upgrade and
deployed regression remain unverified. This issue stays open.

## Chat startup cancellation

Bead `niu-1p2` tracks public issue #115. The candidate creates its cancellation
controller before awaiting draft or session persistence, guards duplicate
submission synchronously, and retains the same session identity until terminal
persistence finishes. A cancelled startup or failed draft confirmation cannot
continue into model dispatch. The existing composer and response layout remain
the presentation used for this lifecycle correction.

With an actual isolated backend, a currently published free OpenRouter model
mapping and 600ms browser response latency, Send followed immediately by Stop
produced one saved cancelled session. An independent operator-history read
confirmed its terminal phase and empty output. A database read found one chat
and zero attempts. Reload and direct navigation to its readable session URL
retained that result. Desktop and 390px renders were inspected; the narrow
document width equaled its viewport and cancellation content remained readable.

Further probes are explicitly limited evidence: a later latency probe ended in
an upstream setup failure rather than establishing startup cancellation. A real
storage-lock probe exceeded the save deadline, displayed a save error, retained
the prompt and created no additional saved session. A response-interception
probe did not observe the targeted response and did not qualify that timing
window. Normal free completion, active-stream cancellation, uncertain-save
recovery and production regression remain required. The issue remains open.

## Mobile Models navigation

Bead `niu-cs3` tracks public issue #112. Models now uses the existing mobile
product/account navigation, independently of model availability. The filter
trigger is rendered only when the model catalog can render its filter panel.
This follows the separation of global navigation and catalog filtering inspected
on [OpenRouter Models](https://openrouter.ai/models), while retaining Niu's
existing DropdownMenu, Sidebar, brand and spacing. Applicable Niu requirements
are continuous task navigation, visible recovery from missing configuration,
direct use of shared controls, keyboard operation and full-width management pages.

Current-input browser verification used an actual isolated backend and two
persisted workspaces: a funded workspace with a real free-model mapping and an
unfunded workspace with payment readiness blocked. At 390px both exposed product
and account navigation. The blocked workspace opened the account Settings dialog
from that menu and had no ineffective filter trigger. Escape dismissed the menu
and returned focus to its trigger. The ready workspace independently opened its
model-filter Sidebar and account menu; their stable open states were visually
inspected. The menu preserved item gutters, readable labels and account actions.

Ready-state layouts at 390, 580, 900 and 1440px showed no document overflow.
At 580, 900 and 1440px, main-panel widths were respectively 580, 840 and 1372px;
the difference is the existing product rail, not a centered page-width limit.
At 900px the open filter overlay measured 256px and began after the 60px rail.
Open and closed layouts were inspected after transitions completed. Dashboard
type checking also completed. No fixture result was used as evidence. Packaged
and deployed regression remain required before this issue is closed.

## Unpaid checkout recovery

Bead `niu-0gj` tracks public issue #114. An actual isolated mock merchant created
four fresh checkout sessions through the current gateway. Browser actions ran
decline, cancellation, out-of-order success/failure and timeout scenarios. Saved
order reads respectively returned closed, closed, paid and pending. Independent
PostgreSQL reads found one closure and zero settlements/receipts for each closed
order; the paid order had exactly one settlement and receipt, no closure; the
timeout had none of those records. The simulated merchant is the authorized
payment boundary for this run; this is not evidence of real merchant activation.

A newly issued organization-wide owner credential reconciled all four saved
orders successfully and retained those states. The same credential received 404
when addressing another organization. Browser network evidence showed **Check
payment status** issuing POST reconciliation and receiving 200 for the pending
order, which truthfully remained pending. No browser-return URL supplied payment
evidence. Closed details were inspected at desktop and 390px, including readable
status, amount and recovery guidance. **Start a new top-up** opened a blank amount
form; Escape dismissed that form. Existing Niu Dialog and Button primitives and
the existing checkout layout were retained. The changed behavior follows the
Stripe lifecycle references in the payment integration documentation and Niu's
requirements for explicit recovery, truthful status and narrow-screen usability.

The gateway and mock checkout UI were built and the generated API documentation
was refreshed. Fixture outcomes were not used. Missing-notification recovery
was subsequently exercised as described below. Deployed
verification and full release acceptance remain pending; the issue stays open.

A further fresh cancellation checkout used an intentionally unavailable callback
route on the isolated gateway. The real merchant recorded six delivery attempts,
all HTTP 404, with no accepted notification. The dashboard initially showed the
saved order as awaiting payment. Clicking **Check payment status** changed it to
closed with recovery guidance. A subsequent independent database read found one
closure and zero settlements. The merchant's normal callback configuration was
then restored and mock payments were disabled. This verifies customer-driven
recovery without a delivered notification; no order status was injected into the
application database.

## Embedded Help and quickstart anchors

Beads `niu-a9v` and `niu-lb0` track issues #113 and #111. The current gateway
served the newly built documentation with `X-Frame-Options: SAMEORIGIN` and
`Content-Security-Policy: frame-ancestors 'self'`. The browser actually rendered
the article inside dashboard Help. This exposed a separate layout defect: the
route wrappers let the iframe retain its intrinsic 300px width. Extending the
existing flex layout through those wrappers restored the available content width.

Rendered iframe widths at 1440, 900 and 390px were 1372, 840 and 390px. Neither
the outer document nor embedded article overflowed horizontally. Desktop,
intermediate and narrow renders were inspected, along with the open mobile
documentation menu. Its Guardrails link navigated the parent Help route. Searching
the actual generated index for `guardrails`, selecting GuardrailPolicy and
refreshing retained the selected article. The existing sidebar/article/contents
structure was preserved, consistent with the inspected
[OpenRouter quickstart](https://openrouter.ai/docs/quickstart) and equivalent Niu
documentation. Applicable requirements are full available content width,
discoverable navigation, responsive layouts and complete task recovery.

The Chinese installation heading now uses Markdown so it appears in the generated
contents. The introduction links to that heading; the previous English fragment
remains an alias. A desktop introduction click positioned the visible heading at
88px, and a direct legacy-fragment reload positioned it at 257px. A direct Chinese
heading-fragment load at 390px positioned it at 136px. These are browser layout
measurements after navigation, not source-only checks. Documentation was rebuilt;
no fixture-test result was used. Final packaged and hosted regression, including
the full bilingual anchor matrix, remains required before closing these issues.

## Restored bilingual task guidance

Bead `niu-2xp.1` tracks regressions of issue #98 findings A02–A04 in the bilingual
guides. Both model-route locales again describe Responses text streaming and the
bounded token-priced Chat function-tool subset. This aligns the guide with the
current Responses handler and priced-Chat validation contract; it does not claim
new live upstream qualification. Missing terminal usage remains unknown, and the
guide distinguishes browser cancellation from confirmed upstream cancellation.

Generations now starts with selecting a workspace/key/model, comparing results,
creating video and revisiting saved work, ahead of its retained management API
reference. API integration now gives introductory sections distinct headings and
restores the task-to-reference table in both locales. Current route contracts and
existing technical sections were retained.

The final documentation build was served through the actual local gateway. The
three English desktop pages and three Chinese 390px pages were visually inspected;
all narrow document widths equaled their 390px viewport. Runtime DOM reads
confirmed the revised visible Chinese content and English content. Ten linked
documentation routes returned 200, including both English protocol fragment
targets. The Chinese protocol links now target their visible Chinese sections:
clicking the Responses link navigated to the visible Chinese heading, instead of
the hidden English content. No fixture outcome was used. Complete inference
qualification and the final deployed guide audit remain release requirements.

## Provider integration configuration foundation

Bead `niu-2xp.2` tracks issue #97. A fresh Provider and disabled OpenRouter
connection were created through the actual local gateway. Saving a Provider
default propagated to its inheriting connection. An explicit Custom override
survived a default change; clearing it restored inheritance. Current SDK calls
exercised OpenRouter, New API, LiteLLM and Custom selections without changing the
adapter, credential or endpoint and without dispatching inference.

A stale connection revision returned 409. A workspace-scoped operator received
403 for the configuration read. After restarting the gateway, the built SDK read
the retained Provider default and connection revision. Independent PostgreSQL
reads confirmed the persisted selections and revisions. Storage and gateway
builds, SDK compilation and API generation completed; no fixture outcome was
used. The architecture record describes the full discovery/review requirements.
No UI, live discovery/import or hosted acceptance is claimed by this foundation.

### Provider discovery scope follow-up (#97)

A current authenticated request to OpenRouter's filtered model endpoint with
`output_modalities=all` returned HTTP 200, 687 models and 845,411 response bytes.
The actual response included text, image, video, audio and other output
modalities. This verifies that the configured upstream exposes a credential-
filtered inventory within the existing response bound; it does not verify
inference access or Niu gateway integration. No fixture response was used.

The gateway now selects that endpoint only for explicitly configured OpenRouter
integrations, and reports effective integration, inventory scope, catalog-read
success, unverified inference, unchecked management authority and advertised-only
prices. Other integrations retain their instance model endpoint. A denied
filtered request does not fall back to public inventory. Gateway runtime and
browser verification remain required before accepting this change.

The rebuilt isolated gateway then returned HTTP 200 and 687 models through an
explicitly configured loopback reverse proxy forwarding live requests to
OpenRouter. The relay generated no model data and retained no response cache;
it worked around the development machine's public-DNS interception without
changing Niu's endpoint validation. Independent comparison with the direct
upstream response found identical model-ID sets. The gateway reported inherited
OpenRouter identity, credential-filtered inventory and unverified inference;
a separate model-route read still returned zero saved routes. This verifies the
configured reverse-proxy path, not direct hosted connectivity or the unfinished
review UI. The first run exposed query-bearing endpoint validation rejection;
query parameters now attach to the request after the unchanged endpoint check.

### Provider integration configuration and reviewed import UI (#97)

The actual OpenRouter settings page required sign-in, so its authenticated
interaction was not available for inspection. The alternative reference was
[LiteLLM's model-management documentation](https://docs.litellm.ai/docs/proxy/model_management),
including its published Add New Credential dialog. Its explicit Provider choice,
API-base field and save action informed the configuration order; Niu retains its
existing settings page, connection detail and model-mapping dialogs. This is a
reference screenshot inspection, not a claim to have operated LiteLLM's dialog.

The current isolated browser run saved a Provider default as LiteLLM and
confirmed it after a full reload. A connection inherited that value, saved an
explicit Custom override, and retained Custom after an independent API write
changed the Provider default to OpenRouter. Clearing the override in the browser
restored inherited OpenRouter. A concurrent connection update then caused the
stale browser save to show a conflict, disable another save and offer an explicit
reload; reloading showed the independently saved value. The final connection
again inherits OpenRouter.

Live discovery populated 687 upstream models. The browser selected the free
Liquid model, displayed its metadata before saving, and created only the chosen
alias. An independent API read confirmed the selected upstream ID, context
65,536, output bound 8,192, text modalities, private visibility, disabled route,
null purchase pricing and all optional inference declarations false. Public
catalog metadata retains the advertised zero token prices separately. Discovery
text now says models are reported, rather than asserting they are available for
inference. No inference request was dispatched during this import acceptance.

Applicable Niu UI gates were checked directly: installed DropdownMenu primitives
retain their icon gutter; Provider-default and connection-override menus were
inspected open; Escape returned focus to the trigger. Screenshots at 390, 900 and
1440 CSS pixels were visually inspected, including intermediate-width navigation
open and closed. The 390-pixel document stayed 390 pixels wide and both model
review dialogs measured 356-pixel client and scroll widths. At 900 pixels the
connection section measured approximately 790 pixels with navigation collapsed;
at 1440 pixels the settings content measured 1,308 pixels. Controls align with
the existing form, menus remain within the viewport, content wraps, and the
canvas has no added page-level maximum width. Light and dark rendered states
were inspected. The review dialog remains vertically scrollable to its save
action.

Limits: manual recovery after a real discovery failure, existing-route metadata
replacement, other integration instances, endpoint-application convenience,
full localization and deployed acceptance still require verification or work.
This record does not close the issue or establish release readiness.

### Invalid-credential discovery and manual recovery (#97)

A current negative run replaced only the owned, disabled acceptance connection's
credential with an invalid value. The actual OpenRouter filtered-model endpoint
returned HTTP 200 and 691 models despite that invalid bearer; an independent
current-key request using the same value returned HTTP 401. This contradicted the
assumption that a successful filtered-model request alone establishes credential
identity. Earlier successful catalog runs are not evidence of invalid-key
rejection.

The gateway now verifies OpenRouter current-key identity before discovery, with
the same pinned, redirect-rejecting client and a 64 KiB identity-response bound.
Only recognized identity shape is accepted; raw identity, usage and budget fields
are discarded. The integration's discovery protocol also determines its auth
headers and catalog normalization independently of the inference adapter.

Against the rebuilt gateway, the browser displayed the actual credential
rejection with retry and manual-entry actions, and no successful inventory
label. Manual entry then saved a private, disabled route. Independent API
inspection confirmed null purchase pricing and no catalog metadata on that
manual route. After restoring the authorized credential, browser retry recovered
687 models with credential-filtered scope. A separate API read returned only
`data` and `discovery` at the top level, with no identity response attached.

The error state exposed a layout defect: the long upstream error stretched the
neighboring alias field vertically. Top-aligning the existing form grid fixed
it. Rendered screenshots were inspected at 1440 and 390 pixels. The desktop
upstream control and alias input began at y=137 and y=135 respectively; narrow
content wrapped without horizontal overflow (document and viewport both 390).
This verifies failure recovery and layout for the actual OpenRouter path; other
integration instances and hosted behavior remain outside this run.

### Existing-route preservation and additional integration instances (#97)

An owned disabled route was explicitly configured with four distinct nonzero
purchase rates and an existing structured-output declaration. In the browser,
selecting its current upstream model from live discovery displayed the metadata
replacement notice. Saving advanced the revision from 2 to 3. Independent API
comparison confirmed byte-for-byte equal pricing objects, unchanged capability
flags, private visibility and disabled state; only the selected catalog metadata
was added. The configured capability is not evidence that structured-output
inference was executed. Existing nonzero customer selling prices were not part
of this particular route-preservation run.

Actual upstream services were installed outside the public tree:
[LiteLLM v1.106.4](https://github.com/BerriAI/litellm/releases/tag/v1.106.4) and
[New API v1.0.0-rc.47](https://github.com/QuantumNous/new-api/releases/tag/v1.0.0-rc.47).
The New API macOS binary matched its published checksum. Both used an isolated
PostgreSQL cluster and actual persisted configuration pointing to a free
OpenRouter model. No fixture server or fabricated model-list response was used.

Each service issued an ordinary model-restricted inference credential. Independent
management reads with those credentials were rejected: LiteLLM `/key/list` with
HTTP 403 and New API `/api/channel/` with HTTP 401. LiteLLM initially rejected
`/v1/models` with HTTP 422 because a zero key budget was already exhausted; after
an explicit budget update to USD 0.001, the same credential read its single
configured model. No inference request was dispatched or billed in this run.

Direct service reads and Niu gateway discovery returned the matching configured
model for each instance. Niu reported the explicit connection integration,
instance-reported inventory, unverified inference and unchecked management
access. Through the Niu browser, each model was selected, reviewed and saved
under a distinct alias. Independent API reads confirmed exactly one mapping per
connection, private and disabled, with null purchase price and every optional
capability off. New API's missing context and modality metadata rendered as
not reported rather than fabricated values; its 390-pixel review was visually
inspected.

These runs establish discovery and reviewed import for these pinned actual
instances. They do not establish every upstream version, inference behavior,
customer price publication or hosted deployment readiness.

The English and Chinese Provider administration guide now describes integration
scope, endpoint configuration, reviewed discovery and recovery, and uses the
current tab names. The built English desktop and Chinese narrow pages were
rendered and inspected; the narrow document remained 390 pixels wide. Temporary
LiteLLM and New API inference credentials were revoked after acceptance, and the
two owned services plus their isolated database were stopped. The Niu gateway
and its separate acceptance database were retained for remaining issue work.

## Branded Credits configuration publication — issue #110

Bead `niu-2xp.3` remains open. The initial implementation includes exact integer
conversion and original-lot backing arithmetic, migration 0376, immutable unit
definitions and purchase rules, platform configuration HTTP operations, typed
administration SDK methods and generated API documentation. The design contract
is [branded consumption units](../architecture/branded-credits.md).

The actual isolated gateway was rebuilt and started with its existing database.
An authenticated HTTP read returned revision zero with no definition or rules.
Actual administration requests published a six-decimal Niu Credits definition,
then USD purchase rules of 100 and 200 units per dollar. Repeating the original
request after the newer publication returned its original revision. Reusing that
key with a changed ratio and submitting a stale revision both returned HTTP 409.
Two concurrent publications at the same expected revision produced one HTTP 200
and one HTTP 409. Zero ratio components, leading-zero strings, a signed value and
an integer exceeding the supported range returned HTTP 400. An anonymous read
returned HTTP 401; an actual workspace-scoped operator's read and write each
returned HTTP 403.

The built JavaScript SDK then read the actual gateway, published a new four-decimal
definition and observed an empty current rule list. Publishing a ratio of
20000/100 returned the reduced ratio 200/1. Retrying the earlier definition
publication returned its original revision after the rule had advanced the
configuration. Independent SQL reads confirmed both historical definitions and
all four purchase rules remained present at configuration revision six. An
attempted SQL mutation of the original rule was rejected by the immutable-record
trigger; independent rereads confirmed no change. The count and signed sum of
existing monetary balance entries were identical before and after these actual
configuration publications. After stopping and restarting that gateway process,
the HTTP configuration response exactly matched the saved SDK response at
revision six.

These observations establish configuration publication, its current authorization
boundary, concurrency behavior and retained records. They do not establish
checkout conversion, issuance, lot allocation, admission, settlement, refunds,
customer UI, mode switching or hosted behavior. Exact-arithmetic implementation
has compiled but has not yet been qualified through the complete payment and
consumption workflow. No fixture outcome is used as evidence. The feature and
release gate remain incomplete.

## Branded Credits pinned purchase preview — issue #110

Migration 0377 adds immutable purchase quotes with an independent database check
against the selected exact ratio. The running gateway and built JavaScript SDK
prepared two concurrent identical intents for a USD 1.00 purchase at 200 Credits
per dollar. Both returned the same saved quote with 200,000,000,000 atoms.
After publishing 300 Credits per dollar, an authoritative read and original
idempotent retry still returned the original quantity, rule and expiry. A new
intent referencing the superseded rule returned HTTP 409, as did reuse of the
original key with a different payment amount.

An actual rule publication of one Credit per three dollars allowed a USD 0.03
preview with exactly 10,000,000 atoms. A USD 0.01 preview under that rule returned
HTTP 400 rather than rounding. After restoring the 200-to-one ratio, an amount
whose converted quantity exceeded storage range also returned HTTP 400.
Independent SQL reads found exactly two quotes, reconciled each quantity against
its saved ratio, and confirmed each original lifetime was 900 seconds. Direct
attempts to mutate a saved quote or insert an inconsistent converted quantity
were rejected. No monetary balance entries or payment orders were created by
these preview operations. Reading the quote under a different organization
returned HTTP 404; a workspace-scoped operator received HTTP 403.

This is actual preview and persistence evidence, not completed-payment evidence.
Checkout binding, processor eligibility, expiry enforcement at binding, unit
issuance, consumption and refunds remain unverified and are still required.

## Branded Credits verified payment issuance — issue #110

Migration 0378 separates unit purchase lots and receipts from monetary wallet
funding and adds a shared payment-reference registry. Order creation can bind a
quote atomically before submission. Verified payment settlement now writes either
a monetary entry or a unit lot, its matching receipt and the terminal order record
in one transaction. Financial receipt summaries include both kinds while retaining
the simulated-payment exclusion from verified cash. Existing monetary allocation
and credit-repayment triggers receive no Credits receipts.

A separate native gateway and empty PostgreSQL database were started with the
actual opt-in Mock Payment Gateway. Company, unit definition, purchase rule and
quote were created through the actual administration SDK. Before changing the
development configuration, a currency-mode checkout with a quote returned HTTP
409. For this isolated integration run only, the internal billing-mode column
was explicitly set to Credits after checking that there were no monetary entries,
payment orders or credit facilities. This direct development configuration is
not evidence for the still-unimplemented guarded customer mode-switch workflow.
The hosted installation was not changed.

An actual USD 1.00 checkout pinned 100 Credits. After the order was pending, a new
purchase rule of 200 Credits per dollar was published. Replaying the order retained
its original identity and 100-Credit quantity. Selecting the merchant's duplicate
success scenario delivered two signed callbacks, both acknowledged with HTTP 200.
Independent SQL reads found exactly one 100-Credit lot, one receipt and one
settlement. Its provenance was simulated and monetary backing was zero. There
were no monetary balance entries or monetary funding receipts.

A subsequent failed USD 1.00 payment closed its order without issuance. Another
successful USD 1.00 payment issued a separate 200-Credit lot under the new rule.
Independent reads confirmed two lots containing 100 and 200 Credits, two receipts,
two payment references, two settlements and one closed order. Reusing a consumed
quote for a new order, omitting a quote in Credits mode and changing a quote's
payment amount each returned HTTP 409. The rejected amount attempt did not prevent
the identical idempotency key from subsequently creating its valid original intent.

Submitting the already-used payment reference to the monetary funding endpoint
returned HTTP 409 and left the monetary ledger empty. The actual financial-summary
API reported USD 2.00 simulated receipts and USD 0 verified cash receipts.

The existing currency-mode gateway was then upgraded through migration 0378.
An actual successful mock checkout without a quote added exactly USD 1.00 to its
monetary ledger and returned `credits: null`. Its prior mock-payment enabled state
was restored afterward. This verifies the exercised legacy funding path after
the registry backfill, not every historical financial workflow.

These runs establish the exercised simulated-payment issuance and binding paths.
Genuine cash-backed issuance, natural expiry rejection, EPay and Zhifux unit
checkouts, lot consumption, grants, refunds, guarded mode activation, customer
rendering and hosted behavior remain outside this evidence. An unused live quote
was retained for a later natural-expiry check. The feature and release gate remain
open; no fixture outcome supports these observations.

## Credits grants and natural quote expiry — issue #110

Migration 0379 preserves purchase lots and their existing references while
extending the common lot record with explicit grant reason, actor and optional
expiry. Promotional and simulated grants have no payment currency or amount and
zero monetary backing. The new platform-only grant operation has a typed SDK
method and generated contract; it does not enable Credits mode.

Through the running gateway and built SDK, two concurrent identical requests
issued one promotional grant of five Credits with a ninety-second expiry. A
separate explicit simulated grant issued two Credits without an expiry. Reusing
the promotional idempotency key with a changed amount returned HTTP 409. New
requests with purchased provenance, a past expiry or zero quantity returned
HTTP 400. A workspace viewer's request returned HTTP 403. After publishing a new
unit definition, a new grant using the old definition returned HTTP 409, while
replaying the existing grant returned its original definition and quantity.

After the promotion naturally expired, another SDK replay returned the identical
original grant, including its expired deadline. Independent SQL reads found only
the two grants, with exact quantities, no payment amounts and zero backing.
Attempted mutation was rejected by the immutable-record trigger. This verifies
retained grant provenance and expiry, not the still-unimplemented consumption
rule for an expired lot.

An actual USD 0.01 mock purchase after the common-lot migration issued two Credits
and settled normally. Financial reporting showed USD 2.01 simulated receipts
and zero verified cash; there were three purchase receipts and no monetary wallet
entries. Grants created no extra payment receipts. The separate currency-mode
gateway was upgraded and rejected a grant with HTTP 409.

The unused purchase quote retained from the preceding run expired naturally at
11:24:40 UTC. At 11:25:43 UTC, submitting it through the actual checkout endpoint
returned HTTP 409. Independent before/after SQL counts remained four orders;
the failed binding did not leave a new payment intent. No quote timestamps were
changed to obtain this result.

Reservation, consumption, refunds, expired-lot admission behavior, customer UI,
guarded mode activation and hosted acceptance remain required. No fixture result
or compilation outcome establishes these missing behaviors.

## Credits range foundation and exact balance reads — issue #110

Migration 0380 and storage primitives add immutable reservations, ordered source
ranges, charge/release resolutions and original-range restorations. The native
Credits database migrated successfully with its three actual mock purchase lots
and two actual grant lots retained: 309 Credits issued, five naturally expired,
three unit receipts and no monetary wallet entries. This verifies the exercised
upgrade and retained data, not allocation or inference settlement behavior.

The new customer-safe balance API and typed SDK method were exercised against
the running gateway. Original unit definitions and promotional/simulated sources
remain separate. The read initially reported 304 Credits of unexpired remaining
capacity and five expired Credits, with no holds or charges. An actual authorized
promotional grant of one atom (0.000000001 Credits) then appeared as exactly `1`
available atom, despite the definition's four-place display precision. After its
45-second deadline elapsed naturally, a fresh SDK read reported that atom as
expired and zero available. No timestamp or clock was modified.

Independent SQL reads after expiry found 309000000001 issued atoms,
5000000001 expired atoms and 304000000000 nonexpired atoms. There were still
three purchase receipts, no monetary entries and no request reservations. Every
returned group satisfied issuance plus restorations equals holds plus gross
charges plus expired and available atoms. The response contains no cash backing,
upstream prices or internal lot identifiers. Anonymous access returned HTTP 401;
an absent company and an authenticated workspace viewer each returned HTTP 404.
The viewer's temporary verification session was revoked afterward (HTTP 204).

The gateway build, SDK build and generated contract checks completed as code
hygiene. No fixture outcome is used as evidence. Request allocation, concurrent
holds, expiry during a hold, real text/media consumption, over-bound liability,
refunds and backing reconciliation are not established by these balance reads.
They remain open along with guarded mode activation, customer rendering and
hosted verification. Next, connect explicit Credits tariff publication and
atomic request admission to the new range ledger before exercising real usage.

## Explicit Credits text tariff publication — issue #110

Migration 0381 adds immutable text consumption tariffs, separately from purchase
conversion and monetary selling prices. The administration API and typed SDK
publish and read complete atom-denominated schedules, including cache categories,
reasoning output, context tiers, request fees and minimum charges. Publication
shares the installation configuration revision and checks current operator
authority inside its transaction.

The running native gateway and actual SDK published a category-aware price with
two out-of-order context thresholds. The saved result normalized the thresholds
to 1000 then 10000 and retained explicit nullable category semantics within each
tier. Two concurrent changes with the same expected revision produced one HTTP
200 and one HTTP 409, leaving one new flat tariff. Replaying the original
publication returned its original revision and semantically identical price;
object key ordering was ignored. An equivalent retry with leading-zero rate
notation and reordered tiers also returned the original revision.

Publishing a new purchase rule of 300 Credits per USD did not change the latest
consumption tariff or any existing balance. Independent SQL reads found exactly
two tariff revisions (7 and 8), installation revision 9, six retained lots,
309000000001 issued atoms, no monetary entries and no request reservations.
Negative or over-limit rates and duplicate thresholds returned HTTP 400; a JSON
number instead of a decimal string returned HTTP 422. A stale new publication
and changed retry returned HTTP 409. An absent price returned HTTP 404,
anonymous reads returned HTTP 401, and an authenticated workspace viewer could
neither read nor publish platform tariffs (HTTP 403). Its temporary session was
revoked afterward (HTTP 204).

The public OpenAPI aggregation was also corrected to include the balance endpoint
added in the preceding change, alongside both tariff operations. Handler-derived
documentation alone did not establish inclusion in the full public contract.
After rebuilding the documentation artifact, downloading the full OpenAPI from
the running gateway returned HTTP 200 with all three operations. Its bytes
matched the generated contract exactly (SHA-256
`dda21b246c93e59dd6c5c629f7aa6819fecf8268de60a7899cfd799b3637455a`).
Generated contract checks and builds are code hygiene, not request-billing
acceptance. Actual tariff binding, unit-priced admission and settlement, category
usage calculations, over-bound reconciliation, text/media refunds and hosted
verification remain unverified and required; no fixture outcomes support them.

## Actual Credits text admission and consumption — issue #110

Migrations 0382–0383 and the request/financial recovery paths now pin Credits text
prices, reserve source ranges with dispatch, record usage-derived unit liabilities
and resolve or retain those ranges. The first actual request exposed a missing
integration with the existing database prepaid-dispatch guard: it returned HTTP
400 before egress, with no committed attempt or debit. The guard was extended to
require the explicit unit tariff and a fully funded exact bound, preserving the
existing currency and personal-route checks. The corrected running gateway was
then exercised with actual free OpenRouter inference.

The isolated native runtime used its supported static route configuration and
a bounded local transport forwarder to the actual OpenRouter service. The
forwarder produced no model responses and limited requests to independently
listed free models and at most 64 output tokens. Seven actual upstream requests
returned HTTP 200 with the expected short output (`42` or `ZERO`); each upstream
receipt reported cost zero. This is not evidence for hosted deployment or the
managed Provider onboarding journey.

- A flat-price request pinned tariff revision 8, reserved 9320000 atoms and
  settled 2000000 atoms. Independent ranges showed 500000 promotional atoms
  consumed first, then 1500000 simulated-purchase atoms; unused held capacity
  was released. The separate monetary customer charge and wallet tables stayed
  empty, and the procurement cost entry remained zero USD.
- A zero-price request was observed in `may_have_executed` with revision 10.
  Revision 11 was published before its response arrived. Its final charge and
  resolution remained exactly zero under revision 10, with no allocated ranges.
- Concurrent category-priced requests returned actual output and retained
  disjoint ranges. One complete, coherent observation under revision 11 reported
  40 input tokens, 45 output tokens and 28 reasoning tokens, with zero cache
  read/write tokens. Independent arithmetic using the selected context tier and
  fixed fee matched the recorded 186600-atom charge.
- Three other category-priced responses reported reasoning counts larger than
  total output counts. Independent OpenRouter generation metadata for the first
  two retained the contradiction (71 reasoning versus 61 output, and 64 versus
  61). These do not establish billable category usage. No unit charge was posted
  for them; their combined 49728300-atom hold remains. Restart recovery retained
  these unresolved records instead of substituting a flat rate, inventing usage
  or releasing capacity.
- A five-million-atom promotion was reserved before its one-second deadline.
  The actual model response arrived after expiry. The request settled two million
  atoms from that original promotion; the three-million unused remainder stayed
  expired. Independent saved timestamps establish both sides of the deadline;
  no clock, expiry or model-response data was modified.
- An isolated company with one simulated atom received HTTP 402 before upstream
  dispatch. Its balance remained one atom with zero held or charged atoms, and
  the upstream request count remained seven.

Independent final reads found seven actual requests and four unit resolutions:
2000000, 0, 186600 and 2000000 atoms. Each matches a separate calculation from
the original saved price and reported usage. Occupied ranges had no cross-request
overlap. There were no monetary customer charges or wallet entries, and total
procurement cash cost was zero. Both temporary inference keys were revoked; the
main revoked key independently returned HTTP 401 while historical charges and
the three unresolved holds remained readable.

The guarded mode-activation UI/API remains unimplemented: this runtime still
uses the explicitly documented isolated development configuration. Unit spending
limits, actual over-bound settlement/recovery, purchase backing, refunds, media,
customer request/history UI and exports, current currency-mode inference
regression and hosted acceptance remain required. The paid-usage metadata guard
was extended to cover recorded unit charges; its managed-route reconciliation
branch is not established by these static-route runs. Builds and generated
contract checks are code hygiene; no fixture result supports these observations.

## Credits original-range refunds — 2026-10-25 12:44 UTC

Related work: `niu-2xp.3`, public issue #110. The current native gateway and
compiled JavaScript SDK exercised the refund endpoint against the preceding
actual free-model inference charges. These were existing real request outcomes,
not inserted consumption records or fixture results. This is partial acceptance;
it does not qualify the complete Credits workflow or hosted release.

- Two concurrent identical 750000-atom refund requests returned the same
  immutable receipt. Its original sources were 500000 promotional atoms from
  definition 5 and 250000 simulated atoms from definition 1. The promotional
  deadline was unchanged and had already expired.
- A subsequent 1250000-atom refund completed restoration of the original
  2000000-atom charge. Changed idempotent input and an additional one-atom
  over-refund returned 409.
- Restoring 500000 atoms from the promotion consumed after its deadline retained
  that original expiry. It increased expired quantities, not available balance.
- Two distinct concurrent 150000-atom intents against a 186600-atom charge
  returned 200 and 409. Only one restoration was recorded.
- A positive refund against the explicit zero charge returned 409. An absent
  organization returned 404, anonymous access 401, a workspace viewer 403 and
  zero quantity 400. The temporary viewer session was revoked with 204.

Independent database reads of the original allocation ranges, charge quantities,
lots and restoration intervals were reconciled with separate integer arithmetic.
Four refund records restored 2650000 atoms: available simulated quantities rose
by 1650000 and expired promotional quantities by 1000000. No restored interval
remained occupied. Gross charges, all three unresolved holds and monetary wallet
entries were unchanged; monetary entries remained zero. Each balance group
still satisfied issued + restored = held + charged + expired + available.
After gateway restart, both the balance and original idempotent receipt matched
their pre-restart responses exactly.

The endpoint and SDK expose the original source deadlines and exact string
quantities without procurement or monetary-backing fields. Generated handler
contracts and the full public OpenAPI entry point include the operation.
Compilation and contract checks are code hygiene only. Genuine cash-backed
purchase consumption, processor refunds, purchase reversals, monetary-mode
inference regression, unit limits, over-bound recovery, media, activation,
customer presentation and hosted verification remain outside this evidence.

## Currency-mode text inference regression — 2026-10-25 12:48 UTC

Related work: `niu-2xp.3`, public issue #110. The separate native currency-mode
instance was upgraded through migration 0383 and ran the same current gateway
implementation as the Credits refund verification. It retained currency mode
and its existing simulated USD 3 balance. A supported private static route used
the actual free OpenRouter model through the previously documented transport
forwarder; no inference response or usage was synthesized.

An explicit monetary customer tariff used USD 1 per million input tokens,
USD 2 per million output tokens, USD 0.001 per request and a USD 0.002 minimum.
The temporary inference key had a USD 0.01 spending limit and one-request
concurrency limit. Procurement budget and configured upstream rates were zero.
The actual bounded request returned HTTP 200 and exactly `42`, reporting 25 input
and 32 output tokens. Independent upstream evidence reported cost zero.

Separate database reads verified the saved monetary tariff, confirmed completed
attempt, reported usage, one customer charge, one negative wallet posting and
released monetary reservation. Independent arithmetic applied the original
rates, fee and minimum and produced exactly 2000000 USD nanounits. The account
balance moved from 3000000000 to 2998000000 nanounits with no remaining monetary
hold. The key committed 2000000 of its 10000000-nanounit limit, leaving 8000000.
The upstream accounting entry had zero cash and API-equivalent cost. There were
zero Credits lots, reservations or charges in this currency-mode database.

The inference key was revoked and independently returned HTTP 401. After gateway
restart, both the monetary balance and empty Credits balance remained identical.
This verifies the actual native monetary text path after the Credits changes;
it does not cover hosted managed-Provider routing, media, all monetary error
paths or the full installation/upgrade distribution matrix. It is not a release
qualification, and no fixture result contributes to this evidence.

## Billing-mode compatibility preview — 2026-10-25 12:58 UTC

Related work: `niu-2xp.3`, public issue #110 and acceptance case UNIT-05.
The current native gateway and JavaScript SDK read the new platform-only preview
against the existing currency and Credits databases and an additional clean
database migrated through 0383. This verifies the read-only preview, not guarded
mode publication or the mode-management UI; UNIT-05 remains unverified overall.

The currency instance reported one account with a nonzero monetary balance and
one pending checkout. The Credits instance reported three unresolved unit
reservations, three unsettled customer requests and five remaining unexpired
lots across two companies. Independent reads of accounts, payment orders and
terminal records, unit lots, original ranges, resolutions and refunds matched
the corresponding preview counts. Separate integer reconstruction of consumption
and restoration established the remaining-lot count. Existing wallet entries,
unit lots, reservations and refunds were unchanged by preview reads.

The clean installation remained in currency mode. Initial setup exposed an
unconfigured platform payment currency even after a definition and USD purchase
rule had been published. The preview was corrected to distinguish this as
`missing_payment_currency`. Configuring USD through the actual platform API
removed the blocker. Publishing a new unit definition then reported
`missing_purchase_rule` rather than reusing the old definition's rule. Publishing
its matching rule removed that blocker. The final configuration was revision 4
and still currency mode, with no wallet entries, unit lots, reservations or
refunds. No direct database mode mutation was used for this clean installation.

Invalid targets returned 400 and anonymous requests returned 401 on all three
instances. An actual workspace viewer received 403; its temporary session was
revoked with 204. The operation and explicit configuration `billing_mode` field
are included in generated handler contracts, the full OpenAPI entry point and
the typed SDK. Build and contract checks are code hygiene only.

Credit facilities, negative monetary balances, unapplied grant intents, unposted
known liabilities, media obligations and the over-100-account truncation branch
are represented in the implementation but were not exercised by these runs.
Atomic mode publication, concurrent financial changes, limit migration and
rendered desktop/narrow acceptance remain required. An empty preview is not
evidence of release readiness or a completed mode switch.
