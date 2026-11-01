# Dashboard localization checks

Run from the repository root:

```sh
pnpm check:i18n       # Full application TSX audit; any finding fails
pnpm test:i18n        # AST scanner regression fixtures
pnpm build:dashboard  # Includes the same full localization gate
```

The dashboard build and CI reject untranslated application text, user-facing
attributes (including accessible labels), direct string expressions, conditional
branches, logical fallback expressions, template strings and their nested branches, plus
lexically resolved local display constants. A TypeScript-aware pass also checks
finite string unions, including imported choice labels and API enum presentation.
Single-argument
`t()` / `uiT()` and parameterized `format()` / `uiF()` calls require a catalog key.
`pnpm check:i18n:new` remains a compatibility alias for the full check; no baseline
waivers remain. The former inventory has been removed after translating its copy
and correcting technical-attribute false positives.

Use `useLocale()` for reactive rendering. Short messages may use explicit
`t(English, Chinese)` arguments or catalog-backed `t(English)`. Use
`format(EnglishPattern, values)` for parameterized messages; numeric placeholders
allow translations to reorder values without changing customer data. Keep saved
names, model aliases, resource slugs, protocol identifiers and API values separate
from translated presentation. Never translate a module constant once at import
time: translate it when rendered, so language changes take effect immediately.

Dashboard rendering imports `useLocale` from `shell/ui-locale`, which supplies
the catalog. The small shared `shell/locale` module supports explicit bilingual
copy without including the dashboard catalog in the public website bundle.
The catalog is `apps/dashboard/app/shell/locale-messages.ts`. Preserve exact
amounts and technical identifiers when interpolating. For dates, use the selected
interface locale explicitly; browser language may differ from the interface.

For machine-readable output:

```sh
node apps/dashboard/scripts/check-i18n.mjs --json > /tmp/niu-i18n.json
```

## Verification limits

A clean source audit is not proof of complete localization. The scanner does not
follow arbitrary data flow through helpers or broad string API responses,
validate translation meaning, or inspect separate docs and marketing
repositories. Installed shadcn primitives are excluded from the application copy
audit; shared accessible labels still require localized browser verification.
Technical names, complete URLs/email examples and code samples are intentionally
excluded. Product documentation remains English.

Verify changed journeys in both languages, including missing configuration,
loading, failures and recovery, permissions, dialogs, open menus and narrow
layouts. Check persisted values and outgoing API payloads are unchanged. Unit
coverage includes parameter reordering, exact large values and runtime locale
changes while a warning draft remains open.
