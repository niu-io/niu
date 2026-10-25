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
