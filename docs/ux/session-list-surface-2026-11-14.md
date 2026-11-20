# Session-list surface — 2026-11-14

Bead: `niu-1ear`. The primary navigation and secondary session list both inherited
the same sidebar surface. Scope: color only, preserving layout and interactions.

The session list now scopes its sidebar background: light appearance mixes the
existing canvas (60%) and card, while dark appearance uses the existing card.
Its hover/selected surface mixes foreground at 8% into that local surface.
Primary navigation and brand colors are unchanged. The same scope applies to
the installed Sidebar's mobile drawer.

Inspected the actual OpenRouter Chat room sidebar before editing, retaining its
quiet neutral secondary-navigation treatment within Niu's existing shell.
Current-input local browser verification used actual saved Chat data from the
connected gateway. Inspected light/dark, desktop 1353px, intermediate 1100px with
primary navigation expanded/collapsed, and 390px mobile drawer. Measured dark
primary navigation RGB 20/20/20 versus history 28/28/28, and a 320px history width.
Verified drawer Escape dismissal and no narrow document overflow. No generation
was submitted. Existing failed requests are historical data, not a test outcome.

Review: ux-review visual-review.md, NN/g grouping/hierarchy and consistency.
Observed pass: neutral tonal separation makes the two navigation levels readable;
selected rows remain distinct and typography/density/layout are preserved.
Diff whitespace validation completed. No fixture outcomes support this record.
Hosted acceptance remains separate from these local observations.

Hosted acceptance: staging workflow 43564227463 completed successfully for
composition `f14c347`, core `1c8952a2`. Independent readiness returned `status: ok`.
Actual hosted light sidebar/history measured RGB 250/250/249 versus approximately
244/244/243; dark measured 20/20/20 versus 28/28/28. Both full rendered frames
were inspected. The list stayed 320px wide, beginning at x=240 beside expanded
primary navigation. No production promotion or model invocation occurred.
