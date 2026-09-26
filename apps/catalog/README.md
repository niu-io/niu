# Public model catalog

This Astro application owns `/models/`, `/catalog-assets/`, and `/_catalog/`. It lists only model aliases explicitly published by the gateway operator and loads metadata from the same-origin `/catalog/v1/models` API.

From the repository root, use `pnpm dev:catalog`, `pnpm check:catalog`, and `pnpm build:catalog`. The Gateway reads the output through `NIU_CATALOG_DIR` (default `apps/catalog/dist`; community image `/app/catalog`).

The marketing homepage is maintained in the separate `niu-io/website` repository. A composed distribution serves its independent artifact through `NIU_SITE_DIR`, keeping all product pages on `niu.io`. Community builds require no website checkout. See [repository ownership](../../docs/architecture/repository-ownership.md).

Structure: `src/pages/models/` defines the route, `src/components/` contains shared chrome, `src/layouts/` provides metadata, and `src/styles/` applies Niu's checked-in theme. `scripts/sync-brand.mjs` copies canonical brand assets and attribution from `branding/`. Geist font notices and Niu brand attribution are retained in static assets.
