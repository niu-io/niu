# Public site

This Astro application owns the niu.io homepage and public model catalog. The Rust gateway serves its static output on the same listener as the workspace console, documentation, and APIs.

## Development

Use Node.js 22.12 or newer and pnpm 11.25.0 from the repository root.

```sh
pnpm dev:site
pnpm check:site
pnpm build:site
```

The site uses root-domain routes: `/`, `/models/`, `/docs/`, and `/workspaces/:workspace/`. It does not have a separate deployment target. Canonical URLs use `https://niu.io`; product navigation stays on the same host.

## Structure

- `src/pages/index.astro`: product story, illustrative task evidence, and release status.
- `src/pages/models/index.astro`: the operator-controlled public model catalog.
- `src/components/`: shared site chrome and focused interactive product examples.
- `src/content/`: benchmark examples and reviewed public copy.
- `src/styles/global.css`: responsive site presentation layered over `branding/tokens.css`.
- `scripts/sync-brand.mjs`: copies the canonical logo, favicon, and attribution into Astro's static assets before development or build.

The landing page source was merged from `niu-io/website` through commit `0d494d9`. Niu-authored website code remains MIT licensed in `LICENSE`. Geist font notices and Niu brand-art attribution are included in the generated site. The separate website deployment workflows and internal editorial research were not brought into this public product tree.

Product claims separate implemented workflows from planned release work. Benchmark tables and dashboard mockups are labeled as hypothetical or synthetic and do not execute model requests.
