# Supplier media offer checkpoint

Reviewed 2026-10-07. This verifies local administration, accounting and recovery subsets of F03/F04/F05/F10 and V01/V04/M01–M05. It does not qualify a live video channel or close a release gate.

## Delivered behavior

- Draft model choices require explicit Supplier credential ownership and a valid bound video schema, without requiring an existing active offer. Personal credentials and foreign ownership are excluded. Pagination is bounded and revisions remain exact strings.
- Installation-only publication creates an inactive immutable media offer with no text-token price placeholders. Receipt replay preserves later revisions; changed/foreign receipts and stale configuration conflict. Concurrent publications cannot replace each other silently. Rebinding permits only another credential owned by the same Supplier, retaining original revision bindings.
- Media qualification checks current credential/model/schema bindings at review, availability and dispatch. Changes require a new offer revision. Existing text publication, price history and route requalification retain their compatibility contracts. Additive migrations preserve released migration checksums.
- Purchase and customer selling cards remain independent prerequisites. Shared text, embedding and Responses APIs reject media offers before egress; a database guard additionally requires pinned media prices, liability and original recovery route before dispatch. Video fixtures now use null text prices rather than placeholder rates.
- Supplier administration separates Text rates and Media rates. The media setup dialog uses named choices and internal immutable receipts, preserves identical explicit retries and preselects the model for configuration updates. Media rows expose review/paused state and accessible actions. Supplier member pages handle null text prices without displaying invented amounts or currency choices.

## Fresh verification

Current-tree recheck on 2026-10-09 through migration 0201: all six
`supplier_media_offers` and all ten `media_rates` PostgreSQL tests passed in
disposable clusters. The four dashboard suites for Supplier management, media
publication, customer rates and rate history passed 28 tests. The JavaScript
SDK built successfully and all four Supplier media-offer tests passed. This
refreshes the local independent-credential, immutable-price and client-contract
subsets; it does not qualify live supply, full rendered onboarding or dispatch.

The same current-tree refresh passed the PostgreSQL-backed gateway case
`media_offer_configuration_is_installation_only_bounded_and_receipt_safe`.
It covers administrator-only configuration, multi-credential discovery with
empty-page cursor advancement, safe response fields, exact large revisions,
bounded writes and receipt replay/conflict behavior. This is one management
API acceptance case; it does not refresh all gateway or inference tests.

Current-tree recheck on 2026-10-07 through migration 0149: all six
`supplier_media_offers` and all ten `media_rates` PostgreSQL tests passed using
disposable databases. This confirms the named storage prerequisites after the
payment migrations: scoped immutable offers, qualification invalidation,
independent effective selling schedules, retirement/replacement rollback,
historical prices and concurrent replacement. It does not refresh the broader
gateway, browser or live-channel evidence in the table below.

The added multi-credential PostgreSQL case publishes two models against one
owned credential and a third against an independent credential belonging to the
same Supplier. Discovery and immutable offer revisions retain those exact
bindings. Changing the shared credential revision rejects stale publication for
both associated models while the independent model can publish a new offer.
An unrelated Supplier cannot discover these choices. This verifies storage
configuration isolation, not credential rotation through the UI or actual
upstream dispatch.

Fresh gateway follow-up: the PostgreSQL-backed
`media_offer_configuration_is_installation_only_bounded_and_receipt_safe` test
passed with three valid models across two explicitly owned credentials. A
one-row page containing an invalid schema returns a forward cursor; subsequent
pages recover every valid binding without duplicates or premature termination.
Responses omit credentials, endpoints, upstream model names and price fields.
The same test retains customer-owner denial, invalid-token denial, page/body
bounds and immutable receipt replay/conflict checks. This refreshes that one
management API case, not all gateway Supplier tests or live video dispatch.
The contract, SDK method guidance and video reference now explicitly tell clients
to follow `has_more` and `next_after` even when `data` is empty. Contract YAML
parsing and changed-file public-boundary checks passed.

