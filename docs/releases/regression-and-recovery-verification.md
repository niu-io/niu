# Regression and native database recovery verification

**Current package evidence:** the [0178 checkpoint](package-qualification-2026-10-08.md) covers direct/Compose recovery, encrypted listing fixtures and a distinct 0174 → 0178 upgrade. Older package entries below remain historical; full release gates remain open.

## Gateway benchmark response bounds — 2026-10-07

The load client now drains responses in chunks of at most 64 KiB instead of
retaining the entire body. `--max-response-bytes` defaults to 1 MiB and is
recorded in report metadata. Crossing that limit closes the connection and
records `ResponseTooLarge`; even an HTTP 200 header cannot turn an oversized
response into a successful measurement. The limit applies during warm-up and
both measured load modes. It is a byte bound, not a new wall-clock deadline;
the existing socket timeout remains unchanged.

Actual loopback HTTP tests verify rejection one byte above the configured bound
and success exactly at it, alongside the latency-population cases. All 15
gateway/Guardrail benchmark harness tests pass. This protects the measurement
client; it does not qualify gateway response limits or production performance.

## Gateway benchmark latency populations — 2026-10-07

The HTTP load client previously combined successful responses and HTTP errors in
its latency distribution. It now preserves the aggregate `latency_ms` for
compatibility, labels its population explicitly, and reports
`successful_http_latency_ms` and `failed_http_latency_ms` separately, including
sample counts. Transport errors remain separately counted and are not assigned
fabricated response latencies. An empty population has null percentiles.

Loopback HTTP fixtures exercise mixed 200/429 responses in scheduled-rate and
fixed-concurrency modes and an all-503 run. They verify response population
counts and that unsuccessful runs retain the nonzero exit status. Together with
the existing synthetic Guardrail preview harness suite, 13 tests pass. These are
measurement-harness checks, not measured Niu inference overhead, TTFT, CPU/RSS,
external-detector cost or production rollout thresholds. F09/F10 performance
qualification remains open.

## Combined dashboard and public-boundary checkpoint — 2026-10-07

A fresh `pnpm --dir apps/dashboard test --maxWorkers=2` run passed **489 tests
across 77 files** in the current worktree. Dashboard type checking passed.
This includes the Settings return-context regression and the CNY/USD funding
intent tests; it does not establish live payment settlement, real Supplier
qualification or new rendered-browser acceptance. No Agent Observability source
was changed for this check.

`python3 scripts/check-public-boundary.py --tracked-tree --check-build-inputs`
passed across **1,278 files**, including the Docker build-input rules. Docker
and Podman were still unavailable on PATH, so packaged install/restart/upgrade
acceptance remains unqualified. Full F01–F10 completion remains open.

## Buffered-output decision confidentiality — 2026-10-03

The fresh PostgreSQL buffered-output regression passed with explicit checks that recorded decision metadata excludes the synthetic matched content for redaction, blocking and indeterminate inspections. Oversized and unsupported-content responses also retain confirmed Provider completion and reported token usage. Existing assertions reconcile six incurred customer charges separately from procurement expenses, release reservations, retain sanitized response content and prove no output-denial retries or fallback. This qualifies those fixture boundaries; streaming modes, external detectors and full live/packaged Guardrail acceptance remain open.

## Unsupported Guardrail activation regression — 2026-10-03

At this checkpoint, the routed workspace-policy regression attempted to replace an active policy with windowed output, observe-only output, an external detector configuration and a hard-budget field. Each unsupported draft returns HTTP 400, omits the synthetic detector credential from its error, and leaves the complete saved active policy and revision unchanged. The fresh PostgreSQL gateway test passed, alongside public-boundary and changed-file whitespace checks. This verifies rejection and atomic preservation only; it does not implement or qualify those required modes, detectors or budgets. F09 remains open.

The later [output observation implementation](output-observation-verification.md) supersedes the observe-only rejection checkpoint. The [required input detector implementation](required-input-detector-verification.md) also supersedes blanket detector rejection for explicitly authorized, declared unmetered services. Windowed output inspection, external output detectors and hard-budget fields remain unsupported.

Development checkpoints, 2026-10-02–03. These checks strengthen F02/F05/F06/F09/F10 evidence; they do not close the full release gates.

## Current SDK and benchmark checkpoint — 2026-10-03

Fresh main JavaScript SDK type checking, build and all 66 tests passed. Agent Connect type checking, build and all 12 tests also passed. Their fixtures cover scoped transport, exact accounting values, stream interruption, explicit errors and connector configuration; they do not establish real third-party agent version compatibility or complete packaged first use.

The freshly packed main SDK includes model/key customer-charge summaries, delivery-status summaries and HTTP-status filters in its declarations. Its extracted ESM entry imports successfully without workspace dependencies. The tarball SHA-256 is `ef948a0c1aa2beaca73ff35243660655b87678477ededd70c336bd5fc8cf75b5`. This is an artifact/import checkpoint, not live qualification of every packaged example.

The CI paired-experiment fixture command completed successfully. Its synthetic records exercise evaluator calculations and explicit limitations; they do not prove production performance, causal savings, commercial discounts or task execution capabilities. Full F10 remains open.

### Updated packaged read-only examples

After adding delivery-status coverage, gateway-body percentiles and repeated-cursor rejection to the usage example, all 69 SDK tests passed. The three new process-level fixtures verify filtered pagination, first-page summary consistency, exact money above JavaScript's safe integer range, null timing, omission of request content and credentials, looping-cursor rejection and authorization failure without a successful partial report.

The rebuilt and extracted SDK tarball has SHA-256 `5fe4da87be4a40a3ad875f2b53c8d123c2d6253efc528485b9bb5d9618971004`. Its usage example ran against the development API: 35 traversed requests, 25 complete gateway timing samples, and exact agreement with the API's token, customer-charge, delivery-status and percentile summaries. No inference calls or configuration writes were made. All 30 extracted package files passed the public-boundary scan.

The extracted billing example also ran successfully and reconciled the one existing invoice's line amounts, with explicitly limited latest-100 invoice coverage. The policy-history example successfully handled this workspace's empty recorded policy history and left unrequested key history null. That empty-history check does not qualify a populated history workflow; its pagination and authorization behavior remain covered by fixtures. These read-only examples ran using installation administration credentials, so ordinary-role packaged acceptance remains open. This supersedes the earlier artifact hash for the changed usage example, without closing F10.

### Workspace-reader packaged acceptance

The same three extracted examples subsequently ran using a newly issued, ten-minute workspace-scoped Viewer session rather than the installation credential. Usage, billing and policy-history reads succeeded in its assigned workspace. Each example rejected an existing different workspace without printing a report; no credential appeared in its output or error. The temporary identity was revoked in cleanup, and another usage run with its revoked session was rejected without a report. No inference calls, customer-key changes or invoice mutations occurred.

This supersedes the missing ordinary-role evidence for these three read-only examples. It qualifies their live read authorization, foreign-workspace rejection and revoked-session rejection only; it does not qualify the dashboard's role-management journey, populated policy-history navigation, other examples, session-expiry behavior or clean container installation. F02/F10 remain incomplete.

### Natural session-expiry acceptance

A separate workspace-scoped Viewer was issued with the supported minimum 60-second session lifetime. The extracted usage example succeeded while that session was valid. After 62 seconds without changing its expiry or database records, the same example failed without printing a report, and a direct scoped request returned HTTP 401. Installation-authorized reads confirmed that request counts and exact customer-charge summaries were unchanged. The temporary identity was revoked in cleanup; no inference calls were made.

Seven existing dashboard development-authentication and gateway-recovery tests also passed. This closes the missing natural-expiry evidence for the packaged workspace-reader API path, not the browser's expiry/re-login/destination-restoration workflow or the full F02 gate. Those rendered acceptance requirements remain open.

### Rendered demo sign-out and destination restoration

In the running port-2566 browser, the account menu's Sign out action was followed by direct navigation to Logs with `status=delivery_failed`. Protected navigation redirected to the regular Login page. Submitting the preserved demo username/password through the actual Sign in button returned to the exact Logs route and query filter. Reload retained the authenticated Logs page and destination. This verifies the local demo's sign-out, password sign-in, destination restoration and reload path; it does not qualify browser expiry or ordinary scoped-role navigation.

The account-menu inspection also found an outstanding UI defect: duplicate organization names expose their internal identifiers. This requires correction before navigation qualification. F02 and the complete release remain open.

The identifier suffix was subsequently removed from organization menu labels. Selection remains bound to the unchanged internal organization key and the installed menu's checked indicator; the displayed label is the saved organization name. The actual OpenRouter account-switch menu was inspected before this correction and uses account names without identifier suffixes. Niu's existing menu layout and icon gutter were preserved. The open menu was inspected at desktop and 390-pixel widths, with no identifiers in its visible text and all actions fitting within the viewport. Duplicate saved names remain duplicate labels; this correction does not invent distinguishing business information or rename saved organizations.

## Regression coverage

- `pnpm --filter @niu-io/dashboard test`: 155 tests passed across 32 files, including the existing Supplier, workspace, authentication, Chat, Logs and Billing fixtures. These simulated tests do not replace real browser workflows.
- `cargo test --locked --workspace -- --include-ignored`: all workspace tests passed against local PostgreSQL, including the 121 gateway tests, restart integration and storage suites. Ignored PostgreSQL tests were enabled, not silently skipped.
- `python3 -m unittest discover -s scripts/tests`: 16 development/packaging/seed-script tests passed. Container execution remains unqualified.

## Consistent timing aggregates

The request-range average now uses only complete gateway body-consumption measurements, matching the samples used by P50/P95/P99. Historical dispatch-to-completion intervals remain available per request but are excluded from this average because their measurement boundary differs. Missing and interrupted timings remain unknown rather than contributing zero or a partial interval.

The PostgreSQL fixture verifies 100 ms and 300 ms complete timings average to 200 ms, excluding a 10,000 ms interrupted sample and a 7 ms legacy interval. Empty/interrupted/legacy-only ranges return null latency. The gateway fixture covers more than 100 requests across pagination, filters and foreign-workspace reads. The full gateway suite and all 47 JavaScript SDK tests passed; the running API reported matching average/percentile sample counts and the Logs page was inspected after sign-in on port 2566. This does not qualify percentile presentation, narrow-screen performance diagnosis or the full F06 workflow.

## Native database recovery

A custom-format `pg_dump` of the development database was restored with `pg_restore --exit-on-error` into a disposable database on the same local PostgreSQL service. Fingerprints (row counts plus ordered row-content hashes) matched for workspace, API-service, model mapping, API-key, customer-tariff/revision, charge and invoice/entry tables: nine tables total.

The restored database retained encrypted Supplier credentials, scoped keys, immutable customer rates, the real test request charge and invoice accounting. The original database was unchanged. The restored database and private backup were removed after verification; no dump, credentials, IDs or fingerprints enter the public repository.

