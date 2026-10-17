# Changelog

All notable changes to Niu are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.17] - 2026-10-17

### Fixed

- Keep embedded Help publicly accessible without a dashboard session, including direct article entry and reload. Add direct public model catalog and documentation links to the sign-in page.

### Verification boundary

- Actual anonymous browser navigation checks the built Help index, article navigation and reload, plus the sign-in page at desktop and narrow widths. Public resource links use document navigation to their separate artifacts. Hosted verification follows deployment; complete platform acceptance remains open.

## [0.2.16] - 2026-10-17

### Fixed

- Keep JIT compilation out of bounded activity/reporting reads so PostgreSQL does not spend the request deadline compiling a small result's many subplans. The setting is local to the read-only snapshot transaction; existing lock and statement deadlines remain unchanged.

### Verification boundary

- Paired executions of the actual production list query isolate compilation overhead: approximately 3.63 seconds with JIT, including 3.61 seconds compiling, versus 1.67 milliseconds without JIT. Diagnostic sessions enforce read-only operation and temporary access is removed afterward.
- Actual native HTTP baseline/candidate responses on a retained real backup agree, named request/accounting row hashes remain unchanged, and single-connection checks preserve the original pooled settings after page and export reads. Hosted API verification follows deployment; full platform acceptance remains incomplete.

## [0.2.15] - 2026-10-17

### Fixed

- Document installation of the published MCP package for hosted and self-hosted gateways. Agent configuration uses the installed executable instead of a path relative to the Niu source checkout, with absolute-path guidance when the editor does not inherit PATH.
- Keep building the MCP server from source as a separate development option.

### Verification boundary

- The actual v0.2.14 MCP release asset is checked against its published checksum and source commit, installed with npm into an isolated prefix, and invoked outside the Niu checkout. Current hosted discovery and admission-error forwarding are independently checked against saved request, task and balance records.
- The built guide is inspected at desktop and narrow widths. Hosted documentation verification follows deployment. Successful estimates remain unavailable for the inspected personal video route; this release does not qualify full platform acceptance.

## [0.2.14] - 2026-10-17

### Fixed

- Hide the video-result action and saved-task guidance for requests rejected during admission. Keep the rejection reason, gateway status and customer charge state visible, and preserve result navigation for actual video jobs.

### Verification boundary

- A single current-input video request with a zero-RPM key returns an explicit 429 and creates a durable not-sent, not-charged admission record. Independent reads find no video task and no balance change; the temporary key is revoked. The actual refused request and an existing completed video record are the browser verification inputs.
- Hosted verification follows deployment. This does not qualify other usage limits, successful commercial video billing or full platform acceptance.

## [0.2.13] - 2026-10-17

### Fixed

- Serve the workspace directory at both `/workspaces` and `/workspaces/` so direct navigation and browser reload retain the directory instead of redirecting to the default workspace or returning 404.

### Verification boundary

- Actual native gateway and built-dashboard browser checks use an isolated existing restored backup, normal short-lived owner sign-in, cookie-preserving reload, and desktop/narrow layouts. Independent HTTP reads match the real entry artifact and preserve scoped routes, cache policy and the community home redirect. Named request and accounting records remain unchanged; the temporary owner is revoked.
- Hosted directory verification follows deployment. Full platform acceptance and the intermittent hosted request-read storage failure remain open.

## [0.2.12] - 2026-10-17

### Fixed

- Keep all nine Provider commercial position columns within printed financial statements, wrap long content and pending labels, and preserve complete rows across pages. Screen tables retain their existing scrolling layout.

### Verification boundary

- Actual current-data browser exports cover active model rows and all configured models at A4 size. Every rendered page is inspected; independent PDF column geometry checks retain complete model names, headers and pending states without text beyond page width.
- This verifies the browser print stylesheet and resulting PDF artifacts. The native operating-system print dialog and complete platform acceptance remain unverified.

## [0.2.11] - 2026-10-17

### Fixed

- Label Provider qualification separately from supply readiness on Models & pricing. An approved Provider review does not establish approved model offers or sellable inventory.
- Preserve the standard Badge foreground and typography inside Provider section headings in light and dark themes.
- Count only active, non-revoked accounts in the Provider portal access summary while retaining historical membership rows.

### Verification boundary

- Actual desktop and narrow browser checks use authenticated current production reads. Provider qualification states, light/dark Badge presentation, and the effective access count are inspected without changing credentials, memberships or commercial records. Hosted verification follows deployment.
- This release does not resolve intermittent request-read storage failures or establish complete platform acceptance.

## [0.2.10] - 2026-10-17

### Fixed