| Check | Result and scope |
| --- | --- |
| PostgreSQL media offer tests | 6 passed: null prices, exact replay, stale review denial, cross-Supplier/personal exclusion, immutable text history, owned credential rebinding, concurrent publication and dispatch prerequisites. |
| PostgreSQL storage regression | 141 passed across 25 nonempty suites. The final focused media suite additionally covers the two subsequently added ownership/concurrency cases. |
| Gateway Supplier tests | 8 passed, including installation-only choices/publication, 4 KiB body bound, changed receipt denial and customer-safe serialization. |
| Gateway video tests | 4 passed with media-only prepaid offers: text/embedding/Responses denial, no upstream calls or customer debits on those paths, bounded admission, separate prices and exactly-once settlement/recovery. |
| Native process replacement | 4 video tests passed, including prepaid media-offer recovery, one debit, no replacement generation and revoked-key liability preservation. |
| JavaScript SDK | 127 passed. New methods preserve exact read revisions, allowlist mutation fields, reject lossy bindings and never retry automatically. |
| Dashboard | 397 tests across 65 files passed on the final run; TypeScript check passed. Supplier/Settings targeted checks also passed. |
| Rust | Storage/gateway all-target Clippy passed with warnings denied. |
| Contracts and repository | 259 references across 8 YAML contracts resolved; released migration history unchanged; public-boundary check passed. |

## Rendered review

Inspected New API's actual channel-management and model-configuration reference, preserving Niu's shared table/dialog conventions, Supplier sidebar and Text/Media tabs. The running `/suppliers/manage/models` route was inspected with its saved OpenRouter data and the actual empty video-configuration state at desktop and 390px. Its configuration remained unchanged.

A temporary interaction fixture rendered the real product administration page and dialog with named draft video bindings. Desktop and 390px checks covered populated media rows, review gating, sticky action-menu access, model menu alignment/spacing, selection, cancellation, uncertain save and explicit replay. A discovered mobile intrinsic-width overflow was fixed and rechecked: the dialog measured 358px inside a 390px viewport, its menu remained bounded, and the page had no horizontal overflow. Temporary fixture sources were removed. Fixture interactions prove layout and client behavior, not live Supplier qualification or upstream generation.

## Remaining

Customer selling-rate administration, effective output specification/meter/liability management, full multi-key Supplier qualification, actual video channels/rates, media inspection/results/assets/liveness/portrait workflows and packaged end-to-end acceptance remain required. Backend/fixture evidence does not establish commercial rights, official model availability or release readiness.

## Exact offer-write revisions

Media-offer writes now accept canonical decimal strings alongside legacy JSON
integers for credential/model revisions. The backend retains signed 64-bit
values; the JavaScript SDK forwards strings without converting them to numbers.
Zero, fractions, signs, leading zeroes and overflow are rejected. Existing
numeric callers remain supported. Other price-card write contracts are unchanged.

Fresh evidence: the parser unit test covers legacy values and exact revisions
above the JavaScript integer range through the signed 64-bit maximum. All 146
SDK tests passed. The PostgreSQL-backed management case publishes and replays
an offer against credential revision `9007199254740993` through the HTTP endpoint
using string bindings, retaining stale/changed receipt denial. Contract YAML
parsing and changed-file public-boundary/whitespace checks passed.

The dashboard publisher now preserves canonical revision strings directly and
checks their signed 64-bit bounds before freezing the write document. Nine
publisher integration tests passed, covering exact large values, invalid
revisions, pagination, no visible internal identifiers and identical explicit
replay. Dashboard type checking passed.

The existing production dialog was inspected before and after the behavior
change using an isolated browser fixture at desktop and 390px. Named model
selection, menu alignment, uncertainty and retry were checked; both widths
confirmed exact revision strings and identical replay. No new layout was
introduced. Temporary fixture files were removed, the review tab was closed,
and the viewport reset. No saved Supplier data was changed. This qualifies the
rendered serialization subset together with the separate management endpoint
check; it does not establish a live Supplier configuration or full F03 pass.

Storage all-target Clippy passed with warnings denied after this change.
