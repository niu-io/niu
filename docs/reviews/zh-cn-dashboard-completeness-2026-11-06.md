# zh-CN dashboard content completeness verification, 2026-11-06

Dated local verification for `niu-lxs.31` (UX-29). This record covers the
dashboard and the public catalog document title; it does not close the bead and
does not qualify hosted deployment. Source documentation remains English.

## Changes

- Extended `apps/dashboard/app/shell/locale-messages.ts` from 4,269 to 4,625
  entries for application-owned dynamic copy: generation outcomes, video
  validation/result messages, lifecycle labels, catalog/model errors, key and
  guardrail state errors, billing/credits validation, session and workspace
  errors, and provider configuration messages.
- Added a TypeScript-aware audit pass in
  `apps/dashboard/scripts/check-i18n.mjs` for display fields (`label`, `detail`,
  `title`, `message`, `help`) declared by application `.ts` helpers. Rendering
  those fields raw now fails `check:i18n`; translated call sites pass. Regression
  fixtures are in `scripts/check-i18n.test.mjs`.
- Centralized video composer/session document titles in
  `apps/dashboard/app/shell/useRouteMetadata.ts`, keyed by the route and search
  intent, so `视频 · 生成对话` / `Video · Generations` survives a language switch.
- Wrapped runtime error and state text at render sites with `t()` / `uiT()` so a
  locale change updates visible text instead of freezing the language used when
  the error was created.
- Localized the public catalog document title and skip link in
  `apps/catalog/src/layouts/SiteLayout.astro` from the shared dashboard locale.
- Updated the module-size and lint baselines for the append-only message table,
  and documented the dynamic display-field audit in
  `docs/development/localization.md`.

## Verification

Commands run from the repository root unless noted:

| Gate | Result |
| --- | --- |
| `pnpm check:i18n` | 0 findings; full dashboard TSX + typed + `.ts` display-field audit |
| `pnpm test:i18n` | 15 tests passed |
| `pnpm check:dashboard` | passed: SDK build, route typegen, `tsc`, lint, CSS audit |
| `pnpm lint:dashboard` | passed; 1,207 diagnostics at the refreshed baseline |
| `pnpm build:dashboard` | passed; localization gate included |
| `pnpm build:catalog` | passed |
| `npx vitest run` (dashboard) | 147 files, 1,273 tests passed |

Rendered `zh-CN` checks used the local packaged stack at 1280×800 and 390×844:

- Workspace: overview, API keys, request logs, assets, routing, evaluations,
  event subscriptions, guardrails, activity, billing, workspace settings.
- Generations: chat composer, prompt tabs, no-model/no-key states, video
  composer, saved-video session error, video details/session titles.
- Models: workspace models empty state and public `/models/` catalog.
- Settings: account, appearance, organization, members/invite dialog, about.
- Administration (temporary installation session): providers list and
  add/connect Provider dialogs, routing, customers, branding, audit logs,
  incidents, pricing, payment gateways, reports, settings.
- Cross-surface: `/help/` and `/models/` followed the dashboard `zh-CN`/`en`
  selection; catalog title and skip link changed with it.
- Language switching on the video composer changed the title, rail, form copy,
  placeholders and validation copy without stale English. Guardrail rule
  validation rendered in Chinese: `请选择支持的预置规则，或输入 1–4096 个 UTF-8
  字节的匹配模式。`
- 390 px screenshots showed the rail, workspace navigation, chat cards,
  guardrail tabs, and appearance controls within the viewport.

Evidence limits: the local catalog had no Provider or model, so populated model
tables, Provider detail routes (models, offers, settlements) and generation
result cards were not rendered in the browser. Component, route and scanner
tests cover those surfaces; hosted data remains unverified.

## Remaining untranslated text

The following are deliberately outside the translation boundary or are still
interpolated diagnostics. No other user-visible static English remains in the
dashboard TSX audit.

### Interpolated application diagnostics

- `apps/dashboard/app/features/activity/global-page.tsx:54` —
  `Activity could not be loaded ({status}). Try again.`
- `apps/dashboard/app/features/executions/components/GatewayActivity.tsx:219` —
  `Could not load gateway activity ({status}).`
- `apps/dashboard/app/features/executions/components/GatewayActivity.tsx:577` —
  `Could not export requests ({status}). Try again.`
- `apps/dashboard/app/features/playground/components/PlaygroundView.tsx:181` —
  `Request failed ({status}).`
- `apps/dashboard/app/features/playground/components/PlaygroundView.tsx:469` —
  `{file.name} exceeds 4 MB.`
- `apps/dashboard/app/features/playground/components/PlaygroundView.tsx:472` —
  `{file.name}: use PNG, JPEG, WebP, or a text file.`
- `apps/dashboard/app/features/playground/components/PlaygroundView.tsx:477` —
  `Could not read {file.name}. Try attaching it again.`
- `apps/dashboard/app/features/video/ImageReferences.tsx:50` —
  `Choose up to {n} reference images.`
- `apps/dashboard/app/features/video/ImageReferences.tsx:54` —
  `{file.name} exceeds the reference size limit.`
- `apps/dashboard/app/features/video/ImageReferences.tsx:145` —
  `Choose up to {n} saved reference images.`
- `apps/dashboard/app/features/video/request.ts:29,34,37,40` — `Choose
  {control}.`; `{control} must be an integer from {min} to {max}.`; `Choose a
  supported {control}.`
- `apps/dashboard/app/features/providers/components/VideoSchemaEditor.tsx:211,213,214,228`
  — label-prefixed MIME, role, HTTPS and choice validation messages.
- `apps/dashboard/app/features/providers/video-schema.ts:32,37` — label-prefixed
  integer and distinct-value validation messages.
- `apps/dashboard/app/features/provider-business/admin.tsx:381` — cross-currency
  rate publication warning with interpolated currencies.
- `apps/dashboard/app/lib/media-price.ts:11` — `Use at most {n} decimal places.`
- `apps/dashboard/app/lib/media-rate.ts:36` — `Enter a nonnegative price with at
  most {n} decimal places.`
- `apps/dashboard/app/shell/useGatewayConnection.ts:24` — `Health check returned
  HTTP {status}.`
- `apps/dashboard/app/shell/useWorkspaceController.ts:518,635` — `Could not
  create workspace ({status}).`; `Could not create organization ({status}).`

### Outside the translation boundary

- Upstream/API response text, Provider names and procurement data, model aliases,
  slugs, customer/workspace/organization names, emails, revisions, amounts,
  timestamps, UUIDs, logs, raw request data and code samples stay unchanged.
- Workspace defaults such as `Default` and `Personal workspace` are persisted
  display names, not UI copy.
- Source documentation in `/help/` and `/docs/` remains English by policy, as do
  its embedded source pages and agent-contract prompts.
- Public catalog SEO metadata (`description`, Open Graph title) remains English;
  the rendered title and skip link are localized.
- Developer diagnostics that are not product copy remain English:
  `useChart must be used within a <ChartContainer />`,
  `useSidebar must be used within a SidebarProvider.`,
  `Generation sessions require the Generations route layout.`,
  `Route module cannot export both loader and clientLoader.`,
  `The operation was aborted.`, and the internal `delete failed` state label.
- Technical protocol names such as `Responses API`, `MCP`, `HTTP`, `JSON` and
  `SSE`, and brand names such as `OpenRouter`, stay as names.
