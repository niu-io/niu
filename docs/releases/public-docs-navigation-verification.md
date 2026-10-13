# Public documentation navigation and comparisons

October 13, 2026.

The public documentation portal now separates Docs, API, and Compare through the header and scoped sidebar. Docs groups existing articles into Start here, Use Niu, Operate Niu, and Advanced. The overview uses an ordered onboarding path and links to the relevant guides. Existing article URLs remain available. API retains its existing contracts and adds a focused reference directory.

Compare includes an overview matrix and Niu vs New API / OpenRouter articles. The information structure follows the inspected [ColliePWA comparison](https://colliepwa.dev/compare/moshi) and [Moshi comparison overview](https://getmoshi.app/compare): positioning, row-by-row differences, alternative strengths, Niu use cases, and a choice guide. Competitor descriptions are grounded in the linked official project documentation. Claims concern documented scope rather than measured parity, prices, or performance. Each comparison records its review date and Niu's qualification limits.

The existing Niu Stitch project and design system informed the public shell and table layout. Generated example capabilities, version numbers, and metrics were excluded. The installed shadcn Table primitives render comparison data; the existing DropdownMenu supplies theme choice. Mobile tables stack labeled product values within each feature, following Collie's reading pattern.

The model catalog and the independently built marketing repository link to the same-origin Docs, API, and Compare destinations. Marketing source remains outside this repository. No application subdomain or build dependency on marketing source was introduced.

## Verification

- Documentation build: 25 pages. Astro diagnostics: zero errors, warnings, or hints.
- Catalog and marketing artifact builds passed.
- Built Docs overview, API overview, comparison overview, and both comparison details were opened in a real Chromium browser at 1440px and 390px. Correct headings and viewport widths were checked. No document-level horizontal overflow was observed.
- Header navigation changed the article and reference sidebar. The mobile menu opened and navigated to Implemented API operations.
- Search opened, returned five indexed results for Supplier, and dismissed with Escape at both widths.
- Theme choice menu was inspected open at both widths; Dark and Light choices were exercised. Table contrast, first-column wrapping, and mobile caption width were corrected during review.
- Catalog navigation and marketing navigation were inspected at both widths, including the open marketing mobile menu. The static catalog has no live gateway model data in this preview; this review qualifies header navigation, not model retrieval.

No live gateway, dashboard Help iframe, inference request, or deployed hosted release is qualified by these static-artifact checks.

## Generated API/SDK references and independent Compare

The subsequent refinement separates Docs, API, SDK and Compare. API and SDK tutorials remain in the main Docs directory. Generated reference pages use the available article width without the general guide's right-hand table of contents.

The TypeScript compiler emits 309 public SDK export references. The complete OpenAPI root and its referenced contracts bundle into a self-contained JSON document and 343 operation references, organized into model, video/media, authentication, workspace/company, administration and service sections. Required parameters, request body media types, resolved schemas, response states and explicit scope annotations are preserved. Tutorial TypeScript examples compile against current SDK source. `pnpm generate:api` regenerates; `pnpm check:api`, the docs build, and CI reject stale output. An isolated generator test confirms stale-output rejection without modifying checked-in files.

Help supplies an explicit same-origin iframe embed marker. Standalone docs retain the header brand; embedded docs hide it and retain navigation/search/theme. Desktop and 390px browser checks of the real Dashboard shell with synthetic read-only session responses and built iframe assets confirmed a single rail brand, preserved Help URLs, and hidden docs brand after switching to SDK. This is frontend integration evidence, not live authentication qualification. The three Help navigation tests pass, including embed-marker removal from dashboard history.

Compare is now an independent Astro website section with a React matrix island and structured detail pages. The matrix has shadcn DropdownMenu product/category filters and a shadcn Table. Both menus, category filtering, alternative selection and both detail routes were exercised at 1440px and 390px with no document-level overflow. New API/OpenRouter source links and review dates remain explicit. The website build and Astro check pass. Marketing source remains in its separate repository.

The detail pages were subsequently rewritten around categorized feature tables and a separate requirements/fit table, following the supplied Collie and Moshi references. New API has 18 feature comparisons; OpenRouter has 16. Unsupported Niu endpoints and bounded retry behavior are explicit, and no performance or savings claims are made. The rebuilt pages and both matrix filter menus were rechecked at 1440px and 390px with no document-level overflow; the website's 20-file Astro check reported zero errors, warnings or hints.

The gateway composes `/compare/` only from the website artifact when configured, redirects the old hosted docs comparison URLs, and supplies documentation redirects for community installs without that artifact. Static routing regression cases were added, but the current execution environment has no Cargo/rustfmt toolchain; Rust route compilation and those new tests remain unverified here. The browser checks used separately served static artifacts and do not qualify gateway routing or deployment.

## Unified public shell and documentation home — 2026-10-14

Docs home now uses a Stitch-reviewed developer overview composition, based on the inspected OpenRouter documentation: short introduction, Quickstart/deployment actions, a real model-discovery command, grouped guides and distinct generated-reference links. The home-only TOC and pagination are disabled; ordinary articles retain their reading layout. Homepage-to-article Astro navigation was exercised.

Landing copy follows the current model-API product boundary. Removed visible Agent Ops, task-import/benchmark/fusion/subscription narratives and synthetic task previews. Supplier configuration, workspace spending, request/customer-charge evidence and supported text/video management replace them. Website README and claim guidance were reconciled. Actual offer savings and full video/commercial release qualification are not inferred from this content work.

The canonical public navigation and header geometry are in `branding/public-navigation.json` and `branding/public-header.css`. Docs and catalog consume those files directly. The independent website snapshots them and the Niu-specific public header composition, with a synchronization/hash-check script; builds do not require an adjacent checkout. Landing, Models, Docs, API, SDK and Compare were checked at 1440, 760 and 390 pixels. Browser measurements confirmed identical brand and navigation coordinates at desktop, consistent 64px single-row header geometry and no document overflow. Narrow headers hide desktop navigation/tools and expose one hamburger. Docs uses a floating bounded panel containing public links, search/theme and its article tree; other public pages use the installed shadcn DropdownMenu directly. Decorative arrows were removed from updated link/button content.

Browser checks exercised all narrow menu open states, Escape/outside dismissal, nested theme selection in Docs, mobile search, SDK/Compare navigation, persistent dark preference across section changes and the website search entry opening Docs search. Opening the Docs panel leaves the article heading bounding box unchanged. Website, Docs and catalog builds and Astro checks pass. This is frontend/static-artifact verification; no deployment or gateway route qualification is added.
