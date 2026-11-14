# Neutral card surfaces — 2026-11-14

Bead: `niu-mt67`. Follow-up to the logo palette refinement.

The orange `accent` token unintentionally colored model-card hover, skeletons,
menu focus and other generic interaction surfaces. Generic canvas, card, muted,
hover and sidebar surfaces now use neutral gray values. Logo colors remain on
intentional primary actions and meaningful accents. Content/progress panel fills
and focused request-row backgrounds use muted surfaces rather than primary tints;
the focused row retains its visible focus stripe. Skeletons explicitly use muted.

Actual current-input browser inspection used live gateway-backed Models and
Overview routes. Inspected light/dark model cards, hover, the open sorting menu,
keyboard ArrowDown/Escape, 1353px desktop, intermediate 1100px and 390px narrow
frames. The 390px document measured 390px. Dark cards are charcoal, light cards
are white, and hovered cards/menu focus remain neutral. Overview preserves its
metric hierarchy and orange primary action. TypeScript compilation and diff
whitespace checks completed; fixture outcomes were not used.

Criteria: ux-review visual-review.md and its NN/g hierarchy/consistency sources:
neutral supporting surfaces must not compete with the primary action. Existing
Manus tonal surface reference remains the established pattern; this correction
adds no new layout or interaction. Visual observation supports the scoped fix,
not a complete product or accessibility audit. Active generation progress and
all unvisited routes remain outside this browser verification.

Hosted follow-up: staging composition `7d59ca5` deployed core `cef0588b`;
workflow 43556308628 reported SUCCESS. The deployed stylesheet changed to
`root-Bwp-lQKB.css`. Independent `/readyz` returned `status: ok`. Actual hosted
Models hover measured light accent `#ececeb` and dark accent `#242424`, with
neutral card fills; both rendered screenshots were inspected. This confirms the
scoped surface correction is live on staging, without production promotion.
