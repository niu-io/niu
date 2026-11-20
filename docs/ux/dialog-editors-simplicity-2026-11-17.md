# Dialog Editors and Page Simplicity Review (2026-11-17)

- **Bead**: `niu-3c1x` (`closed` upon merge to `release/0.3`)
- **Branch**: `fix/dialog-editors-and-page-simplicity` -> `release/0.3`
- **Scope**: `AGENTS.md` policy clarification and end-to-end UX/UI refactoring of Niu Dashboard management and detail pages (`apps/dashboard`).

## Why this change was needed

Several management and detail surfaces rendered permanent multi-field edit forms, multi-card sprawl, or inline confirmation panels directly inside reading views, while still leaving modal `Dialog` infrastructure unused outside narrow confirmations. That made routine inspection pages dense and hard to scan, blurred read vs. edit boundaries, and mixed page-level actions with in-place form state.

We updated `AGENTS.md` (`## Dialogs and page simplicity`) with a three-part rule:

1. Keep management and detail pages as scannable reading and inspection surfaces (tables or concise single-panel key-value summaries) without multi-card sprawl or walls of explanatory prose.
2. Open an installed shadcn `Dialog` (`DialogHeader`, bounded scrollable body such as `max-h-[90dvh] overflow-y-auto`, and `DialogFooter` with cancellation and primary submit actions, restoring focus to its trigger via `onCloseAutoFocus`) for every page-level create, edit, rename, publish, limit-setting, and destructive confirmation action. Never replace a read view in place with an inline edit form, embed permanent mutation forms inside a summary page, or expand inline confirmation strips on pages.
3. Conversely, never open a nested `Dialog` inside an already-open modal (such as global `Settings` or `ProviderEditor`); keep secondary flows inside active modals inline or in-dialog views.

## Surface inventory and changes

### 1. API Key Detail & List (`apps/dashboard/app/features/keys/components/`)

- **`KeyDetailView.tsx`**: Folded Source IP access and Spending limits into `<dl className="key-detail-facts">`, keeping the detail page a scannable summary. Moved `Edit API key`, `Rotate API key`, and `Revoke API key` actions into shadcn `<Dialog>` modals with `onCloseAutoFocus` trigger restoration.
- **`KeysView.tsx`**: Updated row menu `Edit` links to navigate with `state={{ editKey: true }}` so row-level edit actions open the edit dialog directly on arrival.
- **`KeySettingsEditor.tsx`**: Standardized the cancellation action to `variant="outline"` and separated the scrollable form body (`-mx-2 grid min-h-0 flex-1 gap-4 overflow-y-auto px-2 py-1`) from a pinned action footer (`flex shrink-0 flex-wrap justify-end gap-2 pt-1`) inside `DialogContent` (`flex max-h-[90dvh] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-2xl`).

### 2. Guardrails (`apps/dashboard/app/features/guardrails/`)

- **`page.tsx`**: Replaced the embedded multi-card configuration layout with a single clean read-only summary card (or `<Empty>` state when unconfigured), added stable `keyedRules` keys (`noArrayIndexKey`), and corrected `Custom regex` i18n labels.
- **`PolicyEditorDialog.tsx` & `PolicyTestDialog.tsx`**: Extracted policy editing (`expected_revision`, `409` reload inside the modal, bounded scrollable inner body with pinned `DialogFooter`, and `onCloseAutoFocus`) and rule preview testing into dedicated `<Dialog>` components.
- **`ContentRules.tsx` & `ExternalDetectors.tsx`**: Added `hideTester?: boolean` and `inlineConsent?: boolean` so secondary detector consent flows stay inline inside `PolicyEditorDialog` instead of spawning nested dialogs.

### 3. Workspace Settings & Spending Limits (`apps/dashboard/app/features/workspace/` & `billing/`)

- **`settings-page.tsx`**: Replaced inline workspace naming inputs with a read-only `General` `<dl>` showing workspace URL slug (`<code>{/workspaces/${workspace.slug}}</code>`) and a `Rename` trigger (`aria-label="Rename workspace"`) opening a `Rename workspace` `<Dialog>`. Updated the delete confirmation dialog cancel action to `variant="outline"`.
- **`WorkspaceSpendingLimits.tsx`**: Moved workspace currency and Credits limit mutation forms plus `Set unlimited` confirmation into `<Dialog>` modals with `onCloseAutoFocus` focus return.

### 4. Admin Platform Settings (`apps/dashboard/app/features/platform-settings/`)

