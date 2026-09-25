# Niu

Niu is an open-source Agent Observability and Benchmark platform with an integrated AI gateway, focused on task quality, performance and total cost, with security as its foundation. The repository is a mixed-language monorepo for the complete self-hosted product: gateway runtime, management console, API contracts, SDKs, documentation, and release packaging.

The product is intended to cover the practical gateway lifecycle: connect model providers, expose compatible APIs, route requests, enforce identity and policy, observe usage, account for cost, manage keys and model offers, and operate the deployment. The current code is an early implementation and does not yet provide feature parity with established gateways.

## Current implementation

The repository now has a monorepo layout. `apps/gateway` is the Rust application entry point, `apps/console` is the niu.io-branded TypeScript console, and `apps/docs` is the static developer documentation site. `contracts` owns the public API schema, `crates` contains the shared execution contract and selected cost calculation package, and `vendor/litellm-rust` contains selected provider and protocol modules with upstream provenance.

The first gateway slice serves health, model-list, admin model-list, process counters, and OpenAI-compatible chat completion routes from one Rust HTTP process. Requests use configured public model names; provider endpoints and credentials remain server-side. Niu owns the OpenAI-compatible pass-through adapter; selected, pinned LiteLLM Rust modules provide native Anthropic and Bedrock transformations. Streaming is currently supported for configured OpenAI-compatible routes.

The console connects to the admin model-list endpoint and uses the existing niu.io visual tokens and logo. The Starlight site documents the full product direction and clearly marks capabilities that are not implemented. PostgreSQL now stores organizations, projects, scoped API keys and attempt evidence. Bootstrap management endpoints create and revoke keys; every dispatch rechecks permission and persists intent. Operator roles, durable financial accounting, budgets, route editing, the broader protocol surface, and production qualification remain in progress.

The next product slice is standalone, metadata-only execution collection and task investigation: task → agent/subagent → step → model/tool invocation → validation/outcome. Subscription visibility is the first use case. This workflow will not require inference forwarding, account pooling or Enterprise policies. It is a release target, not a claim that the current request-level console already implements agent observability.

The [first-release acceptance matrix](docs/releases/first-release.md) defines the complete product scope, enterprise extension boundary, implementation milestones, and required release evidence.

## Product goals

- **Performance:** measure latency, time to first token, throughput, success rate, and resource use across the complete request path.
- **Cost:** manage provider spend, retry exposure, customer accounting, deployment resources, and operational effort.
- **Security foundation:** preserve tenant authorization, credential ownership, data boundaries, and required policy checks while optimizing performance and cost.

## Monorepo map

- `apps/gateway`: single-process inference and management API, static console serving, and recovery workers.
- `apps/console`: TypeScript management application, built as static assets.
- `apps/docs`: Astro Starlight developer documentation.
- `contracts`: versioned OpenAPI and shared protocol contracts.
- `crates`: Niu-owned shared execution contracts and cost components.
- `vendor/litellm-rust`: individually selected LiteLLM Rust crates, pinned and checksummed.
- `sdks`: client SDKs for supported languages.
- `Dockerfile` and `compose.yaml`: container packaging for one application image and one public port.
- `docs/architecture`: product contracts, decisions, and implementation guides.
- `branding`: approved niu.io assets, portable theme tokens, and asset provenance.

## Development

The native gateway currently builds with Rust 1.98.0 or newer. The console and docs use Node.js 24 or newer with pnpm 11.

```sh
pnpm install
pnpm build:console
pnpm build:docs
cargo check --workspace
```

The gateway reads a TOML model configuration and runtime secrets from the environment. Start with [`config/niu.example.toml`](config/niu.example.toml) and [the development guide](apps/docs/src/content/docs/getting-started.mdx).

## License

Niu-owned code is released under the MIT License. Reused code keeps its original copyright, license, pinned source, and checksums in [third-party notices](THIRD-PARTY-NOTICES.md) and [the source manifest](vendor/litellm-rust/SOURCE-MANIFEST.json).
