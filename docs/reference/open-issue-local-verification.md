# Open issue implementation and local verification

This checkpoint records issue work exercised on 2026-10-16, including changes
incorporated into the main branch and the ongoing follow-up work. It is not a production release or a blanket issue-completion claim.
Actual HTTP, SDK, browser and independent persisted-data/artifact checks are
distinguished from implementation findings. Fixture outcomes supply no evidence.
Private runtime configuration, credentials, records and screenshots remain
outside the public repository.

| Issue | Local change and observed boundary | Remaining acceptance |
| --- | --- | --- |
| #12 | Removed stale documentation for retired benchmark/import workflows; both management API prefixes refuse the retired routes. | Broader production navigation and inference acceptance. |
| #20 | Provider commercial positions table exposes per-row customer cash applied, unpaid customer credit, and recorded upstream cost with coverage indicators and Unavailable fallback. | Production rollout and populated commercial supply reconciliation. |
| #23 | Key introspection schema, SDK and MCP instructions match canonical fields; actual finite/unlimited and no-expiry/capped responses validate against the served contract. | Deployed contract rollout. |
| #24 | Priced admission distinguishes missing platform procurement readiness (`503 procurement_not_ready`) from customer balance exhaustion (`402 insufficient_customer_balance`). | Production rollout. |
| #25 | Authenticated Models links carry workspace scope; root/detail refresh, trailing slash, filtering and browser history retain the dashboard. A foreign workspace is refused; the unscoped root remains the public catalog. | Production rollout and mobile account-menu navigation. |
| #26 | Owner-funded models with no estimator offer explicit confirmation rather than an unusable Estimate gate. Desktop/narrow confirmation, cancel, actual zero-RPM refusal and stopped-submission recovery inspected. Three refused attempts remain `not_sent`, without dispatch, jobs or customer holds. | Actual successful asynchronous generation, recovered output and billing. No upstream generation was submitted. |
| #28 | Release publication refuses existing releases and mismatched tag commits; staged assets receive checksums and source identity. Existing GitHub release/tag checks were read-only. | A genuinely new immutable release; no release was published. |
| #29 | Financial statement PDF export resets dashboard viewport clipping and paginates sections cleanly across A4 print pages. | Populated multi-model print acceptance on deployed data. |
| #30 | Billing reuses the effective customer-price selector in its read snapshot and excludes enabled personal routes. Actual owner-funded workspace rates remain empty. | Standard enrollment, promotions, retirement and positive direct-price acceptance. Unprovenanced saved price data is excluded as positive acceptance evidence. |
| #31 | Profile/membership changes atomically record actor and target context. Actual installation and temporary platform-operator writes agree with persisted events; rejected writes add no events. Desktop/narrow audit labels inspected. | Production rollout. |
| #32 | Missing inspection prerequisites return the inspection-specific error; invalid retention and revoked-key preparation are refused. | An actually configured inspector and approved source. |
| #33, #55 | Workspace key creation and combined key metadata/policy updates execute atomically inside bounded recording transactions so failed initial or combined policy writes never leave partial keys or metadata edits. | Production rollout. |
| #34 | SDK key creation inputs and detail/update envelopes align with real API calls. Actual policy writes, failed combined updates, rotation and revocation were independently checked. | Production SDK rollout and complete create-form browser acceptance. |
| #35 | Model metadata documents scope and installation/member projections; actual response projections validate against the published schema. | Deployed contract rollout. |
| #36 | Procurement configuration audit commits with the mutation and excludes confidential values. Actual zero-budget and unconfigured-account writes, rejected writes, scoped denial, pagination and desktop/narrow audit projection checked. | Production rollout; no funding or upstream request was made. |
| #37 | Saved-intent routes enter Video payload capture; malformed/repeated capture headers are refused on both API prefixes. Actual invalid-header requests are rejected before JSON extraction and create no attempt. | Fresh successful capture enabled/disabled, final video artifact, replay and retention checks. |
| #38 | Saved navigation and Reload revalidate key metadata after preparation finishes; catalog refresh preserves submission errors. Actual live revocation and Reload of an unsent saved intent transition to the revoked/read-only state at desktop/narrow widths. Existing completed revoked-key history and disabled Provider actions also inspected. | Live revocation of an active completed task and subsequent history navigation. |
| #39 | Transport labels distinguish submission, query and result transfer, with an unknown-phase fallback. Actual saved submission/query values inspected at desktop/narrow widths. | An actual saved result-transfer timing; none exists in the local run. |
| #40 | Canonical Video sessions appear by persisted title; standalone notes and original request links restore from the backend. Actual rename, stale-revision refusal, explicit reload/save, archive and restore agree with independent records. Actor isolation, SDK cursor traversal, desktop/narrow menus and archive lists, mobile dialog ownership/focus and full-page restoration checked. Archive/restore preserved turn, binding and refused-attempt records. | Production rollout and browser traversal beyond one full page. No job was submitted or refreshed. |
| #41 | Docs console gives allowlisted admission errors and remedies without inventing a diagnostics reference. Actual zero-RPM rejection and key-limit navigation inspected at desktop/narrow widths. | Exact workspace-cap HTTP 402 path. Two refused requests saved `not_sent` attempts, with no dispatch or financial hold. |
| #42 | Cookie restoration no longer trusts a stale per-tab sign-out marker. Actual two-tab sign-in/sign-out, restored Docs access and revoked-cookie refusal checked. | Production rollout. |
| #43 | Referenced authentication definitions survive contract bundling; the served artifact contains resolving security schemes. | Complete interactive authorization-control acceptance. |
| #44 | Timeline histogram schema accepts zero counts; the generated and served artifacts agree. | Actual populated/zero-bucket timeline reconciliation. |
| #45–47 | Financial tables scroll without overlapping amounts; Refresh advances relative cutoffs; reversed bounds normalize controls and URL. Actual reports, open month menu and desktop/narrow geometry inspected. | Production rollout. Empty-model print output does not qualify populated PDF acceptance. |
| #48 | Installation credential entry takes precedence over asynchronous member restoration. Actual credential entry with a valid member cookie checked. | The original production race remains unverified. |
| #49 | Full unused-gift correction appends an independently audited noncash adjustment. Actual SDK, concurrent replay, browser confirmation, named platform-member correction, Owner refusal, held-liability refusal and independent ledger/pool/report reconciliation checked. Original gifts remain; temporary platform permission/member were revoked. | Deployed rollout. Partial and consumed-gift correction are outside the initial conservative contract. |
| #50 | Long material-group choices stay inside the viewport. A real saved preparation name was inspected closed/open at desktop/narrow widths. | Production rollout. |
| #51 | Ready materials expose sanitized inspection details, revision-checked rename and deletion controls, and group status check and deletion actions in the workspace Materials UI. | Production rollout and live upstream asset mutation verification. |
| #52 | Scoped, paginated saved-model discovery works for revoked keys without restoring upstream authority. Actual preparation, key revocation, fresh history discovery and cancellation agree across API, UI and storage. | Production rollout; no native mutation was dispatched. |
| #53 | New uncertain operations can retain bounded diagnostic category/phase; historical unknown causes stay unknown. Migration and actual preparation/cancellation reads checked. | A genuine uncertain operation and corresponding diagnostic UI. No uncertainty was fabricated or replayed. |
| #54 | Exact zero and movements below display precision differ; exact amounts remain available through tooltips. Actual report movement and desktop/narrow rendering inspected. | Production rollout. |

Temporary verification keys and members were revoked, including the temporary
platform grants and the completed Video verification member. Saved histories and audit events are retained. No successful upstream
generation, native mutation, payment, release publication or deployment was
performed in this checkpoint. One actual text request reached an external Provider
and was refused; its uncertain attempt and hold remain, as recorded in
[procurement readiness](procurement-readiness-current.md). Builds, type checks, formatting and generated
contract checks supplement the actual observations; they do not establish the
unverified integrated paths above.

Issue #22 was closed as superseded because current repository instructions
explicitly require **Provider**, including supply businesses and memberships.
Its requested Supplier terminology would violate those instructions.

Issues #1 and #4 were closed as not planned for the current release scope per `docs/product/product-focus.md` and `docs/releases/first-release.md`.

Issue closure does not extend these bounded observations to every conditional
production path. [Unused gift correction](unused-gift-correction-current.md) records
the additional exact financial reconciliation and initial contract limits.
