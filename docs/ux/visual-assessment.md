# Visual evidence assessment

This is a synthesis of the rendered evidence in [coverage](coverage.md), not a new test run or an accessibility certification. The baseline is the working tree based on `241872d0`; concurrent changes require revalidation. Screenshot pixels are not viewport CSS dimensions.

## What the evidence supports

| Dimension | Direct observations | Conclusion and boundary |
| --- | --- | --- |
| Composition and hierarchy | Model pools at desktop, intermediate and narrow widths (E09); creation and editing overlays (E20, E31); populated Provider offers (E33) | UX-07 concerns algorithm-heavy introductory text and repeated emphasis. The earlier excessive-gutter screenshot is not reproduced in the current implementation. Empty pools cannot establish the quality of populated routing decisions |
| Navigation and available width | Current Settings position; narrow Users (E23), key detail at 320px (E31), Provider offers at 390px (E33), installation at 390px (E42) | These samples preserve usable content and access. They reject a blanket claim that the shell remains broken at narrow widths; they do not prove every table, overlay or intermediate width works |
| Typography and rich content | Long saved Chat with ordered and continued lists (E24); served documentation with visible ordered-list numbering (E26) | UX-15 is a visible loss of sequence, not merely a CSS preference. Documentation is a valid counterexample. Nested lists, code, mathematical content and wide rich-content tables have not all been visually qualified |
| Assets and theme | Provider logo on the inspected dark surface (E15) | UX-09 records low visual recognition. It is not a measured WCAG contrast failure, and other-theme coverage remains incomplete |
| Decision information | Populated failures and policy denials (E32, E35), cancelled response (E38), expired video preview (E39) | Distinct failed, denied, cancelled and unavailable-result states can be inspected. UX-18 concerns the separate Chat completion mechanism; one explicit cancellation does not clear terminal empty/partial output |
| Overlays and keyboard | Search/menu dismissal, key editing cancellation, selected chart keyboard paths, account settings return (E16, E25, E28, E31, E40) | These are operated samples, not proof of all focus traps, keyboard paths, target sizes or screen-reader announcements |
| Consequential editing and history | Shared unsaved Guardrails draft (E30); history with external-check count and Restore (E35) | UX-19 and UX-21 are decision and transaction-boundary failures. Adjusting padding, button color or icon choice cannot resolve them |

## Consequences for implementation review

Treat shared layout, component behavior and rendered content as separate validation targets. A repaired shell does not repair an unstyled output renderer; an installed dialog primitive does not make its composed save boundary understandable. Check the object identity, decision information and next action together at the width where the task is actually used.

The three directly visual findings are UX-07, UX-09 and UX-15. Several other findings have visible manifestations, but their acceptance depends on correct scope, state or lifecycle semantics. Do not inflate the visual finding count by splitting every manifestation into a separate issue.

## Remaining evidence limits

- No comprehensive alternate-theme, browser-zoom, reduced-motion or assistive-technology evaluation was performed.
- Empty commercial reports cannot represent dense financial tables, large values, comparison or reconciliation.
- The inspected rich-content sample does not represent every supported renderer structure. E46 accounts for the remaining visible histories: they contain simple acknowledgements or a failed request, not additional rich structures. No new paid generation was made to manufacture samples.
- Viewport and keyboard samples do not establish WCAG conformance or measured task success.
- OpenRouter was inspected for comparable product behavior; this review does not claim a complete visual comparison against every mature-product reference.

These are coverage limits, not presumed defects. Future acceptance needs representative populated states and authorized execution for the affected outcome. The present review already establishes concrete visual failures without claiming that the rest of the visual system is cleared.
