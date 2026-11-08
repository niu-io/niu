# Dashboard CSS and lint gate verification — 2026-11-06

Bead: `niu-4rp.14` (dashboard consistency debt). This record covers the v0.3 handoff worktree at HEAD `a57b1dc5`, plus the pre-existing
handoff working tree. No product commit, push, or history rewrite was performed, and the Bead was not closed.

## Outcome

- Removed 461 classes that no source file references and no runtime class composition can
  produce. At this task's verified snapshot the dashboard CSS went from
  **289,136 bytes / 3,358 lines** to **157,842 bytes / 1,996 lines** (−131,294 bytes,
  **−45.41%**; gzip 43,906 → 26,162 bytes, **−40.41%**).
- The built root stylesheet went from **363,065** to **234,962 bytes** at that snapshot
  (**−128,103 bytes, −35.28%**). The difference from the source figure is Tailwind's generated
  utilities retaining their existing size.
- Split the stylesheet into nine modules imported in the original sequence. The split build is
  byte-identical to the unsplit build (`aeff2ce9585a863196a2943b3971724d6271dae3`), so the
  cascade and visual result are unchanged.
- A concurrent invitation feature appended referenced CSS to `overview.css` and `shell.css`
  after the verified snapshot. The current shared tree is **160,354 bytes / 453 classes**
  (−44.54% versus 289,136; gzip 26,627), and its build root is **237,614 bytes**
  (−34.55%). Typecheck and build pass on that tree. The lint gate correctly reports **1,210**
  against the 1,208 baseline because concurrent operator work added two `useTemplate` findings
  (2026-11-06 follow-up: those two `useTemplate` findings were reviewed and the checked-in
  baseline was accepted at **1,210 / 38 rules**; `pnpm --filter @niu-io/dashboard lint` passes.)
  in `test/features/operators/components/OperatorsView.integration.test.tsx` at 02:00:33.
  Refresh the baseline only after that work lands.
- Added Biome 2.6.5 with an explicit **1,208-diagnostic / 38-rule baseline**. The gate fails on
  any count above the baseline; it does not disable recommended rules.
- Added a reproducible unused-CSS audit with zero remaining removable classes and nine
  deliberately protected dynamically composed classes.
- Verified typecheck, build, i18n, the behavioral test suite, and 10 rendered
  desktop/390 page states. No computed-style difference was introduced.

## Exact commands

```sh
# from the repository root
pnpm --filter @niu-io/dashboard lint                    # gate (Biome baseline + CSS audit)
pnpm --filter @niu-io/dashboard check                   # adds SDK build, typegen, tsc
pnpm --filter @niu-io/dashboard build                   # production build + i18n new-copy gate
pnpm check:i18n                                         # full localization audit
NODE_ENV=test pnpm --filter @niu-io/dashboard test      # Vitest needs the test environment
node apps/dashboard/scripts/lint.mjs                    # Biome baseline only
node apps/dashboard/scripts/check-css-usage.mjs --report # read-only CSS audit
node apps/dashboard/scripts/check-css-usage.mjs --json   # machine-readable removed-class list
```

`NODE_ENV` is `production` in the handoff shell; Vitest and the Vite development server must run
with `NODE_ENV=test` / `NODE_ENV=development` or the host loads production React builds and fails
with `React.act is not a function` and `No such built-in module: node:`.

## Lint gate

- Tool: `@biomejs/biome@2.6.5`, pinned in `apps/dashboard/package.json`; config in
  `apps/dashboard/biome.json`.
- Scope: `apps/dashboard/app/**` (TS, TSX, CSS), `apps/dashboard/scripts/**` (MJS), and
  `apps/dashboard/test/**` (TS, TSX, MJS), with `css.parser.tailwindDirectives` enabled.
- Formatter and assist are disabled; this gate does not rewrite the tree.
- Baseline: `apps/dashboard/lint-baseline.json`, total **1,208** diagnostics across **38 rules**.
  Biome's recommended preset on the pre-cleanup tree reported 1,667 diagnostics. The lower final
  count comes from the CSS split (per-file specificity analysis) and the retired CSS, not from
  rule exclusions.
- Largest remaining baselined rules:

| Rule | Count |
| --- | ---: |
| `lint/correctness/useExhaustiveDependencies` | 401 |
| `lint/style/useTemplate` | 238 |
| `lint/style/noNonNullAssertion` | 179 |
| `lint/style/noDescendingSpecificity` | 107 |
| `lint/complexity/noImportantStyles` | 57 |
| `lint/suspicious/noArrayIndexKey` | 45 |
| `lint/style/useImportType` | 25 |
| `lint/a11y/useAriaPropsSupportedByRole` | 25 |
| `lint/suspicious/noControlCharactersInRegex` | 23 |
| `lint/correctness/noComponentHookFactories` | 22 |

