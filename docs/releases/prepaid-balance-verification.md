# Prepaid balance implementation checkpoint

Reviewed 2026-10-04. F05 remains incomplete.

## Current-input development initialization correction — 2026-10-10

The loopback development member bootstrap previously called the legacy default
workspace initializer. In an actual fresh native database, starting that login
service before calling `POST /admin/v1/setup/default-workspace` left zero customer
balance accounts: setup reused the already-created workspace. This made fresh
local billing behavior depend on initialization order.

Development member provisioning now calls the same prepaid initializer as setup.
A fresh native gateway start, setup HTTP request and independent database reads
confirmed one USD account with zero approved credit, no funding entries and no
inference attempts. The balance HTTP endpoint returned that account. Restarting
with a different development seed password retained the member's saved password
hash, revision and role, the same workspace and the same account count.

The database retained from the pre-fix run was then started with the corrected
binary. Setup and balance HTTP reads still reflected its original legacy state
with no account. Restart preserved that state and its member credential. Existing
workspaces are not silently converted. Isolated processes were stopped; the
original development database and encrypted Supplier credential were unchanged.

This qualifies first-use initialization and the exercised persistence boundary,
not received-money funding, successful paid inference or complete F05 acceptance.
Historical fixture outcomes in the older notes below have no evidentiary role.

## Default setup API contract and concurrency — 2026-10-10

The setup handler now owns its OpenAPI annotation, including the unwrapped
`organization_id` / `project_id` response and installation-only authorization.
The root contract references the generated operation rather than duplicating it.

An actual fresh native gateway received 16 concurrent setup requests. Every
response identified the same company and workspace; independent SQL found exactly
one company, workspace and zero-credit USD balance account. An invalid credential
and a newly issued inference key returned 401. An ordinary company owner returned
403, as did the same member after an explicit audited platform-admin grant.
Restart and another setup request retained the identifiers and one account.
There were no balance entries or inference attempts. This verifies setup
idempotence and the exercised permission boundary, not funding or inference.

## Historical implementation notes

The organization/currency account schema has zero-default approved credit, an optional warning threshold and append-only signed balance entries. Customer tariff binding pins an existing matching account before dispatch. Confirmed customer-charge accrual records the debit in the same transaction as the immutable customer charge, using that charge's currency and amount. Account row locking serializes settlement; uniqueness prevents duplicate debits. Zero-cost requests create no monetary entry. Supplier costs are excluded.

An account created later does not automatically debit historical invoice-era requests: only attempts with a pre-dispatch account binding are eligible. Existing invoice records and compatibility APIs remain intact during implementation; this is not yet the requested balance-first payment workflow.

Fresh PostgreSQL tests passed: both billing integration tests, including concurrent duplicate accrual, exact debit amount, historical-request exclusion and reopening storage without duplicate deductions. A transactional database check also verified zero-default credit, rejection of negative funding entries and entry immutability. Test records were rolled back or created in isolated test databases. Migration numbers were reconciled with concurrent work without changing its source.

The internal organization-scoped summary now derives exact posted balance, approved credit, configured warning threshold and low-balance/posted-credit-exhaustion flags from the ledger. It exposes no account IDs or Supplier data. PostgreSQL coverage verifies negative balances, zero and approved credit, optional warning thresholds and organization isolation. Posted-credit exhaustion does not account for reservations and is explicitly not admission enforcement. The existing workspace-scoped Billing endpoint does not expose this shared-company summary; the separately authorized company endpoint is described below.

Settled funding now has an internal transactional storage boundary and immutable receipt records. A channel/payment reference is globally unique; identical retries return the original entry, while a changed amount, currency or company is rejected. Funding creates a matching zero-credit account when needed and atomically adds the positive entry and receipt. Invalid amounts or references do not fund the account. Callers must authenticate the payment source and verify settlement; no public self-credit endpoint or payment-channel integration is supplied by this change.