- **`platform-currency.tsx`**: Replaced the inline currency form with a read-only card and a single `Set platform currency` `<Dialog>` containing the searchable currency dropdown.
- **`registration-review.tsx`**: Converted `RegistrationPolicySection` to a concise summary view with an `Edit policy` `<Dialog>` supporting `409` conflict reloads without unmounting the modal and direct conditional translations compliant with `check:i18n`.
- **`platform-units.tsx`**: Replaced embedded unit-definition, purchase conversion-rule, and billing-mode controls with 3 clean read-only summary cards/tables plus 3 `<Dialog>` modals. Applied `min-w-0 flex-1` and `shrink-0` in the conversion-rule header so `Publish rule` stays right-aligned with its section title, and styled `Prepare compatibility check` as `variant="outline"`.

### 5. Branding (`apps/dashboard/app/features/branding/page.tsx`)

- Simplified `Branding` and `Theme` tabs into full-width read-only inspection views paired with `Edit branding`, `Edit theme`, `Reset to Niu defaults`, and `Preview` `<Dialog>` modals (including `409` reload handling inside modals).

### 6. Provider & Integration Settings (`apps/dashboard/app/features/provider-business/` & `providers/components/`)

- **`ProviderSettings.tsx`**: Replaced the permanent business profile form with a read-only `Business profile` panel and an `Edit profile` `<Dialog>` with `onCloseAutoFocus` and `409` reload handling.
- **`IntegrationSettings.tsx`**: When `resource === 'providers'`, renders a read-only summary and an `Edit integration` `<Dialog>`; when `resource === 'vendors'`, preserves inline editing inside the already-open `ProviderEditor` modal so no `<Dialog>` nests inside another `<Dialog>`.

### 7. Stylesheets (`apps/dashboard/app/styles/`)

- Ran `node scripts/check-css-usage.mjs --write` to prune unreferenced guardrail classes (`guardrails-access-grid`, `guardrails-policy-summary`) across `operations.css` and `surfaces.css`.

## Browser & Visual Verification

Verified all refactored routes live against a local loopback stack before final test execution across `1440x900` desktop, `1024x800` intermediate, and `390x844` mobile viewports, in both light and dark themes and EN / `zh-CN` locales:

- Confirmed zero horizontal overflow, zero permanently embedded page forms or `<select>` elements, zero exposed internal IDs, and `dialogCount === 1` on `PolicyEditorDialog`, global `Settings / Account`, and provider connection edit modals (zero nested dialogs).
- Visual issues caught and fixed during inspection:
  1. **Dialog footer clipping on desktop**: `KeyDetailView` (`Edit API key`) and `PolicyEditorDialog` initially let tall bodies push `DialogFooter` actions out of view; switching `DialogContent` to flex column bounded to `max-h-[90dvh]` with an inner scrollable body pinned `Cancel` and primary actions visibly at the bottom (`cancelVisible: true`, `saveVisible: true`).
  2. **Conversion rule header alignment and button emphasis**: In `platform-units.tsx`, `Publish rule` wrapped onto a second line until constrained with `min-w-0 flex-1` / `shrink-0` (`defTop: 272`, `ruleTop: 272`, `sameRowAligned: true`), and `Prepare compatibility check` was lowered to `variant="outline"`.

## Automated Verification Results (post-final edit)

- **Updated unit/integration test suites**: `KeyDetailView.test.tsx`, `guardrails/page.test.tsx`, `workspace-settings.test.tsx`, `AppLayout.integration.test.tsx`, `WorkspaceSpendingLimits.test.tsx`, `platform-currency.test.tsx`, `PlatformUnitsSetting.test.tsx`, `branding.test.tsx`, and `ProviderSettings.test.tsx`.
- `pnpm --dir apps/dashboard check:i18n`: `i18n: 0 findings. Full dashboard TSX and helper-label audit; no baseline waivers.`
- `pnpm --dir apps/dashboard test:i18n`: `tests 15`, `pass 15`, `fail 0`.
- `pnpm --dir apps/dashboard check`: passed (`tsc -b`, `check-hygiene.mjs`, `check-module-size.mjs`: `296 modules checked, 11 recorded exception(s) above 800 lines`, `lint.mjs`: `1144` Biome diagnostics across 37 rules vs `1206` baseline, `check-css-usage.mjs`: `stylesheet: 163067 bytes, 474 classes`, `used 464, dynamically protected 9, unreferenced 1, removable 0, retained 1`).
- `pnpm --dir apps/dashboard test` (`vitest run`): `Test Files  152 passed (152)`, `Tests  1346 passed (1346)` in `96.79s`.
- `pnpm --dir apps/dashboard build`: `✓ built in 1.41s`, `SPA Mode: Generated dist/client/index.html`.
- `python3 scripts/check-public-boundary.py --root . apps/dashboard/dist`: `Public boundary checks passed (754 files scanned).`
