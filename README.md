# Niu

[![Release](https://img.shields.io/github/v/release/niu-io/niu?label=release)](https://github.com/niu-io/niu/releases)
[![Qualification CI](https://github.com/niu-io/niu/actions/workflows/ci.yml/badge.svg)](https://github.com/niu-io/niu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Documentation](https://img.shields.io/badge/docs-niu.io%2Fdocs-0f172a)](https://niu.io/docs/)

**Niu** (牛元) is an open-source AI model API gateway built in Rust for lower-cost model access, Provider routing, workspace budget controls, and transparent consumption accounting.

This repository is the complete self-hosted monorepo: single-process Rust gateway, workspace and Provider management dashboard, opt-in public model catalog, developer documentation, OpenAPI 3.1 contracts, client SDKs, built-in open-source plugins, and container packaging.

Release acceptance is maintained in the [release checklist](docs/release-checklist.md). Every required check must be GREEN with current-candidate hosted end-to-end evidence before release.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/niu-io/niu)

---

## Key Capabilities

- **Three-Plane Single-Process Gateway (`apps/gateway`)**:
  - **Inference Data Plane (`/v1/*`)**: OpenAI-compatible `/v1/models` and `/v1/chat/completions` (streaming SSE and non-streaming) with native Anthropic and AWS Bedrock protocol transformations via pinned LiteLLM Rust modules.
  - **Unified Control Plane (`/api/v1/*`)**: Scope-isolated REST API across account sessions (`/api/v1/auth/*`, `/api/v1/user/*`), customer workspaces (`/api/v1/workspaces/:workspace/*`), model Providers (`/api/v1/providers/*`), and installation administration (`/api/v1/platform/*`).
  - **Public Catalog & Docs (`/models/`, `/docs/`, `/catalog/v1/*`)**: Opt-in public model catalog and embedded developer documentation served directly from the same Rust HTTP listener on port `2555`.
- **Pre-Dispatch Budget Reservations & Durable Accounting**:
  - Commits dispatch intent and bounded workspace budget reservations in PostgreSQL before calling an upstream Provider, then settles token usage and customer charges asynchronously in batched workers.
  - Strictly separates customer-facing workspace charges from confidential Provider purchase rates and platform margins.
- **Encrypted Provider Credentials & Fail-Closed Startup**:
  - Provider API credentials persist in PostgreSQL encrypted with `NIU_VENDOR_ENCRYPTION_KEY` and are never returned by API responses.
  - `niu-gateway --check-encryption` verifies stored credential decryption before cutover or upgrade.
- **Extensible Plugin Architecture (`plugin-api` & `plugin-sdk`)**:
  - Versioned Rust `plugin-api` and `plugin-sdk` supporting built-in open-source plugins (`plugins/hello-echo`, `plugins/request-tagger`, `plugins/webhook-audit`) and manifest-validated external plugins over Unix domain sockets (`/api/plugins/v1/{plugin_id}/…`).
- **Independent Client Access**:
  - Applications and coding agents connect through standard `/v1` model APIs or the TypeScript SDKs (`@niu-io/sdk`, `@niu-io/agent-connect`, `@niu-io/mcp`) without requiring an external agent orchestrator. `niu-mcp` is a local stdio server; the hosted client uses `https://niu.io/v1`.

---

## Quickstart

### 1. Self-Hosted Installation (Docker Compose)

Install a pinned release with [`scripts/install.sh`](scripts/install.sh). The installer generates `.env` secrets (`NIU_ADMIN_TOKENS`, `NIU_VENDOR_ENCRYPTION_KEY`, and PostgreSQL credentials), pulls the versioned image (`ghcr.io/niu-io/niu:v0.2.28`), starts PostgreSQL and the gateway, and verifies `/readyz`:

```sh
./scripts/install.sh install --version v0.2.28 --dir /opt/niu
```

Once running on port `2555`:

- **Default Entry (`/`)**: Redirects to `/workspaces/default/` (or `/installation` before first-time setup and `/login` when unauthenticated, with direct links to `/models/` and `/docs/`).
- **Installation Setup (`/installation`)**: Authenticate with your `NIU_ADMIN_TOKENS` secret to configure the platform currency (`USD` or `CNY`), upstream Providers (such as OpenRouter, OpenAI, Anthropic, or Bedrock), published model routes, and either a payment gateway or a company funding arrangement (`/admin/balances`).
- **Public Model Catalog (`/models/`)**: Browse routes enabled for `public_catalog`.
- **Developer Documentation (`/docs/` & `/help/`)**: Read setup, routing, and API guides.

### 2. Enable Self-Hosted Funding & Call the Inference API

Customer workspaces require a configured platform currency and either a verified payment gateway or an explicit company funding arrangement (credit grant, settled funding, or credit limit). For self-hosted evaluation without an external payment merchant, configure the platform currency and grant credits to the default company using one installation token from `NIU_ADMIN_TOKENS`, then issue a workspace API key and call `/v1/chat/completions`. `NIU_ADMIN_TOKENS` accepts a comma-separated list; select one value for the commands below:

```sh
# 0. Choose one installation token from the generated NIU_ADMIN_TOKENS value
export NIU_INSTALLATION_TOKEN='<one token from NIU_ADMIN_TOKENS>'

# 1. Set the installation platform currency (one-time)
curl -X PUT http://localhost:2555/api/v1/platform/currency \
  -H "Authorization: Bearer $NIU_INSTALLATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currency": "USD"}'

# 2. Grant initial credits (e.g. $10.00 = 10000000000 nanounits) to the default company.
#    Currency is a path segment; amount_nanos is an exact positive integer.
ORG_ID=$(curl -fsSL http://localhost:2555/api/v1/organizations \
  -H "Authorization: Bearer $NIU_INSTALLATION_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
curl -X POST "http://localhost:2555/api/v1/organizations/$ORG_ID/billing/accounts/USD/grants" \
  -H "Authorization: Bearer $NIU_INSTALLATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount_nanos": "10000000000", "reason": "Self-hosted evaluation", "idempotency_key": "00000000-0000-4000-8000-000000000001"}'

# 3. Issue a workspace API key and call /v1/chat/completions
curl http://localhost:2555/v1/chat/completions \
  -H "Authorization: Bearer $NIU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4-mini",
    "messages": [
      {"role": "user", "content": "Explain pre-dispatch budget reservation in one sentence."}
    ]
  }'
```

### 3. Upgrade & Rollback

[`scripts/install.sh`](scripts/install.sh) performs a PostgreSQL `pg_dump` backup, runs `niu-gateway --check-encryption` against the target image before restarting, verifies `/readyz`, and automatically rolls back the image if a check fails. The pre-upgrade dump lets rollback restore the matching database when the previous image cannot start against the upgraded schema; pass `--keep-data` to skip that restore when the schema is known compatible:

```sh
# Upgrade an existing installation to a pinned release
./scripts/install.sh upgrade --version v0.2.28 --dir /opt/niu

# Roll back to the previous image version or inspect deployment health
./scripts/install.sh rollback --dir /opt/niu
./scripts/install.sh rollback --keep-data --dir /opt/niu
./scripts/install.sh status --dir /opt/niu
```

### 4. Deploy to Render

The [Render Blueprint](render.yaml) provisions the gateway and a managed PostgreSQL database in your Render workspace. Provide your upstream Provider API key during setup; Render generates `NIU_ADMIN_TOKENS` and `NIU_VENDOR_ENCRYPTION_KEY`.

---

## Architecture & Repository Layout

```text
niu/
├── apps/
│   ├── gateway/          # Rust HTTP gateway (/v1, /api/v1, /catalog/v1, /api/plugins/v1, static UI routes)
│   ├── dashboard/        # Workspace, Provider, and platform management UI (React + TypeScript + Vite)
│   ├── catalog/          # Opt-in public model catalog (/models/)
│   └── docs/             # Developer documentation site (/docs/, Astro Starlight)
├── contracts/            # Versioned OpenAPI 3.1 specifications (niu.v1.json) and fixtures
├── crates/
│   ├── storage/          # PostgreSQL persistence, migrations, encrypted credentials, budget reservations
│   ├── metered-cost/     # Exact integer rational media pricing engine
│   ├── execution/        # Compatibility vocabulary for imported task records
│   ├── cost/             # Standalone pinned LiteLLM floating-point cost reference (not linked by gateway)
│   ├── benchmark/        # Standalone paired-experiment CLI (retired from gateway runtime)
│   ├── plugin-api/       # Neutral plugin protocol types, capabilities, and hook envelopes
│   └── plugin-sdk/       # Rust SDK for building Niu plugins over Unix domain sockets
├── plugins/              # Built-in open-source plugins (hello-echo, request-tagger, webhook-audit)
├── sdks/
│   ├── javascript/       # @niu-io/sdk client library
│   └── agent-connect/    # @niu-io/agent-connect telemetry & correlation helper
├── vendor/litellm-rust/  # Selectively imported, checksum-verified LiteLLM Rust protocol crates
├── branding/             # Shared Niu brand assets, theme tokens, and public header contracts
├── scripts/              # Dev runner, self-hosted installer, OpenAPI checks, and boundary verifiers
└── docs/                 # Product focus, architecture specifications, and release criteria
```

See:
- [Product Focus](docs/product/product-focus.md) for product goals, Provider qualification, and commercial data boundaries.
- [Vendor & Provider Architecture](docs/architecture/vendors.md) for credential encryption (`NIU_VENDOR_ENCRYPTION_KEY`), static-route precedence, and bootstrap semantics.
- [Repository Ownership](docs/architecture/repository-ownership.md) and [Plugin, Cloud & Enterprise Composition](docs/architecture/enterprise-composition.md) for how `niu-io/niu` composes with `niu-io/website` and `niu-io/plugins` in hosted (`niu-io/cloud`) and self-hosted enterprise (`niu-io/enterprise`) distributions.

---

## Local Development

Start the native open-source development stack (isolated local PostgreSQL cluster, Rust gateway, and hot-reloading dashboard, docs, and catalog dev servers — no Docker required):

```sh
pnpm install
pnpm dev
```

Stop the local stack with `Ctrl-C` or `pnpm dev:stop`. The default local member account is `demo@niu.io`; see [`scripts/DEV.md`](scripts/DEV.md) for local URLs, seeded credentials, and log files.

Build and verify the workspace manually (requires Rust `1.98.0+`, Node.js `24+`, and `pnpm` `11+`):

```sh
pnpm build:dashboard
pnpm build:docs
pnpm build:catalog
cargo check --workspace
```

Release versions are synchronized across [`VERSION`](VERSION), [`Cargo.toml`](Cargo.toml), [`package.json`](package.json), and [`compose.yaml`](compose.yaml) via `pnpm version:check` and `pnpm version:set <X.Y.Z> --tag`. The gateway binary reports its version and commit via `niu-gateway --version`.

---

## Contributing & Security

- Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for development workflows, OpenAPI synchronization, migration immutability rules, and UI guidelines.
- Please review [`SECURITY.md`](SECURITY.md) to report vulnerabilities privately via GitHub Security Advisories.
- Community participation is governed by the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

Niu is released under the [MIT License](LICENSE). Selectively reused third-party modules retain their original copyright, license, pinned commit, and SHA-256 checksums in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) and [`vendor/litellm-rust/SOURCE-MANIFEST.json`](vendor/litellm-rust/SOURCE-MANIFEST.json).