All three PostgreSQL billing integration tests passed, including concurrent callback retries, conflicting retries, cross-company payment reuse, exact funded balance, durable retry after reopening storage and receipt immutability. Test settlement channels are fixtures, not supported commercial integrations.

Storage reservations now serialize on the shared account before checking posted balance plus approved credit minus active holds. A trusted caller supplies a conservative positive liability bound; duplicate reservation requests must match that bound and remain undispatched. Confirmed customer-charge settlement releases the hold in the same transaction as the debit. Confirmed non-execution can release a hold; unknown execution cannot. Database constraints bind holds to the exact pinned account and prevent amount changes, deletion, premature release or reopening.

The four PostgreSQL billing tests cover competing reservations from two workspaces sharing one account, duplicate/conflicting bounds, foreign scope rejection, uncertainty retention, exact charge deduction and terminal release. Direct mutation attempts are rejected. These tests qualify storage behavior; the routed checkpoint below covers the separate priced gateway integration.

Priced gateway admission now derives the retail liability bound from the attempt's pinned customer tariff and the configured input/output token bounds. For organizations with balance accounts, customer reservation and the existing guarded procurement/dispatch transition commit in one transaction. Insufficient funds return HTTP 402 before upstream dispatch; missing matching retail/account binding fails closed. Zero-priced bounds require no monetary hold. Existing organizations without balance accounts retain the historical path while account provisioning is still unfinished.

A fresh routed PostgreSQL integration test verified zero-balance denial with no fake-upstream call, verified test funding followed by successful inference, a later insufficient-capacity denial, renewed funding and recovery, two customer debits and no stranded holds. This is a synthetic upstream workflow, not commercial payment-channel qualification. Default account provisioning, full batch qualification, concurrent account activation and the complete protocol/credit matrix remain open; this checkpoint does not qualify end-to-end prepaid enforcement.

Prepaid organizations now reject unpriced routes before admission with an actionable HTTP 400 and no upstream call. A database trigger independently prevents dispatch without a held customer reservation or a pinned zero-price tariff, including the batch admission transition. Priced admission and reservation use organization shared locks before account locks; funding takes the organization update lock, providing a consistent order for normal activation/funding paths. Four storage tests and the routed prepaid test passed again, covering a direct unfunded dispatch mutation and the unpriced route rejection. Broader batch/activation-race qualification remains required.

The company balance API now requires organization-wide owner/admin access (or installation administration); workspace-scoped sessions, company viewers and foreign-company identities are denied. It exposes exact posted, reserved and available funds by currency without account identifiers, Supplier costs or payment references. Installation write access can record an externally verified settled payment through the administrative funding endpoint. This supports trusted payment recording, not a self-service payment integration; pending payments must not be recorded.

The routed PostgreSQL authorization/funding test passed for allowed and denied identities, duplicate receipt replay and exact funded/available balance. The JavaScript SDK has a company-scoped balance read with exact-string amounts and a published response type. The OpenAPI contracts document authorization, the settlement trust boundary and unsupported payment-channel integration. Account membership/role UX and default account provisioning remain open.

Credit limits and warning thresholds now have an installation-write-only policy endpoint, exact monetary inputs, expected revisions and immutable policy history. Configuration can create an unfunded account with zero-default credit; raising credit does not create funding. Reductions that cannot cover active holds are rejected. With no holds, reduced credit may exhaust capacity while retaining the actual negative balance. Balance reads expose the policy revision and configured warning state; notification delivery is not implemented.

Five PostgreSQL billing tests passed, including approved-credit spending into a negative balance, held-liability protection, stale revisions, exhausted-capacity rejection, verified funding recovery and immutable policy history. The routed account authorization test passed for denied customer policy writes, installation policy updates, stale-revision conflicts and readable warning state. Contracts parse successfully. The customer payment UI and full protocol/credit matrix remain unqualified.

