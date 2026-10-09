# Video customer activity accounting checkpoint

Reviewed 2026-10-07. Local accounting projection subset; full V13/V16/V19/M08 and release gates remain open.

Logs, request CSV exports, customer-charge totals and model/key charge breakdowns
now include settled media charges alongside text charges. Previously these
projections read only text charge records, incorrectly classifying video jobs as
unpriced and omitting their charges from totals.

Append-only migration 0137 adds customer-only activity views. A media amount is
included only after an exact matching customer ledger debit exists. Qualified
zero charges instead require the reservation to be released. A saved liability
without a debit stays pending with an unknown charged amount. Text/media pricing
presence is recognized independently of settlement. Supplier purchase prices,
costs, margins and settlement records are never read by these views.

All existing workspace filters and pagination remain in the shared activity
queries. Currency totals remain separate and exact. No media quantity is relabelled
as text tokens, and a status label alone does not establish payment or refund.
The existing customer-charge fields and UI contracts are preserved.

Fresh verification:

- Fourteen PostgreSQL media-pricing tests passed, including a posted historical
  charge across store reconstruction and duplicate settlement, matching Logs,
  export and aggregate values, qualified zero charges, unposted bound-breach
  liability, and negative foreign-workspace reads/exports/summaries.
- Two existing request-timing/activity storage tests passed.
- The gateway customer-charge activity test passed, preserving customer amounts,
  aggregate totals and exclusion of Supplier costs.
- Storage Clippy passed with warnings denied. Published migration history is
  unchanged. Public-boundary and scoped whitespace checks passed.

No new UI layout or synthetic production job was added. A real qualified video
job must still be traced through rendered Logs/Usage/global Billing, with its
historical price explanation and live account reconciliation. This checkpoint
does not qualify a live channel or complete the video lifecycle acceptance.


## Durable request kind — 2026-10-07

Request detail/list responses now identify pinned video recovery routes with
`request_kind: video`, including uncertain submissions that have no upstream
receipt. Generic inference retains its own kind. Pricing alone is insufficient
to label a request video. The optional SDK field preserves older-server
compatibility and exposes no upstream route or credential.

Twelve media-job tests passed, including uncertain video identity and foreign
workspace denial. Fourteen media-pricing tests passed, including generic
accounting fixtures that do not acquire a video identity. The existing gateway
customer-activity regression and all 142 SDK tests passed; storage Clippy,
dashboard type checks, contract references and public-boundary checks passed.

The first gateway/Clippy attempts failed when the development disk filled.
Cargo's package-specific cleanup reclaimed generated artifacts; the checks
were rerun successfully. Source and saved product data were preserved, and
port 2566 remained responsive. Logs' video-specific diagnosis surface remains
next; the existing linked-request lookup already fetches jobs beyond page one.


## Logs video drilldown — 2026-10-07

Video request details now omit text input/output/cache/reasoning token metrics,
text-stream timing and text finish reasons. Observed elapsed remains distinct
from exact Supplier generation duration. Open video result preserves the
request's workspace, key and saved job, where lifecycle and historical Billing
are available under their existing authorization.

All 63 affected Logs/Video tests passed, including a historical video outside the
loaded request page, exact navigation parameters and exclusion of visible
internal IDs. Dashboard type checks and public-boundary checks passed. The actual
Niu text request sheet was inspected against the supplied request-timeline
reference before editing. Production Logs components were reviewed with an
isolated historical video fixture at desktop and 390-pixel widths; narrow content
had no horizontal overflow, and sheet dismissal worked. The fixture was removed.
No synthetic production job or paid Supplier request was created.

This closes the scoped video-aware detail/navigation gap. Live generation,
complete Logs/Usage/global Billing charge traversal and packaged recovery
qualification remain open.

## Native scoped-reader recovery acceptance

The isolated native gateway runner passed on 2026-10-07 with an ordinary
workspace-scoped viewer. Request detail and list identify the saved job as video
and match its historical customer charge/currency after tariff replacement,
gateway restart, PostgreSQL restore and credential rotation. Checked procurement
and credential fields remain absent; a foreign-workspace lookup is concealed with
404. These reads cause no upstream requests. All 12 video fixture/setup tests
passed, including rejection of charge drift and confidential fields.

This qualifies a controlled API investigation path, not the rendered customer
workflow or a live Supplier. See [native recovery acceptance](packaged-video-recovery-verification.md).