- Distinguish observed asynchronous task duration from gateway latency in request lists and details; name the mixed column Duration and its sort Longest duration. Gateway latency summaries retain their existing complete-transport boundary.

### Operational diagnostics

- Log a sanitized database error category and SQLSTATE for unexpected storage failures while retaining generic customer errors. New diagnostic fields contain no SQL, values, credentials or database messages.

### Verification boundary

- Actual browser checks use current production reads for desktop and narrow request lists, duration labels and sorting. An isolated restored-backup gateway run verifies a controlled lock failure, safe operational metadata, recovery and unchanged named request/accounting records.
- These diagnostics do not resolve or identify the cause of intermittent hosted request-read storage failures. Production diagnosis and the complete platform acceptance remain open.

## [0.2.9] - 2026-10-17

### Fixed

- Keep documentation search initialized across article navigation and prevent discarded search elements from leaving global keyboard shortcuts behind.

### Verification boundary

- Actual built-page browser checks cover article navigation, search results, result navigation and keyboard reopening at desktop and narrow widths. Hosted Help is checked after deployment; this patch does not establish complete platform acceptance.

## [0.2.8] - 2026-10-17

### Security

- Preserve explicit empty IP allowlists in unified workspace-key creation and updates: `[]` denies every source, matching the independent IP policy endpoint. Explicit `null` remains unrestricted, and omitting the policy in an update leaves it unchanged.
- Existing saved null policies are not rewritten because their original intent cannot be recovered. Review affected keys and explicitly save the intended policy.

### Documentation

- Clarify the same IP policy values in handler-generated OpenAPI, SDK comments and the IP policy reference.

### Verification boundary

- Check actual create/update authorization, saved policy/history, source denial, rotation and restart behavior; fixture outcomes provide no acceptance signal. This patch does not qualify upstream inference, billing, browser interactions or the complete release.

## [0.2.7] - 2026-10-17

### Security

- Keep built-in demo sign-in scoped to its customer account; startup no longer grants platform administration.
- Revoke the built-in account's previously implicit platform grant through an appended, audited migration. Existing passwords, sessions, workspace membership, encrypted credentials and financial history remain intact.

### Verification boundary

- Verify existing and fresh demo sessions against the upgraded application, including denied platform configuration and financial access, preserved installation administration and restart behavior.
- This security patch does not establish complete demo-data isolation, commercial qualification or full release acceptance. Fixture outcomes provide no acceptance signal.

## [0.2.6] - 2026-10-16

### Fixed

- Publish the release-qualification documentation route linked from the website, with a navigation entry and built-artifact check.
- Include OpenAPI contracts and SDK TypeScript configuration in container documentation builds; rebuild the previous-source upgrade baseline with the corrected recipe.
- Preserve released migration `0333` byte-for-byte and append its guardrail diagnostic-context correction as `0352`.

### Changed

- Keep compilation, contracts, licenses, migration history, builds and runtime-asset checks blocking; run fixture commands separately as non-gating diagnostics and disregard their outcomes.

### Verification boundary

- Static checks, actual image construction and runtime-asset inspection qualify only their build/artifact scope. An isolated PostgreSQL 17 upgrade and independent catalog inspection verify the appended schema transition.
- Desktop/narrow browser checks verify the new documentation page locally. Hosted availability is checked after cloud deployment, not inferred from a pushed commit.
- This patch does not establish fresh model conformance, cash receipt, commercial settlement, performance or complete production acceptance. Unknown operations and financial liabilities must remain preserved. Fixture outcomes provide no acceptance signal.
- The standalone MCP client remains included in the release assets with source provenance and checksums.

## [0.2.5] - 2026-10-16

### Added

- Manage persisted Video sessions through Generations history, rename, archive and restore controls.
- Correct wholly unused administrator noncash gifts with immutable audit records, exact replay protection, SDK methods and dashboard controls.
- Inspect native material details and access revision-checked rename and explicit deletion controls.
- Record Provider membership actors and procurement configuration changes in platform audit history.

### Fixed

- Preserve workspace scope in Models navigation and restore valid shared browser sessions and installation credential entry.
- Align API-key SDK envelopes, key introspection, model projections, authentication schemes and zero-count timeline contracts.
- Support explicit owner-funded Video confirmation without an estimator, revalidate revoked keys and distinguish transfer timing phases.
- Report unavailable platform procurement as service readiness rather than customer balance exhaustion; resolve effective customer Billing rates consistently.
- Correct financial table scrolling, reporting cutoffs, calendar bounds and below-precision movements, and expose separate cash, credit and upstream-cost measures.
- Preserve native-operation diagnostics and revoked-key history; harden bounded storage, transport, cancellation and background processing.
- Refuse replacement of existing release tags/assets and publish source identity with complete asset checksums.

