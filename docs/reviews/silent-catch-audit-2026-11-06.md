# Dashboard silent data-loading catches — audit and fixes

Status: implementation evidence for Bead `niu-4rp.27`. Current execution state remains in Beads; this record is a dated audit, not a second backlog. The Bead is not closed here.

**Reviewed branch:** `codex/v0.3-handoff-receive-20261104` (`a57b1dc5`) plus the handoff working set.

## Scope

Dashboard feature and shell catches that load data for a user-visible list, detail, balance, comparison or directory read. Expected `404`/abort paths remain quiet; cached or last-loaded values are retained while a retryable status is shown. Fire-and-forget analytics, background probes, mutation handlers, form validation and genuinely optional browser APIs are out of scope or explicitly justified below.

## Fixed data-loading paths

| File | Catch purpose | Disposition | Test |
| --- | --- | --- | --- |
| `app/shell/useProviderDirectory.ts` + `app/features/providers/page.tsx` | Load the shared Provider directory used to resolve Provider detail routes | Failure is exposed as `providerDirectoryError`; a detail route with no cached resolution shows a retryable alert instead of the false “Provider unavailable” state. Cached entries still render. | `test/features/providers/ProviderDirectoryError.test.tsx` |
| `app/features/commercial-position/page.tsx` | Load the prior comparison period separately from the current statement | Non-404 failure shows an inline “comparison period” alert with retry. Current totals and the last loaded comparison stay visible; aborted and 404 reads stay quiet. | `test/features/commercial-position/CommercialPositionPage.test.tsx` |
| `app/features/billing/WorkspaceSpendingLimits.tsx` | Optional Credits limit + limit-history reads after the primary spending-limit read | Non-404 failure shows a retryable Credits-limit alert; cached/loaded accounts and unit values are preserved. `404` (units not configured) stays quiet. | `test/features/billing/WorkspaceSpendingLimitsUnits.test.tsx` |
| `app/features/billing/AccountBilling.tsx` | Optional branded Credits unit snapshot after the primary balance read | Non-404 failure shows a retryable Credits-balance alert; the monetary balance and last loaded snapshot are preserved. `404` stays quiet. | `test/features/billing/AccountBillingUnits.test.tsx` |

## Audited paths that already had a visible state

| File | Catch purpose | Disposition |
| --- | --- | --- |
| `app/shell/useCatalogModels.ts` | Model catalog read | Sets `modelsError`; Models page and Playground show the error with retry. |
| `app/features/generations/SessionHistory.tsx` | Chat/Video session list read | Shows “Some sessions could not be loaded.” with “Retry sessions”; previous snapshot rows are retained. |
| `app/features/activity/global-page.tsx` | Activity list + older pages | Visible error with “Try again” and “Show all workspaces”; cached rows remain. |
| `app/features/library/page.tsx` | Library list + load-more + preview | Visible list/action errors with retry; cached pages remain. |
| `app/features/billing/page.tsx` | Billing statement, invoices, invoice detail, media charges | Visible errors with retry; cached statement remains. |
| `app/features/billing/TopupFunding.tsx` | Payment options, saved top-ups, older top-ups | Visible load errors with retry; background status polling stays quiet because the manual “Check payment status” reports failure. |
| `app/features/customers/page.tsx`, `setup.tsx`, `grants.tsx`, `unit-accounts.tsx`, `gift-corrections.tsx` | Customer/account/grant lists and detail reads | Visible errors with retry or reload; uncertain writes are preserved for idempotent retry. |
| `app/features/guardrails/*` | Policy, history, denials, detector reads | Visible errors with reload/retry; cached policy heads are optional hydration. |
| `app/features/keys/*` | Key directory, detail, history, usage, guardrails | Visible errors with retry/reload. |
| `app/features/operators/components/OperatorsView.tsx` | Operator/workspace/session lists | Visible error with “Try again”; workspace sessions load on demand. |
| `app/features/providers/ProviderList.tsx`, `ProvidersView.tsx`, `components/*` | Provider list, presets, integration, limits, cooldowns | Visible errors with retry/reload; Provider save errors are owned by the calling form. |
| `app/features/retail-pricing/*` | Prices, history, models, customers, promotions | Visible errors with retry/reload and conflict handling. |
| `app/features/provider-business/*` | Offers, media rates, model checks, settlements | Visible errors/check states with retry. |
| `app/features/connect/page.tsx` | Connection request + model catalog | Visible request error and a retryable catalog error. |
| `app/features/playground/components/PlaygroundView.tsx` | Chat history, archived chats, keys, saved comparisons | Visible errors with retry; malformed stream output is reported as partial. |
| `app/features/executions/components/GatewayActivity.tsx` | Request list/detail, linked request, export | Visible errors with retry/reload. |
| `app/features/incidents/*`, `account/*`, `workspace/*`, `help/*` | Incident, profile, workspace, help reads | Visible status/retry states where the read gates an action. |

