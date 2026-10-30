# Architecture security review — 2026-10-30

This dated evidence record supports Beads `niu-32s.2` under `niu-32s`. Current work state remains in Beads.

## Scope and finding

Reviewed baseline `282dd68` and the current working changes. Inspected gateway member authentication, cookie Origin and Fetch Metadata validation, durable session authorization, member management, forwarded client identity, and the Codex OAuth callback and identity-validation boundaries. The separate upstream review covers provider transport and media fetching.

The confirmed finding was a missing authority boundary on management of platform administrators. Customer Owner scope was sufficient to reach the password-reset and session-issuance methods for a platform administrator in the same company. Those methods could provide the platform identity's credentials. Session and identity revocation, password configuration, session listing and audit retrieval used the same incomplete management gate. The finding was confirmed from the current source; no production takeover was attempted. It is separate from the existing shared-demo configuration finding `niu-4ir`.

## Change

- `apps/gateway/src/admin.rs` now resolves management targets through `operator_for_management`. Platform targets require current platform authority in addition to the existing role and tenant-scope checks. Unauthorized targets return 404.
- `crates/storage/src/operators.rs` rechecks and locks the target inside session creation, session revocation and identity revocation transactions. A concurrent platform grant cannot pass through an earlier gateway check.
- `crates/storage/src/password_logins.rs` uses the same transactional guard for password reset. A platform member can still change their own password with current-password proof. Installation management remains available.
- The existing role-change transaction already rejects platform targets; that restriction remains in place.

No API credential fields, tenant scope or platform grants were changed by this implementation.

## Current-input verification

Ran the actual native gateway over TCP with an isolated PostgreSQL database, newly generated identities and credentials, and real API requests. The final run used the rebuilt gateway after the request-body-deadline change from the same architecture review. It was restarted before the final run. No external model or payment calls were made. Fixture-test outcomes were not used.

Final native binary SHA-256: `23b3c68331f4e57d6db0be3747bb1bd0304260323933e0ef1149d55f65da32bf`.

| Operation | Observed result |
| --- | --- |
| Customer Owner reads a protected member's sessions, password configuration or audit events | 404 through both `/api/v1` and `/admin/v1` |
| Customer Owner creates a protected member's session, resets their password, revokes their session or revokes their identity | 404 through both route prefixes |
| Customer Owner reads and manages an ordinary member's sessions, sets their password and revokes their identity | Expected 200, 201 and 204 responses; mutations persisted |
| Customer Owner repeats ordinary session/identity revocation, issues a session for a revoked ordinary identity or resets its password | Existing 409 responses preserved |
| Installation administrator issues a session for a missing identity or revokes a missing identity | Existing 409 responses preserved |
| Customer Owner reads a protected identity after installation revocation | Still 404 |
| Installation administrator sets a protected member's password, issues and revokes a session, reads password configuration and revokes the identity | Expected 200, 201 and 204 responses; mutations persisted |
| Platform Owner issues a protected member's session within the existing company scope | 201 |
| Customer Owner reads `/api/v1/platform/configuration` | 403 |
| Platform member with Viewer customer role reads that platform endpoint | 200 |
| Protected member signs in through `/api/v1/auth/browser/login` and accesses `/api/v1/session` with the resulting cookie and matching Origin | 200 |
| Same cookie is sent with a different Origin and cross-site Fetch Metadata | 403 |
| Protected member changes their own password with current-password proof | 200; the old cookie then receives 401 |

For each of the four mutations—session issuance, password reset, session revocation and identity revocation—a separate concurrent run held an uncommitted platform grant in PostgreSQL. The real gateway first observed the ordinary target and then waited on the target row lock, as independently observed through `pg_stat_activity`. After the grant committed, each HTTP mutation returned 401. No requested mutation persisted.

Independent PostgreSQL inspection compared the protected identity, password revision and fingerprint, session metadata and audit count before and after the denied operations. They were unchanged. A separate final database query confirmed that each concurrent-grant target retained its original single active session, had no password credential, remained active, and retained the committed platform grant. The successful ordinary-member and installation operations were also confirmed in the final database state. Secrets and credential fingerprints remain outside this public record.

The private local evidence includes the actual request observations, independent database comparisons, native binary digest, server logs and the executable verification script. Formatting and `git diff --check` were also run. These checks are distinct from the HTTP and persisted-state evidence above.

## Limits

This verification covers the implemented member-management boundary in the local native gateway and PostgreSQL runtime. It does not verify the current production deployment, production demo permissions, an external OAuth provider, provider-network security or every authorization path in the product. No UI was changed. No source commit, remote publication or deployment was performed by this scoped review.