### Verification boundary

- Actual HTTP, compiled SDK, desktop/narrow browser workflows and independent persisted records qualify only the scenarios recorded in the [local verification checkpoint](https://github.com/niu-io/niu/blob/v0.2.5/docs/reference/open-issue-local-verification.md) and [unused gift correction](https://github.com/niu-io/niu/blob/v0.2.5/docs/reference/unused-gift-correction-current.md).
- Conditional merchant funding, commercial supply/settlement, identity verification, successful fresh upstream generation and broader production acceptance remain unverified by this patch release. Existing uncertain operations and financial holds are retained. Fixture outcomes supply no acceptance signal.
- This publishes a new immutable source release; it does not claim a production deployment or completion of the feature-complete milestone.

## [0.2.4] - 2026-10-15

### Added

- Ship the standalone `@niu-io/mcp` stdio client as a downloadable GitHub release package with a SHA-256 checksum.
- Document coding-agent setup and workspace-key tools for model discovery, inference, generation diagnostics, video jobs and media assets.

### Fixed

- Reject malformed JSON-RPC envelopes without terminating the MCP process.
- Bound MCP gateway requests and reject credential-bearing HTTP redirects without automatically retrying billed requests.

### Verification boundary

- The packaged stdio client was exercised against a running Niu gateway and OpenRouter: initialization, tool discovery, key inspection, model listing, chat completion and generation lookup. The saved attempt independently confirmed completion and provider-reported token usage.
- Video and media wrappers are included; this release verification did not create a new paid video or validate every tool end to end. MCP runs locally over stdio; no remote MCP HTTP endpoint is introduced.

## [0.2.3] - 2026-10-15

### Added

- Run live streaming Chat examples from documentation with a signed-in workspace key, without revealing the key secret.
- Connect Scalar inference requests to the same-origin browser session and selected workspace key.
- Display supported model parameters in model discovery and management.

### Fixed

- Align JavaScript generation diagnostics with the API's nested usage fields.
- Return browser sign-in to public documentation and website pages, preserving query parameters.
- Serve Admin deep links and sort active API keys consistently.

### Verification boundary

- Live documentation requests were verified against OpenRouter with independently inspected saved attempts and customer ledger fingerprints. This does not qualify every model, protocol or commercial billing path.

## [0.2.2] - 2026-10-15

### Added
- **Website `/blog/` Channel Mount**: Mounted `/blog/` and `/blog/*` from `NIU_SITE_DIR` in `niu-gateway` alongside marketing landing routes.
- **Unified Plugin Runtime & Built-in Plugins**: Unified `plugin-api` and `plugin-sdk` contracts with the gateway Plugin Host runtime and built-in reference plugins.

### Changed
- **Dashboard UX & Visual Design Refinements**:
  - Standardized second-level navigation across Workspace, Provider Portal, and Installation Admin views on line-style tabs (`<TabsList variant="line">`), including Workspace Billing (`Spending`, `Statements`, `Rates`), Video (`Tasks`, `Materials`), Request Log detail drawers (`Request`, `Response`, `Raw`), Admin Commercial Overview (`Provider positions`, `Financial summary`), and Admin Customer Pricing (`Text pricing`, `Media pricing`).
  - Unified Manus-inspired flat surface styling across all `Button`, `DialogTrigger`, `DropdownMenuTrigger`, and `PopoverTrigger` outline controls (`[data-variant="outline"]`) and disabled table header row hover highlights (`<thead><tr>`).
  - Improved Dark Mode model and Provider badge contrast by rendering `.provider-logo-colored` containers on `var(--card)` instead of light-only surfaces.
  - Streamlined Provider Portal header layout by removing the duplicate top-bar Provider switcher (retaining the sidebar switcher with section preservation) and keeping mobile period controls aligned on a single row.
  - Standardized canvas width, top vertical rhythm, and tabular UTC timestamp formatting across Admin `Commercial overview`, `Customer pricing`, `Payment gateways`, `Branding & theme`, and `Audit logs`.
  - Updated user-facing copy across Admin Customer Pricing and Provider Settlement views to consistently use `Provider` terminology.

### Fixed
- **Default Workspace Alias Resolution**: Resolved `/models?workspace=default` and `/workspaces/default/*` to the active user's preferred workspace instead of showing a workspace recovery error when no workspace is literally named `default`.
- **Provider Sub-Route Fallbacks**: Added safe redirects and section fallbacks for unknown sub-routes under `/admin/suppliers/:supplierId/:section` and `/suppliers/:supplier/:section`.
- **Responsive Header & Form Control Polish**: Fixed mobile breadcrumb truncation on Admin Provider detail pages, API Keys toolbar button alignment, API Key detail card and guardrail history action spacing, Settings profile hidden file input overflow, file input button vertical alignment, and installation login field spacing.

## [0.2.1] - 2026-10-15

### Added
- Open-source governance and community health documentation (`SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, and `.github` issue/PR templates).

### Changed
- Standardized root `LICENSE` formatting so automated license detectors recognize the repository as `MIT` while retaining Niu Contributors and Berri AI copyright attributions.

## [0.2.0] - 2026-10-15

### Added
- **Unified Three-Plane HTTP Architecture**:
  - **Inference Data Plane (`/v1/*`)**: OpenAI-compatible `/v1/models` and `/v1/chat/completions` (streaming and non-streaming) with pre-dispatch PostgreSQL budget reservations and asynchronous usage settlement.
  - **Control Plane (`/api/v1/*`)**: Unified REST control plane organized by principal scope across `/api/v1/auth/*`, `/api/v1/user/*`, `/api/v1/workspaces/:workspace/*`, `/api/v1/providers/*`, and `/api/v1/platform/*`.
  - **Public Catalog Plane (`/catalog/v1/*`)**: Opt-in public model catalog API and static browser at `/models/`.
- **Plugin Architecture (`plugin-api` & `plugin-sdk`)**:
  - Added versioned `crates/plugin-api` and `crates/plugin-sdk` for external Unix-socket plugins and built-in open-source plugins (`plugins/hello-echo`, `plugins/request-tagger`, `plugins/webhook-audit`).
  - Added manifest-validated plugin proxy routing under `/api/plugins/v1/{plugin_id}/...`.
- **Self-Hosted Installation, Upgrade & Release Tooling**:
  - Added [`scripts/install.sh`](scripts/install.sh) supporting `install`, `upgrade` (with automatic PostgreSQL `pg_dump` backup, `niu-gateway --check-encryption` preflight verification, and automatic rollback on failure), `rollback`, and `status`.
  - Added [`scripts/release-version.py`](scripts/release-version.py) (`pnpm version:check` and `pnpm version:set`) and centralized [`VERSION`](VERSION) tracking across `Cargo.toml`, `package.json`, and `compose.yaml`.
  - Added `niu-gateway --version` (`-V`) CLI output with build commit metadata and [`.github/workflows/release.yml`](.github/workflows/release.yml) for automated GHCR image and release bundle publishing.
- **Open-Source Default Landing Flow**:
  - When `NIU_SITE_DIR` is unset, `GET /` redirects to `/workspaces/default/` (entering `/login` when unauthenticated or `/installation` before initial setup), and `/login` exposes direct navigation links to the public Model Catalog (`/models/`) and Documentation (`/docs/`).

## [0.1.0] - 2026-10-14

### Added
- Initial public release of the Niu monorepo:
  - Single-process Rust gateway (`apps/gateway`) with PostgreSQL persistence (`crates/storage`), encrypted Provider credentials (`NIU_VENDOR_ENCRYPTION_KEY`), and selective LiteLLM Rust protocol modules (`vendor/litellm-rust`).
  - Workspace, Provider, and installation administration dashboard (`apps/dashboard`).
  - Public model catalog (`apps/catalog`) and developer documentation site (`apps/docs`).
  - OpenAPI 3.1 contract specifications (`contracts/`) and TypeScript client SDKs (`sdks/javascript`, `sdks/agent-connect`).
  - Single-container `Dockerfile`, `compose.yaml`, and Render Blueprint (`render.yaml`).

[Unreleased]: https://github.com/niu-io/niu/compare/v0.2.17...HEAD
[0.2.17]: https://github.com/niu-io/niu/compare/v0.2.16...v0.2.17
[0.2.16]: https://github.com/niu-io/niu/compare/v0.2.15...v0.2.16
[0.2.15]: https://github.com/niu-io/niu/compare/v0.2.14...v0.2.15
[0.2.14]: https://github.com/niu-io/niu/compare/v0.2.13...v0.2.14
[0.2.13]: https://github.com/niu-io/niu/compare/v0.2.12...v0.2.13
[0.2.12]: https://github.com/niu-io/niu/compare/v0.2.11...v0.2.12
[0.2.11]: https://github.com/niu-io/niu/compare/v0.2.10...v0.2.11
[0.2.8]: https://github.com/niu-io/niu/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/niu-io/niu/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/niu-io/niu/compare/v0.2.5...v0.2.6
[0.2.2]: https://github.com/niu-io/niu/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/niu-io/niu/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/niu-io/niu/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/niu-io/niu/releases/tag/v0.1.0

[0.2.5]: https://github.com/niu-io/niu/compare/v0.2.4...v0.2.5
