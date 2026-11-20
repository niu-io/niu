# CI verification scope

CI separates checks of current source and built artifacts from fixture commands.
Fixture outcomes have zero signal: disregard success, failure, counts and duration
when diagnosing defects, assessing behavior or deciding release readiness.

## Blocking source, build and artifact checks

The public build workflow (`.github/workflows/ci.yml`) runs on pull requests,
pushes to `main`, tags and manual dispatch. Its blocking checks cover:

- Rust formatting, selective-import integrity, generated handler contracts,
  dependency licenses, Clippy and compilation of workspace test targets without
  executing them (`cargo test --no-run`).
- The tracked public-source boundary, actual installed JavaScript dependency
  licenses, current operator-documentation commands and paths, untranslated-copy
  checks, dashboard lint, types and production build.
- Generated API consistency, documentation and catalog checks/builds, documentation
  audience links, and inspection of the actual built documentation HTML and
  OpenAPI artifacts (`node apps/docs/scripts/verify-built-docs.mjs`).
- JavaScript SDK, Agent Connect and MCP typechecks and builds.
- Released migration immutability, container builds, runtime user and required
  files, and the public-boundary scan of extracted final image assets.

The package job depends on the Rust and web jobs, not the fixture workflow.
The backend workflow (`backend.yml`) runs formatting, import/contract checks,
Clippy and compilation on matching backend pull requests and `main` pushes, or
manual dispatch. It does not execute behavioral fixture suites as blocking steps.
Other contract, documentation and SDK workflows retain their source/build checks.
These checks establish only their stated static or artifact properties; they do
not establish integrated behavior or staging acceptance.

The operator-documentation command uses Python's unittest runner to inspect the
current repository documents. It checks source consistency, without provisioning
synthetic product data, and does not establish runtime route behavior.

## Non-gating fixture commands

`fixtures.yml` is callable and manually dispatchable. Each fixture job and command
uses `continue-on-error: true`. It retains Rust workspace, PostgreSQL storage,
gateway, recovery and performance commands, plus Python, license-inventory,
localization, documentation-navigation/generation, dashboard, SDK and MCP commands.
The presence of a real PostgreSQL service does not turn synthetic fixture inputs
into current-input end-to-end evidence.

Mock-upstream package smoke, Compose persistence and upgrade scripts remain
non-gating diagnostic commands in the package job. Record only their execution;
do not interpret their outcomes or use the aggregate workflow result as evidence
of runtime correctness. Fixture maintenance does not alter this rule.

## Release acceptance

Release-branch pushes do not automatically trigger every public build workflow.
Dispatch the required workflows on the exact `release/<minor>` tip, check that
run revisions match, and inspect the applicable source/build/artifact steps
separately from fixture diagnostics. A green aggregate is not release acceptance.

Deploy that same candidate to staging. Assess integrated behavior only through
actual current-input end-to-end runs and independent verification of their final
artifacts. Record the revision, environment, input, observed result and limits.
This includes real authorization and workspace isolation, customer charges and
ledger effects, saved outputs and recovery where required by the release scope.
Check `/readyz` and `/healthz` on the actual deployment; a healthy endpoint alone
does not establish business-flow correctness. If the required evidence is absent,
the behavior remains unverified. Follow the branch model and current release gate
before tagging or promoting to production.
