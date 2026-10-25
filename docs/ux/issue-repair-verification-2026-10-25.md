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
