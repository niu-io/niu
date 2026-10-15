# Contributing to Niu

Thank you for contributing to **Niu** (牛元), the open-source AI model gateway for lower-cost model access, Provider routing, and transparent consumption accounting.

## Repository Scope

`niu-io/niu` contains the complete self-hosted open-source product:

- `apps/gateway`: Single-process Rust HTTP gateway (`/v1` inference data plane, `/api/v1` control plane, `/catalog/v1` public catalog, and `/api/plugins/v1` plugin proxy)
- `apps/dashboard`: Workspace, Provider, and platform management UI (React + TypeScript + Vite)
- `apps/catalog`: Opt-in public model catalog (`/models/`)
- `apps/docs`: Developer documentation site (`/docs/`, Astro Starlight)
- `contracts`: OpenAPI 3.1 specifications and test fixtures
- `crates`: Storage, execution, cost calculation, benchmark, `plugin-api`, and `plugin-sdk` crates
- `plugins`: Built-in open-source plugins (`hello-echo`, `request-tagger`, `webhook-audit`)
- `sdks`: JavaScript (`sdks/javascript`) and Agent Connect (`sdks/agent-connect`) client SDKs

See [`docs/architecture/repository-ownership.md`](docs/architecture/repository-ownership.md) for route and repository boundaries. Marketing pages for `niu.io` live in the separate `niu-io/website` repository; community builds of `niu-io/niu` have zero dependency on website or private plugin repositories.

## Prerequisites

- **Rust**: `1.98.0` or newer (`rustup toolchain install 1.98.0 --component rustfmt --component clippy`)
- **Node.js**: `24` or newer
- **pnpm**: `11.25.0` or newer
- **Python**: `3.12` or newer (used for verification, OpenAPI extraction, and release scripts)
- **PostgreSQL**: `17` (for local development via `pnpm dev` or storage integration tests)

## Local Development

Start the complete local stack (isolated local PostgreSQL cluster, Rust gateway, dashboard, docs, and catalog dev servers) with a single command:

```sh
pnpm install
pnpm dev
```

Stop the local stack with `Ctrl-C` or `pnpm dev:stop`. See [`scripts/DEV.md`](scripts/DEV.md) for local ports, seeded demo credentials (`demo@niu.io`), and log locations.

## Verification Checklist

Before submitting a pull request, run the checks relevant to your changes (all of these run in CI via [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

### 1. Rust Workspace & Storage Tests

```sh
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
```

If you modified SQL queries or migrations in `crates/storage` or gateway routes in `apps/gateway`, also run the PostgreSQL integration suites against a test database:

```sh
DATABASE_URL=postgres://niu_test:niu_test@127.0.0.1:5432/niu_test \
  cargo test --locked -p niu-storage --tests -- --ignored
DATABASE_URL=postgres://niu_test:niu_test@127.0.0.1:5432/niu_test \
  cargo test --locked -p niu-gateway -- --ignored
```

### 2. Frontend, Docs, Catalog & SDK Checks

```sh
pnpm check:dashboard
pnpm build:dashboard
pnpm check:docs
pnpm build:docs
pnpm check:catalog
pnpm build:catalog
pnpm --dir sdks/javascript run check
pnpm --dir sdks/javascript run test
pnpm --dir sdks/agent-connect run check
pnpm --dir sdks/agent-connect run test
```

### 3. OpenAPI Contracts & Generated SDKs

If you add or modify Gateway HTTP handlers or control-plane routes, synchronize and verify the OpenAPI schema and generated documentation/SDK artifacts:

```sh
python3 scripts/extract-handler-openapi.py --check
python3 scripts/check-openapi-entrypoints.py
pnpm check:api
```

To regenerate the OpenAPI artifacts and SDK types after changing `contracts/openapi/niu.v1.json`:

```sh
pnpm generate:api
```

### 4. License, Migration & Public Boundary Hygiene

```sh
# Verify selective upstream LiteLLM Rust imports and SHA-256 checksums
python3 scripts/verify-imports.py

# Verify JavaScript dependency licenses
node scripts/verify-js-licenses.mjs

# Verify public boundary (no secrets, local paths, or private URLs)
python3 scripts/check-public-boundary.py --root . --tracked-tree --check-build-inputs

# Verify version synchronization across VERSION, Cargo.toml, package.json, and compose.yaml
pnpm version:check
```

> **Migration Immutability**: Never edit or delete a SQL migration file in `crates/storage/migrations/` that has already shipped in a tagged release. Always add a new numbered migration file (`00XX_description.sql`); CI verifies migration immutability against the previous release tag via `scripts/check-migration-history.py`.

## Product & UI Conventions

Please review [`AGENTS.md`](AGENTS.md) before making UI or API changes. Key rules include:

1. **Brand & Terminology**:
   - Use **Niu** as the English product name (never `niu.io` or `NIU.IO` in prose; keep `niu.io` only in URLs and technical configuration). Use **牛元** in Chinese content.
   - Use **workspace** consistently for customer-facing scope (never call a workspace a "project" in UI or docs).
   - Use **Provider** consistently for model-supply businesses, upstream adapters, offers, and settlements.
2. **No Internal Identifiers in UI**:
   - Never display raw or shortened UUIDs/GUIDs in dashboard tables, menus, dialogs, tooltips, or secondary labels. Always render human-readable names, slugs, or dates.
3. **Shared UI Primitives**:
   - Use the installed shadcn primitives (`Button`, `Input`, `Textarea`, `Checkbox`, `Label`, `Dialog`, `DropdownMenu`, `Popover`, `Sidebar`, `Tabs`, `Card`, `Badge`, `Alert`, `Table`, `Tooltip`) directly at call sites.
   - Never use native HTML `<select>` / `<option>` or the shadcn `Select` component; compose `DropdownMenu` primitives directly for all choice controls.
   - Use only Lucide React and Tabler Icons.
4. **Browser Verification**:
   - For every UI change, run the application and inspect the rendered route in a browser at both desktop and narrow responsive widths before marking the change complete.

## License

By contributing to Niu, you agree that your contributions will be licensed under the [MIT License](LICENSE).
