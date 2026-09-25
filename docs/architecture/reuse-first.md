# Selective reuse

Niu adopts independently reusable source files and modules when they reduce implementation effort without importing another project's full repository, history, or release assumptions.

Each adopted component records its source repository, exact commit, source path, checksum, license, and whether Niu changed the code. Preserve the applicable copyright and license terms. Review dependencies and build provenance before the component enters a public release.

Niu's first implementation includes a Niu-owned Rust gateway application and TypeScript management console. Selected LiteLLM native runtime packages supply provider and protocol functionality. The package set is pinned to `61953318bf4fd16393c4a2a60bf398d791cd1f19`; per-package source hashes are in [`SOURCE-MANIFEST.json`](../../vendor/litellm-rust/SOURCE-MANIFEST.json). The standalone `niu-cost` engine remains independently pinned to `c19ce71bcdad234ca87a7af10cee45375ce811a8`.

These imports are components of the complete Niu product. They do not replace the Niu gateway, access control, management API, console, storage, billing ledger, SDKs, or deployment packaging. See [third-party notices](../../THIRD-PARTY-NOTICES.md).

The existing niu.io assets and visual tokens remain the brand baseline. The hosted product and private enterprise feature code stay in their separate repository.
