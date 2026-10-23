# Security Policy

## Supported Versions

Niu follows Semantic Versioning (`vX.Y.Z`). Security fixes are applied to the latest minor release line and released as patch updates.

| Version | Supported |
| --- | --- |
| `0.2.x` | Yes |
| `< 0.2.0` | No |

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues, discussions, or pull requests.

Instead, report vulnerabilities privately through [GitHub Security Advisories](https://github.com/niu-io/niu/security/advisories/new). Include:

1. **Affected component and version**: e.g., `apps/gateway`, `crates/storage`, `apps/dashboard`, or `scripts/install.sh`, along with the output of `niu-gateway --version` or commit SHA.
2. **Impact**: What boundary or control is bypassed (e.g., workspace tenant isolation, Provider credential confidentiality, commercial data boundary, budget reservation enforcement, or authentication).
3. **Reproduction steps**: Minimal configuration, HTTP requests, or test case demonstrating the issue.

We acknowledge vulnerability reports within 3 business days and coordinate disclosure and patch releases before publishing advisory details.

## Security Architecture & Operational Boundaries

Self-hosted operators and contributors should preserve the following security invariants:

- **Provider Credential Encryption (`NIU_VENDOR_ENCRYPTION_KEY`)**: Upstream Provider API credentials stored in PostgreSQL are encrypted at rest using `NIU_VENDOR_ENCRYPTION_KEY`. Raw credentials are never returned by management or workspace APIs. Back up `NIU_VENDOR_ENCRYPTION_KEY` separately from database backups; rotating or losing this key without migrating credentials will prevent the gateway from decrypting stored Provider keys (`niu-gateway --check-encryption` verifies decryption before startup and during upgrades).
- **Separate Installation Administration (`NIU_ADMIN_TOKENS`)**: Platform installation and Provider management require explicit administrator credentials and are strictly separated from customer account sign-in (`/login`) and workspace-scoped API keys (`NIU_API_KEY`).
- **Workspace & Commercial Data Isolation**: Every control-plane (`/api/v1/workspaces/:workspace/...`) and data-plane (`/v1/...`) request enforces workspace membership, role scope, and key revocation state. Provider purchase rates, upstream costs, and platform margins are confidential platform data and must never be serialized in customer workspace responses, usage exports, or public catalog routes (`/catalog/v1/...`).
- **Public Repository Boundary**: Secrets, private keys, customer records, and local filesystem paths must never be committed to this repository. Run `python3 scripts/check-public-boundary.py --root . --tracked-tree --check-build-inputs` before opening a pull request.
