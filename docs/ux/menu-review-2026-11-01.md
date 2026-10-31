# Menu conventions and review — 2026-11-01

Evidence for niu-92w, following user feedback on the account-menu screenshot from
`dd0b6a018`. The user explicitly chose right-aligned check marks instead of left
radio dots and requested a review of all menus for a shared convention.

## Component purpose and decisions

The account menu identifies the signed-in person, selects an assigned platform
identity and organization, reaches settings, changes appearance/language and ends
the session. These actions remain available. Workspace and Provider selectors
identify a resource scope; action menus execute commands; filter and form menus
select values. Their different tasks do not require different selection gutters.
Navigation drawers remain navigation containers rather than being converted into
choice menus.

| Item purpose | Shared convention |
| --- | --- |
| Command or destination | Ordinary menu item; optional meaningful icon on the left; no selection indicator. |
| One selected value | Radio group semantics, optional left icon, label, right-side check on the selected item. |
| Several selected values | Checkbox semantics and right-side checks; selection menus that support several edits remain open. |
| Submenu | Left icon/label, optional current-value summary, right chevron; preserve ArrowRight/ArrowLeft behavior. |
| Group context | Muted label and separators between distinct tasks; avoid an extra selection column. |
| Destructive command | Existing destructive item variant; preserve the action's existing confirmation/recovery behavior. |

The installed shadcn DropdownMenu primitives own the common padding and check
placement. There is no new wrapper and no call-site gutter CSS. Radio and checkbox
items reserve the same right gutter; radio exclusivity and checkbox toggling are
unchanged. Organization choices in the account menu now use the organization icon
so their text aligns with role and settings rows. Brand tokens, menu anchoring,
responsive navigation and authority rules remain unchanged.

## Reference and criteria

The actual [shadcn Dropdown Menu Radio Icons example](https://ui.shadcn.com/docs/components/radix/dropdown-menu#radio-icons)
was opened and inspected, including its selected Credit Card row: left icon and
label, right-side check. The plain Radio Group example was also opened for
comparison. The right-check treatment follows the user's explicit preference.

The ux-review skill's source-backed [consistency heuristic](https://www.nngroup.com/articles/ten-usability-heuristics/)
and [visual grouping principles](https://www.nngroup.com/articles/principles-visual-design/)
apply to the reported extra label column. The previous account composition failed
this local consistency criterion: roles had a dot, icon and label while adjacent
actions had only icon and label. After correction the measured role, organization
and submenu-label starts are all x=100px in the desktop sample, with check gutters
at x=316px. These are observations, not universal spacing requirements or a claim
of measured user preference. Keyboard selection/name/state checks follow the
[WAI-ARIA menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menus/).
Niu's requirements to reuse shadcn, preserve brand tokens and keep menu layout in
the shared primitive are project constraints.

## Source coverage

The scan covered dashboard, docs and catalog TSX/Astro source. Counts are static
JSX occurrences, not runtime menu instances (mapped options can create many rows).

| Source | Files with menu call sites | Root menus | Radio items | Checkbox items | Action items | Submenus |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dashboard | 61 | 130 | 176 | 8 | 78 | 3 |
| Docs | 4 | 6 | 13 | 0 | 2 | 0 |
| Catalog | 0 | 0 | 0 | 0 | 0 | 0 |

The reviewed families include account/preferences, workspace/Provider and header
scope selectors, model filters, request filters/metrics/columns, API-key access,
guardrail restrictions, administration forms, pricing, media controls and row
actions. Public language, appearance and live-API choices import the same shared
primitive. No native select/option controls or alternative choice-menu wrappers
were found in this scan; `<option.icon>` is an icon component, not a native option.
No consumer adds a competing left/right selection gutter. The workspace selector's
local class changes row height and emphasis, not its internal indicator layout.
The shared change therefore reaches these consumers without rewriting their
business behavior.

## Rendered and interaction evidence

A native gateway, PostgreSQL and the real dashboard entry point were used with an
isolated synthetic account. No production role, upstream request, payment or
commercial configuration was changed for this review. The docs application was
also run against the current working tree. A test-only currency/credit policy
was configured in the isolated database to exercise workspace forms; it did not
credit funds or contact a payment service. No API key was created.

| Control/sample | Action and observed result | Dismiss/return |
| --- | --- | --- |
| Account identity and choices | Desktop open menu retains readable identity, grouped roles/organization and aligned labels; current User/organization show right checks and the unselected role has none. | Escape closes and returns focus. |
| Role | User → Platform administrator reaches administration; switching back returns to the workspace and moves the check. | Successful selection closes the menu. |
| Theme | Opened submenu; Light changed appearance; System restored the previous setting and selected check. | Selection closes; keyboard submenu navigation remains available. |
| Language | ArrowRight opens the language submenu; keyboard selection switches Chinese/English; Chinese restored. | Escape/selection dismiss and preserve the current route. |
| Workspace selector | Selected workspace has a right check; All workspaces remains an ordinary action. | Escape dismisses. |
| Provider row actions | Open/Edit/Delete remain command items without selection checks. Destructive actions were not submitted. | Escape dismisses. |
| Intermediate account menu | At 860×900 the menu is 280×378px, with 376px client/scroll height: no internal vertical overflow. Enter opens with the User choice focused. | Escape dismisses. |
| Phone account menu | At 390×844 the 280px menu fits at x=12…292; English Platform administrator and the organization label fit alongside right checks. Navigation and account actions retain their groups. | Escape dismisses within the drawer. |
| Form single choice | API-key draft Expiration shows one right check; the 390px menu measures 308×170px at x=41, with equal client/scroll width of 306px. | Escape returns to the form; Cancel discards the draft. |
| Form multi-choice | Model access checkbox checked/unchecked/checked; menu stays open while toggling and updates the draft summary. Desktop and 390px screenshots show the right check with no overlap. | Escape dismisses; draft cancelled without creating a key. |
| Public docs theme/language | Desktop theme and language menus render the same checks. At 390px the language menu stays above the native navigation popover; English selection updates navigation text and Chinese restores it. | Selection returns focus to the language trigger; viewport override reset. |

Independent composition review: identity is first, scope choices are grouped,
settings and session actions remain distinct, icons/text follow one alignment and
selection uses the otherwise free trailing space. The 280px floating account menu
preserves the remaining desktop work area; phone navigation intentionally overlays
the reading area only while open. No new page gutters, cards or fixed canvas width
were introduced. Whole-frame screenshots were inspected before checking individual
rows. Desktop/intermediate/phone screenshots include the surrounding navigation.

Task completeness, composition and tested interactions pass for the sampled menu
families. Source coverage is comprehensive for the directories above; browser
coverage is representative, not a claim that all 136 root-menu call sites or every
commercial/admin action was exercised. The API-key Model access checkbox menu was exercised in the browser; guardrail
and populated request-table checkbox consumers are additionally covered by the
existing component/integration suite. Those individual routes were not each
rendered with populated data during this review.

## Validation and limits

Dashboard TypeScript checking passed. The complete dashboard test run passed 117
files and 1,025 tests, with two failing files: branding's mock resolves a missing
token stylesheet, and localization expects a Blog link absent from the current
public header. The latter contains one failing test; the branding file cannot
collect. These are outside the changed menu files, but baseline attribution was
not independently established. This is not a clean full-suite claim.

Only the shared primitive, account organization icon, agreed project rule and this
review record change in the menu correction. Other in-progress work in the shared
checkout is excluded from the commit. No push or deployment is included.
