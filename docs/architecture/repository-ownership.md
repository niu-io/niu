# Repository ownership

Repository boundaries and URL boundaries are independent. The hosted product uses one domain, `niu.io`, with no separate application subdomain.

| Repository | Owns | Public paths |
| --- | --- | --- |
| `niu-io/niu` | Public Gateway, console, model catalog, API contracts, SDKs, docs, tests, community image, shared brand assets and theme tokens | `/models/`, `/docs/`, `/workspaces/{workspace}/…`, `/v1/`, `/admin/v1/`, `/catalog/v1/` |
| `niu-io/website` | Marketing homepage, copy, illustrations, and marketing build | `/`, `/site-assets/`, `/_astro/`, favicon, robots and sitemap |
| Enterprise distribution | Private modules, SaaS integration, production release composition | `/enterprise/` and `/enterprise/api/v1/{module_id}/…` |

The public product builds from this checkout without website or private source. Its image serves the catalog, docs, console and APIs from one listener, with PostgreSQL as an external service. Its root redirects to the default workspace. Builds use checked-in brand assets and theme tokens under `branding/`.

The hosted distribution pins immutable Niu and website commits and installs the separately built artifacts into distinct directories. Set `NIU_SITE_DIR` to the website output and `NIU_CATALOG_DIR` to the product catalog output. The Gateway serves both on its existing public listener. Website assets never overwrite catalog, console, or docs assets; website content is not a fallback for unknown APIs or workspace routes. Marketing changes require rebuilding and deploying the composed artifact; this is not runtime remote code loading.

Keep cross-product navigation relative to the origin: `/models/`, `/docs/`, and `/workspaces/default/`. Production canonical URLs use `https://niu.io`. Website brand snapshots retain attribution and record the Niu revision from which they were copied; the Niu `branding/` directory remains the shared theme source.

The private Enterprise distribution composes independently versioned private services beside the pinned public core. The public service boundary, module registration, health checks and tenant context are specified in [Enterprise composition and service boundaries](enterprise-composition.md). Community operation requires no private module, supervisor, or license service.
