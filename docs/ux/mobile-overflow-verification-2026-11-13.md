# Mobile overflow verification — 2026-11-13

Bead: `niu-ly7e`. Source: working-tree changes based on `c0d73a22`, on
`fix/mobile-layout-overflow`. This is local implementation evidence, not staging
deployment acceptance.

## Scope and method

Reproduced the reported saved-chat scrolling, Billing rate-table and revealed-key
layout problems in the signed-in staging application. Verified the edited dashboard
running locally against the same live staging backend and existing records, without
creating model requests, payments or API keys. No fixture outcomes were used.
Browser captures containing account context remain outside the public repository;
revealed secrets were concealed for visual inspection without changing their bounds.

The inspected OpenRouter chat reference keeps its composer accessible below the
conversation on phone screens. The repair retains Niu's existing shell, theme,
reading column, Table, DropdownMenu and Dialog primitives; it introduces no new
navigation or data presentation pattern.

## Findings and observed outcomes

| Surface | Before | After and verification |
| --- | --- | --- |
| Saved chat | At 390 × 844, an inner route wrapper grew to about 1091px. Its outer container clipped the content; the composer began below the viewport. | Included the sidebar-provider wrapper in the existing shrinking-height rule. At widths 320, 390, 768, 1024 and 1440, the transcript had bounded height and the composer remained inside the viewport. Wheel input reached both ends; End scrolled the transcript; a touch swipe also changed its scroll position. |
| Chat navigation | The phone history drawer inherited a two-column layout, separating New generation from the narrow session list. | The existing history content now stays a single flex column. Inspected the settled drawer at 390px; Escape dismissed it and returned focus to its trigger. At 1024px, the expanded primary sidebar left a measured 784px chat canvas; the collapsed sidebar left 960px. |
| Workspace Billing rates | The phone override forced eight columns into the viewport, breaking headings and values into vertical fragments. | Removed that override. At 390px, the 358px table container scrolled over a readable 1028px table; horizontal wheel input reached its 670px maximum offset. The main page did not overflow at 320, 390, 768, 1024 or 1440px. Both table ends were visually inspected. |
| Credits and payment orders | At 320px, dates split inside the fixed-width amount column; payment-notice titles were truncated, including in the details dialog. | Reduced phone table-cell gutters, kept dates together and allowed notice titles to wrap. All five current date cells measured 96px with no horizontal overflow. Inspected 320px and desktop layouts; opened an existing order, dismissed with Escape and verified focus returned to View details. No payment action was executed. |
| API key list | Revealing an existing key expanded the table to about 723px at a 390px viewport. | Key text wraps within its cell and adjacent buttons retain their width. The revealed table measured 358px at 390px and 288px at 320px. Checked 768, 1024 and 1440px as well. Hide worked through keyboard activation; copy and row actions stayed within the table. Clipboard contents were not inspected. |
| API key detail | At 320px, the action row extended left of the viewport. Two usage-metric selector labels overflowed their tiles. | Actions wrap onto two rows. Metric triggers can shrink and wrap; all four 144px tiles had equal client and scroll widths. Inspected both metric menus at phone and desktop sizes, including selected checks, Escape dismissal and keyboard focus return. Existing detail-secret wrapping was also inspected with a real revealed key. |

## Review criteria and limits

The local `ux-review` applied [WCAG 2.2 reflow](https://www.w3.org/TR/WCAG22/#reflow)
and [keyboard access](https://www.w3.org/TR/WCAG22/#keyboard) to the affected paths.
The wide rate comparison retains its two-dimensional table structure with scrolling
inside the table container; the surrounding page reflows. Menu and dialog inspection
used the [WAI-ARIA menu](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) and
[dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) interaction guidance.
Niu's full-width management canvas and direct shared-component requirements remain
in force.

Visual inspection separately confirmed readable rate headings, intact date strings,
visible key actions and a single-column history drawer. Existing grouping, action
emphasis and brand treatment were retained. This bounded inspection is not a full
accessibility audit or a physical-device/Safari test.

`pnpm --dir apps/dashboard check` and `git diff --check` completed successfully.
The final Billing inspection reported no failed script, stylesheet or image resource
responses. These checks supplement the current-input browser evidence above; they
do not establish staging acceptance. The source changes have not been committed,
pushed or deployed. Model execution, payment processing and key rotation/revocation
were outside this layout verification.