The Billing page now follows the inspected OpenRouter Credits hierarchy: balance first, supporting records secondary. Niu uses the agreed sidebar-section/tabs hierarchy with Balance, Statements and Rates. Shared account amounts are requested and shown only for company-level financial access; workspace-only users retain workspace spending. Approved credit, active holds, low funds and exhaustion are shown when present. Dormant invoice issuance/payment and tariff-write forms were removed from the customer page; saved usage documents remain readable. No unsupported payment collection button is displayed.

Five dashboard billing tests and dashboard type checking passed. Browser review at 1280px and 390px covered the actual unconfigured-account state, workspace charges, all tabs and a saved statement dialog. The desktop dialog was widened after inspection; phone line-item horizontal scrolling reached token/rate columns without page overflow (document and viewport both 390px). Existing records and financial data were not altered for screenshots. Funded/credit/warning/suspension rendering is fixture-tested; populated-account browser review remains open because the demo company has no prepaid account. This UI checkpoint does not qualify self-service funding or the full billing journey.

The gateway recovery loop now scans bounded pages of held reservations whose attempts are durably never-dispatched or confirmed non-executed. Releases recheck state under account/attempt locks; uncertain execution remains held. A released intent cannot be reserved again. The recovery operation is idempotent and keeps exact available balance consistent without inferring settlement from elapsed time or a process stop.

All six PostgreSQL billing tests passed, including reopening storage with never-dispatched, confirmed non-executed and uncertain holds, repeated recovery, exact available funds and rejection of reservation reuse. This verifies storage/recovery-call behavior and the wired background loop; full packaged process restart and recovery qualification remains open.

Customer balance refunds and settled-funding reversals now append signed entries against their immutable originals. Account locking caps cumulative reversals at the original amount; identical retries reuse the prior entry and conflicting retries fail. Charge refunds credit account balance without changing original request charges or Supplier accounting. Funding reversals debit actual funds, preserve any resulting debt and do not release uncertain holds. These operations record ledger effects; they do not execute external money transfers.

Seven PostgreSQL billing tests passed, including concurrent over-refund attempts, duplicate/conflicting reversals, foreign-company rejection, unsupported original kinds, exact debt, unchanged charges and durable retry after reopening storage. Installation-write-only reversal and company-authorized latest-100 transaction APIs are documented. The routed authorization test passed for transaction-read role boundaries, forbidden customer reversals, installation reversal replay and exact final balance. Contracts parse and storage/gateway Clippy passed. Full transaction dashboard presentation, paging/export and external payment-channel refunds remain open.

Remaining: self-service top-ups and supported payment channels; account role UX and adjustments; default account provisioning and complete dispatch/batch qualification; uncertain-liability handling and reservation release; credit-control UI and full lifecycle qualification; warning notifications and recovery; full refund/reversal lifecycle and transaction-dashboard qualification; populated-account browser and complete Billing workflow qualification; account ownership and cross-workspace qualification. No prepaid suspension or overspending guarantee is qualified by this checkpoint.

## Global settings placement

Billing & payments now opens from Account menu → Settings, in a dedicated section of the global settings dialog. The supplied Manus and ChatGPT settings screenshots establish the navigation pattern. Company balance and recent transactions use organization-scoped APIs without requiring a workspace billing configuration; workspace billing compatibility pages retain only spending attribution, statements and rates. Billing was removed from workspace navigation.

Reviewed the running dashboard at desktop 1280×720 and narrow 390×844, including Account menu, both Settings sections and dialog dismissal. Fixed the narrow sidebar height so section navigation does not push content below the dialog. Six focused billing tests and dashboard typechecking passed. Live company account was unconfigured; funded/credit/reservation and signed transaction states remain fixture-tested rather than a qualified live payment workflow. No self-service payment processor is connected.

