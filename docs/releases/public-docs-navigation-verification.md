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