## Justified silent catches

| File | Catch purpose | Justification |
| --- | --- | --- |
| `app/shell/branding.tsx` | Background public branding refresh | Display-only preferences keep the last good settings; authentication is independent, focus retries, and Admin Branding reports its own failure. |
| `app/shell/mock-payments.ts` | Deployment mock-payment warning probe | Preserves the last known warning; no user action depends on the probe. |
| `app/shell/useSessionController.ts` | Session focus revalidation / auth config probe / browsers storage | Transient network failure preserves the verified identity; gateway status is visible; login handles unavailable auth; storage is optional. |
| `app/shell/useWorkspaceController.ts` | Workspace-local storage and initial-creation fallback | URL/verified session remains authoritative; storage is optional; initial creation intentionally falls back to organization setup. |
| `app/shell/useRouteMetadata.ts` | `useMatches` outside a data router | Test/standalone fallback; production routes use the data router. |
| `app/shell/theme.ts`, `locale.ts`, `login-return.ts` | Browser storage, navigator and URL parsing | Genuinely optional browser APIs; defaults keep the application usable. |
| `app/features/provider-modules/useWorkspaceVideo.ts` | Capability discovery probe | Failed discovery does not advertise a capability the server has not confirmed. |
| `app/features/generations/legacy-video-link.ts` | Legacy intent/job resolution | Missing, foreign or unbound records fall back to the legacy surface instead of guessing a session. |
| `app/features/customers/pending.ts`, `app/features/keys/mutation-recovery.ts` | Disposable retry hints in browser storage | Backend remains authoritative; corrupt or unavailable storage must not block creation. |
| `app/features/billing/WorkspaceSpendingLimits.tsx`, `AccountBilling.tsx`, `billing/page.tsx`, `library/page.tsx`, `branding/page.tsx`, `guardrails/page.tsx`, `activity/global-page.tsx`, `keys/components/KeyTokenUsage.tsx` | Optional cached-snapshot parsing | A corrupt cache entry is ignored; the following network read replaces it or reports the failure. |

## Verification

| Check | Result |
| --- | --- |
| Focused tests (new + affected billing/commercial/provider tests) | 8 files, 92 tests passed |
| Full dashboard suite (`NODE_ENV=test pnpm test`) | 1227 passed, 1 unrelated pre-existing failure: `GenerationsLayout.test.tsx` expects legacy selectors in `app/styles.css`, which this handoff splits into `app/styles/*.css` |
| Typecheck + lint (`NODE_ENV=test pnpm check`) | `tsc -b` passed; Biome baseline check passed with 1208 recorded diagnostics |
| Build (`NODE_ENV=test pnpm build`) | passed |
| i18n (`pnpm check:i18n`, `pnpm test:i18n`) | 0 findings; 14/14 checker tests passed |
| Browser | `/settings/billing` opened in the running handoff dev instance and rendered without console-visible errors. The changed billing/Provider/commercial failure states are role-gated in the seeded member session (billing requires owner/admin in resale mode; Provider and commercial pages require platform administration), so the forced-failure alert states were verified by the focused browser-environment tests rather than a live signed-in failure reproduction. |