The global Settings entry point is covered by two additional integration tests: organization-wide access reads company funds without any selected workspace, dismissing the dialog restores the account menu, internal identifiers stay out of visible content, and a workspace-scoped owner issues no company billing reads. Together with the six balance/statement tests, eight focused dashboard tests pass. JavaScript SDK exports `CustomerBalanceTransaction` and `getCustomerBalanceTransactions`, preserving signed quantities beyond JavaScript's safe integer range and cancellation; all 76 SDK tests pass. These checks do not qualify external payment settlement.

## Packaged acceptance preparation

The single-image smoke verifier now initializes an isolated prepaid account, submits the same synthetic settled funding receipt twice, and requires one funding entry. After ordinary and streamed fixture inference, it reconciles signed entries against posted/available balance, requires one debit matching the immutable customer charge per attempt, and requires released reservations. The checks repeat after application restart. Compose mode checks funding durability without implying model inference qualification.

Three verifier tests reject missing debits, inconsistent balances, retained holds and mismatched customer charges. The script suite previously failed because upgrade verification assumed contiguous migration numbers; the verifier now requires positive unique versions and correctly selects the next allocated migration across gaps. All 38 script tests passed before the three new prepaid assertion tests, which also passed. The full dashboard suite passed 255 tests. Container execution remains unverified because no Docker or Podman executable is available; this preparation does not pass F01 or F05.

## Packaged account inspection example

The JavaScript package now includes `examples/inspect-account-balance.mjs`, documented in its README. It reads organization-scoped funds and recent transactions without a workspace, keeps currency nanounits exact with BigInt, checks the available-capacity identity, and explicitly labels history as latest 100. It serializes only customer fields, excluding internal IDs, credentials and Supplier expenses. Malformed responses and authorization failures produce no partial successful output or raw error body. Three process-level local HTTP tests cover debt beyond the safe integer range, inconsistent balance rejection and HTTP 403 handling. All 79 JavaScript SDK tests pass. These fixtures qualify the example's transport/output behavior, not real payment processing or complete account history export.

The SDK was packed with `pnpm pack`, extracted outside the repository, and its account example executed from that extracted artifact against an isolated local HTTP fixture. The artifact includes the example, compiled client, declarations and LICENSE. Exact available capacity and signed ledger amounts beyond the JavaScript safe integer range survived transport and output; no source-tree imports, internal IDs or credentials appeared in output. Public-boundary scans passed for 1,006 working-tree files/build inputs and all 32 unpacked package files. This qualifies the shipped account example's artifact composition and isolated behavior; live funds/payment and full F10 remain unqualified.

## Transaction history paging

Company transaction reads now return `next_cursor`, with at most 100 entries per page and descending date/reference keyset ordering. The optional `before` query cursor is validated inside the requested company; missing or foreign entries are rejected. Existing no-query callers retain their latest-100 read. A dedicated company/date/reference index supports history lookup. The JavaScript client accepts a validated cursor with cancellation, and contracts document the response.

A real PostgreSQL test inserted 105 synthetic funding entries, traversed both pages, proved exactly 105 distinct records and a null terminal cursor, and rejected unknown and foreign-company cursors. Storage and gateway compile checks passed. No customer demo funds were changed. The dialog and inspection example still show recent 100 entries; complete UI paging and ledger export remain open.

All 80 JavaScript SDK tests passed after pagination support; both OpenAPI documents parsed and whitespace checks passed. Gateway HTTP cursor rejection and concurrent history insertion semantics still need dedicated acceptance coverage.

Follow-up PostgreSQL-backed gateway tests passed: company owners receive a scoped transaction page and terminal cursor, foreign cursors return HTTP 409, workspace-only owners remain HTTP 404 even with a cursor, and malformed or unknown query parameters return HTTP 400. A storage test also inserts a newer receipt between page reads and proves the remaining older page stays complete and disjoint; refreshing the first page includes the new receipt. This is a live traversal rather than an export snapshot. UI paging, tied timestamp stress and complete export acceptance remain open.