- Update procedure: `pnpm --filter @niu-io/dashboard lint:update-baseline`, review the count
  change in the diff, and explain deliberate increases during review.
- Negative test: adding one unused import raised `noUnusedImports` from 2 to 3 and exited 1;
  removing it restored exit 0. Adding `.niu-css-probe { color: red; }` made the CSS audit exit 1
  with `unreferenced 1, removable 1`; removing it restored `unreferenced 0`.
- CI: `.github/workflows/ci.yml` runs `pnpm lint:dashboard` before the dashboard typecheck, and
  `apps/dashboard/check` now runs the same lint gate.

## CSS removal method

`apps/dashboard/scripts/check-css-usage.mjs` is the reproducible scan and remover:

- A class is used when its token appears outside the CSS files, across all repository text files
  (including Rust, docs, tests, and JSON).
- A template literal can protect a composed class only when it is a `className`/`class`
  expression, a `cn`/`clsx`/`cva`/`classNames`/`twMerge` argument, or a `classList` call. Prefix
  fragments ending in `-` are also protected from app templates so helper-composed class names
  are covered. String literals joined with `+` are inspected at their class boundary too, so
  `'operator-session-state state-' + state` protects `state-*` and
  `'operator-role-chip role-' + role` protects `role-*`.
- `:not()`, `:is()` and `:where()` arguments are treated as optional, not required: a class that
  only appears there cannot prove a selector matches or cannot match.
- A rule is removed only when at least one class it requires is unreferenced. Grouped selectors
  are pruned selector by selector; empty at-rule blocks and their whitespace are dropped.
- Result: 910 classes before, 443 after; 434 used, **9 dynamically protected**, 461 removed,
  **0 retained, 0 removable**. Protected: `gateway-attempt-details`, `playground-roster-help`,
  `provider-logo-large`, `provider-logo-small`, `role-admin`, `role-owner`, `state-active`,
  `state-expired`, `state-revoked`.
- The same audit runs in `pnpm lint`; it fails if new unreferenced classes are added.

Removed inventory by prefix:

| Prefix | Count | Prefix | Count |
| --- | ---: | --- | ---: |
| `execution-` | 64 | `model-` | 18 |
| `playground-` | 47 | `overview-` | 14 |
| `provider-` | 38 | `trace-` | 11 |
| `benchmark-` | 37 | `is-` | 10 |
| `gateway-` | 32 | `budget-` | 7 |
| `subscription-` | 26 | `first-` | 7 |
| `key-` | 24 | `cost-` | 6 |
| `operator-` | 24 | `kind-` | 6 |
| `vendor-` | 24 | remaining (39 prefixes) | 66 |

Examples: legacy `brand-lockup`, `dashboard-label`, `nav-caption`, `topbar`, `status-pill`,
`metric-*`, `setup-*`, `keys-controls`, `vendor-*`, `provider-*`, `playground-*`,
`execution-*`, `subscription-*`, `operator-*`, `overview-workflows`, and `trace-*`.

Removed-class names (from `check-css-usage.mjs --json`):

<details>
<summary>461 removed classes</summary>

