# Niu documentation

**Authoring direction:** Follow the [agent documentation contract](../../docs/development/agent-documentation.md) and [product principles](../../docs/product/agent-oriented-principles.md). The default human path is orientation plus agent-led onboarding; technical references primarily serve coding agents. Current site structure is not evidence that this refactoring has been completed.

The Astro/Starlight portal keeps tutorials in Docs. API and SDK are separate navigation scopes for generated references. The dashboard's Docs link opens the standalone portal in a new tab. Legacy `/help/` URLs redirect to the corresponding `/docs/` URLs.

## Source of truth and regeneration

From the repository root:

```sh
pnpm generate:api
pnpm check:api
pnpm --filter @niu-io/docs test:api
pnpm build:docs
```

`generate:api` first extracts the annotated Rust handler contracts, then runs `apps/docs/scripts/generate-api-docs.mjs`.

- REST pages under `src/content/docs/api/rest/` come from `contracts/openapi.yaml`, including referenced JSON/YAML contracts. The generator bundles local references into `contracts/generated/public-openapi.json`, validates every remaining reference, and publishes it at `/docs/openapi/public.json`. Authentication, declared parameters, body content types, response schemas and scope annotations are rendered per operation. The full contract includes explicit limitations and stub endpoints; generation is not runtime qualification.
- SDK pages under `src/content/docs/api/sdk/` come from the TypeScript compiler's declaration emit for `sdks/javascript/src/index.ts` and its public exports. Inferred returns and nested namespaces are included; private/protected members and implementation bodies are excluded. The SDK tutorial's TypeScript blocks are compiled against the same source.
- Tutorials under `src/content/docs/guides/` explain setup and usage. They are intentionally authored guides, not copies of interface definitions.

Do not edit generated references or bundled JSON. Change the SDK source or OpenAPI/handler contract, run regeneration, and review the resulting diff. Documentation builds and CI reject stale files. The generator test writes an isolated temporary output, checks public interfaces and referenced schemas, then verifies that tampered output fails `--check`.

Hosted `/compare/` pages belong to the separate website repository. The bundled `/docs/compare/` articles remain the community fallback, requiring no marketing source.
