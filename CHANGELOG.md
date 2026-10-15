# Changelog

All notable changes to Niu are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/niu-io/niu/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/niu-io/niu/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/niu-io/niu/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/niu-io/niu/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/niu-io/niu/releases/tag/v0.1.0
