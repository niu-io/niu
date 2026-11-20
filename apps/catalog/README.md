# Catalog assets

This package publishes brand files for `/catalog-assets/` and the community favicon. The signed-in model catalog is the dashboard route `/models/`. There is no public browsing page.

From the repository root, use `pnpm build:catalog`. The Gateway reads the output through `NIU_CATALOG_DIR` (default `apps/catalog/dist`; community image `/app/catalog`).

The marketing homepage is maintained in the separate `niu-io/website` repository. A composed distribution serves its independent artifact through `NIU_SITE_DIR`, keeping all product pages on `niu.io`. Community builds require no website checkout. See [repository ownership](../../docs/architecture/repository-ownership.md).

`scripts/sync-brand.mjs` copies canonical brand assets and attribution from `branding/`. Geist font notices and Niu brand attribution are retained in static assets.
