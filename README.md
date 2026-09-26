# Niu

Niu is an open-source Agent Observability and Benchmark platform with an integrated AI gateway, focused on task quality, performance and total cost, with security as its foundation. The repository is a mixed-language monorepo for the complete self-hosted product: gateway runtime, management console, API contracts, SDKs, documentation, and release packaging.

The product is intended to cover the practical gateway lifecycle: connect model providers, expose compatible APIs, route requests, enforce identity and policy, observe usage, account for cost, manage keys and model offers, and operate the deployment. The current code is an early implementation and does not yet provide feature parity with established gateways.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/niu-io/niu)

The [Render Blueprint](render.yaml) provisions the gateway and a separate managed PostgreSQL database in your Render workspace. It uses paid compute plans; check [Render pricing](https://render.com/pricing) before deploying. You provide the OpenRouter API key privately during setup, and Render generates the admin token and vendor encryption key. Automatic deploys are off for button-created instances; trigger updates manually from Render.

## Simple model access

Configure a provider, issue a client key, and call the standard model API on port 2555. No task definitions, agent telemetry, benchmarks, subscriptions or pooling are required. See the [quickstart](apps/docs/src/content/docs/getting-started.mdx). Advanced observation and evaluation are optional workflows in the same product.

## Managed upstream vendors

Installation administrators can manage vendors such as OpenRouter and their model mappings in the console. Configuration persists in PostgreSQL; new requests use current enabled state and routing. Provider credentials are encrypted with a separate `NIU_VENDOR_ENCRYPTION_KEY` deployment secret and are never returned by the API. Back up that key separately from the database. See [vendor architecture](docs/architecture/vendors.md) for access boundaries, static-route precedence and bootstrap semantics.

## Current implementation

The repository is a mixed-language monorepo. `apps/gateway` is the Rust application entry point, `apps/catalog` contains the public model catalog, `apps/console` is the workspace console, and `apps/docs` is the static developer documentation site. `contracts` owns the public API schema, `crates` contains execution, benchmark, extension and cost components, and `vendor/litellm-rust` contains selected provider and protocol modules with upstream provenance.

The first gateway slice serves health, model-list, admin model-list, process counters, and OpenAI-compatible chat completion routes from one Rust HTTP process. Requests use configured public model names; provider endpoints and credentials remain server-side. Niu owns the OpenAI-compatible pass-through adapter; selected, pinned LiteLLM Rust modules provide native Anthropic and Bedrock transformations. Streaming is currently supported for configured OpenAI-compatible routes.

The Rust gateway redirects `/` to the workspace and serves documentation at `/docs/`, the explicitly published model catalog at `/models/`, workspace UI under `/workspaces/:workspace/…`, and APIs from the same HTTP listener. Console, docs and catalog assets are built into one application image. The marketing homepage is maintained separately in `niu-io/website`; a hosted distribution supplies its pinned static artifact through `NIU_SITE_DIR` on the same domain. The public catalog lists only routes whose operator enables `public_catalog`; its API omits provider names, upstream IDs, endpoints and credentials. PostgreSQL stores organizations, projects, scoped API keys, operator sessions, managed vendors and routes, accounting records, and attempt evidence. Management endpoints create, rotate and revoke credentials; every dispatch rechecks permission and persists intent. Operator roles enforce tenant scope. Broader routing, provider conformance, subscription inference and production qualification remain in progress.

The public workspace also contains paired benchmark analysis and a versioned Rust extension API with a synthetic reference extension. The extension contract is tested independently, but the gateway does not load extensions yet. The API defines claim mapping rather than a full OIDC/SAML login flow, and the task adapter's required sandbox runner is not implemented.

The [Enterprise composition architecture](docs/architecture/enterprise-composition.md) defines how a pinned public Niu release is combined with private Enterprise services on the same `niu.io` domain, including module registration, service authentication, health, tenant context, and platform API ownership. The public Gateway includes an optional manifest-validated Unix-socket adapter, disabled when no Enterprise manifest is configured. Enterprise owns the service supervisor, verification-key distribution, private modules, and assembled Enterprise image.

The [first-release acceptance matrix](docs/releases/first-release.md) defines the complete product scope, enterprise extension boundary, implementation milestones, and required release evidence.

## Product goals

- **Performance:** measure latency, time to first token, throughput, success rate, and resource use across the complete request path.
- **Cost:** manage provider spend, retry exposure, customer accounting, deployment resources, and operational effort.
- **Security foundation:** preserve tenant authorization, credential ownership, data boundaries, and required policy checks while optimizing performance and cost.

## Monorepo map

- `apps/gateway`: single-process inference and management API, static product routes, and recovery workers.
- `apps/catalog`: opt-in public model catalog.
- `apps/console`: TypeScript management application, built as static assets.
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

This starts an isolated local PostgreSQL cluster, the Gateway, and the console,
docs and catalog dev servers. Frontends hot reload; Rust changes rebuild and
restart the Gateway. Stop with Ctrl-C or `pnpm dev:stop`. See
[scripts/DEV.md](scripts/DEV.md) for prerequisites, URLs, credentials and logs.


The native gateway currently builds with Rust 1.98.0 or newer. The console and docs use Node.js 24 or newer with pnpm 11.

```sh
pnpm install
pnpm build:console
pnpm build:docs
pnpm build:catalog
cargo check --workspace
```

The gateway reads a TOML model configuration and runtime secrets from the environment. Start with [`config/niu.example.toml`](config/niu.example.toml) and [the development guide](apps/docs/src/content/docs/getting-started.mdx).

## License

Niu-owned code is released under the MIT License. Reused code keeps its original copyright, license, pinned source, and checksums in [third-party notices](THIRD-PARTY-NOTICES.md) and [the source manifest](vendor/litellm-rust/SOURCE-MANIFEST.json).

Local console sign-in is automatic when started with `pnpm dev`. The loopback-only
Vite proxy uses `NIU_ADMIN_TOKENS` from the development environment and gives the
browser a temporary proxy credential, including after refresh. The real admin token
is never included in the console build. This shortcut is unavailable in production
and for remote or cross-origin requests; deployed consoles still require sign-in.
