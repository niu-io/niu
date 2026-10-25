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
