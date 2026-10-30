# Changelog

All notable changes to Niu are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.28] - 2026-10-30

### Changed
- keep the settings route lazy
- index Credits ledger by tenant
- restore the pre-upgrade database when rollback cannot start
- serialize squashed migration collapse across gateways

### Fixed
- **branding**: apply approved Maple Mono 600 identity across public apps

### Documentation & Governance
- record the 2026-10-29 architecture re-review
- correct self-hosted funding, CI scope, and rollback guidance

## [0.2.27] - 2026-10-29

### Added
- **docs**: upgrade documentation portal UX, visual system, and Model Pools guide
- **pools**: unify custom model identity, routing rules, billing modes, and strategy audit (#117)

### Changed
- **storage**: factor PriorRoutePoolRow type alias for clippy
- **storage**: apply rustfmt to route pool modules

### Fixed
- **ui**: visual polish across catalog, dashboard and docs (niu-0u8)
- **dashboard**: use RouterPending during sign-in redirect instead of unstyled text

### Documentation & Governance
- **release**: record v0.2.26 release-gate qualification and issue closure

## [0.2.26] - 2026-10-26

### Added
- **credits**: add branded Credits customer/admin UI surfaces, reporting views, and exports (#110)
- **billing**: add Credits media billing and over-bound recovery (#110)
- **credits**: implement exact purchase reversals and backing conservation (#110)
- **billing**: add separate Credits workspace and API-key spending limits (#110)
- **billing**: publish preview-confirmed Credits mode changes (#110)
- **billing**: preview billing-mode compatibility without converting records (#110)
- **billing**: restore original Credits consumption ranges (#110)
- **billing**: settle actual text inference against Credits ranges (#110)
- **billing**: publish explicit versioned Credits text tariffs (#110)
- **billing**: add Credits range ledger and exact balance reads (#110)
- **billing**: issue immutable noncash Credits grants with expiry (#110)
- **billing**: settle quoted Credits purchases into separate provenance lots (#110)
- **billing**: persist exact version-pinned Credits purchase quotes (#110)
- **billing**: publish versioned Credits configuration through API and SDK (#110)
- **billing**: define versioned Credits arithmetic and configuration foundation (#110)
- **providers**: configure integrations and review discovered models (#97)
- **providers**: report credential-scoped discovery evidence (#97)
- **providers**: persist integration defaults and connection overrides (#97)

### Changed
- **storage**: squash 382 historical migrations into 0001_initial_schema.sql with legacy receipt folding
- **beads**: track full branded Credits release scope

### Fixed
- **dashboard,docs**: make API keys table responsive at intermediate widths, bound benchmark claims, and sync Branded Credits API docs (#98, #110)
- **providers**: verify credential identity before filtered discovery (#97)
- **help**: fill available width and preserve indexed quickstart headings
- **payments**: verify unpaid checkout events and expose scoped recovery
- **models**: retain mobile navigation during setup gating
- **chat**: retain cancellation ownership through startup persistence
- **billing**: exclude simulated receipts from verified cash reports
- **catalog**: preserve directional filters and confirm clipboard writes
- **docs,gateway**: guard docs translation lookup, scope zh heading TOC, and allow same-origin help iframe
- **auth,docs**: restore customer-scoped demo account and add release acceptance checklist

### Documentation & Governance
- hand off paused all-issues repair to Gemini
- **qa**: verify monetary inference after Credits integration
- require all-issues acceptance before release
- **providers**: record native integration acceptance and setup guidance (#97)
- record current served guidance verification
- distinguish bilingual API guide navigation (#98 A04)
- restore bilingual Generations task walkthrough (#98 A03)
- restore bilingual protocol and priced-tool guidance (#98 A02)
- **payments**: record hosted mock acceptance and recovery limits

## [0.2.25] - 2026-10-24

### Added

- User-selectable hosted mock payment plugin with same-origin checkout, durable merchant state, signed settlement and persistent simulated-payment labels.

## [0.2.24] - 2026-10-23

### Added

- **Simplified Chinese (`zh-CN`) localization across Dashboard, Catalog, and Documentation (#95)**:
  - Add full `en` / `zh-CN` internationalization across the Dashboard shell, navigation rail/sidebar, account menu, workspace switcher, sign-in and installation setup pages, overview, workspace directory/settings, account settings, embedded Help/API reference, live API console, and public model catalog (`/models/`).
  - Add dual-language (`<div data-lang="en">` / `<div data-lang="zh">`) localization across all 33 authored documentation pages, automatic runtime localization of generated REST/SDK/handler reference pages (`localizeGeneratedContent`), and synchronized theme (`system` / `light` / `dark`) and language controls across public and dashboard headers.
- **Customer onboarding and request capacity operational guides**:
  - Add [Set up a customer](/docs/admin/customers/) (`/docs/admin/customers/`) and [Investigate request capacity](/docs/guides/request-capacity/) (`/docs/guides/request-capacity/`) in both English and Simplified Chinese, and separate customer API quickstart workflows from installation administrator responsibilities (`3e4c1ed4`).
- **Durable idempotent API key mutation recovery & database migrations (`0356`–`0358`)**:
  - Add `0356_readable_resource_slugs.sql`, `0357_key_mutation_outcomes.sql`, and `0358_guardrail_request_evidence.sql` to persist readable resource slugs, idempotent key rotation/revocation outcome receipts, and request-linked guardrail policy evidence (`4b0708aa`, `e2a15269`, `645f7318`).

### Changed

- **Single-word API route segments & readable product URLs (`4b0708aa`, `858f8c80`, `903156a5`)**:
  - Standardize single-word route segments across control and data planes (`/api/v1/pools`, `/api/v1/generations`, `/api/v1/video/draft`, `/v1/media/groups`, `/v1/media/operations`, `/v1/media/verifications`, `/api/v1/Guardrails` history/evidence) while preserving legacy route compatibility aliases.
  - Use durable, human-readable `slug` paths for workspaces, Providers, and API keys across Dashboard routes, navigation, and query scopes without exposing internal UUIDs in product UI.
- **Dashboard UX, navigation & choice-control remediation (`#100`, `niu-4rp`, `niu-hux`)**:
  - Redesign `/login` and `/login/installation` sign-in surfaces with clear mode separation and return-path preservation (`241872d0`).
  - Connect blocked Guardrails requests directly to saved policy revision evidence and audit records (`645f7318`).
  - Decompose oversized Dashboard feature modules (`BillingView`, `PlaygroundView`, `VideoView`, `KeyDetail`, `RoutePoolsAdmin`, `ProviderDirectory`, `GuardrailsPage`, and `GatewayActivity`) into focused sub-modules with shared shadcn `DropdownMenu` choice controls, `Popover` secondary search triggers, and explicit uncertain-mutation recovery banners (`829a856d`, `903156a5`).
- **Gateway runtime, storage & SDK modularization (`niu-hux`)**:
  - Split `crates/niu-gateway/src/http/mod.rs` and `crates/niu-storage/src/postgres.rs` into domain-aligned submodules, enforce statement timeouts and bounded pagination across list/export queries, and synchronize OpenAPI contracts, `@niu-io/sdk`, `sdks/mcp`, and generated REST/SDK documentation (`858f8c80`, `903156a5`).

### Fixed

- Keep public Dashboard navigation links independent of asynchronous session checks (`8c12c75a`) and navigate directly to the created Provider detail page after creation (`d4eae19a`).
- Align API response metadata, `Cache-Control: no-store` headers, pagination cursors, and OpenAPI handler annotations across 327 handler operations (`858f8c80`, `903156a5`).

### Verification boundary

- Verified across `@niu-io/dashboard` (`tsc`, `vite build`, and 114 test files / 996 tests including `locale-i18n.test.tsx`), `@niu-io/docs` (`generate-api-docs.mjs --check`, `test:api`, `astro check`, and 849 built static pages), `@niu-io/catalog` (`astro check` and `astro build`), `scripts/extract-handler-openapi.py --check` (327 handler annotations, 429 REST operations, 383 SDK exports), `cargo fmt --all -- --check`, and `scripts/check-public-boundary.py` (3,090 tracked files).

## [0.2.23] - 2026-10-19

### Changed
- **sdk,dashboard**: unify Supplier/Vendor types and methods to Provider across SDK, docs, and dashboard

## [0.2.22] - 2026-10-19

### Added

- **Dashboard Route Pools administration (`/admin/route-pools`)**:
  - Add a full administrative surface for inspecting, filtering, creating, editing, and reviewing revision history of model route pools (`GET /api/v1/model-route-pools/index`, `PUT /api/v1/model-route-pools`, `GET /api/v1/model-route-pools/history`).
  - Support shared and organization-scoped pools, priority-tier ordering (`-1000..1000`), weighted selection (`1..10000`), optimistic revision guards (`expected_revision`), uncertain write recovery (`writeMayHaveCommitted`), and candidate route discovery across configured Provider model mappings.
- **Shared demo browser sign-in (`POST /api/v1/auth/browser/demo`)**:
  - Add server-configured shared demo sign-in controlled by `NIU_DEMO_LOGIN_EMAIL` and `NIU_DEMO_LOGIN_PASSWORD` (`demo_login` in `GET /api/v1/auth/config`), with a one-click `Try the demo` action on `/login` and migration `0355_restore_demo_platform_admin.sql`.

### Changed

- **Unified Provider terminology and routes**:
  - Standardize Dashboard Provider management routes under `/admin/providers` and `/providers/:providerId` while preserving legacy `/admin/suppliers` and `/suppliers/:providerId` redirects and API/storage compatibility aliases.
  - Style the public shell `Dashboard` / `Sign in` call-to-action button with the brand accent and group desktop header navigation links.

## [0.2.21] - 2026-10-19

### Added

- Add a filled `Dashboard` / `Sign in` call-to-action button in the public header and right-align the mobile session control across public surfaces (#96).
- Add database migration `0354_architecture_stability_and_ledger_fixes.sql` restoring unlimited request-rate fast paths, fixing post-reservation settlement triggers, binding `attempts.api_key_id` before reservation enforcement, recording `P0020` / `P0026` key rate denials in `gateway_admission_denials`, rewriting `niu_customer_key_committed()` to eliminate $O(N)$ ledger scans, and adding partial indexes for financial recovery and commercial position queries (#85, #86, #87).

### Fixed

- **Public shell, `/help/` embed & catalog UX (`v0.2.21`)**:
  - Unify public header navigation (`Models`, `Docs`, `API Reference`, `Comparison`, and active `Dashboard` / `Sign in` session action) across `/models/`, `/docs/`, and `/help/`, while suppressing duplicate public header chrome when documentation is embedded inside the Dashboard `/help/` frame (#96).
  - Refine the `/login` heading hierarchy and `/models/` public catalog search and filter toolbar ergonomics across desktop and narrow viewports (#96).
  - Synchronize pinned SHA-256 source fingerprints in `vendor/litellm-rust/SOURCE-MANIFEST.json` for `litellm-core`, `litellm-llms`, and `litellm-auth-aws` following the `v0.2.20` upstream engine fixes (#91).
- **Gateway runtime & multi-replica consistency (`v0.2.20`–`v0.2.21`)**:
  - Normalize trailing-slash requests on top-level and nested Dashboard SPA routes (`/activity/`, `/generations/`, `/settings/`, `/admin/.../`, `/providers/.../`, `/suppliers/`, `/workspaces/{slug}/.../`) so direct entry and refreshes do not return HTTP `404` (#74).
  - Signal background recovery workers immediately upon `SIGINT` / `SIGTERM`, bound HTTP connection draining to 15 seconds, and route `/v1/messages` streaming completion through `diagnostic_writes` so downstream client disconnects cannot cancel post-stream settlement (#81).
  - Execute `GatewayWrites` single-item admission fallbacks with bounded concurrency (`8`) and offload per-item completion retry sleeps onto background tasks to prevent batch worker head-of-line stalls (#82).
  - Persist Codex OAuth PKCE login state across gateway replicas using authenticated AES-256-GCM state tokens (`vendor_cipher`) with replay tracking, and preserve the payment recovery cursor when an order probe is skipped due to rate limiting (#83).
  - Add a 200ms monotonic TTL to the in-memory `RouteRegistry` active generation check, cache decrypted `EPayRuntime` instances by `(revision, encryption_key_version)`, defer request payload credential scrubbing to background persistence, and eliminate redundant JSON AST clones during input guardrail evaluation (#84).
- **Financial ledger, storage & query performance (`v0.2.20`–`v0.2.21`)**:
  - Distinguish API-submitted media jobs (`source = 'api'`) from `'generations'` and `'unknown'` in `generations_inventory.sql`, and bind `organization_id` / `project_id` on `LEFT JOIN attempts` in `generations_session_turns.sql` (#79).
  - Bind `attempts.api_key_id` prior to `customer_balance_reservations` insertion so `enforce_customer_balance_reservation()` enforces per-key spending limits at admission time, and create `0`-nanos reservation records for zero-priced prepaid text attempts with bound customer tariffs (#85).
  - Restore the unlimited fast-path in `niu_enforce_vendor_request_rate()` and `niu_enforce_key_request_rate()`, bypass redundant workspace limit re-checks when settling charges covered by an active reservation, and enforce `AND currency = $5` in `settle_cost_in_tx` (#86).
  - Push unsettled `needs_recovery` predicates into the `candidates` CTE of `customer_charge_recovery.sql`, `customer_media_charge_recovery.sql`, `supplier_earning_recovery.sql`, and `media_completion_recovery.sql`, and consolidate `gateway_activity_summary_on` histogram bounds into a single CTE pass (#87, #88).
- **AI inference protocols, video pipeline & `litellm-rust` (`v0.2.20`–`v0.2.21`)**:
  - Support 100%-cached and zero-completion usage in native Chat Completions, populate `token_categories` for native chat responses, inject `stream_options.include_usage = true` on personal (BYOK) streaming routes, default omitted Anthropic cache token fields to `0` while supporting `thinking` and `redacted_thinking` content blocks in `/v1/messages`, default omitted Gemini category token counts to `Some(0)`, and map `incomplete`, `refusal`, and `finish_reasons` in `/v1/codex/chat/completions` (#89).
  - Preserve validated `asset://` references during `OutputSchema` re-validation (`validate_request_value_allowing_prepared_assets`), permit `video_url` and `audio_url` blocks in `pin_media_output_snapshot`, move `enqueue_pending_media_queries()` outside the inner per-tick loop in `video_recovery.rs`, coalesce `IN_FLIGHT_REFRESHES` by `(organization_id, project_id, id)`, record `confirmed_not_executed` on pre-dispatch video failures, and verify `DELIVERY_CHUNKS` capacity before downloading upstream video bytes (#90).
  - Cache `AwsAuthFlow::WebIdentity` STS credentials and check the `AssumeRole` cache before calling `GetCallerIdentity` in `litellm-auth-aws`, surface upstream SSE `event: error` frames in `AnthropicChatCompletionsStreamTransformer`, harden `litellm-core` HTTP clients with a 16 MiB response cap, and preserve user schema properties named `"additionalProperties"` in Bedrock `strip_additional_properties` (#91).
- **Security & isolation hardening (`v0.2.20`–`v0.2.21`)**:
  - Evaluate per-identity password login rate limits before the installation-wide global bucket, add per-IP login rate limiting, isolate authenticated password changes (`PUT /api/v1/auth/password`) into a dedicated rate-limit bucket, require a loopback bind or explicit `https://` `NIU_AUTH_PUBLIC_ORIGIN` when `NIU_DEMO_ACCOUNT_ENABLED=1`, add Ed25519 JWS verification, `0o600` Unix socket permissions, and a 16,384-entry deduplication window in `niu-plugin-sdk`, support browser session cookie + CSRF authentication and singleflight health probes in the enterprise plugin proxy/runtime, add `validate_public_endpoint_url` in `niu-upstream`, and guard `tokio::task::block_in_place` with a `RuntimeFlavor::MultiThread` check (#92).
- **Dashboard, Docs, OpenAPI contracts & SDKs (`v0.2.20`–`v0.2.21`)**:
  - Use workspace route slugs (`workspacePathSegment` / `resolveWorkspacePathSegment`) consistently across `AppLayout`, global `Activity`, `GatewayActivity`, `ModelTable`, `PlaygroundView`, `SessionHistory`, and `VideoView`, and route Guardrails history links through `${workspaceRoot}/guardrails/history` (#75, #93).
  - Render the `ArrowUpRight` action icon in the Activity Model usage table and preserve `net_contribution_nanos: null` (`Unavailable`) when cohort contribution is unknown on the Commercial Position page (#76).
  - Replace permanently visible model filter inputs on Customer Pricing, Retail Pricing, and Provider Admin pages with compact Popover search panels, remove duplicate `<h2>` supplier section headings, compute provider token sums with `BigInt`, use React Router `<Link>` in `MediaOfferPublisher`, and narrow `aria-current="page"` in `PublicNavigationMenu` (#77).
  - Guard Playground comparison cancellation against stale in-flight responses, eliminate `SessionHistory` $4 \times N$ cross-workspace re-fetch fan-out on workspace switches, refresh terminal video job billing/timings and pause hidden-tab polling in `VideoView`, forward Dashboard Bearer authentication into embedded `/help/` API Reference views, and reset stale tenant billing/key state on scope changes (#93).
  - Align OpenAPI `security` declarations across 21 `/api/v1/` management operations and 32 `/v1/` inference/media operations, document `key_id` and `model_alias` on `GET /api/v1/organizations/{org_id}/projects/{project_id}/requests`, and replace residual `Supplier` / customer-facing `project` terminology with `Provider` / `workspace` (#80).
  - Replace the unsupported `before` parameter in MCP `get_video_job_diagnostics` with 64-character hex `after` cursor validation (#78), confine MCP binary file downloads to `NIU_MCP_OUTPUT_DIR` with safe media extensions and exclusive creation (`wx`), parallelize the MCP stdio JSON-RPC dispatch loop (concurrency up to 16), URL-encode path segments in `sdks/javascript`, block Aider short/model override flags in `sdks/agent-connect`, and harden `Dockerfile` and `scripts/install.sh` (#94).

### Verification boundary

- Full static, contract, license, and build verification passes across `cargo +1.98.0 clippy --locked --workspace --all-targets -- -D warnings`, `scripts/verify-imports.py`, `scripts/extract-handler-openapi.py --check`, `scripts/check-openapi-entrypoints.py`, `scripts/check-public-boundary.py`, `niu-storage` (34 unit tests + PostgreSQL storage fixtures), `niu-media` (54 unit tests), `niu-plugin-sdk`, `niu-upstream`, `niu-gateway` unit and functional/stability/process-recovery fixtures, `@niu-io/dashboard` (96 test files, 768 tests), `@niu-io/docs` (723 built pages), `@niu-io/catalog`, `sdks/mcp` (15 tests), `sdks/javascript` (44 tests), and `sdks/agent-connect` (18 tests).
- Production deployment to `https://niu.io` (`niu-io/cloud`) is live and verified against `/enterprise/readyz`, `/api/v1/auth/config`, `/catalog/v1/models`, and `/docs/openapi/public.json`.

## [0.2.20] - 2026-10-18

### Added

- Add a filled `Dashboard` / `Sign in` call-to-action button in the public header and right-align the mobile session control across public surfaces.
- Add database migration `0354_architecture_stability_and_ledger_fixes.sql` restoring unlimited request-rate fast paths, fixing post-reservation settlement triggers, binding `attempts.api_key_id` before reservation enforcement, recording `P0020` / `P0026` key rate denials in `gateway_admission_denials`, rewriting `niu_customer_key_committed()` to eliminate $O(N)$ ledger scans, and adding partial indexes for financial recovery and commercial position queries (#85, #86, #87).

### Fixed

- **Gateway runtime & multi-replica consistency**:
  - Normalize trailing-slash requests on top-level and nested Dashboard SPA routes (`/activity/`, `/generations/`, `/settings/`, `/admin/.../`, `/providers/.../`, `/suppliers/`, `/workspaces/{slug}/.../`) so direct entry and refreshes do not return HTTP `404` (#74).
  - Signal background recovery workers immediately upon `SIGINT` / `SIGTERM`, bound HTTP connection draining to 15 seconds, and route `/v1/messages` streaming completion through `diagnostic_writes` so downstream client disconnects cannot cancel post-stream settlement (#81).
  - Execute `GatewayWrites` single-item admission fallbacks with bounded concurrency (`8`) and offload per-item completion retry sleeps onto background tasks to prevent batch worker head-of-line stalls (#82).
  - Persist Codex OAuth PKCE login state across gateway replicas using authenticated AES-256-GCM state tokens (`vendor_cipher`) with replay tracking, and preserve the payment recovery cursor when an order probe is skipped due to rate limiting (#83).
  - Add a 200ms monotonic TTL to the in-memory `RouteRegistry` active generation check, cache decrypted `EPayRuntime` instances by `(revision, encryption_key_version)`, defer request payload credential scrubbing to background persistence, and eliminate redundant JSON AST clones during input guardrail evaluation (#84).
- **Financial ledger, storage & query performance**:
  - Distinguish API-submitted media jobs (`source = 'api'`) from `'generations'` and `'unknown'` in `generations_inventory.sql`, and bind `organization_id` / `project_id` on `LEFT JOIN attempts` in `generations_session_turns.sql` (#79).
  - Bind `attempts.api_key_id` prior to `customer_balance_reservations` insertion so `enforce_customer_balance_reservation()` enforces per-key spending limits at admission time, and create `0`-nanos reservation records for zero-priced prepaid text attempts with bound customer tariffs (#85).
  - Restore the unlimited fast-path in `niu_enforce_vendor_request_rate()` and `niu_enforce_key_request_rate()`, bypass redundant workspace limit re-checks when settling charges covered by an active reservation, and enforce `AND currency = $5` in `settle_cost_in_tx` (#86).
  - Push unsettled `needs_recovery` predicates into the `candidates` CTE of `customer_charge_recovery.sql`, `customer_media_charge_recovery.sql`, `supplier_earning_recovery.sql`, and `media_completion_recovery.sql`, and consolidate `gateway_activity_summary_on` histogram bounds into a single CTE pass (#87, #88).
- **AI inference protocols, video pipeline & `litellm-rust`**:
  - Support 100%-cached and zero-completion usage in native Chat Completions, populate `token_categories` for native chat responses, inject `stream_options.include_usage = true` on personal (BYOK) streaming routes, default omitted Anthropic cache token fields to `0` while supporting `thinking` and `redacted_thinking` content blocks in `/v1/messages`, default omitted Gemini category token counts to `Some(0)`, and map `incomplete`, `refusal`, and `finish_reasons` in `/v1/codex/chat/completions` (#89).
  - Preserve validated `asset://` references during `OutputSchema` re-validation (`validate_request_value_allowing_prepared_assets`), permit `video_url` and `audio_url` blocks in `pin_media_output_snapshot`, move `enqueue_pending_media_queries()` outside the inner per-tick loop in `video_recovery.rs`, coalesce `IN_FLIGHT_REFRESHES` by `(organization_id, project_id, id)`, record `confirmed_not_executed` on pre-dispatch video failures, and verify `DELIVERY_CHUNKS` capacity before downloading upstream video bytes (#90).
  - Cache `AwsAuthFlow::WebIdentity` STS credentials and check the `AssumeRole` cache before calling `GetCallerIdentity` in `litellm-auth-aws`, surface upstream SSE `event: error` frames in `AnthropicChatCompletionsStreamTransformer`, harden `litellm-core` HTTP clients with a 16 MiB response cap, and preserve user schema properties named `"additionalProperties"` in Bedrock `strip_additional_properties` (#91).
- **Security & isolation hardening**:
  - Evaluate per-identity password login rate limits before the installation-wide global bucket, add per-IP login rate limiting, isolate authenticated password changes (`PUT /api/v1/auth/password`) into a dedicated rate-limit bucket, require a loopback bind or explicit `https://` `NIU_AUTH_PUBLIC_ORIGIN` when `NIU_DEMO_ACCOUNT_ENABLED=1`, add Ed25519 JWS verification, `0o600` Unix socket permissions, and a 16,384-entry deduplication window in `niu-plugin-sdk`, support browser session cookie + CSRF authentication and singleflight health probes in the enterprise plugin proxy/runtime, add `validate_public_endpoint_url` in `niu-upstream`, and guard `tokio::task::block_in_place` with a `RuntimeFlavor::MultiThread` check (#92).
- **Dashboard, Docs, OpenAPI contracts & SDKs**:
  - Use workspace route slugs (`workspacePathSegment` / `resolveWorkspacePathSegment`) consistently across `AppLayout`, global `Activity`, `GatewayActivity`, `ModelTable`, `PlaygroundView`, `SessionHistory`, and `VideoView`, and route Guardrails history links through `${workspaceRoot}/guardrails/history` (#75, #93).
  - Render the `ArrowUpRight` action icon in the Activity Model usage table and preserve `net_contribution_nanos: null` (`Unavailable`) when cohort contribution is unknown on the Commercial Position page (#76).
  - Replace permanently visible model filter inputs on Customer Pricing, Retail Pricing, and Provider Admin pages with compact Popover search panels, remove duplicate `<h2>` supplier section headings, compute provider token sums with `BigInt`, use React Router `<Link>` in `MediaOfferPublisher`, and narrow `aria-current="page"` in `PublicNavigationMenu` (#77).
  - Guard Playground comparison cancellation against stale in-flight responses, eliminate `SessionHistory` $4 \times N$ cross-workspace re-fetch fan-out on workspace switches, refresh terminal video job billing/timings and pause hidden-tab polling in `VideoView`, forward Dashboard Bearer authentication into embedded `/help/` API Reference views, and reset stale tenant billing/key state on scope changes (#93).
  - Align OpenAPI `security` declarations across 21 `/api/v1/` management operations and 32 `/v1/` inference/media operations, document `key_id` and `model_alias` on `GET /api/v1/organizations/{org_id}/projects/{project_id}/requests`, and replace residual `Supplier` / customer-facing `project` terminology with `Provider` / `workspace` (#80).
  - Replace the unsupported `before` parameter in MCP `get_video_job_diagnostics` with 64-character hex `after` cursor validation (#78), confine MCP binary file downloads to `NIU_MCP_OUTPUT_DIR` with safe media extensions and exclusive creation (`wx`), parallelize the MCP stdio JSON-RPC dispatch loop (concurrency up to 16), URL-encode path segments in `sdks/javascript`, block Aider short/model override flags in `sdks/agent-connect`, and harden `Dockerfile` and `scripts/install.sh` (#94).

### Verification boundary

- Verified across `niu-storage` (34 unit tests + PostgreSQL storage fixtures), `niu-media` (54 unit tests), `niu-plugin-sdk`, `niu-upstream`, `niu-gateway` unit and functional/stability/process-recovery fixtures, `@niu-io/dashboard` (96 test files, 768 tests), `@niu-io/docs` (723 built pages), `@niu-io/catalog`, `sdks/mcp` (15 tests), `sdks/javascript` (44 tests), and `sdks/agent-connect` (18 tests).

## [0.2.19] - 2026-10-18

### Fixed

- Redesign the interactive API reference connection bar (`/help/api/` and `/docs/api/`) into a single-row segmented control bar using shadcn `DropdownMenu` primitives, automatically connecting the active workspace and default API key on page load without exposing internal UUIDs.
- Enforce pre-dispatch customer pricing bounds and surface below-cost configuration warnings across platform pricing management (#61).
- Normalize public catalog filtering, search, and model metadata display across desktop and mobile viewports (#64).

### Verification boundary

- Full unit and integration suites pass across `@niu-io/dashboard` (96 test files, 768 tests) and `@niu-io/docs` (`tsc`, `astro check`, and `test:api`), alongside backend contract and pricing checks.
- Native browser checks at desktop (`1440px`) and narrow (`390px`) viewports verify anonymous Sign-In CTA, signed-in auto-selection of Workspace and API Key, workspace switching with automatic key re-binding, manual raw Bearer key override and reset, one-click key creation (`POST /api/v1/keys`), and live Scalar `Test Request` header injection (`Authorization: Bearer niu-browser-member-session` and `x-niu-key-id`).

## [0.2.18] - 2026-10-17

### Fixed

- Return unscoped model-catalog sign-ins to the public artifact; retain dashboard navigation for workspace-scoped models. Canonicalize public directory entries while preserving query parameters.
- Use Provider terminology in contract descriptions and regenerate REST and handler documentation without changing compatibility identifiers.
- Preserve referenced contracts' default authentication in the bundled OpenAPI and generated request examples. Explicit public operations retain their overrides; backend authorization is unchanged.

### Verification boundary

- Actual native browser sign-ins and refreshes distinguish public and workspace model destinations; direct HTTP reads verify query-preserving redirects and retained request/financial records.
- Independent resolution of the current source contracts agrees with all generated operation security requirements, including inherited protected and explicit public operations. The served local OpenAPI bytes match the generated artifact. Actual hosted reads distinguish anonymous refusal, authorized administration, and public authentication configuration.
- Updated examples are inspected at desktop and narrow widths. Hosted verification follows deployment. Pricing integrity, commercial settlement, capacity and complete platform acceptance remain outside this release's verified scope.

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

[Unreleased]: https://github.com/niu-io/niu/compare/v0.2.28...HEAD
[0.2.28]: https://github.com/niu-io/niu/compare/v0.2.27...v0.2.28
[0.2.27]: https://github.com/niu-io/niu/compare/v0.2.26...v0.2.27
[0.2.26]: https://github.com/niu-io/niu/compare/v0.2.25...v0.2.26
[0.2.25]: https://github.com/niu-io/niu/compare/v0.2.24...v0.2.25
[0.2.23]: https://github.com/niu-io/niu/compare/v0.2.22...v0.2.23
[0.2.22]: https://github.com/niu-io/niu/compare/v0.2.21...v0.2.22
[0.2.21]: https://github.com/niu-io/niu/compare/v0.2.20...v0.2.21
[0.2.20]: https://github.com/niu-io/niu/compare/v0.2.19...v0.2.20
[0.2.19]: https://github.com/niu-io/niu/compare/v0.2.18...v0.2.19
[0.2.18]: https://github.com/niu-io/niu/compare/v0.2.17...v0.2.18
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
