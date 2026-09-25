# Third-party notices

## LiteLLM native runtime modules

Niu selectively imports the following Rust packages from the LiteLLM source tree. The source files and package manifests are preserved under `vendor/litellm-rust/crates/`; they are not a full repository mirror. Their exact per-package file counts and SHA-256 tree fingerprints are listed in [`vendor/litellm-rust/SOURCE-MANIFEST.json`](vendor/litellm-rust/SOURCE-MANIFEST.json).

- Source repository: <https://github.com/BerriAI/litellm>
- Source commit: `61953318bf4fd16393c4a2a60bf398d791cd1f19`
- Imported paths: `litellm-rust/crates/{auth,auth-types,auth-aws,auth-azure,auth-gcp,core,core-utils,coroutine,framer,host,http,llms,python-compat,secrets,secrets-types,secrets-aws,secrets-azure,secrets-cyberark,secrets-google,secrets-hashicorp,tracing,types}`
- License: MIT, preserved in [`vendor/litellm-rust/LICENSE`](vendor/litellm-rust/LICENSE)
- Source comparison: imported package files match the selected source checkout at the pinned commit; Niu has not edited those packages

Niu uses these packages as a provider and protocol layer inside its own gateway application. Niu owns the application entry point, route coordination, management APIs, console, API contracts, persistence, SDKs, and packaging. No upstream Python gateway, dashboard, enterprise tree, examples, full repository history, or full repository archive is included.

## LiteLLM Rust cost engine

`crates/cost/src/lib.rs` is copied without modification from `litellm-rust/crates/cost/src/lib.rs` in the LiteLLM source tree at commit `c19ce71bcdad234ca87a7af10cee45375ce811a8`.

- Source: <https://github.com/BerriAI/litellm/blob/c19ce71bcdad234ca87a7af10cee45375ce811a8/litellm-rust/crates/cost/src/lib.rs>
- SHA-256: `435ecf2f885fb6a36768872549258f6ad70d50f884be98062ef5c520c37d3ea0`
- License: MIT, under the source repository's root `LICENSE`

The pricing engine is a calculation component. Durable accounting and strict spending controls are Niu-owned work.

## shadcn/ui console components

The components in `apps/console/src/components/ui/` were selected from the official shadcn/ui new-york registry on 2026-09-25 using its CLI. They are adapted to the local class utility and niu.io theme. Upstream: https://github.com/shadcn-ui/ui. Copyright (c) 2023 shadcn, MIT; the full license is retained in `apps/console/licenses/shadcn-ui.txt`. Lucide React supplies the console icons through the package dependency.
