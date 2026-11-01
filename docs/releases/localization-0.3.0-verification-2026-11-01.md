# Niu 0.3 localization and onboarding verification

Dated local/source evidence, 2026-11-01. Related Beads: `niu-lxs.31`, `niu-7ce`,
`niu-1at`, `niu-h8g`, release preparation `niu-2pu`. This record does not qualify
hosted deployment or replace the release acceptance matrix.

## Changes and boundaries

Application copy now uses reactive locale lookups and parameterized messages.
English and Simplified Chinese cover application TSX headings, controls, accessible
names, table labels, empty/loading states and directly derived display text.
Account funding, warning preferences, transactions, model-management review and
request summaries received additional runtime-label corrections. Date formatting
uses the selected interface locale. Customer names, model aliases, exact amounts,
API identifiers and English agent-contract source remain unchanged.

The former untranslated-copy baseline is removed. Build and CI run the full AST
audit without waivers. It checks literal copy, visible attributes, local display
constants, nested template branches, catalog keys, parameterized messages, empty
explicit translations and duplicate catalog entries. See
[scope and limits](../development/localization.md); arbitrary runtime/API data
flow and translation meaning still need rendered verification.

The docs header exposes **For Human / For Agents**, or **用户文档 / 智能体文档**.
Embedded `.md` routes show exact source in a wrapping code block with copy and
raw-open actions. The product rail no longer duplicates the account language
control. Public documentation retains language access.

## Verification observations

- Full application audit: zero findings; eight scanner fixtures pass.
- Parameter tests preserve exact large values, reorder placeholders and do not
  interpret customer text as further placeholders. A funding test switches locale
  with a warning draft open and preserves its numeric value.
- Dashboard thread-pool run: 120 files, 1,035 tests passed. The additional source
  viewer test separately verifies failed-read recovery, exact source copying and
  HTML remaining inert. Fork-pool runs on the local Node runtime encountered
  worker-startup timeouts; the dashboard test configuration uses isolated threads
  with bounded 15-second test/hook deadlines.
- Native Rust workspace: 378 passed, 352 ignored across 87 test/doc-test suites.
  Ignored tests are not represented as executed database acceptance.
- Enterprise workspace: 22 tests passed. Private implementation remains in its
  owning repository.
- Product documentation: 980 pages built. Newly added session-role operations
  are classified in authentication navigation and generated references.
- Release script suite: 144 tests passed. Upgrade-history checks reject unknown
  receipts while recognizing the actual squashed legacy history.

## Rendered UX review

The affected task is to inspect shared funds, configure an in-app warning, recover
from unavailable data and continue using Niu in the selected language. Funding
scope remains account-wide; workspace limits remain separate. Controls and amounts
retain their previous meaning.

Review criteria follow the skill's source-backed standards: [NN/g consistency,
meaningful language and recovery](https://www.nngroup.com/articles/ten-usability-heuristics/),
[WAI-ARIA modal focus and keyboard behavior](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
and the applicable naming/reflow checks in [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
These are scoped observations, not a full accessibility-conformance claim.

- At 1280×900, the settings dialog measured 1024×760 with navigation beside the
  funding content. At 390×844, the settings navigation became a horizontal row;
  the content and warning dialog stayed within the viewport. Localized labels,
  balance hierarchy and cancellation remained legible and reachable.
- The warning checkbox enabled the amount field; cancellation preserved the
  original balance and returned to the opener. Escape returned to the underlying
  workspace. No payment or budget change was submitted in this visual check.
- The raw agent-document view measured 1280×720 on desktop and 390×844 on narrow
  layout, with no document-level horizontal overflow. Desktop audience links
  resolved under `/help/`; raw-open resolved under `/docs/`. Copy feedback appeared
  and the browser clipboard matched all 7,480 source characters at that revision.
- Overview request totals, timing choices and completion states were checked
  against saved local requests. Custom workspace/model names remained verbatim.

Task completeness, composition and interaction were reviewed separately. Exact
source copying and cancellation passed; no clipping was observed in the checked
views. Actual payment settlement, paid model quality, hosted release behavior and
unexercised API-error variants remain outside this local evidence.

## Hosted follow-up, 2026-11-01

At core revision `909b582a286763e6c45242e34f1723665b196bf4`, hosted browser
checks passed at 1280, 960 and 390-pixel widths. Human documentation retains
tutorials and product references; agent documentation exposes its index and five
raw Markdown contracts. Chinese audience navigation, mobile navigation opening
and Escape dismissal, raw contract responses, and visible code-token colors passed.
Screenshot review found one untranslated sidebar group, `Product references`;
the follow-up translates it to 产品参考 in both initial and transition rendering.

Hosted account checks passed login, Chinese language selection, funding labels,
warning-draft cancellation, Escape dismissal and desktop/narrow layout. These
checks did not submit payment or change financial preferences. They do not
qualify all hosted product journeys or upstream inference availability.

## Embedded navigation regression, 2026-11-01

Hosted Help checks at source `2375805b0c671d8f25c9ecda621db79c9fa632ee`
found that embedded-document CSS still suppressed the human/agent navigation,
although the standalone documentation exposed it. This fails navigation
consistency and discoverability across the same documentation task. The source
correction retains the existing documentation header and mobile navigation in
embedded mode; account controls remain owned by the dashboard shell.

The corrected source builds all 980 documentation pages and passes the three
audience-navigation checks. Deployed desktop/narrow interaction and exact source
copying require rendered evidence under `niu-h8g` and release case `HELP-01`;
build success alone does not establish that evidence.
