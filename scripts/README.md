# Repository scripts

Run the public development stack with `pnpm dev`; `pnpm dev:stop` stops the launcher while retaining its database. See the [local development guide](../apps/docs/src/content/docs/guides/local-development.mdx) for private runtime configuration and setup.

`pnpm generate:api` extracts handler annotations and regenerates the bundled OpenAPI and SDK/REST reference. `pnpm check:api` checks those artifacts for source drift. These checks do not qualify live API behavior; use actual current inputs and independently reopen the final records or artifacts.

Release version commands are exposed as `pnpm version:check`, `pnpm version:set` and `pnpm version:notes`. The release workflow runs `release-guard.py` against actual GitHub state before publication. It refuses an existing release or a tag/source mismatch, and never replaces published assets. Credentials belong in private environment configuration.

External execution-record import and paired-benchmark analysis are retired from the current product surface. There is no supported import CLI or current Gateway import/read/delete API. Historical database records remain retained; see the [archived interchange contract](../docs/architecture/execution-observation.md) for their meaning.
