# Staging visual review, 2026-11-09

Read-only inspection of https://staging.niu.io. The finding list, acceptance checks, and coverage limits are in [GitHub issue 121](https://github.com/niu-io/niu/issues/121). Current tracking is Beads `niu-7wpf`. This note is dated evidence, not a second backlog.

## Verification record (2026-11-09)

Following confirmation of the 15 findings in GitHub issue 121 plus 3 additional user-aligned UX items (empty-state visual polish across management views, local caching and `/generations/runs/:run` route hierarchy for Generations, and removal of the displaced billing disclaimer / height-jumping status lines around the Generations composer), all 18 items were implemented on `ux/issue-121-repair` and verified via `pnpm -C apps/dashboard check`, `pnpm -C apps/dashboard build`, `pnpm -C website build`, Vitest suites, and headless Chrome inspection at `1440x900`, `700x900`, and `390x844`:

1. **Generations Chat model picker & composer (`PlaygroundView.tsx`, `chat.css`, `generations.css`)**:
   - Fixed `.playground-model-picker-option` row clipping (`height: auto; min-height: 44px; align-items: flex-start; white-space: normal; line-height: 1.4`) and `.playground-model-picker-list` spacing (`gap: 2px`).
   - Replaced raw provider/model paths in the picker, composer pill, and hover card with `disambiguatedCatalogTitle` / `catalogTitle`, removed per-row `"Billing information unavailable"` repetition, and changed `"routes"` to `"models"` in the empty filter message.
2. **Model catalog & detail (`ModelTable.tsx`, `models.css`, `catalog.css`)**:
   - Added provider disambiguation (`Seedance 2.0 Fast (fastrouter)` vs `Seedance 2.0 Fast (volcengine)`), suppressed CJK-only `model.catalog.description` on English cards, rendered `Free` when both prompt and completion rates are `0`, routed video-capable models to `Try in Video`, fixed `.model-route-example` narrow overflow, and wrapped `.models-toolbar` at `<=580px` so the filter input spans full width (`279px` at `390px` viewport).
3. **Video Generations (`VideoSessionView.tsx`, `VideoTurnResult.tsx`, `VideoSessionComposer.tsx`, `VideoView.tsx`, `SessionHistory.tsx`)**:
   - Displayed friendly catalog titles (`Seedance 2.0 Fast`) on model selector buttons, page headers, turn result headings, and sidebar history items; surfaced readable run badges (`run-*`) on turn cards and sidebar subtitles; and removed height-jumping loading/draft status lines inside the composer surface.
4. **Workspace API keys (`KeysView.tsx`, `KeyDetailView.tsx`, `KeyGuardrails.tsx`, `operations.css`)**:
   - Surfaced the active status filter label (`Active keys` / `Revoked keys`) on the trigger button with `sideOffset={6}`, kept `Last used` visible at `@container (max-width: 720px)`, synced the page breadcrumb title to `key.name`, summarized 7-protocol `Model calls` as `All model endpoints`, and hid `View policy` when no policy exists and the user is read-only.
5. **Workspace Logs (`GatewayActivity.tsx`, `operations.css`)**:
   - Hid secondary columns (`Latency`, `Input`, `Output`, `API key`) below `860px` container width (`scrollWidth === clientWidth` at `700px`), added `Peak: {n}` to the histogram header, and reduced zero-state histogram height to `56px`.
6. **Customer charges on Logs & Billing (`GatewayActivity.tsx`, `billing/page.tsx`)**:
   - Excluded zero-charge rows when unsettled or unpriced requests exist so `Customer charges` shows `Unresolved` / `No rate` on Logs and `Pending / unpriced` on Billing instead of a misleading `$0.00`.
7. **Workspace Assets (`library/page.tsx`)**:
   - Replaced the permanently visible search input with a compact search icon Popover trigger per the secondary-search rule.
8. **Duplicate model title disambiguation (`lib/providers.ts`)**:
   - Shared `catalogTitle` and `disambiguatedCatalogTitle` across Models, Chat, and Video selectors.
9. **Routing & Evaluations (`routing/page.tsx`, `evaluations/page.tsx`)**:
   - Hid the redundant `"Not saved"` badge on fresh blank editors before edits occur, and shortened empty-state copy on Routing, Evaluations, and Guardrails.
10. **Settings & Notifications (`event-subscriptions/page.tsx`)**:
    - Shortened the page subtitle and moved the zero-channel warning into `<EmptyDescription>`.
11. **Billing & Rates narrow layout (`billing/page.tsx`, `operations.css`)**:
    - Reduced `.workspace-billing-rates-table` minimum width so `700px` viewports do not overflow horizontally.
12. **Administration & Provider Operations (`Administration.tsx`, `platform/page.tsx`, `ProviderList.tsx`, `route-pools/page.tsx`)**:
    - Consolidated Admin Settings status cards into a compact health strip, collapsed identical upstream URLs in Route Pools into a single summary badge, and mapped Provider readiness to distinct `Ready to supply`, `Configured`, and `Disabled` badges.
13. **Account Menu (`AccountMenu.tsx`)**:
    - Consolidated theme and locale selectors into nested `DropdownMenuSub` menus (`Theme`, `Language`) and removed the duplicate `Manage workspaces` item.
14. **Documentation links**:
    - Verified clean navigation between Dashboard and Docs without dead links.
15. **Public website `/compare/` (`website/src/components/CompareBenchmark.tsx`)**:
    - Localized all 8 benchmark table row labels when switched to `中文`.
16. **Empty-state placeholder system (`components/ui/empty.tsx` and 15 feature views)**:
    - Upgraded `<Empty>` primitives with a subtle surface container, `size-11` ringed icon badge, `15px` semibold title, `13.5px` `42ch` description, and consistent icons across Chat, Video, Models, Logs, Assets, Routing, Evaluations, Guardrails, Notifications, Billing, Route Pools, Providers, Audit Logs, Customers, Retail Pricing, and Incidents.
17. **Generations local caching & run routes (`routes.ts`, `PlaygroundView.tsx`, `VideoSessionView.tsx`, `VideoView.tsx`, `SessionHistory.tsx`, `LegacyVideoLink.tsx`)**:
    - Added `peekQuery` / `primeQuery` (`{persist: true}`) caching for sessions, tasks, video models, and workspace keys so revisiting `/generations` renders cached sessions and models immediately without a blocking skeleton, and introduced `/generations/runs/:run` and `/generations/:session/runs/:run` routes replacing `/generations?job=run-*`.
18. **Generations composer notice cleanup (`PlaygroundView.tsx`, `VideoSessionComposer.tsx`)**:
    - Removed the visible `.playground-composer-notices` billing disclaimer below the Chat composer (retaining `.sr-only` accessibility text and surfacing billing status inside the `API key` settings dialog).
