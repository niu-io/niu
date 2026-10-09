# Supplier media rate administration checkpoint

Reviewed 2026-10-07. This supports F03/F05/F07/F10 and M03/M04/M08; it does not close a release gate.

## Implemented

- Installation Supplier administration → Models & pricing has Text rates and Media rates tabs within Supplier detail; Admin sections remain in the sidebar.
- Media history reads the scoped, paginated purchase-rate API. It displays exact prices, quantity denominators, specifications and effective periods without floating-point money conversion or internal references.
- Rate details show minimum quantity, rounding and configured discount rules. Period status describes the time window, not qualification or route availability.
- Publication uses named eligible model/credential choices and configured resolutions. Exact prices, quantity denominators, precision, rounding and effective periods are editable; discount rules have explicit multipliers, distinct priorities and stacking, scoped to the selected specification and offer.
- Replacement fixes the original specification and billing unit. The backend publishes the new immutable card and retires the original at the new start in one transaction; a conflict rolls back both changes. Exact retries cannot duplicate that transition. Original documents and historical job prices remain unchanged.
- An uncertain save freezes the submitted document. Only an explicit retry sends the same document again; there is no automatic mutation retry. Loaded overlapping history directs publication to replacement; this is an interaction safeguard, not an exhaustive server-side overlap guarantee.
- Retirement sends one explicit cutoff against the original revision. Saved history reloads after confirmation; failures stay visible. Existing jobs retain pinned prices. Retirement does not cancel jobs or imply refunds.
- Procurement history remains on the installation Supplier surface, separate from customer catalog, workspace usage and billing.

## Fresh verification

- Dashboard TypeScript check passed.
- Dashboard suite: 376 tests passed across 62 files with four workers. The focused publication/history suite passed nine tests covering exact prices, named choices, scoped discounts, fixed replacement dimensions, explicit byte-identical retries, loaded overlaps, retired/unrelated offers, omitted internal references, retirement and pagination.
- JavaScript SDK suite: 124 tests passed. Storage regression: 138 tests passed across 24 nonempty suites. The four video gateway fixtures and four native process-replacement cases passed. Clippy with warnings denied passed. These are internal fixture/recovery checks, not live commercial qualification.
- Named-choice APIs enforce installation access, current active qualified offer bindings and bounded pagination. Atomic replacement fixtures cover authorization, exact retry, immutable historical prices, cross-Supplier denial and rollback of a conflicting retirement.
- Inspected OpenRouter's actual model pricing table before implementation. Niu retains shared primitives, brand and navigation; effective-period and retirement controls follow Niu's immutable rate contract.
- Browser review on the development service covered pricing tabs and genuine empty media history, including a 390 × 844 viewport. Populated publication, details, replacement, overlap guidance and retirement were additionally reviewed at desktop and phone widths in an isolated synthetic interaction fixture using the production component. All five publication choice menus were inspected open at desktop and phone widths. The phone dialog measures 358 px within a 390 px viewport, with scrollable content and no document overflow. The fixture changes no Supplier configuration or commercial qualification.

## Still required

Complete customer selling-rate administration, capability configuration and qualification remain unfinished. Publication selects from configured eligible bindings; it does not configure a schema or qualify a route. The discount form covers the selected offer/specification and rate period, not every arbitrary eligibility policy. The development Supplier has no media purchase rates; synthetic interaction evidence does not qualify live supply or commercial prices. Supplier-member media history and consumption views also remain open. Existing text offer rows need protocol-aware classification as part of complete media management.

## Prerequisite navigation recheck — 2026-10-08

The current demo has 25 text offers with saved purchase rates and no media
schema/offer. The media-offer setup dialog now links its genuine empty state to
that Supplier's API keys & routes configuration. It does not create a schema,
activate an offer or imply that OpenRouter supports the required video channel.
The empty-state guidance is withheld while another page of model choices remains.

The running service was reviewed at desktop and 390×844: the prerequisite link
fits the dialog and opens the same Supplier configuration with its saved key and
25 routes intact. No credentials, rates or qualifications were changed. Dashboard
type checking and all 9 media-offer publisher tests passed. The separate Supplier
view/model-mapping suites passed 17 tests. These cover local behavior and this
navigation correction, not a live qualified video route or the full F03 gate.