Global dialogs now use the shared branding `--radius-dialog` token (24px), following the supplied Manus settings screenshot. The installed Dialog primitive consumes it; the legacy narrow modal override uses the same token. Settings was visually reviewed at 1280×720 and 390×844 and its computed corner radius confirmed at both widths. Dashboard typechecking passed. Transaction History loading/retry is implemented following OpenRouter's inspected Recent Transactions/History control; nine focused billing/settings tests pass, including preservation on page failure and duplicate-free retry. Actual populated history controls still await browser qualification; the real reviewed account remains unconfigured.

## Billing regression checkpoint

The history test now creates 105 test-only ledger entries within one PostgreSQL transaction and asserts their recorded timestamps are identical. Two pages cover every entry exactly once, while an intervening newer receipt appears only on first-page refresh. All eight PostgreSQL billing storage tests pass, covering pinned prices, funding idempotency, shared holds, uncertain recovery, approved credit, reversals and history boundaries. Storage/gateway Clippy passes for all targets with warnings denied. Public-boundary checks pass for 1,007 files.

The initial unrestricted dashboard run concurrent with Rust compilation timed out in seven interaction tests (249 passed); it must not be counted as a pass. The full unchanged suite then passed all 256 tests across 46 files with `--maxWorkers=2`, after the Rust work completed. Test assertions and timeouts were not weakened. Populated history browser review, payment integration, default account provisioning and full prepaid acceptance remain open.

The packaged account inspection example now accepts `--all` to traverse all available history pages. It follows company-scoped cursors, preserves exact signed amounts, rejects repeated cursors, duplicate entries and missing continuation metadata, and caps extremely large traversals with failure rather than partial success. Null transaction dates are rejected rather than shown as epoch time. Output is emitted only after traversal and validation succeed, excludes internal references, and explicitly declares `all_pages_live_view` instead of claiming an atomic balance snapshot. Added process-level HTTP tests cover multiple pages, loops, missing continuation and null dates; all 84 SDK tests pass. Real complete ledger export qualification remains open.

## Guardrail denial transaction regression

The full PostgreSQL-backed storage/gateway run exposed a priced-dispatch regression: denial prevented egress but the outer customer-reservation transaction rolled back the database function's denial audit. The storage method now commits a genuine audited policy denial together with release of the unused customer hold. Non-policy database errors still roll back, preserving fail-closed behavior; the attempt remains unsent and no charge is created.

All three audit-failure tests passed after the fix, including injected storage failure, cancellation/retry and a new funded prepaid denial with unchanged posted/available funds and no active hold. The complete `cargo test -p niu-storage -p niu-gateway -- --include-ignored` rerun passed 252 tests (169 gateway, one gateway process-replacement test, 17 storage unit tests and 65 storage integration tests), with no ignored tests. The initial broad run failed and is explicitly not counted as successful evidence. Full F05/F09 and packaged acceptance remain open.

## New company account provisioning

Customer-facing company creation and workspace creation that implicitly creates a company now use atomic organization/account storage. The initial account is USD, matching the current customer tariff currency, with zero funds, zero credit and no synthetic ledger entries. Other currencies still require explicit setup; there is no implied exchange or Chinese payment-channel support. Existing organizations, bootstrap/default-workspace compatibility and saved demo setup are not silently converted.

A PostgreSQL test proves zero-capacity/zero-credit creation, rejection of invalid currency or name without orphan companies, and preservation of a legacy organization. A gateway test verifies both onboarding HTTP routes create the shared account. Full legacy rollout, default/bootstrap onboarding and additional-currency customer configuration remain open.

All 13 gateway admin tests passed serially after onboarding changes. The first parallel attempt passed 12 and failed one because its SQLx temporary database no longer existed; it is not a successful run. The serial rerun exercised that workspace-authorization case and passed without changing assertions. Contracts parsed and whitespace checks passed.

