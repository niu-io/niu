# Native open-source development

Run `pnpm dev` from the repository root. Requires PostgreSQL 17 tools on PATH,
Rust 1.98 or newer, Python 3, Node 24 or newer, and pnpm 11. An installed Rust 1.98
rustup toolchain is detected when cargo is not on PATH.

The launcher installs locked JS dependencies, builds the Gateway and static
dashboard, documentation, and catalog, then starts the Gateway, Vite dashboard and its isolated
PostgreSQL database. The application is available from one URL:

- Dashboard, API, documentation, and catalog: http://127.0.0.1:2566/

The dashboard signs in with a persisted member account using the normal password
and browser-session APIs. The default account email is `demo@niu.io`; its generated
password is stored in the private state directory's `dev-password` file. To seed
the requested demo credential, set `NIU_DEV_USERNAME=demo@niu.io` and
`NIU_DEV_PASSWORD=Hello123` in the ignored repository-root `.env` file before the
first launch. This seed-only password exception does not change the production
password policy. Startup preserves existing passwords, profile edits, roles,
and revoked accounts rather than resetting them from `.env`.

The seeded member owns the default workspace's organization. It has a real profile
and tenant-scoped permissions; it does not receive installation-wide authority.
Development allows HTTP browser cookies only on loopback, while production account
sign-in still requires HTTPS. The former local administrator login and token-injection
proxy have been removed. Installation tokens remain separate API credentials for
explicit setup and automated administration.

The dashboard serves live source with Vite HMR on port 2566. API, account sign-in,
docs and public catalog requests are proxied to the loopback-only Gateway on
port 2567. Use the single application URL above; port 2555 is not used. Rust
source, Cargo manifests and SQL migrations are watched; successful builds restart
the Gateway, while failed builds leave the previous binary running. Documentation
and catalog source changes are included at startup; restart the launcher after
editing them.

Use `pnpm dev -- --packaged` to verify the built product directly through the
Gateway on port 2566 without Vite. In that mode dashboard edits rebuild the package
and require a refresh. `pnpm dev -- --no-watch` disables Rust watching; dashboard
HMR remains enabled in the default mode. The legacy `--hmr` flag is accepted but
unnecessary.

The dedicated PostgreSQL instance listens only on loopback port 55433 with
password authentication. It uses its own unprivileged application role and database.
New private state and service logs live in `~/.local/state/niu/dev/` with owner-only
permissions. The model registry starts empty; add a Supplier through the dashboard for
inference. No provider credentials are required just to start development.

Stop everything with Ctrl-C or `pnpm dev:stop`. Data remains for the next launch.
Existing legacy state in `/tmp/niu-core-dev-<uid>/` is retained until explicitly
moved while stopped; temporary legacy state remains vulnerable to OS cleanup.
The launcher does not silently create a replacement for an incomplete cluster.
Back up development data and its private encryption configuration. Occupied
app ports fail explicitly; unrelated servers are never stopped. Use `--no-watch`
to disable Rust watching, or `--packaged` for packaged-product verification.

The launcher reads `.env` from the repository root. It accepts `NIU_ADMIN_TOKENS`,
`NIU_VENDOR_ENCRYPTION_KEY`, `NIU_DEV_USERNAME`, `NIU_DEV_PASSWORD`, and its managed
database URLs. Database URLs must match the isolated cluster; external database
overrides are rejected. Other variables are ignored. Values are literal, with no
shell execution or variable expansion. Restart `pnpm dev` after editing `.env`.
Keep the file private and Git-ignored.

## OpenRouter demo rates

OpenRouter is one optional demo Supplier. After saving its Supplier business, API key and model mappings, use its current public input/output token rates for test offers. Keep the installation administrator token in the private environment; never commit it.

```sh
python3 scripts/seed-openrouter-offers.py --vendor-name OpenRouter --check
python3 scripts/seed-openrouter-offers.py --vendor-name OpenRouter --refresh-rates
```

These commands use `NIU_ADMIN_TOKEN` and optional `NIU_ADMIN_URL` (default `http://127.0.0.1:2566`). Replace the example name with the exact saved API-key configuration name. An explicit name is required when multiple OpenRouter configurations exist. `--check` makes read-only requests and rejects missing mappings, missing offers, changed prices or incorrect Supplier ownership. `--refresh-rates` publishes revision-checked test rates, preserving historical revisions and pausing changed offers. It does not qualify or activate offers, issue inference requests, set customer tariffs or establish a discount. Rates are obtained from the [public model catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties); compatibility and commercial qualification remain separate.
