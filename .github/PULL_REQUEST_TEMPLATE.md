## Summary

<!-- Describe what this pull request changes and why. -->

## Affected Areas

- [ ] Gateway (`apps/gateway`)
- [ ] Storage / Migrations (`crates/storage`)
- [ ] Dashboard (`apps/dashboard`)
- [ ] Public Model Catalog (`apps/catalog`)
- [ ] Documentation (`apps/docs`, `docs/`)
- [ ] OpenAPI Contracts / SDKs (`contracts/`, `sdks/`)
- [ ] Plugin API / SDK / Built-in Plugins (`crates/plugin-api`, `crates/plugin-sdk`, `plugins/`)
- [ ] Packaging / Scripts / CI (`Dockerfile`, `compose.yaml`, `scripts/`, `.github/`)

## Verification

- [ ] `cargo fmt --all -- --check` and `cargo clippy --locked --workspace --all-targets -- -D warnings`
- [ ] `cargo test --locked --workspace`
- [ ] Frontend/SDK checks (`pnpm check:dashboard`, `pnpm check:docs`, `pnpm check:catalog`, `pnpm check:api`) if applicable
- [ ] `python3 scripts/check-public-boundary.py --root . --tracked-tree --check-build-inputs`
- [ ] If UI routes changed: inspected rendered pages and interaction states in a browser at desktop and narrow viewports
- [ ] If SQL migrations changed: added a new migration file without altering released migrations (`python3 scripts/check-migration-history.py`)