```text
activity-key-disclosure, agent-node, benchmark-candidate, benchmark-candidate-grid,
benchmark-candidate-head, benchmark-candidate-id, benchmark-candidate-mark, benchmark-costs,
benchmark-diagnostic, benchmark-diagnostics, benchmark-file-control, benchmark-form,
benchmark-form-footer, benchmark-heuristic-tag, benchmark-input-panel, benchmark-interval,
benchmark-json-input, benchmark-limit-detail, benchmark-limit-note, benchmark-mini-grid,
benchmark-mode, benchmark-outcome-strip, benchmark-page-heading, benchmark-pair-index,
benchmark-pair-list, benchmark-pair-row, benchmark-pairs-panel, benchmark-progress,
benchmark-qualification, benchmark-readiness, benchmark-report-head, benchmark-results,
benchmark-revision, benchmark-safety-note, benchmark-sample, benchmark-schema, benchmark-spend,
benchmark-spin, benchmark-uncertainty, billing-actions, billing-row-actions, blue, brand-lockup,
brand-name, budget-dialog, budget-form-error, budget-grid, budget-panel, budget-panel-heading,
budget-policy-note, budget-setup-form, calls-node, candidate-1, chevron, client-base-url,
client-example, client-example-heading, client-setup-copy-field, coming-art, coming-label,
coming-panel, contains-task-list, cost-foundation, cost-home-heading, cost-workflow,
cost-workflow-copy, cost-workflow-index, cost-workflow-step, dashboard-label, directory-empty,
directory-result-count, execution-account-link, execution-account-unlinked, execution-agent-usage,
execution-agent-usage-grid, execution-agent-usage-note, execution-charge-list, execution-cohort,
execution-cohort-accepted, execution-cohort-authorities, execution-cohort-authorities-title,
execution-cohort-disclosure, execution-cohort-empty-value, execution-cohort-error,
execution-cohort-foot, execution-cohort-grid, execution-cohort-head, execution-cohort-loading,
execution-cohort-money, execution-cohort-ratio, execution-cohort-stat, execution-definition,
execution-empty-list, execution-evidence-alert, execution-evidence-diff, execution-evidence-grid,
execution-evidence-panel, execution-explorer, execution-explorer-head, execution-feedback,
execution-import-actions, execution-import-dialog, execution-import-form, execution-import-head,
execution-import-privacy, execution-investigation, execution-latency, execution-links-panel,
execution-loading, execution-metrics, execution-order-note, execution-outcomes,
execution-page-actions, execution-page-heading, execution-pagination, execution-run,
execution-run-id, execution-run-list, execution-run-meta, execution-run-top, execution-scope,
execution-scope-note, execution-search, execution-section-head, execution-span-detail,
execution-stream-mark, execution-task-actions, execution-task-head, execution-task-title,
execution-trace, execution-unknown-note, execution-unresolved-cost, execution-welcome,
execution-welcome-mark, execution-workbench, first-key-actions, first-key-card, first-key-expiry,
first-key-fields, first-key-heading, first-key-icon, first-key-models, gateway-activity-filters,
gateway-activity-heading, gateway-activity-scope, gateway-capture-icon, gateway-capture-note,
gateway-client-setup, gateway-client-setup-heading, gateway-client-value, gateway-client-values,
gateway-copy-notice, gateway-filter-error, gateway-recovery, gateway-recovery-actions,
gateway-recovery-content, gateway-recovery-details, gateway-refresh, gateway-request-content,
gateway-request-example, gateway-request-heading, gateway-request-model, gateway-request-state,
gateway-request-unavailable, gateway-task-disclosure, gateway-task-group, gateway-task-group-head,
gateway-task-group-total, gateway-task-groups, gateway-task-kicker, gateway-task-quality,
gateway-task-request, gateway-task-request-list, gateway-task-trace-link, green, guardrails-back,
is-active, is-amber, is-clipped, is-green, is-instant, is-public, is-revoked, is-selected,
is-unlinked, is-violet, issued-key-actions, issued-key-copy-hint, key-actions, key-choice-field,
key-client-fields, key-client-setup, key-copy-field, key-copy-notice, key-endpoint,
key-form-actions, key-form-card, key-form-grid, key-id, key-issued-actions, key-issued-card,
key-issued-heading, key-model-grant, key-model-grants, key-model-value, key-page-heading,
key-prerequisite, key-revoke-button, key-row-actions, key-scope-grid, key-sdk-example, key-search,
keys-controls, kind-agent, kind-attempt, kind-model-invocation, kind-task, kind-tool-invocation,
kind-validation, ledger-pagination, metric-card, metric-grid, metric-icon, model-detail-icon,
model-directory-filters, model-directory-toolbar, model-explorer, model-explorer-list, model-grant,
model-mark, model-pagination, model-restricted, model-route-actions, model-route-detail-empty,
model-route-dialog, model-route-icon, model-route-list, model-route-name, model-route-option,
model-routes-heading, model-row-chevron, nav-caption, niu-modal-overlay, operator-count,
operator-create-mark, operator-empty, operator-entry, operator-entry-avatar, operator-entry-main,
operator-issue-controls, operator-list, operator-loading, operator-page-heading,
operator-read-only-note, operator-scope-fields, operator-scope-note, operator-scope-panel,
operator-section-title, operator-session-controls, operator-session-id, operator-status-mark,
operator-summary, operator-summary-context, operator-summary-item, operator-summary-mark,
operator-workspace-empty, operator-workspace-grid, organization-create-form, outcome-accepted,
outcome-copy, outcome-node, outcome-rejected, outcome-symbol, overview-connect, overview-gateway,
overview-gateway-copy, overview-gateway-count, overview-gateway-mark, overview-gateway-summary,
overview-heading, overview-trace, overview-trace-flow, overview-trace-heading, overview-trace-link,
overview-trace-node, overview-trace-note, overview-workflows, page-heading-copy,
payment-gateway-table, playground-api-dialog, playground-api-dialog-actions,
playground-api-settings, playground-api-warning, playground-attempt-details,
playground-chat-settings, playground-chat-settings-actions, playground-chat-settings-dialog,
playground-chat-settings-trigger, playground-chat-toolbar, playground-composer-footer,
playground-composer-models, playground-composer-panel, playground-empty, playground-evidence-note,
playground-history-empty, playground-history-group, playground-history-item,
playground-history-search, playground-inline-hint, playground-key-empty, playground-key-note,
playground-key-paste, playground-key-warning, playground-live-note, playground-measurements-heading,
playground-model-count, playground-model-mark, playground-model-option,
playground-model-option-state, playground-model-options, playground-model-roster,
playground-panel-heading, playground-remove-model, playground-scope-empty, playground-scope-grid,
playground-scope-panel, playground-selected-model, playground-selected-models,
playground-session-button, playground-system-prompt-label, playground-toolbar-chip,
playground-toolbar-chips, playground-toolbar-label, playground-toolbar-model-name,
playground-toolbar-models, playground-toolbar-unselected, price-revision, provider-admin-actions,
provider-admin-entry, provider-badge, provider-business-note, provider-chart, provider-chart-column,
provider-chart-empty, provider-choice, provider-context-label, provider-context-picker,
provider-daily-values, provider-directory-search, provider-footnote, provider-ledger-state,
provider-metric, provider-metric-primary, provider-metrics, provider-model-cell,
provider-model-hint, provider-model-option-copy, provider-model-picker, provider-model-popover,
provider-model-trigger, provider-offer, provider-offer-name, provider-offer-rates,
provider-overview-grid, provider-panel-note, provider-period-picker, provider-qualification-actions,
provider-qualification-content, provider-qualification-note, provider-revenue,
provider-section-heading, provider-tabs, provider-toolbar, provider-traffic, provider-zone-heading,
scope-notice, setup-copy, setup-icon, setup-panel, sidebar-bottom, sidebar-open, sidebar-scrim,
sidebar-toggle-placeholder, skip-link, status-pill, subscription-account-concurrency,
subscription-account-list, subscription-account-name, subscription-account-panel,
subscription-account-row, subscription-capacity-heading, subscription-dialog,
subscription-dialog-form, subscription-dialog-grid, subscription-explainer,
subscription-explainer-mark, subscription-meter, subscription-metric, subscription-metric-icon,
subscription-metrics, subscription-provider-mark, subscription-related-tasks, subscription-window,
subscription-window-account, subscription-window-action, subscription-window-capacity,
subscription-window-change, subscription-window-list, subscription-window-panel,
subscription-window-times, subscription-window-total, success-text, supplier-directory-table,
supplier-models-dialog, supplier-qualification-strip, task-node, topbar, topbar-actions,
topbar-status, trace-axis, trace-bar, trace-duration, trace-kind-mark, trace-no-time,
trace-outcome-mark, trace-row, trace-rows, trace-span, trace-span-copy, trace-track,
usage-page-actions, user-chip, vendor-catalog-state, vendor-count, vendor-detail-facts,
vendor-detail-heading, vendor-directory, vendor-entry, vendor-entry-copy, vendor-entry-mark,
vendor-feature-list, vendor-heading-actions, vendor-list, vendor-model-action-buttons,
vendor-model-actions, vendor-model-alias, vendor-model-empty, vendor-model-form-wrap,
vendor-model-table, vendor-model-table-wrap, vendor-model-toolbar, vendor-models,
vendor-panel-heading, vendor-state, vendor-upstream-model, vendor-workspace, violet,
workspace-create-parent, workspace-mark, workspace-scope-summary, workspace-switcher-org
```