This establishes a native PostgreSQL recovery checkpoint only. It does not verify restoration into a clean packaged deployment, a different PostgreSQL version, external backups, application restart on the restored database, or container upgrade/rollback. Those remain F01/F10 requirements, along with the real desktop/mobile customer workflows and qualified Supplier supply.

## Request timing persistence and release checks

Request timing persistence now takes a named `RequestTimingRecord` instead of seven positional fields. All three callers retain the same optional dispatch/header/first-output stages, total duration, completion flag and HTTP status. No database schema or serialized response changed. Fresh PostgreSQL tests passed for complete-timing averages excluding interruptions and for chronological gateway activity pagination with timing metadata. Storage Clippy passed with warnings denied across all targets. Public-boundary and diff-whitespace checks passed for the affected files.

Fresh release checks also verified 22 selectively imported crates and the standalone cost-engine checksum, all 16 Python script tests, and the license inventory of 566 installed JavaScript package versions. The system Python lacks `tomllib`; import verification passed using Python 3.14, matching CI. Docker and Podman are still unavailable, so image qualification remains open. The full workspace lint run still fails on gateway lint findings (nested conditionals, positional admission arguments, a cloned test slice and a test lock held across awaits); this is not a release lint pass.

## Workspace lint cleanup

A fresh `cargo clippy --locked --workspace --all-targets -- -D warnings` passed after replacing positional inference admission arguments with `AttemptRequest`, simplifying equivalent nested conditions, removing an unnecessary cloned preset slice, and giving the captured-request test mutex a lexical scope before asynchronous reads. Chat, Responses and Embeddings retain their original model, completion bound, task reference, inspected snapshot, request body and protocol. No lint suppression was added.

The gateway suite passed all 132 tests, including PostgreSQL integration, plus the process-replacement integration test. Coverage includes access/input/output guardrails, streaming/customer response sanitization, admission/accounting and authentication. Public-boundary checks passed for all 15 affected files, and diff-whitespace checks passed.

Formatting differences outside the separate Agent Observability workstream were fixed. The remaining whole-workspace formatting differences are in its observation administration module and Codex report tests; those files were deliberately left to that workstream. Full formatting, container, license and release qualification remain open. This supersedes the previous gateway lint failure checkpoint, without marking F10 or the complete release passed.

## Public artifact builds and Rust license audit

Fresh dashboard, documentation and catalog production builds passed using the current worktree. Documentation generated 14 routes and its Pagefind index; the catalog generated its model route and assets. A public-boundary scan passed across all 210 generated dashboard/docs/catalog files. Documentation emitted the existing Astro head-inject bundling warning; build success does not qualify rendered navigation or every document interaction. These are local production artifacts, not a container-install pass or a replacement for the port-2566 development server.

The exact CI-pinned `cargo-deny` 0.20.2 was installed outside the repository and `cargo-deny check licenses` passed with `licenses ok`. The existing permissive allowlist and package-scoped certificate-data exceptions were unchanged. Alongside the JavaScript inventory and import verification above, this qualifies the current dependency-license checks; full F10 still requires formatting reconciliation, packaged runtime, protocol, performance and responsive acceptance.

## Durable request-content deletion

Fixed a payload-retention race: a late asynchronous capture could previously reinsert explicitly deleted request content. Migration 0065 adds a content-free deletion marker. Capture and scoped deletion serialize on the attempt row; capture checks the marker using a fresh transaction snapshot after acquiring that lock. Deletion creates the marker and removes content atomically, including deletion before any content has been captured. Missing or cross-workspace attempts do not create markers. No accounting table or customer-charge logic changed.

All three PostgreSQL payload tests passed: scope/expiry/size/accounting-record preservation, bounded cleanup with locked rows, and 12 concurrent capture/deletion cases including pre-capture deletion and late retries. All 132 gateway tests plus process replacement passed. Storage Clippy passed with warnings denied, public-boundary checks passed, and migration 0065 is applied in the live development database. This qualifies durable payload-deletion behavior; full retention, backup deletion, all data classes and F09 remain open.

The payload API authorization regression also passed after extending it for durable deletion: inference credentials cannot read retained content, workspace readers cannot delete it, and a writer scoped to another workspace cannot delete or create a suppression marker. An authorized reader sees the initial content with `no-store`; after an authorized deletion and a late capture write, the API still returns null with `no-store`. Repeated authorized deletion returns 204 and retains exactly one marker. This uses real scoped administration credentials and PostgreSQL via the routed API, not a mocked authorization result. The attempt remains present. Public-boundary and diff-whitespace checks passed.

## Full storage regression after migration 0065

A fresh `cargo test --locked -p niu-storage --tests -- --include-ignored` completed against PostgreSQL after the deletion change: 55 tests passed across 14 suites, with zero failures and zero skipped tests. Each PostgreSQL fixture applied the current migration set, including 0065. Coverage includes activity timing, billing, Chat persistence, Guardrail lock ordering and policy activation/dispatch attribution, session expiry/revocation, administration audit, Provider/Supplier isolation, and payload retention/deletion. The separate agent-storage suites ran without source changes; their passing fixtures do not qualify native collection or that workstream’s UI.

This verifies migration application and storage regression in native PostgreSQL. It does not prove packaged install, previous-image upgrade, backup recovery, discounted supply, the complete inference matrix, performance thresholds or the full release. Those gates remain open.

## Package command confidentiality — 2026-10-03

Package install and upgrade test failures now report only the Docker operation and exit status. Secret-bearing arguments and engine output are excluded from exceptions. Five package-script unit tests passed, covering both scripts' failure messages, unchecked upgrade failures and migration selection. Importing the install test no longer starts containers or cleanup. Docker and Podman are still unavailable in this environment, so these checks do not qualify packaged install, upgrade or recovery and do not close F01/F10.

### Upgrade credential and grant acceptance

The pinned-image upgrade verifier now checks the original workspace key identity and name, absence of its secret from management reads, and successful model discovery using its original issued credential. The granted catalog must contain exactly the configured upgrade-test model. These checks run on the previous package before migration and on the new package afterward, preventing a surviving row count from concealing a replaced key, unusable credential or changed access.

Eight package-script unit tests passed, including rejection of a replacement key, missing or different model access, extra ungranted models, and command-error confidentiality. Changed-file whitespace checks passed. Docker, Podman and Colima remain unavailable; no pinned-image upgrade was executed. This strengthens the acceptance command but does not qualify packaged upgrade, restore or F01/F10.

### Packaged token-category reporting

The current main SDK rebuilt successfully and all 69 tests passed. A new tarball was extracted outside the workspace; its ESM entry imported without source dependencies, and its declarations include nullable cache/reasoning counts and independent coverage fields. SHA-256: `cc9482dcc2c4c246c4ea44b391ce97276bc05b3e8d625998be0a94096dd84146`. All 30 extracted files passed the public-boundary scan.

The exact packed usage example, using the documented administration base including `/admin/v1`, traversed all 35 saved requests and matched the live API's exact input/output totals, customer charges and category summary. Both category sums were null with 35 unknown observations; no historical values were fabricated. An initial invocation omitted the documented API suffix and was rejected; the corrected invocation passed. No inference, configuration changes or billing writes occurred.

This supersedes the earlier artifact hash for the new reporting fields. This run used installation administration access and does not requalify ordinary-role expiry/revocation against the changed artifact. Full packaged gateway installation, protocol/category coverage and F10 acceptance remain open.

### Local inspection worker recovery

