# Niu

Niu is an open source AI gateway focused on performance and cost, with security as its foundation.

This repository is the public project. The first implementation step is selective reuse of small, independently licensed components alongside Niu's own design. It is not a wholesale mirror of another gateway repository.

## Current status

The workspace currently contains a native model-pricing engine in `crates/cost`, adopted from LiteLLM's Rust cost crate. The engine is designed for provider pricing with service tiers, cache usage, thresholds, regional multipliers, and UTC off-peak windows. The source and license are recorded in [third-party notices](THIRD-PARTY-NOTICES.md).

The gateway service, management console, provider registry, database schema, and container image are not implemented in this repository yet. The architecture documents describe intended behavior, not shipped capabilities.

## Project direction

- **Performance:** measure latency, time to first token, throughput, success rate, and resource use on the complete request path.
- **Cost:** measure provider spend, retry overhead, deployment resources, and operational effort against equivalent task requirements.
- **Security foundation:** preserve tenant authorization, credential ownership, data boundaries, and required policy checks while optimizing performance and cost.

## Repository map

- `crates/cost`: selected pricing calculation component.
- `docs/architecture`: English design specifications for the gateway, request lifecycle, cost accounting, and single-container deployment.
- `branding`: NIU.IO assets, theme tokens, and asset provenance.

## Development

A Rust toolchain compatible with Rust 1.88 or newer is required.

```sh
cargo check --workspace
```

The workspace has no runtime dependencies today. The application runtime and its build instructions will be added with the first gateway vertical slice.

## License

Niu-owned code is released under the MIT License. Reused components retain their existing notices; see [LICENSE](LICENSE) and [third-party notices](THIRD-PARTY-NOTICES.md).