</details>

## CSS modules

`app/styles.css` is now a 13-line entry point that imports the ordered modules below. Import
order is the cascade order; do not reorder the imports. The total includes the entry point.

| Module | Lines | Bytes | Content |
| --- | ---: | ---: | --- |
| `styles.css` (entry) | 13 | 423 | Tailwind, branding, and ordered module imports |
| `foundation.css` | 198 | 17,884 | Root/base elements, theme tokens, base layer, shared rhythm and primitives |
| `overview.css` | 299 | 31,380 | Activity summary, overview/rollup and trace surfaces |
| `shell.css` | 212 | 22,672 | Product rail, workspace shell, contextual navigation, responsive shell |
| `catalog.css` | 24 | 2,375 | Model catalog/search |
| `chat.css` | 223 | 18,908 | Generations/chat, first-run surfaces, recovery |
| `surfaces.css` | 349 | 29,225 | Shared page hierarchy, provider identity, supplier surfaces, spacing |
| `operations.css` | 348 | 23,878 | Logs, request toolbars, guardrails, keys, administration |
| `print.css` | 258 | 6,429 | `@page` and print layout |
| `polish.css` | 72 | 4,668 | Billing, activity, lifecycle and narrow-viewport refinements |
| **Total** | **1,996** | **157,842** | |

