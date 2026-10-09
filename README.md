# Niu

Niu is an open-source model API gateway focused on lower-cost model access and transparent usage and billing. The repository is a mixed-language monorepo for the complete self-hosted product: gateway runtime, management dashboard, API contracts, SDKs, documentation, and release packaging.

The product is intended to cover the practical gateway lifecycle: connect model providers, expose compatible APIs, route requests, enforce identity and policy, observe usage, account for cost, manage keys and model offers, and operate the deployment. The current code is an early implementation and does not yet provide feature parity with established gateways.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/niu-io/niu)

The [Render Blueprint](render.yaml) provisions the gateway and a separate managed PostgreSQL database in your Render workspace. It uses paid compute plans; check [Render pricing](https://render.com/pricing) before deploying. You provide the OpenRouter API key privately during setup, and Render generates the admin token and vendor encryption key. Automatic deploys are off for button-created instances; trigger updates manually from Render.

## Simple model access

Configure a provider, issue a client key, and call the standard model API on port 2555. No task definitions, agent telemetry, benchmarks, subscriptions or pooling are required. See the [quickstart](apps/docs/src/content/docs/getting-started.mdx). Agent orchestration and task evaluation belong to external clients. Niu remains independently usable through its public APIs.

## Managed upstream vendors

Installation administrators enter through `/installation` using the administrator credential configured for the deployment. This administration page is separate from customer account sign-in at `/login`; account sign-in never falls back to an administrator-token form. Production customer account authentication remains a release requirement; the current username/password service is development-only.

Installation administrators can manage Suppliers such as OpenRouter and their model mappings in the dashboard. Configuration persists in PostgreSQL; new requests use current enabled state and routing. Provider credentials are encrypted with a separate `NIU_VENDOR_ENCRYPTION_KEY` deployment secret and are never returned by the API. Back up that key separately from the database. See [vendor architecture](docs/architecture/vendors.md) for access boundaries, static-route precedence and bootstrap semantics.

The gateway's PostgreSQL connection pool defaults to 10 connections per instance. Set `NIU_DATABASE_MAX_CONNECTIONS` from 1 to 256 to tune it for the database's connection limit and the number of gateway instances.

Concurrent unpriced requests share bounded PostgreSQL admission batches. Niu commits dispatch intent before calling a provider, then flushes usage evidence asynchronously after the response. Priced requests commit a bounded budget reservation before dispatch and queue provider usage and settlement in a bounded worker after completion. The worker batches completions by workspace to reduce database round trips and budget-row contention. Queue pressure applies backpressure; a storage failure leaves the durable attempt and reservation unresolved rather than inventing a charge.

## Current implementation

The repository is a mixed-language monorepo. `apps/gateway` is the Rust application entry point, `apps/catalog` contains the public model catalog, `apps/dashboard` is the workspace dashboard, and `apps/docs` is the static developer documentation site. `contracts` owns the public API schema, `crates` contains execution, benchmark, extension and cost components, and `vendor/litellm-rust` contains selected provider and protocol modules with upstream provenance.

The first gateway slice serves health, model-list, admin model-list, process counters, and OpenAI-compatible chat completion routes from one Rust HTTP process. Requests use configured public model names; provider endpoints and credentials remain server-side. Niu owns the OpenAI-compatible pass-through adapter; selected, pinned LiteLLM Rust modules provide native Anthropic and Bedrock transformations. Streaming is currently supported for configured OpenAI-compatible routes.

The Rust gateway redirects `/` to the workspace and serves documentation at `/docs/`, the explicitly published model catalog at `/models/`, workspace UI under `/workspaces/:workspace/…`, and APIs from the same HTTP listener. Dashboard, docs and catalog assets are built into one application image. The marketing homepage is maintained separately in `niu-io/website`; a hosted distribution supplies its pinned static artifact through `NIU_SITE_DIR` on the same domain. The public catalog lists only routes whose operator enables `public_catalog`; its API omits provider names, upstream IDs, endpoints and credentials. PostgreSQL stores organizations, projects, scoped API keys, operator sessions, managed vendors and routes, accounting records, and attempt evidence. Management endpoints create, rotate and revoke credentials; every dispatch rechecks permission and persists intent. Operator roles enforce tenant scope. Broader routing, provider conformance, subscription inference and production qualification remain in progress.

The public workspace retains historical paired benchmark analysis and a versioned Rust extension API with a synthetic reference extension. These existing components do not expand the current product scope into task orchestration or evaluation. The extension contract is tested independently, but the gateway does not load extensions yet. The API defines claim mapping rather than a full OIDC/SAML login flow, and the task adapter's required sandbox runner is not implemented.

The [Enterprise composition architecture](docs/architecture/enterprise-composition.md) defines how a pinned public Niu release is combined with private Enterprise services on the same `niu.io` domain, including module registration, service authentication, health, tenant context, and platform API ownership. The public Gateway includes an optional manifest-validated Unix-socket adapter, disabled when no Enterprise manifest is configured. Enterprise owns the service supervisor, verification-key distribution, private modules, and assembled Enterprise image.

The [first-release acceptance matrix](docs/releases/first-release.md) defines the complete product scope, enterprise extension boundary, implementation milestones, and required release evidence.

## Product goals

- **Lower-cost model access:** offer verified customer prices from qualified Suppliers, with explicit model capabilities and reliable delivery. Compare prices for specific models and usage patterns; do not imply universal savings or current competitive superiority.
- **Transparent consumption:** show where tokens and customer charges accumulate, including observable retries, latency, failures and unknown usage. Link potential waste to evidence and a change the user can try; high consumption alone does not prove waste.
- **Independent access:** applications and coding agents can use Niu without an orchestration product. Niu owns model requests; external clients own tasks, tools, reviews and outcomes.
- **Security and commercial boundaries:** preserve workspace isolation and credential ownership. Customer reports show customer charges; Supplier purchase prices and platform margins remain confidential.

The [product focus](docs/product/product-focus.md) defines the audience, commercial model, Supplier qualification, request-observability boundaries and scope exclusions. These are release targets, not claims that discounted supply is already available.

## Monorepo map

- `apps/gateway`: single-process inference and management API, static product routes, and recovery workers.
- `apps/catalog`: opt-in public model catalog.
- `apps/dashboard`: TypeScript management application, built as static assets.
- `apps/docs`: Astro Starlight developer documentation.
- `contracts`: versioned OpenAPI and shared protocol contracts.
- `crates`: Niu-owned execution, benchmark, extension and cost components.
- `vendor/litellm-rust`: individually selected LiteLLM Rust crates, pinned and checksummed.
- `sdks`: client SDKs for supported languages.
- `Dockerfile` and `compose.yaml`: container packaging for one application image and one public port.
- `docs/architecture`: product contracts, decisions, and implementation guides.
- `branding`: approved niu.io assets, portable theme tokens, and asset provenance.

## Development

Start the native open-source development stack (no Docker):

```sh
pnpm dev
```

This starts an isolated local PostgreSQL cluster, the Gateway, and the dashboard,
docs and catalog dev servers. Frontends hot reload; Rust changes rebuild and
restart the Gateway. Stop with Ctrl-C or `pnpm dev:stop`. See
[scripts/DEV.md](scripts/DEV.md) for prerequisites, URLs, credentials and logs.


The native gateway currently builds with Rust 1.98.0 or newer. The dashboard and docs use Node.js 24 or newer with pnpm 11.

```sh
pnpm install
pnpm build:dashboard
pnpm build:docs
pnpm build:catalog
cargo check --workspace
```

The gateway reads a TOML model configuration and runtime secrets from the environment. Start with [`config/niu.example.toml`](config/niu.example.toml) and [the development guide](apps/docs/src/content/docs/getting-started.mdx).

## License

Niu-owned code is released under the MIT License. Reused code keeps its original copyright, license, pinned source, and checksums in [third-party notices](THIRD-PARTY-NOTICES.md) and [the source manifest](vendor/litellm-rust/SOURCE-MANIFEST.json).

Local dashboard sign-in uses a persisted member account and the normal browser
session flow. The default development account is `demo@niu.io`; see the
[development guide](scripts/DEV.md) for its password and seed configuration.
Account profiles and workspace permissions behave as they do in the deployed
dashboard. Installation tokens are separate credentials for setup and automated
administration.
