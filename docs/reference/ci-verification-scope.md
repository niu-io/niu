# CI verification scope

Niu separates blocking build checks from fixture execution. Fixture outcomes have
zero evidentiary value, whether positive or negative. They do not establish a
defect, regression, performance result, acceptance or release readiness.

## Blocking checks

Backend checks retain formatting, import integrity, generated API consistency,
Clippy and compilation of all workspace test targets without executing them.
Public build checks also retain dependency-license checks, dashboard/docs/catalog
and SDK/MCP type checks and builds, public-boundary scans, released migration
immutability, container construction and inspection of the final runtime assets.
Compilation checks establish only that the checked source compiles.

Released SQL migration files remain byte-for-byte identical to their published
tag. The guardrail rejection-context correction is appended as migration `0352`,
instead of rewriting released migration `0333`. An isolated PostgreSQL 17 run
applied the released schema followed by the appended migration; independent
catalog inspection confirmed the resulting function's volatility and diagnostic
scope/revision fields. This verifies that bounded schema transition, not a
deployed gateway's behavior or a complete release.

## Fixture diagnostics

The reusable `fixtures.yml` workflow executes the existing Rust, PostgreSQL,
Python, dashboard, documentation-generation and SDK/MCP fixture commands. It is
called by the public build workflow and can also be dispatched manually. Its
jobs and execution steps are explicitly non-gating. Each command runs separately
so that one command cannot prevent later commands from being executed. These
jobs do not load production credentials or access an existing application
database; PostgreSQL and detector credentials are disposable CI resources.

Package smoke and upgrade commands use mock upstreams. They remain available as
non-gating fixture diagnostics after blocking image construction and artifact
inspection. Neither their execution nor any outcome qualifies a deployed
application or an upgrade. Raw command logs remain available in Actions; do not
use their outcomes for decisions or claims.

## Acceptance

A green build is not release approval. Integrated behavior requires actual
current-input end-to-end execution and independent verification of its final
artifacts, with the deployed revision and exercised scope recorded. Missing
evidence remains unverified. The [first-release plan](../releases/first-release.md)
retains the product acceptance requirements independently of CI status.