Proof of order preservation: the split and unsplit production builds produced the same
`root-B9g0qSsI.css` file with SHA-1 `aeff2ce9585a863196a2943b3971724d6271dae3` and the same
234,962-byte size. The `GenerationsLayout` stylesheet assertion now follows the entry imports
instead of reading only `app/styles.css`, so it continues to verify the assembled cascade.

The table above is the verified snapshot. Concurrent invitation work later appended referenced
CSS to `overview.css` (now 307 lines / 31,889 bytes) and `shell.css` (now 233 lines / 24,675
bytes), making the current shared tree 160,354 bytes. No rules from this task were reverted.

## Verification evidence

| Check | Command | Result |
| --- | --- | --- |
| Typecheck + lint | `pnpm --filter @niu-io/dashboard check` | pass at verified snapshot |
| Production build | `pnpm --filter @niu-io/dashboard build` | pass at verified snapshot and current tree |
| i18n full audit | `pnpm check:i18n` | 0 findings |
| i18n tests | `pnpm test:i18n` | 14/14 pass |
| Dashboard tests | `NODE_ENV=test pnpm --filter @niu-io/dashboard test` | 143/143 files, 1,228/1,228 tests pass |
| CSS audit | `node apps/dashboard/scripts/check-css-usage.mjs` | exit 0, 0 removable |
| Lint gate | `pnpm --filter @niu-io/dashboard lint` | exit 0 at snapshot; 1,210 vs 1,208 now |

Typecheck and build were re-run on the current shared tree after the concurrent invitation CSS
landed and pass. The test, i18n, and browser rows describe the verified snapshot immediately
before that addition. The current lint delta is the concurrent operator test file described
above; the gate is doing its job rather than being refreshed over moving work.

Browser verification used the live development server at `http://127.0.0.1:2566` and a persisted
demo workspace session. Desktop states: Overview, Request logs, Models, API keys, Generations,
Billing, Workspace settings at 1440×900. Narrow states: Overview, Request logs, Models at
390×844. For every state the run recorded element count, document scroll width, the runtime
class set, and 32 computed-style properties per element.

- All 10 before/after states had zero element, class, scroll-width, and computed-style
  differences. Nine screenshots were byte-identical; `mobile-models` differed in two
  anti-aliased pixels by at most 15/255, with identical computed styles.
- Across all rendered states, **none of the 461 removed classes appeared in the live DOM**.
- The concurrent invitation CSS was added after this capture and was not part of the
  before/after comparison. It is referenced by the new invitation components, passes the CSS
  audit, and is covered by the current typecheck/lint/build run.
- Admin-only routes were not browser-verified because the seeded demo account lacks platform
  administrator authority; their unused CSS was audited statically and is covered by the same
  gate. Dynamic dialogs/menus were not opened in every state.

The checkout's `Cargo`/database backend was not exercised; this change is frontend-only.

## Remaining debt and limits

- 1,208 baselined lint diagnostics remain, dominated by `useExhaustiveDependencies` (401),
  `useTemplate` (238), `noNonNullAssertion` (179), `noDescendingSpecificity` (107), and
  `noImportantStyles` (57). They are visible in the baseline and gate against growth; they are
  not silently disabled. Do not refresh the baseline over the concurrent operator test work;
  rerun `pnpm --filter @niu-io/dashboard lint:update-baseline` after sibling tasks land.
- The nine protected classes are retained by the dynamic-composition rules:
  `gateway-attempt-details`, `playground-roster-help`, `provider-logo-large`,
  `provider-logo-small`, `role-admin`, `role-owner`, `state-active`, `state-expired`,
  `state-revoked`. Some may be dead, but removing them would risk a runtime-composed class.
- The CSS audit is textual at its core. It cannot see classes applied by a future server
  payload, browser extension, or code path that composes a class without an AST-visible
  `className`/`cn`/`classList` expression. Re-run the audit and browser states when adding such
  a path.
- The stylesheet remains about 160 KB of source in the shared tree (157 KB at the verified
  snapshot); no attempt was made to restyle or consolidate visual rules, so cascade order and
  visual behavior are unchanged.
- Host Node is 22.23.2 while the repository documents Node 24; see the `NODE_ENV` note above.