## Fresh default workspace setup

The customer default-workspace HTTP setup path now provisions a zero-funded USD account in the same transaction as its first company/workspace creation. A serialized default ownership lock prevents duplicate account creation under concurrent first use. Reusing a designated default preserves its existing commercial state; legacy storage compatibility remains explicit and does not retroactively convert existing data.

All 11 PostgreSQL billing storage tests passed serially, including concurrent first-use setup, shared zero capacity and reuse of an existing legacy default without account mutation. The HTTP onboarding test now also covers the default setup path. Full conversion policy for existing installations, additional-currency customer setup, payment integration and complete prepaid acceptance remain open.

All 13 gateway admin tests passed after the fresh-default change, including all three company-provisioning HTTP paths and existing default reuse.

## Customer warning preference boundary

A dedicated company warning-threshold endpoint now permits organization-wide owner/admin writes without granting credit, funding or reversal access. The storage transaction locks the company and account, checks the shared policy revision, records immutable history and changes only the warning threshold. Unknown currencies do not create accounts; negative values are rejected; null disables the preference. Customer credit fields are rejected by the HTTP schema. External notification delivery remains unimplemented. The Settings editor was added in the subsequent checkpoint below.

A PostgreSQL test races two same-revision preference writes: exactly one succeeds, approved credit and posted funds remain unchanged, and disabling the warning restores its state. The gateway company-access test passes owner/admin writes, rejects workspace-only and viewer writes, stale revisions and injected credit fields. SDK support preserves exact strings and serializes only allowed fields. All 85 SDK tests pass; contracts are documented. This is threshold configuration coverage, not full warning or notification acceptance.


## Global Settings warning editor — 2026-10-05

Company-wide administrators with write permission can configure or disable an in-app low-balance warning from Settings → Billing & payments. The editor uses the existing account currency, parses amounts without floating-point conversion, and sends only the threshold and expected policy revision. A conflict retains edits and requires loading the current account policy before retrying. Approved credit remains a read-only display; financial settlement operations are not exposed.

The actual OpenRouter notification row and configuration dialog were inspected before implementation. Niu deliberately offers only the implemented in-app warning. The live development Settings flow and unconfigured-account state were reviewed at desktop and 390-pixel widths. The demo company remains unconfigured; populated editor interactions have automated coverage, but live populated-account desktop/mobile review remains required before UI qualification. This checkpoint does not qualify F05 or external notification delivery.


## Live warning editor review — 2026-10-05

A separate company and workspace were provisioned through the running public admin API with the actual default USD account: zero posted funds, zero credit and no funding transactions. The saved demo company and Supplier credentials were preserved. Desktop Settings and the nested warning dialog were inspected at 1280 × 720; narrow Settings, editor and conflict state were inspected at 390 × 844 with the shared 24-pixel dialog radius.

Saving USD 12.345678901 through the dashboard produced exactly 12345678901 nanounits in the authoritative API. Reopening the editor at narrow width retained all decimal places. A concurrent warning-only API update caused the open editor's stale save to return a conflict, preserved the entered value, disabled Save and offered Reload current settings. Reload displayed the new USD 15.00 policy; disabling the warning then persisted null at revision 3. Posted funds, approved credit and reservations stayed zero. Full-page reload retained the disabled preference.

All 260 dashboard tests across 46 files passed with two workers after the warning editor change, including the 13 focused billing/settings tests. This verifies the populated zero-funded editor subset and its real persistence/conflict behavior, superseding the earlier live-review gap. Funded warning crossing/recovery, ordinary-role browser review, transaction paging with a real ledger and external notification/payment integration remain open; F05 is not qualified.


## Broader regression and SDK artifact checkpoint — 2026-10-06