All 11 local-input inspection tests passed with a new real-deadline fixture and a synthetic worker-panic fixture. Capacity stays reserved after the five-second response deadline until blocking computation finishes; excess work is rejected without queuing. Failed workers release capacity, and successful follow-up work proves recovery. Gateway Clippy passed for all targets with warnings denied. See [worker recovery coverage](../reference/local-input-inspection.md#worker-deadline-and-failure-recovery) for limits; this does not close external-detector, live-overload, performance or full F09/F10 acceptance.

### Rendered workspace-key lifecycle

A fresh running-dashboard walkthrough created a named temporary workspace key from the API-key dialog. The one-time secret was displayed and privately retained only for verification, then dismissed. Its inference model discovery succeeded, while using it for workspace key management was rejected. The browser rotation confirmation completed: the original secret returned HTTP 401 immediately and the replacement discovered eligible models.

At 390px, the active replacement's Revoke action opened a visually inspected confirmation that fitted the viewport. Confirming revocation and reloading preserved both revoked records and removed their actions; the one-time secret was absent. Both secrets then returned HTTP 401. The saved Default demo key remained active, request history stayed at 35, and private temporary credential files were removed. No inference was sent and no Supplier configuration changed.

This used an installation-admin browser session and the normal dialog's all-configured-model grant. It qualifies this workspace-scoped creation/rotation/revocation journey, not restricted-model creation, cross-workspace data access, reader/writer UI, natural expiry, Chat first-use or full F02/F03 acceptance. Revoked audit records remain saved intentionally.


### SDK artifact and full regression checkpoint

The main SDK rebuilt and passed all 70 tests. The new tarball's SHA-256 is `91fe6dd32ce5056b4d1c734d9ea686caada3fba787e8658b0fc431c0108ad79f`, superseding the earlier token-category artifact. Its extracted ESM entry imported without workspace source dependencies; declarations include `niu_api_key_v1` and nullable token-category coverage. All 30 distributed files passed the public-boundary scan.

All 70 SDK tests also passed against the extracted distribution, including unchanged preset transport for input/output preview, exact accounting values and packaged examples. The first isolated run passed 69 tests and failed only because the test harness referenced a repository contract fixture absent from its temporary location. Copying that existing fixture beside the external test harness and updating only the harness's fixture URL resolved the failure; the packed distribution was unchanged. These are transport and fixture checks, not external model qualification or live ordinary-role acceptance.

The full dashboard suite passed 225 tests. The default gateway run passed 79 tests and skipped 71 PostgreSQL cases; its separate process-restart test was also skipped. Two focused Supplier PostgreSQL regressions were explicitly run and passed, covering multi-model keys, shared business ownership, independent dispatch, rotation, reload and disablement. Docker, Podman and Colima are unavailable, so packaged install, upgrade and recovery remain unqualified. This checkpoint does not close any full F01–F10 gate.

### Full PostgreSQL regression after token categories and Niu-key preset

Fresh locked gateway and storage runs explicitly included ignored tests against native PostgreSQL. All 150 gateway tests and the separate process-replacement test passed with zero skipped cases. All 61 storage tests passed (13 unit tests and 48 integration tests), also with zero skipped cases. Fixtures applied the current migration set, including request-token categories. Coverage includes cross-workspace authorization, key and session expiry/revocation, Supplier ownership and independent credentials, exact customer/Supplier accounting, scoped exports, policy-change races, input/output denial attribution, worker recovery, and durable payload deletion. Token-category regressions cover unknown observations, immutable bounded subsets, transactional completion and exact aggregates beyond ordinary integer ranges.

The agent-storage tests ran without source edits; they do not qualify the separately owned collector or UI. These regression results supersede the skipped-test default checkpoint for the named native database suites. They do not qualify container packaging, a previous-image upgrade, a new backup/restore exercise, real external model/discounted supply, ordinary-role rendered workflows or the complete release.


### Single-model key setup handoff

The dedicated new-key page now offers Open Chat for a key granting one model, matching Chat's existing one-to-four-model behavior. Its link explicitly starts a new draft while retaining backend history. Previously it withheld the action for one model; reopening the latest conversation could also select an unrelated model, leaving no granted model selected. Setup guidance now distinguishes global Supplier/model configuration from workspace key access and server-held Supplier credentials.

The actual OpenRouter Chat surface was inspected, including its one-or-more-model description, new-chat action and composer. Desktop browser verification created a temporary single-model key and showed the updated action; the destination loaded a fresh draft with the key selected, one model selected and existing history preserved. Read-only model discovery exposed only the granted model, inference-key management access returned 401, and cleanup revoked the key; subsequent discovery returned 401. The temporary private credential file was deleted. No inference or Supplier configuration writes occurred.

All 12 focused key/Chat dashboard tests and dashboard typechecking passed. New cases verify the single-model handoff, explicit new draft, retained server history and usable single-model composer. Responsive verification remains open: the supported viewport override reported success but both reviewed tabs still measured 1280 by 720, so this checkpoint does not claim a narrow rendered pass. Both temporary overrides were reset. Ordinary-role browser acceptance and full F02/F03/F10 remain open.

### Current-schema native restore and gateway restart

A fresh custom-format PostgreSQL backup used an exported repeatable-read snapshot. All 68 public tables matched the restored database by row count and ordered row-content fingerprint, including migration 0072, encrypted Supplier credentials, workspace keys, customer accounting, history and retained-content records. Fingerprints and backup content stayed private. The running database was read only throughout the check.

Two gateway processes started sequentially against the disposable restored database without bootstrap credentials. Both became ready and authenticated administration reads returned the saved Supplier configurations and workspace keys. An initial startup with the launcher's old generated encryption key failed explicitly; using the deployment's configured encryption key made both startups pass. No credentials were changed or reencrypted to bypass that failure. This demonstrates why the separate encryption-key backup is required in addition to PostgreSQL.

Both processes exited, and the restored database and private backup were removed. No inference was sent. This supersedes the earlier nine-table recovery checkpoint for native same-version restoration and adds application startup/restart acceptance. Clean container deployment, cross-version PostgreSQL recovery, previous-image upgrade and the full F01/F10 gates remain open.

### Current-worktree regression checkpoint — 2026-10-03

A fresh locked run of `cargo test --locked -p niu-gateway -p niu-storage --tests -- --include-ignored` passed against native PostgreSQL: 157 gateway tests, one separate process-restart test and 63 storage tests, with zero failures and zero skipped cases. The full dashboard suite passed 227 tests across 41 files.

The current fixtures cover Supplier multi-key dispatch and stale credential updates; workspace-key rotation, grant preservation and revocation; scoped request exports; customer pricing and invoice reconciliation; session expiry and revocation; policy-change races; retained-content deletion; token categories; and streaming framing and terminal-event handling. These are regression fixtures and the existing process-restart scenario, not new real upstream qualification or a new packaged deployment. Agent-storage fixtures ran without edits to the separately owned Agent Observability pages or collector.

Gateway compilation reported unused-import/dead-code warnings in its Codex integration. This run therefore does not establish a warning-free build or Clippy gate. Native regression success also does not close packaged installation/upgrade, discounted Supplier rights, the real protocol/model matrix, ordinary-role rendered journeys, responsive navigation or any complete F01–F10 gate. Those requirements remain open.

### Package failure-path confidentiality — 2026-10-04

Readiness failures in both package verifiers now omit raw response bodies, transport exception text and container logs. The install verifier's Provider probe reports only its exit code, and failed packaged inference reports only its HTTP status without reading/publishing upstream bodies or appending logs. The injected-migration-failure check still inspects its expected marker internally without publishing logs.

All 31 release-script unit tests passed. Added failure fixtures cover unexpected readiness bodies, transport failures, early container exit, failed Provider probes and inference HTTP failures; private sentinel values do not enter their raised error messages. Inference errors also suppress the underlying exception context. Changed-file whitespace checks passed. These are failure-path and script regression checks, not a container run. Docker, Podman and Colima remain unavailable, so F01/F10 packaged install and upgrade acceptance remains open.

### Public source and browser artifacts — 2026-10-04

The current source/build-input boundary scan passed over 961 files. The JavaScript license inventory passed for 566 package versions. Fresh Dashboard, Docs and Catalog production builds passed; a subsequent public-boundary scan passed across 210 generated files. The dashboard initially failed because a Supplier subscription row passed a string to the existing ProviderLogo identity contract; using the shared identity resolver corrected that build error.

The running Supplier page was inspected after signing in and loaded its saved OpenRouter configuration. No subscription accounts were connected, so this does not verify a populated subscription row or its logo. The concurrently added private Codex subscription pool is outside the current first-release exclusions and remains a scope reconciliation issue, not an accepted release capability. Agent Observability pages and collection were not edited.

These checks prove bounded source/artifact hygiene, dependency-license policy and local production compilation. They do not prove independent container installation, all responsive interactions, subscription authorization, or full release readiness.

### Upgrade management-read credential boundary — 2026-10-04

The previous/new-package persistence verifier now rejects credential fields recursively in workspace-key management responses, including nested arrays and case variants. Comparing only the original issued token value could miss a leaked hash or different secret. The new negative fixtures cover token, secret, credential, API-key and API-key-hash fields. All 32 release-script unit tests passed; no container upgrade was run.

A source audit also found that Chat finish reasons are present in returned/retained response payloads but absent from durable request-summary and export contracts. F06 therefore explicitly retains payload-independent finish/stop-reason collection and reporting as remaining work. Retained payload inspection is not equivalent to durable completion metadata, especially after opt-out or retention expiry.

### Development session negative-path qualification — 2026-10-04

Seven local development authentication middleware integration tests and Dashboard typechecking passed. Fresh cases exercise real HTTP requests for explicit sign-out, replayed cookies and admin markers, independent concurrent sessions, expiration at the eight-hour boundary and cross-origin sign-in/sign-out rejection. Expiration removes the server-side session: moving the test clock back does not revive the cookie. Rejected cross-origin sign-out leaves the legitimate session usable.

The existing cases also verify signed-out page redirects, password rejection, HttpOnly/SameSite cookie issuance and the requirement that the development admin marker accompany its signed-in cookie. These checks use an isolated middleware server and synthetic credentials; they neither sign out the live demo user nor qualify production account persistence, destination restoration or the ordinary-role browser journey. No product UI changed in this checkpoint. F02 remains open.

### Safe sign-in destinations — 2026-10-04

The shared return-path validator now rejects external URLs, protocol-relative URLs, backslashes, control characters, paths outside a configured base and login loops. The legacy development middleware carries the requested path and query to sign-in. The current React sign-in route accepts validated navigation state or an explicit return URL, preserving state precedence and falling back to the default workspace.

All 16 focused authentication/navigation tests passed: nine middleware tests, five current-route restoration cases and two existing protected workspace redirect cases. Dashboard typechecking passed. These include preserved queries/fragments, unsafe return rejection and nested base paths. The standard development launcher uses gateway-backed sign-in; middleware fixtures do not substitute for that runtime.

On the running gateway-backed product at port 2566, the demo user signed out, opened a protected workspace Keys URL with a query, signed in using the actual password form and returned to exactly that URL. The signed-in session also restored an explicit Models destination and retained its search query. Sign-in was visually inspected at 1280 and 390 pixels; the phone document width matched its viewport, with readable labels and no clipping. No new layout or controls were introduced. The browser session was restored after the review. This does not close production authentication or ordinary-role browser acceptance.

### Quick-start workflow alignment — 2026-10-04

The quick-start now describes Supplier configuration, global Models, workspace creation/key issuance and Logs/Usage/Billing investigation. It removes obsolete project-key and Tasks instructions and separates customer charges from Supplier expenses and subscription estimates. Container port 2555 and development port 2566 are explicit. The single-container routing guide no longer places model supply under a workspace.

The documentation production build passed. Four shell blocks parsed with `bash -n`, and referenced documentation pages exist in the generated artifact. The rebuilt quick-start was inspected through the running product at 1280 and 390 pixels: readable wrapping, document width matching the viewport and a functioning phone navigation menu. These checks validate the documentation and its rendered layout, not clean container installation or every example against a newly installed upstream route. The build emitted existing Astro directive and missing 404-entry warnings; this is not a warning-free build gate.

### Current dashboard and Rust lint checkpoint — 2026-10-04

The full Dashboard suite passed 243 tests across 43 files. After routine formatting of shared gateway/storage files and an equivalent collapsed Origin check, `cargo clippy --locked --workspace --all-targets -- -D warnings` passed with Rust 1.98.0. The check covers compilation and linting, not fresh live inference or commercial qualification of the concurrently added subscription integration.

The full formatting check still reports two import-layout differences in the separately owned Agent Observability administration module. That module was deliberately not changed in this workstream, so the repository-wide formatting gate remains open. Docker, Podman and Colima were again absent from the executable search path; no container install or upgrade run was claimed.

### PostgreSQL regression refresh — 2026-10-04

A fresh `cargo test --locked -p niu-gateway -p niu-storage --tests -- --include-ignored` run completed successfully against native PostgreSQL: 167 gateway tests, one separate process-restart test and 68 storage tests, with zero failed or ignored cases. This includes the new key-dispatch activity, scoped metadata read, finish-reason storage and Guardrail audit/cancellation fixtures alongside existing billing, isolation and credential lifecycle regressions.

All 32 release-script tests also passed under Python 3.14. One test emitted a resource-cleanup warning; the run is not claimed as warning-free. Selective-import verification passed for 22 attributed crates and the cost-engine checksum. These results refresh regression evidence across the current worktree; they do not establish clean container deployment, the real protocol/model matrix, discounted supply rights or complete F01–F10 acceptance.

### Upstream budget documentation boundary — 2026-10-04

The API reference and model-pricing guide now identify legacy budget/cost endpoints as installation-only upstream procurement controls, separate from customer tariffs and invoice charges. Removed stale claims that ordinary workspace readers can access those records, that customer Usage creates procurement budgets, or that unpriced dispatch bypasses an existing budget. The quick-start now describes the held-reservation requirement consistently.

The current backend independently applies platform authorization to budget/cost reads and budget creation. The fresh PostgreSQL regression above passed the customer-confidentiality and buffered-output accounting fixtures, including denial of unreserved unpriced dispatch in a budgeted workspace. Documentation preserves the important limitation: qualified Provider billing bounds are required and actual overrun liability remains recorded.

The documentation build and 57-file generated-artifact boundary scan passed. The corrected API reference was inspected at 1280 and 390 pixels, and the pricing guide at 390 pixels; text and endpoint paths wrap without document overflow. No new layout or customer spending-limit capability was introduced. Full supported budget guarantees and F09 qualification remain open.

### Storage migration regression — 2026-10-06

Fresh native PostgreSQL ran `cargo test -p niu-storage --tests -- --include-ignored --test-threads=1` against isolated databases containing migrations through 0091. All 89 tests passed: 17 unit tests and 72 integration tests, with zero failed or ignored cases. Coverage includes workspace isolation, session revocation, credential rotation, Supplier configuration/settlement, Guardrail admission/auditing, retained-content deletion, customer billing, top-up settlement and durable creation claims. The isolated server stopped successfully after the run; the existing development database was not used or reset.

This refresh qualifies the storage regression subset only. It does not establish gateway checkout orchestration, live payment collection, clean container deployment or any complete F01–F10 gate. Tests for the separately owned Agent Observability storage ran without editing its implementation and do not establish that feature's browser or real subscription acceptance.

### Payment closure and account-login regression refresh — 2026-10-06

Fresh native PostgreSQL ran the complete storage suite through migration 0096: all 92 tests passed (17 unit and 75 integration), with no failed or ignored tests. The isolated server stopped successfully; existing development data was not used or reset. This includes terminal payment closure, settlement exclusion and recovery selection alongside existing isolation, accounting, Supplier, Guardrail and retention regressions.

The full dashboard run initially found 16 failures: stale administrator-token login assumptions and workflow timeouts under 47 concurrent test workers. Workspace/navigation fixtures now exercise the account password form and development session marker while retaining permission, revocation and destination assertions. Focused authentication/navigation tests passed (25); Supplier/Chat workflow tests passed with one worker (31). The complete dashboard suite then passed with `pnpm --dir apps/dashboard test --maxWorkers=4`: 267 tests in 47 files. Dashboard type checking passed. Test deadlines were not increased and cases were not skipped. This does not claim an unrestricted-concurrency run passes.

No product UI or Agent Observability implementation changed in this regression refresh. These results do not qualify production account authentication, live merchant payments, actual model conformance, container deployment or any complete release gate.

### Native development restoration — 2026-10-06

The stopped development database lacked required cluster/catalog files and no usable backup was found. Under the existing authorization to recreate development storage, the damaged runtime was preserved in a private archive and a fresh cluster created. Existing configured login, administrator and encryption credentials were retained; historical workspace, request, chat and billing records were not recovered.

New launcher state defaults to durable owner-only storage outside OS temporary directories. Existing legacy state remains selected when no durable state exists, so the launcher never silently abandons a saved cluster; incomplete clusters still fail before replacing credentials. Five launcher tests passed. Standard `pnpm dev` now serves the dashboard on 2566 with the Vite live client and the loopback backend on 2567. Readiness and live-client endpoints returned 200. The actual demo password form was submitted in the browser, the workspace opened successfully, and reload/navigation retained the session through Suppliers and Keys.

The encrypted OpenRouter demo Supplier configuration and an active default workspace API key were recreated, with issued credentials saved privately outside the public tree. The starter list's retired ephemeral alias was replaced by a currently listed stable model. Eight seed tests passed; the live catalog-backed seed restored 25 mappings and public-rate offer records. Offers remain unqualified: this establishes neither discounted supply nor inference availability. No merchant payment or real request was claimed. Historical data, full production authentication, actual HMR edit propagation and complete release acceptance remain open.

### Packaging HTTP redirect boundary — 2026-10-04

Both clean-install and upgrade smoke scripts now reject redirects for authenticated HTTP requests and reject cross-origin redirects for public reads. Same-origin unauthenticated routing redirects remain supported, including the workspace-root route. Proxy use remains disabled for the loopback test service.

Fourteen packaging command/upgrade tests passed. Real local HTTP fixtures verify that neither installation nor workspace tokens reach a redirected endpoint, that a different-host redirect is not followed even without credentials, and that an unauthenticated same-origin redirect still succeeds. These tests require no container and make no inference calls. An existing HTTPError cleanup warning remains in a separate fixture. This qualifies the test harness credential boundary, not clean container installation, upgrade/recovery or full F01/F10.

### Fresh packaging harness check — 2026-10-07

The disposable PostgreSQL runner now gives discovery and execution the same
generated test database URL and image-storage test key, without inheriting live
credentials. Discovery still precedes `initdb`; unmatched filters create no
database. All six runner regressions passed, and a fresh EPay callback database
case passed through the updated runner. The observed gateway run still rebuilt
between discovery and execution, so this does not establish a build-time
improvement or resolve the remaining rebuild cause.

All **44** package harness tests passed using
`python3 -m unittest discover -s scripts/tests -p 'test_package*.py'`.
Both package smoke entry points now check for the Docker executable before
resource creation or cleanup, with a regression verifying no engine command is
issued when it is missing. Direct runs of `scripts/package-smoke.py` and
`scripts/package-upgrade-smoke.py` each exited with the explicit missing-runtime
message in this environment. No resources were created. Docker and Podman remain
unavailable; container installation, upgrade and recovery are **not qualified**.
This harness result does not close F01 or F10.

## Complete native gateway regression — 2026-10-06

A fresh isolated PostgreSQL run of `cargo test -p niu-gateway --tests -- --include-ignored --test-threads=1` passed all 178 main-binary tests and the separate process-replacement test. No tests were filtered out or ignored. This supersedes the narrower 84-test workflow checkpoint for the current personal-route/accounting changes. It includes parser and framing tests, supported inference fixtures, customer accounting, authorization/isolation, Guardrail boundaries, customer-safe exports and credential-backed routing. The restart fixture verifies persisted configuration and rotated credentials without bootstrap credentials after process replacement, and checks behavior without the encryption key.

These are native local fixtures. They do not prove clean container installation, packaged upgrade/backup recovery, live model conformance, commercial supply rights or full F01–F10 acceptance. Container-runtime qualification remains unavailable in this environment.

A subsequent fresh PostgreSQL run of the same complete command passed after the Chat archive migration and authorization changes: 179 main-binary tests and the separate process-replacement test, with zero failures, ignored tests or filtered tests. This includes archive persistence, owner isolation and denial of unauthorized mutations. The limitations above still apply.

## Public-tree and build-input boundary — 2026-10-06

The current tracked and non-ignored working tree passed `scripts/check-public-boundary.py --tracked-tree --check-build-inputs` across 1,042 files. The checker also verified required Docker exclusions and explicit build-copy inputs; its five regression tests passed. The changed gateway vendor test module passes Rust 2024 formatting with child traversal disabled and changed-file whitespace checks. Pattern scanning is a defense against known leak shapes, not proof that every secret or proprietary detail is absent; full release and container qualification remain open.

## Current complete gateway regression — 2026-10-06

All 192 main gateway tests passed against fresh PostgreSQL, including required input detectors, local redaction composition, unsupported-content denial, scope isolation, accounting and inference. The separate process-replacement test initially failed because its exact list-response expectation omitted the new read-only `owner_funded` management field. The fixture now explicitly checks that the commercial credential is not owner-funded and carries that metadata into its restart expectation. The fresh process-replacement test then passed, preserving the rotated encrypted credential and Supplier association without bootstrap credentials. The locked whole-workspace all-target Clippy check passed with warnings denied before this expectation-only test correction. This is native regression evidence; it does not qualify the packaged container, actual discounted supply, complete UI workflows or F01–F10.

## Docker build-input syntax boundaries — 2026-10-06

The public build-input verifier now parses JSON-form local COPY inputs, including leading flags, so whole-context, parent-path and wildcard sources cannot bypass checks by changing Dockerfile syntax. Invalid JSON input lists fail verification. ADD is rejected in favor of explicit COPY inputs, preventing remote archive retrieval from bypassing source checks. Explicit JSON COPY remains supported. All 53 script tests passed, including the new bypass fixtures, and the current tracked-source/build-input scan passed over 1,064 files. This verifies the repository check and current declared inputs, not a complete container build or private-dependency audit of every transitive build operation. F01 and F10 remain open.

## Migration history and storage regression — 2026-10-06

Package CI now compares previous-source SQL files byte-for-byte before building upgrade artifacts. Released migration removal, renaming or edits fail the check; new forward migrations remain allowed. Missing baseline history fails closed. The current worktree passed comparison against HEAD’s migration history, and all 55 script tests passed, including edited line endings, deletion, forward additions and missing baseline fixtures. This supplements rather than replaces actual SQLx upgrade/recovery smoke.

The fresh complete storage run passed 93 tests outside the Vendor group. The Vendor group initially found an outdated exact metadata field count after adding read-only ownership; the fixture now expects that field and explicitly verifies false for commercial credentials. All five Vendor tests then passed on another fresh database, including independent credentials/model subsets and rotation. Together these runs cover all 98 current storage tests; they are not a single uninterrupted post-correction full-suite run. No migration or development data was changed. Full release qualification remains open.

## Forward-version migration audit

The source gate additionally rejects invalid/duplicate numeric versions and additions at or below the previous history’s highest version. All three focused tests passed, covering version reuse, insertion into released gaps, malformed names and duplicate forward versions. The stricter current comparison against HEAD failed: HEAD’s highest version is 79, while the shared worktree adds older-numbered files absent from that snapshot. The earlier byte-immutability pass therefore does not establish safe forward upgrade history. Applied local migrations were not renamed or edited, and the gate was not weakened. F01/F10 require reconciliation against the actual previous release artifact/history and a successful packaged upgrade before this can pass.

## Native HEAD history upgrade

A fresh native PostgreSQL fixture reconstructed all SQL files in HEAD’s sparse history and inserted their exact SHA-384 SQLx receipts. The current gateway then started against that database, applied its missing migrations, and reached readiness: 105 successful receipts, highest version 106. This contradicts the earlier inference that lower-numbered additions necessarily prevent upgrade. The source gate therefore retains immutable-byte, deletion, valid-version and duplicate-version checks, while permitting unapplied gaps for runtime qualification. No applied file was edited or renumbered. The earlier forward-range failure is superseded by this result; it must not be presented as an unresolved proven incompatibility. This verifies native migration/startup only, not the previous packaged binary, preserved business records, fault recovery or complete F01/F10 acceptance.

## Native upgrade with saved records

The reconstructed HEAD database now includes synthetic Unicode organization data, a workspace, a correctly formatted saved inference key with its SHA-256 hash/expiry/model grants, and a Supplier credential record. Selected durable fields and the stored credential bytes are compared before and after migration. With a configured synthetic encryption key, the current gateway reached readiness at version 106; all compared fields remained identical, and the saved inference key successfully authenticated model discovery after upgrade. No upstream request was sent. The stored bytes are a synthetic preservation fixture, not proof of decryption or a usable Supplier route. Initial fixture runs exposed a missing encryption environment setting and an invalid key format; both fixture setup errors were corrected before the passing fresh run. Packaged upgrade, complete business-record preservation and restore/credential operation remain open.

## Sparse-history upgrade smoke

The packaged upgrade smoke now reads the actual successful migration-version set rather than treating its maximum as a complete prefix. It selects the first missing version, including a gap below the highest receipt, rejects applied versions absent from the current history, verifies that failed startup preserves the receipt set, and verifies that successful upgrade applies the complete current set. All nine focused upgrade-script tests and all 58 script tests passed. This corrects a verifier assumption exposed by the native HEAD-history experiment. Container execution of the revised recovery path remains required; F01/F10 are not passed.

## Native schema-failure recovery and sanitized errors

A fresh reconstructed HEAD database with saved synthetic records was subjected to the package smoke’s DDL event-trigger fault. Current Niu exited nonzero; PostgreSQL recorded the injected failure, while migration-version/checksum receipts and selected saved record fields remained identical. After removing the trigger, the current gateway upgraded to version 106, reached readiness and authenticated the saved key. No inference was sent. The initial evidence check incorrectly expected the raw database marker in Niu’s sanitized error; using PostgreSQL’s fault evidence corrected the fixture.

The packaged recovery verifier now checks its database container log for the injected marker instead of requiring unsanitized application errors. It still requires a nonzero application exit and rejects unrelated failure evidence without echoing logs. All ten focused upgrade-script tests passed. This verifies native recovery and the revised verifier’s fixtures; actual container/image execution remains open.

## Nested usage commercial metadata

Customer response sanitization now traverses nested usage objects and arrays to remove the existing allowlisted upstream commercial fields. It still avoids generated messages and tool arguments, where a user’s JSON may legitimately contain cost fields. A regression preserves those generated fields, token/reasoning evidence and sanitizer idempotence while removing nested expense metadata. The fragmented SSE regression also includes a nested cost field and checks removal at every byte width. All five customer-response tests, the fresh PostgreSQL inference group and gateway all-target Clippy passed. This hardens known-field handling, not a claim that arbitrary unknown upstream metadata is comprehensively classified; complete customer-safe protocol and export qualification remains open.

## Historical retained-response serialization

The scoped payload read endpoint now reapplies the current commercial-field sanitizer to retained JSON and validated SSE responses, protecting historical records without rewriting durable storage or customer accounting. Structured malformed/incomplete bodies and unsupported content types fail closed rather than exposing unsanitized raw data; plain generated text remains unchanged. The scoped ordinary-reader API fixture saves an unsanitized nested usage expense and verifies it is absent from the returned response while request text, generated output, cache counts, authorization and no-store behavior remain intact. All six customer-response parser tests, 22 fresh PostgreSQL inference tests and gateway all-target Clippy passed. After the native runtime restarted, an existing saved streaming request remained readable in the dashboard with its Messages, counts, stop reason and timing. No new inference or saved configuration write occurred. Complete retention/export/protocol qualification remains open.

## Complete gateway regression after retained-response hardening

All 194 main gateway tests and the separate process-replacement test passed on one fresh PostgreSQL server after the historical payload serialization change. SDK type checking and all 108 SDK tests also passed. The public request-observability contract and API documentation now describe the sanitized historical read and fail-closed HTTP 503 behavior; the YAML contract parses successfully. These are current native/source regressions, not packaged SDK or container execution evidence, and do not close the release gates.

## Historical request credential fields

Payload reads now reuse the capture layer’s known credential-field removal for retained request objects as well as sanitizing response commercial metadata. The ordinary-reader routed fixture persists a mixed-case Authorization field and nested API key before reading; neither is returned, while prompt content and unrelated nested metadata remain intact. Existing authorization, no-store, scoped deletion and late-capture assertions still pass. The fresh PostgreSQL test and gateway all-target Clippy passed. Storage is not rewritten; arbitrary secrets inside prompt strings remain outside this field-based guarantee. Full F09 and retention qualification remain open.

## Routed retained-content failure acceptance

The ordinary-reader payload API fixture now corrupts its stored structured response after the successful sanitized read, then verifies HTTP 503 without the synthetic private body or request prompt in the error. The failed read creates no content-deletion marker and leaves retained storage present. Authorized deletion still succeeds afterward, and the existing late-capture suppression remains intact. The fresh PostgreSQL routed test and gateway all-target Clippy passed. This verifies one malformed JSON failure path through authorization and serialization, not all truncated SSE/UI failure workflows.

## Declared Docker stage copy sources

The public build-input check now resolves COPY --from against stages already declared in the Dockerfile, by name or numeric index. Undeclared external image copy sources fail verification instead of bypassing all local input checks. Existing declared dashboard/gateway stages remain accepted. All eight focused public-boundary tests passed, including named/numeric stage copies and undeclared image rejection; the current source/build-input scan passed across 1,066 files. This checks COPY source declarations, not the provenance of arbitrary base images or every RUN/network dependency. Complete container/public-install qualification remains open.

## Saved credential usability after native upgrade recovery

A fresh isolated PostgreSQL run reconstructed the committed schema with its original migration checksums and seeded a valid encrypted synthetic Supplier credential. An injected schema-startup failure left migration receipts and saved records unchanged. After removing the fault, the current gateway applied all 105 migrations through version 106, authenticated the saved workspace key, and decrypted the saved Supplier credential to authenticate a catalog request against a local test Provider. The returned model matched the fixture, and discovery did not alter saved records. This supersedes byte-preservation-only evidence for credential usability; it does not qualify a real external Provider, commercial supply or the packaged-container upgrade gate.

## Retained stream terminal line endings

Historical payload sanitization now accepts complete SSE events ending with CR-only line breaks at EOF, matching the live parser's terminal behavior. Media-type matching is case-insensitive. A regression verifies commercial metadata removal, preserved token evidence and the terminal marker, while incomplete events and malformed JSON remain rejected. All seven customer-response tests and gateway all-target Clippy passed. This is parser acceptance evidence; complete Logs protocol and failure-workflow qualification remains open.

## Complete migration receipt preservation

The packaged upgrade verifier now compares existing migration receipts, including checksum, success, installation time and execution time. Failed startup requires an exact receipt-set match; successful upgrade permits new receipts while preserving every old receipt. Eleven focused tests passed, including changed checksums, success flags, timestamps and unexpected failed-startup additions. A fresh native fault/recovery run also preserved these fields, applied all 105 migrations through version 106, and authenticated both saved credentials. All 60 script regressions passed before this additional verifier test. Actual packaged-container execution remains unverified.

## Independent Supplier key mutation

The multi-key gateway fixture now compares complete stored model mappings for both keys after credential rotation and a rejected stale update. It also verifies that the other key's metadata and encrypted credential remain unchanged. Existing dispatch, disable/re-enable, process-state reconstruction, workspace-key rotation and revocation assertions remain in the same journey. All ten Supplier gateway tests passed on fresh PostgreSQL, and gateway all-target Clippy passed. The fixture uses two local test Provider endpoints; it does not qualify real commercial supply or the complete rendered onboarding workflow.

## Independent live stream inspection

The customer streaming filter now rejects malformed nonempty JSON data independently of the Chat evidence parser, which already rejected it before forwarding. Fragmented malformed events emit no raw bytes; empty-data keepalives remain unchanged. All eight customer-response tests, ten streaming evidence tests, 22 fresh PostgreSQL inference tests and gateway all-target Clippy passed. This hardens the filter's own boundary without claiming additional protocol support or complete F04/F09 qualification.

## Concurrent prepaid capacity acceptance

A new fresh-PostgreSQL fixture starts sixteen concurrent reservations against company funds sufficient for ten. Exactly ten succeed and six return BudgetExceeded; posted balance remains unchanged, held funds equal the original capacity and availability is zero. Repeated accepted reservations consume no additional capacity. Releasing one known-unexecuted reservation admits exactly one previously denied request and rejects another. All thirteen billing storage tests and storage all-target Clippy passed, including the existing uncertain-liability and credit-recovery cases. This verifies storage admission behavior, not merchant integration, the complete HTTP/UI billing journey or production load performance.

## Authentication fields inside retained JSON

The shared request-field filter now removes Cookie, Set-Cookie, Proxy-Authorization, X-API-Key and API-Key in addition to the existing credential names. Capture and historical reads use the same case-insensitive explicit-name filter. The fresh ordinary-reader API fixture verifies these fields disappear from nested JSON while Accept, unrelated metadata and request content remain intact; authorization, safe malformed-response errors and deletion assertions still pass. The focused PostgreSQL test and gateway all-target Clippy passed. This does not inspect arbitrary prompt strings or claim general secret detection.

## Production password credential foundation

The storage library now provides Argon2id credential hashing and verification using pinned RustCrypto Argon2 0.5.3, independently generated 16-byte salts and its default cost parameters. Verification rejects unsupported algorithms, versions, salt/output sizes and excessive stored costs before running the expensive calculation. Passwords preserve Unicode and spaces; creation requires at least 15 characters and limits input to 1,024 bytes. Three focused tests, storage all-target Clippy and the Rust dependency license audit passed. The helper is not yet wired to production login: durable account binding, bounded blocking execution, throttling, reset/revocation, cookie/session endpoints and the rendered sign-in journey remain required. Development demo credentials are unchanged, and F02 remains open.

## Durable member password binding

Forward migration 0107 adds opt-in email/password credentials to existing scoped member identities. Credential changes revoke prior sessions and append metadata-only audit events in the same transaction. Verification runs outside a transaction; issuing a session locks the member and rechecks its credential revision, rejecting password-reset and revocation races. Hashes are not serializable member metadata. The fresh storage regression passed 103 tests before the final duplicate-email assertion and conflict-error handling change; the final two password integration tests, three password-format tests and storage all-target Clippy passed separately. Duplicate identity assignment preserves the other member's existing sessions and audit history. Released migration bytes remain unchanged. Public login/provisioning endpoints, bounded workers, throttling, cookie protection and the rendered account workflow remain unimplemented; these storage helpers do not close F02.

## Bounded password workers

A shared password-worker pool now runs hashing and verification on blocking workers with a configurable limit of one to four calculations. Excess work fails immediately rather than queuing plaintext passwords. Permits stay with running calculations when the awaiting request is cancelled. Two worker tests passed, including cancellation while a real blocking job holds capacity; both fresh PostgreSQL password tests also passed, with scoped session issuance through the worker. Storage all-target Clippy passed. This supersedes the missing-worker portion of the preceding checkpoint, while durable rate limiting, public endpoints, cookies and rendered sign-in remain open.

## Durable password admission limits

Forward migration 0108 adds shared counters for five attempts per normalized email and 120 per installation during windows expiring 60 seconds after their first attempt. Identity-denied attempts still consume global capacity; the global gate precedes creation of new hashed-identity counters. Counters contain no plaintext email, password or session. Each admitted check removes at most 128 counters older than 24 hours. Two fresh PostgreSQL tests verified concurrent admission across reopened stores, expiry, unknown-identity capacity, bounded cleanup and transaction rollback on storage failure. Both password/session integration tests passed through migration 0108, and storage all-target Clippy passed. The admission helper still needs integration before hashing in the public login route; it is not an active production login guarantee and does not close F02.

## Opt-in password session API

The gateway now exposes owner-authorized password provisioning/reset and a public password-to-session exchange when an HTTPS NIU_AUTH_PUBLIC_ORIGIN is configured. Durable admission precedes bounded verification; unknown identities perform dummy verification and return the same error as wrong passwords. Sessions retain existing member roles and scope. Password changes revoke prior sessions; foreign owners and viewers cannot configure the target credential. Success/error responses are non-cacheable, and supplied mismatched browser origins are rejected. Two fresh PostgreSQL API tests passed, followed by all 198 gateway main tests and the separate process-replacement test. Gateway/storage all-target Clippy, documentation diagnostics, the public-boundary scan and YAML contract parsing passed. The password session contract documents the implemented bearer API; dashboard password login, browser cookies, self-registration, self-service password changes and sign-out integration remain open. No development login or saved Supplier credential was changed, and F02 remains incomplete.

## Nonempty public-boundary checks

The public-boundary CLI now rejects commands that select no files instead of reporting a zero-file success. Each explicitly selected artifact directory must also contribute eligible files, so a populated dashboard cannot conceal an empty docs artifact. The CLI regression covers missing selection, empty selection, mixed populated/empty artifacts and a successful source check. All nine focused boundary tests and all 62 script tests passed. The explicit tracked-tree/build-input scan passed across 1,076 files. This validates the checker’s selection behavior and known leak-pattern checks; packaged artifact qualification remains open.

### Member self-sign-out checkpoint

`POST /admin/v1/auth/logout` now atomically revokes the active member bearer
session and records its metadata-only audit event. Every member role can use it
without member-management permission; installation credentials are rejected.
It accepts no target member/session identifier and leaves other sessions active.
Responses are non-cacheable. Invalid, expired and already revoked sessions return
401. Password runtime origin validation applies when that runtime is configured.

Fresh PostgreSQL gateway tests passed all three password/session cases, including
viewer self-sign-out, repeated sign-out, installation-token rejection, expiry,
other-session preservation, audit identity and gateway reopening. Gateway
all-target Clippy passed; the OpenAPI YAML parsed and the explicit public-boundary
scan passed for 1076 files. This verifies the backend endpoint, not dashboard
sign-out integration or completion of F02.

### Member authentication SDK checkpoint

The JavaScript SDK exports `NiuAuthClient` with explicit `signIn` and `signOut`
methods and typed member-session metadata. Passwords are preserved unchanged;
only accepted login fields are serialized. Sign-out sends a bodyless POST with
only the caller's bearer credential. The client does not retain credentials,
send cookies, retry writes or follow redirects. Both methods accept cancellation
and disable caching. Local bounds include the serialized JSON body limit.

The full SDK build and 111 tests passed, including request shape, cancellation
signal forwarding, 204 sign-out, HTTP errors, uncertain network writes, invalid
base URLs, Unicode byte bounds and JSON escaping expansion. These SDK checks use
controlled transports; the previous PostgreSQL checkpoint verifies the actual
backend separately. They do not qualify a browser session workflow. The public
boundary scan passed for 1078 files. Production dashboard authentication and the
full F02/F10 acceptance journeys remain open.

### Production browser-session backend checkpoint

Separate browser login/logout endpoints now issue and revoke an eight-hour
`__Host-niu_member_session` cookie. It uses Secure, HttpOnly, SameSite=Lax and
Path=/ without Domain; browser login returns session metadata without the bearer
credential. Cookie attributes follow the [MDN Set-Cookie reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

Shared administrative authorization validates this cookie against active scoped
member sessions, never installation tokens. A supplied Origin must match the
configured HTTPS origin; absent Origin requires browser-owned same-origin Fetch
Metadata ([MDN reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site)).
Browser login and logout require the matching Origin explicitly. Duplicate or
malformed member cookies fail; backend revocation survives reopening. Logout
clears already unusable sessions, but storage failure does not clear the cookie
or report successful revocation. Existing bearer and local development flows
remain separate.

Four fresh PostgreSQL authentication cases passed, including cookie issuance,
no token in the JSON response, viewer permissions, cross-site denial, duplicate
cookie denial, installation-token denial, sign-out and reopening. The broader
fresh PostgreSQL gateway suite passed all 200 main tests. All-target gateway
Clippy, docs diagnostics, contract YAML parsing and the explicit public-boundary
scan (1078 files) passed. These are backend checks; real HTTPS browser cookie
acceptance and production dashboard integration remain unqualified. F02 stays open.

### Dashboard member-session integration checkpoint

The dashboard discovers password availability through non-cacheable
`GET /admin/v1/auth/config`. Configured deployments use the existing sign-in
form with an Email field and the browser login endpoint. Shared session startup
restores the backend cookie session without retaining a bearer secret in browser
storage. Development login remains a separate fallback when password mode is
explicitly unavailable. A non-secret internal transport marker selects cookie
authorization centrally; it cannot authenticate without a valid scoped cookie
and is never compared with installation credentials. Explicit ordinary bearer
credentials retain precedence. Session identity responses are non-cacheable.

Sign-out waits for backend revocation before clearing dashboard state. Failures
retain the session and provide a retry dialog; member bearer and development
sessions use their corresponding revocation endpoints. Successful sign-in keeps
the requested destination. Four fresh PostgreSQL authentication tests passed,
including capability discovery, the cookie transport marker without credentials,
and ordinary bearer precedence. All 297 dashboard tests, TypeScript checks,
gateway all-target Clippy, docs diagnostics, contract YAML parsing and the
explicit public-boundary scan (1079 files) passed.

A controlled dashboard integration test exercises production sign-in, restoration
after remounting without a stored bearer, failed sign-out and successful retry.
The live development browser reached the existing sign-in form after sign-out;
the form retained its branded spacing and components. OpenRouter's reference
route redirected the existing authenticated browser to its home page, so no
signed-out reference form comparison was established. Requested viewport
overrides did not change the reported live viewport (743 by 724); narrow-screen
review remains pending. These checks do not establish real production HTTPS
cookie acceptance, invitation/provisioning UX or complete F02 qualification.

### Conflicting browser credentials and sign-out rollback checkpoint

Shared authorization now rejects duplicate Authorization headers before selecting
an identity. Cookie authorization rejects duplicate or non-same-origin Fetch
Metadata even when Origin matches; browser login/logout use that same check.
Explicit bearer precedence remains unchanged, and matching Origin without Fetch
Metadata remains supported for controlled clients.

All four fresh PostgreSQL authentication tests passed. Added cases cover duplicate
Authorization, Origin and Fetch Metadata; matching Origin with cross-site,
same-site, none or invalid Fetch Metadata; and forced failure inserting the
sign-out audit event. That failure returns a sanitized non-cacheable 503 without
clearing the browser cookie, and rollback preserves the active session; successful
retry subsequently revokes it. Gateway all-target Clippy, docs diagnostics,
OpenAPI YAML parsing and the explicit public-boundary scan (1079 files) passed.
This checkpoint verifies these backend failure paths, not complete F02 or HTTPS
browser acceptance.

### Packaged member-login configuration checkpoint

Compose now passes `NIU_AUTH_PUBLIC_ORIGIN` from the deployment environment to
the gateway. The public environment example leaves it blank for installation-only
evaluation. Gateway parsing treats an empty value as disabled, while whitespace
and malformed HTTPS origins fail configuration. The deployment guide describes
same-origin TLS termination, member provisioning through the actual operator
creation contract, initial password assignment, session revocation and dashboard
sign-in. Workspace terminology is preserved around legacy project-named API paths.

Four fresh PostgreSQL authentication tests passed, including empty-setting and
invalid-setting checks. Gateway all-target Clippy, docs diagnostics, Compose YAML
parsing and the optional-origin environment mapping check passed. The explicit
public-boundary scan passed for 1079 files. Docker is absent on this host, so no
Compose rendering, container execution or packaged HTTPS journey is claimed.
F01 and F02 remain open.

### Runtime source-notice packaging checkpoint

The runtime Docker stage now copies the project license, third-party notices,
LiteLLM MIT license and selected-source manifest, and shadcn/ui MIT license into
`/app/licenses`. These are explicit public-tree build inputs; upstream attribution
is preserved. Existing public asset notices remain in their dashboard/catalog builds.

The current locked Rust dependency license audit passed. The JavaScript license
inventory passed for 570 package versions, retaining its scoped exceptions for
optional libvips and Lightning CSS build dependencies. Docs diagnostics and the
explicit public-boundary/build-input check passed for 1080 files. These checks
verify source inputs and approved dependency declarations; they do not establish
complete transitive notice distribution. Docker is absent, so image contents and
installed runtime notice paths remain unverified. F01/F10 stay open.

### Self-service member-password backend and SDK checkpoint

Every authenticated member role can use `PUT /admin/v1/auth/password` with
current-password proof to change only its own password. No target member or email
is accepted; installation identities cannot use this endpoint. Bounded workers
and shared sign-in throttling precede mutation. An opaque verified credential
snapshot pins the existing revision, preventing a concurrent administrative reset
from being overwritten. The backend preserves the existing email and atomically
revokes all own sessions with metadata-only audit records. Success requires fresh
sign-in; browser-cookie requests require matching Origin and expire the cookie.
Other members' sessions remain active. Failed changes do not revoke sessions.

All five fresh PostgreSQL authentication cases passed, including viewer access,
incorrect proof, invalid new password, foreign-target field rejection, stale
verified change, own-session revocation, new-password login, audit actor,
browser-origin denial and cookie clearing. All 113 JavaScript SDK tests passed,
including the new explicit password-change method's PUT body, no target fields,
unchanged password bytes, cancellation, byte/serialization bounds and reset
conflicts without retry. Gateway all-target Clippy, docs diagnostics, contract
YAML parsing and the explicit public-boundary scan (1080 files) passed. Settings
UI, real HTTPS browser acceptance and full F02/F10 qualification remain open.
# Account password settings checkpoint

The account settings form now verifies the current password, confirms the new
password locally, and signs the member out after a confirmed server-side change.
Installation access and disabled password authentication do not offer this form.
The dashboard suite passes 301 tests across 53 files. Public boundary checks pass
for 1,082 files.

Rendered acceptance remains open: the browser tool rejected navigation after an
initial connection error on the isolated HTTPS review server. The temporary
server was stopped. This does not qualify HTTPS browser behavior or close F02.

## Fresh gateway and dashboard audit (2026-10-06)

The full gateway run against a fresh PostgreSQL database passed 199 tests, with ignored cases enabled, including the process-replacement Supplier fixture. This qualifies those test contracts, not the entire release or packaged product.

The dashboard baseline passed 310 tests and failed seven after an incomplete Models navigation patch was removed. Failures include organization access navigation, Supplier qualification/rate interactions and Chat timing. These need current-contract review; do not treat the earlier dashboard checkpoint as evidence that the present suite passes.

A real saved owner-funded request was inspected in the running dashboard at phone width: messages/raw payloads, finish reason, timing, Guardrail observation and Own API key cost labeling were present. Reload restored the authenticated workspace. This was local HTTP development, not production HTTPS/session-expiry qualification. No new upstream request was sent during inspection.

Models navigation currently targets a workspace path, contradicting the required global catalog scope. `/models` is served by the public catalog artifact; changing React links alone does not integrate the authenticated catalog. Resolve route/artifact ownership and retain authorized workspace price/access context before closing this workflow. The temporary link-only patch was removed; no Models routing fix is claimed.

## Dashboard UX regression checkpoint — October 7, 2026

The current dashboard suite has 427 tests in 69 files. The default-concurrency run passed 423 and failed four: organization switching and two Chat cases hit the five-second test timeout, and the Chat settings failure-state assertion did not find its expected error. Running both affected files together passed all 33 tests. A fresh full run with `pnpm --dir apps/dashboard test --maxWorkers=2` passed all 427 tests across 69 files in 86.68 seconds, without changing assertions or timeout limits. The host had substantial non-test CPU load during investigation. Reduced concurrency removes contention from this run but does not prove the default run is consistently reliable; retain that limitation rather than discarding the failed result. These tests cover current component and integration contracts, not whole-product UX, role-specific browser acceptance, packaged deployment or live failure injection.

### Packaging recheck after asset-intent retention

A fresh run of all five `test_package*.py` suites passes 44 harness tests. The
tracked public-tree and Docker build-input boundary check passes across 1,297
files. Direct executions of both package smoke entry points stop with the
explicit missing-Docker error before creating resources. At that checkpoint, neither Docker nor
Podman was installed in the environment. These checks establish current harness
and source-boundary evidence only; clean container installation, upgrade,
backup/restore and packaged journeys remain unqualified for F01/F10.

### Container runtime bootstrap

Homebrew installation completed for Docker CLI 29.8.1, Buildx 0.37.1 and Colima
0.10.3. The CLI and plugin version commands pass. A dedicated release-test VM
was requested with four CPUs, 6 GiB of memory and no host directory mounts,
without activating the default Docker context. At the initial bootstrap checkpoint, VM startup was still downloading
its image; daemon readiness, Niu image build and packaged journeys remained
unqualified. The earlier missing-CLI result is historical, not the current
prerequisite state. This bootstrap does not pass F01/F10.

### Release-test daemon readiness

The native VM image downloader failed with a network connection reset. A retry
using the supported curl downloader completed, and the dedicated release-test
VM started successfully. Docker server 29.5.2 reports four CPUs, approximately
6 GiB of memory and no running application containers. Commands use the named
release-test context; the default context and development service are unchanged.
The first Niu image build is live and downloading its Node/Rust/Debian base
layers. Container runtime readiness is verified; the image build, install,
upgrade and packaged journeys are not yet passed.

### Gateway regression and container build-input correction

A fresh isolated PostgreSQL run passes all 115 selected gateway tests and all
five Supplier/video process-replacement integration tests. The workspace-key
response test now checks its exact public field allowlist, including the existing
revision field; OpenAPI and JavaScript SDK types include that field. All 150
JavaScript SDK tests pass, and the OpenAPI document passes unique-key parsing.

The first container build failed on a truncated Debian layer download. The retry
reached dashboard compilation and exposed a missing build input: dashboard video
code imports public JavaScript SDK source, while the image copied only its package
manifest. The Dockerfile now copies that source before compilation. The corrected
image build is running; packaged installation and recovery remain unqualified.

The corrected build completes the Dashboard, Docs and Catalog compilation stages
and reaches the locked Rust release build. All 44 packaging harness tests pass
again. This proves the omitted frontend dependency is restored, not that the
finished image or packaged product journey passes. The release build and isolated
PostgreSQL image download remain live at this checkpoint.

### Recovery prerequisites rechecked

Docker Compose 5.5.1 is available through the isolated release-test Docker
configuration. A fresh comparison against HEAD's migration history confirms that
existing SQL files are unchanged; new forward migrations remain allowed. The
container build has begun Rust compilation. These checks establish tooling and
source-history prerequisites only. Compose persistence, backup/restore and a
distinct previous-source image upgrade still require execution evidence.

The package route-shell checks now cover global Models, Chat, Admin Suppliers,
Agent Observability and Billing Settings, replacing the retired workspace
subscription route. The title assertion matches the current `niu.io` document
title. These are HTTP shell checks; they do not prove rendered interactions or
authentication. All 44 packaging harness tests pass after this correction.

Direct install and upgrade smoke now create stopped containers, copy their
configuration/fixture files through Docker, and then start them. They no longer
require shared host-directory mounts. The upgrade harness verifies that a failed
copy prevents startup. All 45 packaging harness tests pass. Compose still uses
its declared file mounts and requires separate runtime qualification; these
harness checks do not establish packaged acceptance.

The direct install readiness probe now stops when the application container is
exited or dead, using state inspection rather than publishing container logs.
Both terminal states have tests proving no HTTP probe follows. All 46 packaging
harness tests pass, and a fresh gateway/storage all-targets Clippy run passes with
warnings denied. The actual release image remains under compilation.

A runtime transport probe creates a Python fixture container without host mounts,
copies the Supplier fixture into it, starts it as UID/GID 10001, and receives
HTTP 200 from its authenticated fixture endpoint. The probe container is removed
afterward. This confirms the copied-file approach and non-root readability for
the fixture; it does not exercise Niu inference or establish live Supplier rights.

A fresh full media-crate run passes 57 local tests with one public HTTPS test
ignored by default. Explicitly running that HTTPS test fails with
`EndpointRejected`: this environment resolves the public WPT host to a synthetic
benchmark-range address rather than a public destination. The transport's address
restriction remains intact. External HTTPS retrieval is not qualified by this
environment; no fixture bypass or relaxed SSRF rule was introduced.

### First completed container image

The corrected image build completes. Its image identifier is
`sha256:2dc89a331d35bfabd37d68c3b2885043188f6ded7858022892f75533ac027743`.
Runtime inspection confirms UID/GID 10001, the executable Gateway and packaged
Dashboard, Docs search and Catalog assets, without source manifests or
node_modules in the runtime application directory. This development build is
not pinned for Enterprise manifest loading.

The first isolated smoke executions exposed stale harness expectations for the
Docs title and the public Models catalog's React mount point. The title now
matches the packaged Docs page; Models retains its separate catalog checks
rather than being tested as a dashboard shell. The corrected full journey is
rerunning. Image build/content inspection does not pass install/recovery or F01/F10.

The corrected smoke subsequently exposed a real packaged routing omission:
Admin Suppliers, global Settings and Installation were absent from the static
dashboard router. Their entry/deep links are now registered explicitly, without
introducing an `/admin` catch-all that could absorb `/admin/v1` API errors. Static
route regression checks include these entries and cache revalidation; the existing
API namespace exclusion remains in the suite. Tests and the corrected image build
are running. The earlier image does not qualify these routes.

All four static-site regression tests now pass, including the new Admin,
Installation and Settings paths, entry-document revalidation, API exclusions,
public catalog context and operation without marketing artifacts. The package
route smoke still needs the rebuilt image; this focused test result does not
close the complete install/recovery workflow.

The completed earlier image's runtime `/app` assets pass the public-boundary
scanner across 237 files. The scan uses the recorded immutable image identifier,
and removes its temporary container and extracted assets afterward. This is
artifact-boundary evidence for that image only; the corrected route image must
be scanned and exercised separately after its build completes.

The updated gateway all-targets Clippy run passes with warnings denied. An
untouched HEAD source snapshot is prepared as a distinct upgrade baseline, with
its migration history rechecked against the current tree. This is preparation
only: neither the previous-source image build nor the cross-image upgrade has
passed at this checkpoint.

### Direct container recovery checkpoint

The route-corrected image `sha256:4a0633d3f03d5bc43a750e6e7332423f6496788955a762a1cfd0f48abd8c4bf7`
passes the direct `scripts/package-smoke.py` journey. This includes single-origin
route/API exclusions, nonstreamed and streamed fixture inference, durable keys,
customer tariff publication, prepaid ledger reconciliation, video history and
original-account recovery, uncertain submission without repeated upstream create,
gateway restart, database backup/restore with table and sequence fingerprints,
and graceful drain. The isolated Supplier fixture now declares its procurement
prices and token bounds and has a stable network namespace across gateway
restarts; customer tariffs and procurement budgets remain separate.

All 46 package harness tests pass. This is synthetic packaged recovery evidence,
not live Supplier qualification. The image predates the platform-admin capability
and migrations 0160–0161. Compose execution, distinct-image upgrade, a refreshed
release image and full browser acceptance remain open. The untouched previous
source frontend image currently fails its license inventory step; no cross-image
upgrade success is claimed.

The platform-admin authorization regression passes: a member with the explicit
capability gains platform administration without becoming an installation identity
or gaining another customer workspace or organization. Ordinary workspace owners
do not receive the capability. The session API contract now declares it explicitly.
Rendered administrator navigation and routed authorization regression coverage
remain open.

The next navigation checkpoint passes all 39 dashboard layout tests, including
explicit member platform administration alongside customer areas and ordinary
owner denial. The running dashboard was inspected at desktop and 390px widths:
Admin is additive, Supplier configuration loads, the mobile rail is collapsed,
and the mobile navigation exposes both customer areas and Admin. The viewport
and original customer page were restored afterward. This review also identifies
unfinished Admin OAuth/payment/branding sections and a private subscription-pool
surface inconsistent with the release exclusions; neither is qualified by the
navigation checkpoint. All five routed PostgreSQL operator tests now pass,
including platform grant/revocation reauthentication, ordinary owner denial,
foreign workspace non-disclosure, session expiry/revocation, scoped directory
limits and reader-safe key metadata. These checks use a disposable database and
do not modify development users or saved Supplier credentials.

The same recorded route-corrected image now passes `scripts/package-smoke.py
--compose` against the repository Compose file. The isolated runtime mounts only
the example configuration directory, read-only. The test verifies the two-service
deployment, migrations, saved workspace/key data, customer tariff and funding
persistence, app and PostgreSQL restarts, backup/restore fingerprints, graceful
drain and credential-free admin lists. Its temporary services, volume, environment
file and image alias are cleaned up. Compose mode does not exercise upstream
inference or video; those retain the separate direct-container evidence above.
This result still predates platform-admin migrations and does not close F01/F10.

An isolated diagnostic identifies the untouched baseline frontend failure as
`ERR_PNPM_MISSING_PACKAGE_INDEX_FILE` for its pinned Pagefind Linux ARM64 package.
The original source and release recipe remain unchanged. A separate forced
frozen-lockfile install reports “Already up to date” and reproduces the same
missing package-index error; it does not repair the prerequisite. No baseline
image or cross-version upgrade is yet qualified.

A clean dependency-directory reinstall with the same lockfile repairs the
baseline license inventory. The full untouched HEAD build then reaches genuine
TypeScript failures: its Agent Observability source imports an undeclared icon
dependency and uses a missing session property. That source is not patched to
manufacture an upgrade baseline. The earlier revision
`452d28c38fc30a0c8465d49bf41a7343f69b606d` is being built separately with an
explicit clean dependency-install prerequisite; its released migrations remain
byte-identical in the current tree. Buildability and cross-image upgrade are not
yet claimed.

The route-corrected image recorded above now also passes the runtime public
boundary scan across all 237 `/app` files. The scan's temporary container and
extracted directory are removed afterward. This qualifies that exact artifact's
public-content boundary, not later source changes.

The earlier source baseline also reaches an existing frontend asset-resolution
failure: its login page's relative branded image import does not resolve in the
packaged tree. No source patch or cross-image upgrade success is claimed. The
two historical-source failures remain distinct from the passing direct and
Compose checks of the recorded current artifact.

Customer asset-request discovery now has a bounded workspace-scoped API, SDK
helper and matching contract. Its fixed summary projection omits confidential
account and procurement fields and hides expired/deleted names. OpenAPI
unique-key validation and SDK type checking pass; routed PostgreSQL authorization
tests were running at this checkpoint. This does not qualify upstream asset creation/readiness or
rendered discovery. Retention cleanup was confirmed already connected through
the existing request-payload maintenance method; no duplicate cleanup was added.

The discovery checkpoint now passes its routed PostgreSQL test for two-page
traversal without duplicates, cursor exhaustion, invalid limits, inference-key
denial, foreign-workspace non-disclosure and deletion-name redaction. The separate
storage expiry test passes: expired names are absent before purge, foreign scope
reads are empty, out-of-range limits are rejected, cleanup erases request content
and preserves recovery bindings. All 151 SDK tests, OpenAPI unique-key validation
and whitespace checks pass. These are controlled local fixtures; upstream asset
operations, live entitlement and rendered customer discovery remain open.

Migration 0162 adds the full-state workspace/cursor discovery index without
changing the existing reconciliation index or historical migrations. All ten
asset-management storage tests pass against the updated schema: original-account
and credential binding, one-shot claim, uncertain-state non-replay, rotation,
revocation/erasure, retention, scoped discovery and historical intent upgrade.
Migration-history verification also passes. This is schema and controlled
lifecycle evidence, not a measured production performance claim. Runtime
dispatch and qualified live ordinary-asset operations remain open.

The refreshed source passes gateway all-target Clippy with warnings denied and
the public-tree/build-input boundary check across 1,303 files. Its Docker build
has completed dashboard, docs and catalog compilation and is compiling the
release gateway binary. The build inputs include the platform-admin and
asset-request discovery changes through migration 0162; image completion,
content inspection and direct/Compose reruns are still pending. Earlier packaged
results remain scoped to their recorded immutable image.

The direct/Compose harness now also provisions an isolated member password,
signs in through the token API, proves ordinary-owner platform denial, records
an explicit database-administrator grant, and checks member identity and customer
scope alongside Supplier administration. It retains that session through gateway
restart and restore, then verifies sign-out revocation. All 46 harness tests pass;
the new packaged member journey awaits the refreshed image. Its configured HTTPS
origin is a fixture policy value, not an HTTPS browser/cookie qualification.

The package smoke now compares the complete successful migration receipt set
against source migration versions and rejects failed receipts. Its regression
test rejects missing/extra versions and unsuccessful migrations; sparse but
matching histories remain valid. All 47 package harness tests pass. The expanded
packaged journey still awaits the live refreshed image build.

### Concurrent-source qualification safeguards

The refreshed image through migration 0162 finished building, but its expanded
smoke correctly rejected the schema after migration 0163 was added to the
current source. It is not accepted as the current release image. A subsequent
build captured an intermediate missing dashboard redirect and failed compilation;
the current dashboard type check passes after the concurrent route edit. A new
image build and current customer-accounting check remain in progress. No new
packaged acceptance is claimed from these attempts.

The disposable PostgreSQL runner now requires a nonempty successful execution
receipt, in addition to test discovery. A test removed between discovery and
execution cannot be counted as passing merely because Cargo exits successfully.
All eight runner regression tests pass, covering empty/ignored-only receipts,
multiple targets, credential isolation, failure propagation and owned-cluster
cleanup. This qualifies the verification harness, not product behavior or F10.

Platform media-selling administration now uses the same explicit member grant
as Supplier administration for choices, history, publication, replacement and
retirement. Ordinary company roles and inference keys remain unauthorized; the
grant does not widen customer workspace access. The routed test now exercises
member administration, immutable replay/conflict and immediate grant revocation.
Its execution remains pending; the SDK type check, billing contract unique-key
validation and public-tree/build-input scan across 1,250 files pass. The removed
legacy execution test returned zero executed tests and is expressly excluded
from acceptance evidence.

The Docker build now caches Rust registry and compilation data while copying the
finished executable outside the cache into the runtime image. Qualification of
this changed build remains pending; no build-time improvement or current image
acceptance is claimed before an actual completed build and smoke run.

The routed PostgreSQL media-selling permission test now passes against the
current schema through migration 0163. It executes the signed-in platform-member
journey for choices/history, publication and identical replay, changed-receipt
conflict, immutable retirement and schedule replacement. Ordinary Owner, Admin,
Viewer and inference-key denials remain covered; revoking the platform grant
immediately rejects reads and writes. This qualifies the backend authorization
and controlled configuration subset, not live media supply, rendered pricing
administration or the complete F03/F05 gates.

### Refreshed package qualification — 2026-10-07

The cached release build completed as image
`sha256:88a0b211b727c438384f4c0be7eaa71f8427b293a3581e852c3a7e6104d8a8f5`.
Its direct package smoke failed the migration-history comparison before video
recovery acceptance: the image predates the current source migrations. This is
not a packaged release pass. A fresh build is required before repeating the
install, restart, restore and historical-charge checks against the current tree.

The package smoke now compares SQLx SHA-384 migration checksums as well as
version numbers. A focused test passes for matching content and proves that a
changed file is rejected even when its migration number remains unchanged.
Actual current-image checksum and recovery acceptance remain pending.

All 48 packaging harness regression tests pass after adding the checksum
assertion and updating its existing migration-history fixture. These tests
validate the harness; they do not replace execution against a packaged server.

The refreshed single-image build completed successfully as
`sha256:6178588bbba45ecc5f3cdf0c00f84159bd29c2c3a8be8495fcb4812d076c0f5d`.
Its direct smoke uses this immutable image identity, not the mutable tag.
The direct smoke passed install, nested routes, text streaming, prepaid
reconciliation, member sessions, restart, backup/restore and graceful drain.
Migration versions and checksums matched the source. The executed video subset
is recorded in [video recovery acceptance](packaged-video-recovery-verification.md#direct-container-checkpoint).
The Compose smoke also passed against this same image, covering application
and PostgreSQL restarts, backup/restore, graceful drain, migrations and
credential-free administration lists. Compose does not execute the video branch;
that evidence remains specific to the direct smoke. Distinct-image upgrade and
complete release acceptance remain open.

The same immutable image passed the public-boundary scan across all 228 files
under `/app`. A stopped temporary container supplied the extracted runtime
assets; both the container and extraction were removed after the scan. This
checks known private-data patterns in that exact artifact, not later UI edits
or every possible confidential datum.

## Current package qualification — 2026-10-08

A fresh Docker build completed as `sha256:c0a522a54c465da03cf31fee0421ba2d663bee59abb434e02394b831c872a44d`. Dashboard, docs, catalog and the
release gateway built successfully. The source/build-input public-boundary check
passed across 1,270 files; the finished image passed the same pattern scan across
228 files under `/app`. Temporary extraction and scan containers were removed.
The JavaScript SDK passed all 146 tests and packaging harness tests passed all 48.

The direct package smoke passed against that immutable identity through migration
0168, including exact migration-version/SHA-384 receipts, single-origin routes,
text streaming, prepaid reconciliation, member sessions, restart, backup/restore
and graceful drain. Its controlled video branch covered known and uncertain jobs,
historical customer tariffs, scoped Logs and credential-change recovery denial
without duplicate generation or charges. It does not qualify live video supply
or actual media retrieval.

The distinct-image upgrade smoke passed from `sha256:6178588bbba45ecc5f3cdf0c00f84159bd29c2c3a8be8495fcb4812d076c0f5d` (through 0166) to the
new image (through 0168). An injected DDL fault prevented startup and preserved
the old migration receipt set. After removing the fault, upgrade applied the
complete current receipt set while preserving prior checksums, workspace records,
key metadata, credential secrecy and the key's actual model access. This is one
controlled upgrade path, not every historical version or video upgrade case.
Complete F01/F10 acceptance and current dashboard full-suite qualification remain
open. Enterprise manifest eligibility remains outside this unpinned development
build's qualification.

The Compose lifecycle also passed against the same current image: application
and PostgreSQL restarts, backup/restore, graceful drain, migration receipts and
credential-free administration lists. Compose does not run the video branch.
Both smoke runners removed their disposable containers and networks after success;
the existing development service and its data were not used.


### Additional video upgrade coverage — 2026-10-08

The same distinct pinned image pair now passed the opt-in video upgrade branch:
a queued original-account job completes after replacement with one pinned
customer debit, while an unknown submission retains liability without replay.
Future pricing, scoped Logs and repeated settlement checks passed alongside the
injected migration-failure recovery. See the
[video upgrade checkpoint](packaged-video-recovery-verification.md#video-image-upgrade-checkpoint--2026-10-08)
for exact scope and limitations. All 53 packaging harness tests passed. This does
not qualify every historical upgrade, live media transport or later worktree edits.
