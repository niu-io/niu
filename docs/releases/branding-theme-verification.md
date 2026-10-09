# Branding and theme administration

Status: dashboard editor and native runtime lifecycle verified 2026-10-09 through migration 0189. Packaged deployment qualification remains open.

The backend stores revisioned deployment display name, default appearance and
separate light/dark token overrides. Defaults retain NIU.IO and inherit shared
brand tokens. Names are trimmed, nonempty, control-free and bounded to 80
characters. Palettes accept only eight named shared tokens with six-digit hex
colors; CSS text, URLs and unknown tokens are rejected. Empty palettes reset to
shared defaults. Personal appearance settings are separate and unchanged.

Saves serialize under a transaction lock, require the current revision and
commit settings together with an immutable audit snapshot and optional platform
actor reference. Stale concurrent edits conflict. Failed audit insertion rolls
back the settings update; invalid input cannot advance the revision.

The disposable PostgreSQL test passed concurrent first-save, reconnect,
reset, immutable audit, invalid-input preservation and failed-actor rollback.
Unit validation tests, formatting and storage all-target Clippy with warnings
denied passed. Public-boundary checks passed. The gateway additionally exposes `GET /v1/branding` as an anonymous,
explicit display-only projection. Platform administrators can read and update
`/admin/v1/platform/branding`; ordinary workspace owners cannot. Writes require
the current canonical revision and have a 450000-byte body limit. All responses
use `Cache-Control: no-store`. The PostgreSQL API test passed anonymous-write
denial, workspace-owner denial, authorized save, public readback, stale-save
conflict, invalid CSS rejection, actor attribution, reset and immediate denial
after platform access is revoked.

OpenAPI documents these routes and bounded schemas. The JavaScript SDK provides
`getBranding` and `saveBranding`, preserving exact revisions and cancellation,
projecting supported top-level fields and never retrying uncertain writes.
All 170 SDK tests passed, including the new branding transport test. OpenAPI
YAML parsing, gateway all-target Clippy with warnings denied, formatting of
the new gateway modules and targeted public-boundary checks passed.

Theme validation additionally resolves missing values against the checked-in
shared CSS defaults and requires at least 4.5:1 contrast for background/text,
primary/text, sidebar/text and accent/text in both light and dark palettes.
It uses sRGB relative luminance and converts the opaque OKLCH defaults to
linear sRGB; unsupported default syntax or out-of-gamut defaults fail closed.
This follows [WCAG normal-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [CSS Color 4 conversion](https://www.w3.org/TR/css-color-4/#ok-lab).
Unit tests passed the known sRGB black/white/red luminance values, both
inherited palettes, exact passing/failing gray thresholds, all four same-color
pair rejections and one-sided overrides. The disposable PostgreSQL test passed
rejection of an unreadable palette without advancing the saved revision.
Storage and gateway all-target Clippy with warnings denied and formatting
checks passed after this validation change.
These pair checks do not qualify every rendered component or cross-surface
color combination; visual acceptance remains necessary.

Logo and favicon data are now optional backend settings. Logo PNGs are bounded
to 256 KiB and 1024 × 512 pixels; favicon PNGs to 32 KiB and a square no larger
than 256 × 256 pixels. The shared media decoder rejects animation, malformed
containers, trailing bytes and oversized decoded images. URLs, SVG and other
formats are not accepted. Pixels are re-encoded to PNG before settings and the
immutable audit snapshot commit. Decode work runs off the async executor with
two shared slots, no waiting queue, and permits retained until workers finish.
Decoder allocation checks are best effort, not a hard process-memory guarantee.

Unit asset tests passed valid logo/favicon, default/reset absence, unsupported
URL/SVG, corrupt bytes, dimension/shape bounds and normalization idempotence.
The disposable PostgreSQL test passed saved asset readback after reconnect,
reset of both assets and invalid-asset preservation of the current revision.
The save API returns the exact normalized committed snapshot rather than a
separate read vulnerable to a concurrent save. Existing configuration JSON
without asset fields remains readable and defaults both fields to null.
SDK asset projection and explicit reset tests passed. The PostgreSQL gateway
API test passed asset save/public readback/reset and corrupt-image rejection
without advancing the revision, alongside the existing role and revision checks.
Storage and gateway all-target Clippy with warnings denied passed for the asset
implementation. Formatting, OpenAPI parsing and targeted public-boundary checks
passed.

The Admin editor now provides Branding and Theme tabs, bounded PNG uploads,
light/dark token controls, deployment appearance defaults and a scoped preview.
The public settings projection applies deployment identity, logo, favicon and
palette to the dashboard and sign-in screen. Members without an explicit
appearance inherit the deployment default; saved System, Light or Dark choices
remain independent. The disposable PostgreSQL appearance-default test passed
inheritance and explicit-choice preservation across a default change and reconnect.

Browser acceptance on the native development server passed display-name save and
reload, logo/favicon upload and sign-in application, unreadable-palette rejection
without replacing saved settings, independent light/dark preview, and reset to
NIU.IO defaults followed by reload. Temporary acceptance branding was reset.
Desktop (1280 × 900), phone (390 × 844), and compact (659 × 900) layouts were
inspected. Choice menus and phone navigation were inspected open. Phone contextual
sidebars now expose the existing customer/account Navigation menu while the rail
stays hidden; compact drawers begin beside the visible rail. Default reset removed
root palette overrides and restored the default favicon without horizontal overflow.

The dashboard suite passed all 536 tests in 75 files with two workers after the
navigation-footer adjustment (52.84 seconds). The 52 targeted branding and layout
tests and TypeScript checking also passed. Storage and gateway all-target Clippy
with warnings denied passed after the appearance-default change. These checks do
not qualify every custom palette, every rendered contrast pairing, or packaged
branding behavior.

The migration-0188 package checkpoint predates this foundation; a future package
must separately qualify migration 0189 and its saved configuration.


## Packaged lifecycle coverage prepared

`NIU_PACKAGE_BRANDING=1 python3 scripts/package-smoke.py` enables a synthetic
branding fixture in both direct and `--compose` smoke runs. It saves a deployment
name, distinct light/dark overrides, appearance default and normalized PNG logo
and favicon. Exact public/admin snapshots and immutable audit rows must survive
application restart and backup/restore; Compose also rechecks after PostgreSQL
restart. A stale write must conflict without changing settings or audit, and reset
must advance revision and match public readback.

The package-script suite passed 74 tests, including negative checks that reject
changed public/admin revisions, lost settings, altered audit rows and incomplete
reset readback. This validates the harness, not the packaged product. No new image
has run this branch yet; the existing migration-0188 image cannot qualify it.


The frozen migration-0189 source passed exported-source boundary/build-input
checks, but two Docker builds stopped before compilation while resolving official
base-image metadata with TLS handshake timeouts. The [attempt record](evidence/package-2026-10-09-0189-attempt.json)
identifies the snapshot and explicitly leaves packaged acceptance open. The
isolated dashboard runner now captures shared `branding/tokens.css`; its seven
regression tests passed. The 536-test current-worktree result above is not an
isolated source-snapshot qualification.


The subsequent [isolated dashboard snapshot](evidence/dashboard-automated-2026-10-09-branding.json)
passed all 536 tests and TypeScript checks with both shared stylesheets captured,
unchanged source bytes and unchanged dependencies. CI now enables branding checks
for direct-container and Compose smoke jobs; those jobs have not yet provided a
passing migration-0189 package receipt.