The current PostgreSQL-backed `cargo test -p niu-storage -p niu-gateway -- --include-ignored --test-threads=1` completed successfully: 170 gateway unit/integration tests, one gateway process-replacement test, 17 storage unit tests and 69 storage integration tests (257 total, none ignored). The 12 billing storage tests cover prospective charge binding, exact/idempotent funding, shared reservations, uncertain liabilities, approved credit/recovery, bounded reversals, company history cursors, zero-credit onboarding/default setup and warning-only revision races. Gateway coverage includes prepaid admission/settlement/recovery and scoped company warning authorization. This is regression evidence with controlled upstream fixtures; it does not establish real payment-channel or complete funded user-journey acceptance.

SDK runtime validation now requires actual strings for exact warning amounts and revisions, rejects null/numeric revisions and exhausted revision counters before transport, and preserves null as the explicit disable action. All 86 SDK tests passed. The SDK was packed, extracted and its account example executed against the separate real zero-funded review company with `--all`: capacity and credit remained exact zero, inference was reported paused, and the empty history traversal completed. The public-source/build-input boundary scan passed over 1007 files; the extracted package scan passed over 32 files. All 41 Python script tests passed, including package prepaid invariants and migration-gap handling. Billing and main OpenAPI documents parsed successfully.

Docker and Podman remained unavailable when rechecked. Container install/upgrade/backup acceptance, actual payment collection/callback integration, legacy account rollout, funded warning recovery and full F01–F10 qualification remain open. No release gate is marked passed by this checkpoint.


## Durable top-up order storage — 2026-10-06

Migration 0090 adds immutable company-owned top-up intent, provider order identity and successful settlement records. Intent binds an existing account, currency, amount, merchant, aggregator, method and company-scoped idempotency key. Changed replay conflicts; provider identity cannot be rebound or reused across orders. Pending intent creates no balance credit or new currency account.

The trusted settlement method commits the funding entry, globally unique payment receipt and immutable order settlement together. Concurrent replay returns the same entry. Scope/amount/reference mismatch fails; an injected settlement insert failure rolls back the funding and receipt. A receipt already credited through the existing funding path cannot be credited again as a top-up. Composite foreign keys enforce company/account/currency ownership and provider identity linkage. Application authentication and independent paid-order verification remain mandatory caller responsibilities.

All 15 focused PostgreSQL tests passed (12 existing billing tests and three new top-up tests), none ignored, on a fresh isolated native server. Storage Clippy passed with warnings denied. Public source/build-input checks passed over 1014 files. The previous development services were stopped and their temporary credential bundle was absent; no saved development database was reset or reseeded.

The warning remains based on posted account balance, as requested; credit and holds separately determine available spending capacity. The editor wording now reflects that distinction. All 13 focused dashboard billing/settings tests passed; rendered verification of this wording change remains pending because the dev service is stopped. Earlier desktop/mobile editor persistence evidence covers its previously recorded wording.

Gateway checkout/callback transport, merchant configuration/verification, durable pending/failed/expired recovery, CNY retail setup, customer top-up UI and live payment acceptance remain open. Storage fixture funding is not a real payment; this checkpoint does not qualify F05.

## Explicit company onboarding currency — 2026-10-09

Installation-admin company creation accepts an explicit three-letter uppercase `currency`, including CNY. Omitted currency retains USD compatibility. The organization and its initial zero-funded, zero-credit balance account are still committed atomically; existing accounts are unchanged and no exchange or funding is implied. OpenAPI describes the field.

The PostgreSQL-backed `customer_onboarding_provisions_shared_zero_credit_balance` test passed with both explicit CNY company provisioning and existing USD company, personal workspace and default setup paths. OpenAPI parsing and the public boundary check passed. This is backend provisioning evidence only: customer-facing currency selection, configured payment-method availability and live checkout/callback acceptance remain open. F05 remains incomplete.

The onboarding regression also rejects lowercase, wrong-length, whitespace-padded, null and numeric currencies without creating an organization. The focused PostgreSQL test passed again after these cases were added.
