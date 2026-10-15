# Changelog

All notable changes to Niu are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/niu-io/niu/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/niu-io/niu/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/niu-io/niu/releases/tag/v0.1.0
