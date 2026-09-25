# Selective reuse

Niu adopts independently reusable source files and modules when they reduce implementation effort without importing another project's full repository, history, or release assumptions.

Each adopted component records its source repository, exact commit, source path, checksum, license, and whether Niu changed the code. Preserve the applicable copyright and license terms. Review dependencies and build provenance before the component enters a public release.

The first adopted source module is `niu-cost`, based on LiteLLM's standalone Rust cost engine at commit `c19ce71bcdad234ca87a7af10cee45375ce811a8`. The Rust file is unchanged and has no external runtime dependencies. Niu supplies its own workspace, package name, API gateway, provider lifecycle, storage, and product behavior around this module. See [third-party notices](../../THIRD-PARTY-NOTICES.md).

The existing NIU.IO assets and visual tokens remain the brand baseline. The hosted product and private enterprise feature code stay in their separate repository.
