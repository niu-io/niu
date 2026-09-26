# Native open-source development

Run `pnpm dev` from the repository root. Requires PostgreSQL 17 tools on PATH,
Rust 1.98 or newer, Python 3, Node 24 or newer, and pnpm 11. An installed Rust 1.98
rustup toolchain is detected when cargo is not on PATH.

The launcher installs locked JS dependencies, builds the Gateway and static
fallback assets, and starts all processes without containers or global service
changes. The first build can take several minutes.

- Console and gateway API: http://127.0.0.1:2555/workspaces/default/
- Documentation HMR: http://127.0.0.1:4324/docs/
- Public catalog HMR: http://127.0.0.1:4325/models/

The console is the only browser entry for the local product. It proxies API calls to the loopback gateway service and signs the local development session in automatically; do not open the internal gateway port directly.

Static fallback assets refresh on launcher startup. Use the HMR URLs for frontend
editing. Rust source, Cargo manifests and SQL migrations are watched; successful
builds restart the Gateway, while failed builds leave the previous binary running.
Restart the launcher after changing dependencies or startup configuration.

The dedicated PostgreSQL instance listens only on loopback port 55433 with
password authentication. It uses its own unprivileged application role and database.
Private state and service logs live in `/tmp/niu-core-dev-<uid>/` with owner-only
permissions. The console signs in to the local gateway automatically; no token
copying is needed. The model registry starts empty; add a vendor through the
console for inference. No provider credentials are required just to start development.

Stop everything with Ctrl-C or `pnpm dev:stop`. Data remains for the next launch,
but the OS can clear `/tmp`; this is a disposable development database. Occupied
app ports fail explicitly; unrelated servers are never stopped. Do not run two
stacks on the same app ports. `pnpm dev --no-watch` disables Rust watching.

The launcher reads `.env` from the repository root. It accepts `NIU_ADMIN_TOKENS`,
`NIU_VENDOR_ENCRYPTION_KEY`, and its managed database URLs. Database URLs must match
the isolated cluster; external database overrides are rejected. Other variables
are ignored. Values are literal, with no shell execution or variable expansion.
Restart `pnpm dev` after editing `.env`. Keep the file private and Git-ignored.
