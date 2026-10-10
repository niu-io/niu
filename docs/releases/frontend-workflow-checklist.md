# Frontend workflow qualification

Status: in progress. Updated 2026-10-10. This checklist supplements, rather than replaces, F01–F10 in [first-release.md](first-release.md).

## Design and delivery

- Use the existing **NIU.IO — Current UX & Design Refinements** Stitch project for visual design and iteration. Inspect the relevant mature-product reference and current rendered page before requesting changes. Preserve Niu brand tokens, installed shadcn primitives and supported behavior.
- Frontend implementation and browser verification run locally on main at port 2566 with HMR. The remote backend workstream owns API implementation, migrations and performance. Coordinate contract changes and blockers through shared commits and documentation while direct agent communication is unavailable.
- Prioritize complete desktop business workflows: Supplier configuration and rates → workspace API keys and limits → generation → Logs diagnosis → billing and top-ups. Resolve API contract dependencies before visual polish. Responsive refinement is deferred; fix narrow-screen issues now only when they prevent an action. Preserve the outstanding narrow-width acceptance checks for later release qualification.
- Qualify actual desktop interactions, including loading, empty, error and recovery states where applicable. Automated tests alone do not qualify a workflow. Full release acceptance still includes desktop and narrow-width verification.
- External Agent Observability is separately owned and excluded from edits here. Container qualification remains deferred.

## Workflow checklist

| Flow | Required frontend evidence | Status |
| --- | --- | --- |
| Sign-in and session | Protected destination → login → original destination; reload/restoration, expiry and sign-out; installation setup clearly distinct | Partial; sign-out, protected-route redirect, password login, query-preserving return and reload verified; expiry/revocation and installation distinction open |
| Models → generation | Global catalog, first-row filter, sort/menu alignment, model details and supported capabilities, selected model preserved when starting a generation | Partial; filter, sort menu and selected-model handoff verified; reference comparison and remaining interaction states open |
| Workspace API keys | Create with essential values, copy/setup example, grants and limits, rotation/revocation, authorized details and useful failure recovery | Partial; real key list/details, creation dialog/expiration menu/cancel and Generations link verified; name write/reload and narrow model-access menu verified; creation and single-model save/reload/discovery plus revoked-credential 401 verified; rotation with preserved expiry/grants/rate policy and old-secret 401 verified; ordinary-role grants open |
| Chat | Key-based scope, saved-session title/history, streaming/cancellation, actionable upstream failure, backend restoration and matching Logs | Partial; existing successful history, title, reload restoration and mobile session navigation verified; fresh successful request and restoration verified; connection-stage and live mid-stream cancellation/restoration verified; live partial output and matching interrupted Logs verified; actual two-tab draft conflict/recovery verified; actionable upstream failures and remaining draft transport states open |
| Video | Task category → supported inputs → submission → durable status → preview/download; unavailable, failed, unknown and expired states; matching Logs and customer charges | Partial; desktop category entry, no-supported-route state, key menu and cross-type Chat restoration verified; one personal submission, queued reload, success, preview and download verified; history intent-to-job recovery is defective; commercial billing/failure/expired/narrow states open |
| Logs | Request filters → payload and response → measured timing waterfall → failure diagnosis; exports, unknown values and customer-only costs | Partial; key drilldown, real retained request/error and timing verified; date restoration and mobile detail verified; real model/date CSV exports verified; classified failures, export error browser states and remaining mobile states open |
| Activity | Authorized scope, full-range aggregates → matching Logs; consistent token categories, customer charges and unknown values | Partial; real all-workspace/workspace totals and one model-to-Logs count/filter match verified; Today drilldown and narrow totals verified; other date boundaries and ordinary-role authorization open |
| Guardrails | Supported input/output controls, preview, safe decision diagnosis and clear coverage; ordinary-role access and denied requests | Partial; input redaction/block previews and narrow action menu verified; saved input policy, live input block, versioned history and narrow denial records verified; HTTP failure classification, live output enforcement and ordinary-role access open |
| Settings and billing | Global dialog preserving origin; balance, warning/credit-limit state, history and payment/top-up status; close/reopen/direct URLs | Partial; account-menu opening, Billing/Payments navigation, zero balance, unavailable top-ups, empty history and close-to-origin verified; warning save/reload/restoration verified; payment, credit-limit and remaining narrow states open |
| Admin Suppliers | Directory → add/edit/delete → named detail; credentials/model subsets/rates; sidebar sections and detail tabs; customer/admin navigation both available | Partial; directory/detail, saved OpenRouter route, add-key cancellation, adapter menu and rate editor verified; business-profile save/reload/cancel and exact text-rate save/reload/restoration verified; credential/model writes, model subsets and remaining tabs open |
| Admin authentication/payments/branding | Expose only working configuration lifecycles; validation/save/reload/error states; no secret disclosure; branding preview/reset and personal-theme preservation | Partial; payment draft recovery verified; the shared branding checkpoint records native save/upload/reset and responsive acceptance; packaged branding, payment save lifecycles and OAuth configuration open |

## Browser evidence

All observations below use the real local service and saved data. Narrow checks used a DOM-measured 390×844 viewport, reset after verification. Earlier ineffective viewport overrides are not counted.

- **Authentication:** explicit sign-out showed email/password Login. A protected Logs URL redirected to Login; sign-in restored its workspace path and model query, which survived full reload.
- **Models:** 25 real catalog entries; `gpt-4.1` filtered to one. Sort and model-choice menus aligned with standard gutters at desktop/narrow widths. Model details showed capabilities, unpublished customer prices and an essential curl example. Try in Chat preserved GPT-4.1 Mini and Demo API key.
- **Models filter visibility:** after inspecting the actual reference, reviewed and corrected the existing Stitch mobile candidate (`eb94d3e5756148a781b0cc5f60ed8fbb`). Implemented removable developer/Provider filter buttons using the installed Button primitive. Live HMR at a measured 638×724 viewport showed the OpenAI selection after closing the sidebar, six matching models, recovery to all 25 on removal, an unmatched-name empty state and loading all 25 entries. No horizontal overflow. Viewport overrides remained ineffective even after reload; this checkpoint does not qualify desktop or 390px layout. The override was reset. Thirteen Models tests and TypeScript checking passed.
- **Models responsive follow-up:** an independent background tab accepted viewport overrides after creation. Actual DOM measurements confirmed 1280×720 desktop and 390×844 phone. Compared the desktop filter/sidebar/list hierarchy with the inspected OpenRouter reference and the phone state with the corrected Stitch candidate. At 390px the rail was hidden; the filter sidebar opened, OpenAI selection remained visible after closing, the open sort menu fit with standard item gutters, Name A–Z could be selected and the developer filter removed. No page overflow. The override was reset. Model detail → Try in Chat additionally retained GPT-4.1 Mini and Demo API key, and consumed the new-page parameter after draft preparation; no inference request was sent.
- **API keys:** real list/detail and matching request drilldown; create-dialog name/expiry choices and cancellation. A temporary name change survived reload and was restored to Demo API key. Narrow model-access menu fit and was cancelled; credentials/grants were unchanged.
- **API key lifecycle:** with explicit authorization, created Frontend verification with 90-day expiry. The one-time setup included the API secret, actual `/v1` base URL and a curl example with a configured model, authorization header and message body. Reload retained the new active key; revocation then survived another reload. The test key made no requests and Demo API key remained active. This qualifies the owner UI creation/revocation subset, not revoked-credential API rejection, rotation or ordinary-role grants.
- **Workspace rename:** an actual name update survived reload and updated the header, but routes derive their path segment from the mutable name. Existing named links then became unavailable, including after restoring the display name of the legacy default workspace. The original stored name was restored, and the original key-list URL again resolved with Demo API key active. Stable rename-safe links remain a defect; do not replace durable route identity with a browser-only alias cache.
- **Chat:** a fresh GPT-4.1 Mini request returned `NIU_OK`, 18 tokens and Own API key attribution. Reload restored title, prompt, response and history. Its Logs record retained both messages and HTTP 200. A separate connection-stage cancellation restored after reload with unknown tokens/charge. An earlier stop attempt finished first and is not cancellation evidence. Incremental output and mid-stream cancellation remain unverified.
- **Chat management:** the new test session was renamed, archived and restored; reload retained title and response. Mobile history/action menus fit. Its backend export contained title, prompt and response with only model/phase/content result fields; no routing UUID or accounting fields. No session was deleted.
- **Logs:** model/key drilldowns, Today empty state and All time restoration preserved filters. A completed request showed measured preparation, first-output wait and stream phases; the mobile detail and previous/next controls fit. Retained success/error messages rendered; expired bodies were explicitly unavailable. Older failed records lack the new durable classification, so a classified live failure remains unqualified.
- **Filtered Logs export:** native page interaction on 2026-10-10 exported the selected local day and GPT-4.1 Mini filter. The downloaded CSV contained exactly the four displayed requests, all with the selected model. Its 18 columns included customer charge status/currency/amount, usage confidence and timing; no routing identifiers or Supplier accounting columns. Pagination beyond this four-row subset and ordinary-role export remain unqualified.
- **Activity:** all-workspace totals and default-workspace totals loaded. A two-request model group opened matching Logs with two rows and Own API key attribution. Today additionally showed four requests, two reported usages and two unknown usages; its model drilldown preserved the date and returned four Logs rows. Mobile totals fit without horizontal overflow. Other date boundaries and ordinary-role authorization remain open.
- **Guardrails:** directory/policy sections and synthetic input/output previews worked; external checks disabled addition without an authorized detector. The isolated live-input workflow below now qualifies saved input rules and recorded preparation blocks. Output enforcement and external detector authorization remain separate gates.
- **Settings/Billing:** global dialog opened from Logs, preserved origin on close, and direct Billing URLs worked. Actual zero balance, insufficient funds, empty transactions and unavailable top-ups rendered. A USD 5 warning saved and restored after reload, then was returned to Disabled. Negative input now reports zero-or-greater validation.
- **Admin Suppliers:** OpenRouter retained one enabled key and 25 routes. Directory/detail breadcrumbs and customer navigation worked. Add-key adapter choices/cancellation preserved configuration. GPT-4.1 Mini cache-read purchase rate was saved as USD 0.1 per million tokens, matching the public demo supplier price; ordinary input/output stayed USD 0.4/1.6. Actual save/reload checks covered preservation, explicit zero and explicit clearing, then restored USD 0.1. The offer remained paused and unqualified; no inference or payment occurred. Desktop and measured 390×844 table, action menu and editor were inspected without page overflow.
- **Supplier model editor:** directory → API keys & routes → model management → GPT-4.1 Mini editor was inspected at desktop and measured 390×844. A temporary upstream-name draft was cancelled; reopening restored the original mapping. The scrollable editor and dismissal controls worked without page overflow. Existing credential, capabilities and routes were unchanged. Actual mapping saves remain unqualified.
- **Admin configuration:** EPay Escape/Cancel reopens saved values rather than stale drafts, including mobile. Branding/Theme tabs, default-appearance and preview menus loaded; mobile preview fit. Discard restored System and disabled Save. No merchant or deployment setting was submitted.
- **Shared branding evidence:** [Branding and theme administration](branding-theme-verification.md) separately records native display-name save/reload, logo/favicon propagation to sign-in, invalid-palette preservation, preview/reset and desktop/phone/compact inspection. This supplements this workstream's preview-only checks; packaged lifecycle acceptance remains open.
- **Video:** choosing the category with Demo API key reported no supported route and offered no fabricated model/submission. Local submission, result/preview/download and mobile lifecycle are unqualified. Remote API replay authorization is separate evidence and does not qualify this browser flow.

## Fixes and automated checks

- Billing/Payments no longer misreports missing organization data during restoration as a permission denial. Authorized users see a loading state, then their account; failed account loading offers Retry. Twelve account Settings tests and TypeScript checking passed. Native browser restoration showed loading followed by the real unavailable-top-up/empty-history state. At measured 390×844, Settings navigation, Billing, warning-editor cancellation and Payments fit without page overflow; closing restored the original Models path and workspace query. No payment or credit setting was changed.
- New-generation intent is consumed after confirming the fresh backend draft, so reload no longer clears unsent work. Model selection is preserved when consuming the parameter or opening account Settings. All 45 Chat/draft integration checks and TypeScript checking passed. Actual new-page input restored after reload; the 390×844 composer fit without overflow. The unsent test draft was cleared, with no model dispatch.
- Readable retained JSON/SSE error messages preserve partial output without diagnostic metadata: 8 request-content tests passed.
- Optional durable failure classification separates upstream status from gateway delivery: 50 GatewayActivity integration tests passed; real classified-record qualification remains open.
- Logs histogram boundaries now match the query's local calendar days, including the full selected end date. All 51 GatewayActivity integration tests passed under Asia/Hong_Kong, and the dashboard TypeScript check passed. The rendered single-day axis showed midnight through the next midnight. At a measured 390×844 viewport, both axis labels, the date filter and the open sort/export menu fit without page overflow. The interrupted-request detail retained unknown usage and measured preparation/wait intervals without presenting them as complete latency; its content and navigation fit. The viewport override was reset after inspection.
- Correct negative warning feedback and payment-editor saved/draft separation: dashboard TypeScript check and live HMR/browser checks passed.
- Models component checks on `26c1d618`: both Models test files passed (13 tests), and the dashboard TypeScript check passed. An earlier interrupted full-suite run is not a passing full-suite result.
- Current main at `6cf816db`: all 77 dashboard test files and 550 tests passed, and the dashboard TypeScript check passed. This automated checkpoint does not close the rendered workflow requirements above.

## Remaining dependencies

- In-app browser control is working for current local workflow qualification, including measured desktop and phone viewports. The separate Alipay configuration remains incomplete after concurrent browser interaction interrupted native Chrome work; it has no completed payment setup evidence.
- The personal video route is configured and one successful job is qualified. Repair intent-to-job restoration before qualifying unified history recovery; preserve the original submission identity and never recover by resubmitting.
- Provide durable workspace route identity or retained aliases across renames, with collision and authorization handling. The current workspace response has no stable route slug; frontend-generated name slugs invalidate bookmarks when names change. Coordinate a backend contract before adding client aliases.
- Qualify domestic currency funding, merchant checkout and authenticated payment confirmation; do not infer FX or credit accounts from callbacks alone. Native Zhifux/Stripe configuration is server-managed; OAuth configuration remains unimplemented and must not be an empty Admin destination.
- Financial acceptance follows the [independent capability inventory](../product/backend-capability-checklist.md#financial-capability-inventory): checkout/recovery, actual settled funding, pinned customer tariffs, concurrent reservations, final debit, uncertain liabilities, reversals and statements each require separate evidence. Owner-funded personal Chat does not qualify prepaid admission or payment settlement.
- Complete cached-input display in the Supplier portal, then qualify actual published customer cache prices and settled statement lines. Admin offer editing, customer Models details and usage-statement cache fields are implemented; customer-funded cache settlement remains a separate backend acceptance requirement.
- Complete live output-policy enforcement, ordinary-role isolation, credential rotation/session expiry/revocation, full admin writes and remaining error/mobile states in the table. Live input blocking and API key revocation are qualified below.
- Correct the backend public error for Guardrail preparation denial. A real input-rule block currently returns HTTP 403 with `permission_denied` and an administrator-role message; the recorded event correctly says `input_blocked`. The inference preparation handler calls the same generic forbidden helper as administration. Provide a safe distinct machine-readable inference failure; the frontend must not infer Guardrails from every 403.
- OpenRouter's actual desktop Models page and open sort menu were inspected through native Chrome on 2026-10-10. The reference uses a filter sidebar, a visible first-row model filter and sort controls, and model entries with descriptions, authors, context and prices. Its marketing, rankings and unsupported capabilities are not Niu requirements. Concurrent browser control interrupted the local-page comparison; desktop/narrow comparison and Stitch correction remain open. The earlier generated mobile screen has navigation/filter deviations and has not been applied.
- Supen direct coordination is unavailable because authentication fails. Use shared main and contract documents; preserve private credentials and the remote backend workstream.


## Cached-input frontend increment

- Inspected OpenRouter's GPT-4.1 Mini provider table with separate input, output and cache-read prices. Used the existing NIU.IO Stitch project for the cache-rate dialog/table increment; retained Niu's existing centered mobile dialog and theme rather than adopting generated mock qualification states or prices.
- Admin writes explicitly preserve a cached rate or send null when cleared, with exact nine-decimal conversion and the saved revision. Zero is distinct from blank. The responsive purchase-rate table shows the cached rate, or “Input rate” for flat pricing.
- Customer Models details consume only the published customer tariff's nullable cache rate. The actual unpriced GPT-4.1 Mini detail remained “Not published” at desktop and 390×844 despite its Supplier purchase rate. A real published cached customer tariff display remains unqualified; component checks cover published, zero and null values.
- All 84 targeted Supplier, Models, layout and authentication-boundary checks passed. These tests do not establish customer-funded cache settlement. Supplier portal membership and customer statement cache-price display remain outstanding.


## Customer statement cache fields

- Rates now show the published customer cache-read price, including explicit zero; null uses the ordinary input rate. Statement lines display their pinned cached rate and reported cached-input quantity. Missing quantity is “Unknown”, never zero. Existing amounts, ordinary input/output totals and historical revisions remain unchanged.
- All 26 Billing component checks and dashboard TypeScript checking passed. Checks distinguish null/zero rates and null/zero quantities, preserve exact decimal prices and exclude internal revision and procurement values from customer output.
- The actual default workspace has no published customer rates or statements. Its Rates and Statements tabs were inspected at desktop and measured 390×844; empty states and navigation fit without page overflow. These observations do not qualify populated cache-rate tables, settled statements or funded inference. Do not fabricate line items to close this gate.
- Backend contract dependency: customer text tariff writes currently require `AdminAuthorization::is_installation()` in the billing authorization helper, while normal platform administrators are durable operator sessions (`can_manage_platform()`). Define and implement the platform-administrator customer-price configuration lifecycle, preserving customer scope and procurement separation, before qualifying it through normal administrator login. No backend authorization change was made in this frontend increment.


## Media statement frontend integration

- Integrated the [media invoice contract](../reference/media-invoice-integration.md): statement details render customer `media_lines` separately from text groups, with exact charge and rational measured/billable usage. Internal tariff/discount revisions and cursors are not displayed. A media-only statement no longer incorrectly reports no line items.
- Media pagination appends separate charge records without duplicating the text groups repeated by the API. Failed pages retain existing rows and retry the same cursor. Closing or switching a statement aborts the old page and ignores late results. The existing flat-table/centered-dialog composition was reviewed through the NIU.IO Stitch project; generated placeholders are not product data.
- All 30 Billing component checks and dashboard TypeScript checking passed, including media-only, mixed pagination, failure/retry and late-response cases. The real local default workspace still has no statements; refreshed desktop and measured 390×844 empty-state navigation remained functional without page overflow. Populated browser layout, cursor traversal against real invoices and paid text/media settlement remain unqualified. No charges or statements were fabricated.
- Next saved-policy qualification must use an isolated workspace as well as an isolated key: the current Guardrails policy applies to every key in its workspace. Do not alter the demo workspace's shared default policy merely to test an individual credential.


## Saved Guardrails and key lifecycle

- Used the isolated Guardrail verification workspace, whose prior keys were revoked. Created a 90-day test key and saved the Email addresses input pattern with Block; reload retained it as workspace policy version 6. A real compatible Chat API request containing only a synthetic email was blocked before admission. Blocked requests identified the named key, input-rule reason and pinned version 6 at desktop and measured 390×844 without page overflow. The key detail showed no model attempts or customer charges; this does not qualify upstream output enforcement.
- Saved the key's model permission as GPT-4.1 Mini and reloaded. Its actual `/v1/models` read returned exactly that model. Revoked the key in the UI; reload retained Revoked. Both a catalog read and another Chat request with the revoked credential returned HTTP 401 `authentication_error`. No further preparation-denial record appeared.
- Removed the test input rule and saved/reloaded the original unrestricted input configuration as version 7. History retained versions 6 and 7 with the named editor; the old block still references version 6. Temporary private credential material was deleted. Demo workspace/key and Supplier configuration were unchanged.
- This was native browser and real API qualification, with no source modification or additional automated test required. Public inference error diagnosis remains incorrect as described above. The history dialog now uses the shared human-readable builtin pattern names. Actual version 6 displays “Email addresses” at desktop and measured 390×844; custom regular expressions remain visible and unknown presets use “Pattern name unavailable”. Component checks cover these naming cases without modifying saved policies.

## Live streaming interruption qualification

- Used the existing owner-funded Demo API key and GPT-4.1 Mini, without changing Supplier routes or commercial qualification. Two preliminary requests completed before the attempted stop; those are not cancellation evidence. A third request visibly generated partial text while Stop generating remained available, then changed to Cancelled when stopped. Full reload restored the same partial text and Cancelled state from backend history. Tokens remained Unknown; restored billing attribution was Own API key, not a fabricated zero customer charge.
- Its Inspect request link opened the actual corresponding Logs detail. The record retained partial response content, Uncertain upstream state and HTTP 200 delivery status. Measured phases were preparation 72 ms, first-output wait 1.41 s and output stream 10.14 s, with 11.63 s explicitly described as an observed interrupted interval rather than complete latency. No total-token value or complete latency was invented. This does not qualify a durable classified upstream failure.
- Inspected the restored long response and its Copy/Inspect request actions at measured 390×844 without horizontal overflow. Inspected the matching Logs detail and timing bars at both phone and desktop widths. Restored the temporary output-token setting from 2048 to its original 512; no credential or shared access setting changed. This was live browser qualification of existing behavior, with no UI source change requiring a new component test.
- Synced the latest backend integration baseline. Key request-rate, concurrency and token-rate read/edit controls are now integrated in key details. History and ordinary-role browser qualification remain open; see the limits increment below.

## Frontend review of the generated documentation — 2026-10-10

The local documentation build now serves `/docs/reference/handler-operations/`
on the existing development origin. The generated page exposes 29 annotated
operations; it explicitly remains a subset of the root contract. Extraction
freshness and the selected root-contract entrypoint checks passed. Desktop
operation anchors and the measured 390-pixel layout were inspected; no page
overflow was observed. This is documentation qualification, not live endpoint
qualification.

The backend corrected both TPM description fragments in `80eb7993` and
`51608069`. Regenerated schema descriptions now retain the complete sentences
without extra JSON keywords. The documentation was rebuilt and opened on the
local development origin after pulling these changes; extraction reports 29
operations and the root entrypoint check reports 65 registered paths.

## API key policy integration inventory

Current `KeyDetailView` supports metadata, model access, expiry display,
revocation, Guardrails and request activity. RPM, concurrency and TPM now have read/edit and history controls; ordinary-role
browser qualification remains open. The other policies below remain to be integrated. Backend verification
does not close these frontend flows.

| Contract | Frontend integration requirement |
| --- | --- |
| Request-rate limit | Read/edit RPM and history; explicit null is unlimited, zero blocks new dispatch; preserve independent string revision. |
| Concurrency limit | Read/edit limit and history; show unresolved active requests as a snapshot, including work retained after disconnection. |
| Token-rate limit | Read/edit TPM and history; unknown committed usage remains unknown; explain unresolved reservations and unsupported video requests for finite policies. |
| Token usage window | Read the rolling 60-second known subtotals with unknown-request count; never equate zero known usage with zero actual usage. |
| Source IP policy | Read/edit IPv4/IPv6 addresses or CIDRs and history; null allows all, empty list denies all; retain normalized saved values. |
| Key spending limit | Read/edit currency-specific customer allowance and history; preserve exact monetary strings; distinguish allowance from company balance; reject changes below committed liability. |

Stitch reviewed the incremental Limits composition in the existing NIU.IO
project (session `17988644959648407750`). The inspected LiteLLM optional-settings
numeric form is the reference because OpenRouter's authenticated key settings
were inaccessible. Keep the current key detail shell, add compact independent
policy rows, and edit one policy in the existing rounded Dialog at a time.
Each save needs its own revision and error recovery; there is no atomic combined
policy save. At narrow widths, stack labels/values while retaining accessible
Edit actions and scrollable dialog content. The subsequent limits increment below records implementation and its bounded
rendered qualification.

## API key throughput limits increment — 2026-10-10

- Added independent RPM, concurrency and TPM read/edit controls below Guardrails
  in key details, following the reviewed numeric-form/Dialog pattern. Each write
  retains its own exact string revision; blank explicitly removes a limit, zero
  blocks new dispatch, and invalid numeric input cannot submit. Failed reads are
  unavailable with Retry, not unlimited. Conflict edits remain blocked even after
  closing/reopening until the saved policy is reloaded.
- Real Demo API key reads showed three unresolved requests and unknown committed
  usage with two unbounded requests. This is an observed snapshot, not zero usage.
  TPM editing explains the finite-policy restriction on video requests.
- Saved RPM 1,000,000 through the actual local API, reloaded and observed that
  exact value in the editor, then explicitly restored the original unlimited
  policy and confirmed it after another reload. No inference was dispatched.
  Concurrency/TPM reads and editor cancellation were inspected; actual writes for
  these two policies remain unqualified.
- Desktop and measured 390×844 views were inspected, including centered rounded
  dialogs, invalid TPM feedback, cancel/reopen draft restoration and focus return.
  The phone page had no horizontal overflow; the viewport override was reset.
- All 34 API-key tests across six files and the dashboard TypeScript check passed.
  Tests cover exact revisions above JavaScript's safe-integer range, null/zero,
  conflict reload, failed read retry, failed-write draft retention, invalid bounds,
  viewer controls and unknown usage. Live viewer authorization, histories, IP
  policy, spending limits and token usage-window integration remain open.

## Limit history and remaining throughput writes — 2026-10-10

- Added read-only history for all three throughput policies, available independently
  of editing permission and key lifecycle. The existing rounded Guardrail history
  dialog and the inspected LiteLLM audit-table pattern informed the composition;
  Stitch reviewed it in the existing NIU.IO project. Only limit, actor name and
  recorded date are shown. Revisions remain exact private pagination cursors.
- A full 20-row page offers Load older changes without an invented total count.
  Append failures retain existing rows and retry the same cursor. Closing aborts
  pending history reads; malformed/non-descending pages are rejected.
- Native browser verification observed the real RPM save/restoration records.
  Concurrent limit 10,000 and TPM 1,000,000,000,000 were separately saved,
  reloaded into their respective editors, explicitly restored to Unlimited and
  read again. Each history showed both actual changes attributed to Demo.
  No inference, payment, credential or model-access change occurred. These checks
  qualify configuration persistence, not gateway enforcement under load.
- Desktop and measured 390×844 history dialogs were reviewed. Corrected a mobile
  width constraint and shared table-style interference so the largest supported
  TPM value remains readable in full, actor/date cells fit, and the dialog has
  16-pixel screen gutters with no page overflow. Temporary viewport was reset.
- All 38 API-key tests and TypeScript checking passed, including exact cursor
  values beyond JavaScript's safe-integer range, older-page failure/retry, genuine
  empty history, non-descending response rejection and close-time cancellation.
  Actual multi-page histories, ordinary-role browser qualification, IP policy,
  spending limits and token usage-window integration remain open.

## Source IP access frontend increment — 2026-10-10

- Added a key-scoped Source IP access summary, editor and read-only history.
  The existing key policy form/dialog and history patterns were retained;
  Stitch reviewed the increment in the NIU.IO project. The official OpenAI
  allowlist guide informed IP/CIDR semantics; authenticated upstream settings
  were not inspected or claimed as a visually copied reference.
- Choice menus use installed DropdownMenu radio items directly. Allow all sends
  explicit null, Block all sends an empty array, and Allow listed requires at
  least one entry with the documented 64-entry/64-character bounds. Backend
  address validation errors retain the draft. Saving re-reads normalized saved
  networks. Conflict protection survives closing/reopening until Reload policy.
- The shared exact-cursor history composition now handles source policies as
  well as numeric limits. It shows network values, names and dates without
  displaying revision identifiers; unrestricted and blocked policies remain
  distinct. The component was renamed KeyPolicyHistory to match this scope.
- Actual Demo key read showed Allow all sources and no recorded source policy
  changes. Desktop and measured 390×844 mode menus were opened and inspected;
  listed IPv4/IPv6 drafts, Block all guidance, cancellation/reopening and genuine
  empty history worked without page overflow. Drafts were cancelled and the
  viewport reset. Existing key IP permissions were not modified.
- All 45 API-key tests and TypeScript checking passed. Tests cover explicit
  null/empty/list writes, normalized reads, conflict reload, failed read retry,
  retained server validation errors, entry bounds, viewer controls and source
  history semantics. Actual isolated browser save/enforcement and ordinary-role
  authorization remain unqualified; these are not implied by component checks.

## Isolated source IP workflow qualification — 2026-10-10

- Created a separate disposable verification key in the Guardrail verification
  workspace; shared Demo key permissions and Supplier credentials were unchanged.
  Saved an IPv4 CIDR with host bits and a single IPv6 address through the browser.
  The summary and reopened editor restored normalized `127.0.0.0/8` and `::1/128`
  after a full refresh.
- An actual allowed-source Chat request returned the requested fresh marker with
  13 prompt and 5 completion tokens. Key activity showed one completed request,
  18 tokens, a complete gateway timing and Own API key attribution. This exercises
  the existing personal route, not commercial supply or customer billing.
- Saved Block all sources through the browser and refreshed. An otherwise equivalent
  inference request returned HTTP 403 with `key_ip_not_allowed` and an explicit
  source-address message. The rendered activity remained at one recorded request;
  no additional dispatched request appeared.
- Actual history showed both changes, newest first, with normalized networks, Demo
  and recorded dates. Desktop and measured 390×844 views were inspected; the
  network strings and table remained readable with no horizontal page overflow.
  The temporary viewport was reset.
- Revoked the isolated key and verified HTTP 401 for its credential. Its reloaded
  details showed Revoked without edit actions, while source history remained
  readable. Temporary private credentials were removed from outside the repository.
  Ordinary-role authorization and IP behavior through different deployment proxies
  remain unqualified; this local check does not prove those scenarios.

## Key spending-limit frontend increment — 2026-10-10

- Added currency-specific lifetime key allowances below Source IP access, with
  limit, committed customer amount, remaining allowance, Edit and History. Only
  backend-discovered currencies appear; empty and failed reads remain distinct.
  Amounts use exact decimal strings and BigInt nanounits, preserving nine decimal
  places and the signed-64-bit bound without floating-point conversion.
- Stitch reviewed this incremental composition in the existing NIU.IO project
  (session `5391271498297900043`), using the inspected LiteLLM Max Budget form
  and existing Niu rounded policy dialogs as references. Generated reset budgets,
  funding claims and unsupported contract field suggestions were not adopted.
  History reuses the existing three-column table and exact descending cursors.
- Blank explicitly removes the key limit; zero is a valid finite limit. Client
  validation prevents lowering below the saved commitment; backend 402 or 409
  requires a fresh read and cannot be bypassed by closing/reopening the dialog.
  Other write failures retain the draft. Read-only and inactive keys retain history
  without edit controls. Company/workspace constraints still apply, changing a cap
  adds no funds, and personal upstream routes do not consume customer allowance.
- A separate actual test key saved USD 1.000000001, restored that exact value after
  refresh, then saved zero and explicitly restored Unlimited. Actual history
  recorded all three changes. An independent concurrent write while the editor
  was open produced a real conflict; closing/reopening kept the editor blocked,
  and Reload limits restored the other saved value. No inference or payment was
  performed. The test key was revoked and temporary private credentials removed.
- Desktop and measured 390×844 views were inspected: summary rows stack, history
  amounts/names/dates fit, invalid decimal precision disables Save with readable
  feedback, and cancelled drafts restore saved values. No horizontal page overflow
  was observed; the temporary viewport was reset.
- All 53 API-key tests across nine files and dashboard TypeScript checking passed.
  They cover exact monetary/revision boundaries, null/zero, committed-liability
  protection, conflict reload, failed read/write recovery, genuine empty currency
  discovery, read-only controls and monetary history currency validation. Actual
  paid-request cap enforcement, nonzero commitment UI, ordinary-role authorization
  and multi-page monetary history remain unqualified. Token usage-window frontend
  integration and the other release workflows remain open.

### Supplier generated-contract review (2026-10-10)

- Reviewed the newly generated Supplier credential and model-binding contracts
  against frontend writes. Model edits omit procurement pricing, preserving the
  saved value; creation sends explicit null, and updates carry the saved integer
  revision. Procurement prices remain separate from customer selling tariffs.
- Corrected the Supplier integration-test API to preserve omitted pricing instead
  of silently clearing it. Added a regression exercising capability editing on an
  already priced mapping, its saved revision and subsequent read. All 18 tests in
  the Supplier integration and model-list suites and dashboard TypeScript passed.
- Inspected the actual local OpenRouter Supplier's 25 routes, alias filtering and
  model editor at desktop and 390×844. A changed upstream-ID draft was cancelled;
  reopening restored the saved upstream ID. The editor scrolls at narrow width.
  No model write, credential change, inference or payment occurred in this review.
- The local documentation site renders the new model-binding chapter and its
  authentication, parameters and schema references. Root OpenAPI entrypoint
  checking passed for 76 registered paths and 56 generated methods. This remains
  an annotated subset, not a complete generated reference.
- This increment does not qualify real procurement-price writes, stale-revision
  recovery, multiple upstream accounts, commercial supply or video execution.
  Those remain part of the full Supplier and Generations acceptance work.

### API key rolling token window (2026-10-10)

- Integrated the read-only `token-usage-window` contract within the existing Limits
  section. Stitch review 15481990811136666009 confirmed the flat metric grouping
  based on the inspected LiteLLM customer-usage reference: one explicit window
  timestamp, a refresh action, and a four-column desktop/two-column mobile list.
  Existing brand tokens and direct shadcn controls remain in use.
- Token sums use exact integer strings and BigInt. Any incompletely reported
  request makes total tokens Unknown; known input/output exclude those requests.
  Failed or malformed reads show unavailable with Retry, never fabricated zeros.
  Refresh hides the old snapshot; changing key/session aborts old reads. This is
  dispatch-window telemetry, separate from TPM's unresolved reservations.
- Two short actual owner-funded GPT-4.1 Mini calls were sent through a separate
  90-day test key. The first returned 15 input/5 output tokens and its API window
  matched. By the next browser read it had rolled out of the 60-second window,
  which truthfully showed zero. A subsequent 14-input/5-output response appeared
  in both desktop and 390×844 browser views as one request and 19 total tokens.
  Refresh advanced the window timestamp. No funding or payment was created.
- The test key was revoked (204), its separate verification session signed out
  (204), and its temporary private credential file removed. The viewport was reset.
  An already revoked, unused key also returned and rendered an actual empty window.
- All 58 API-key tests across ten files and dashboard TypeScript passed. Tests
  cover exact large token sums, partial unknown usage, failed-read retry, malformed
  snapshots, refresh loading and aborted old-scope responses. Actual browser
  incomplete-usage and storage-failure states remain unqualified; no backend
  performance or TPM enforcement claim is made by this frontend increment.

### Saved Video read recovery (2026-10-10)

- Fixed two dead ends within the existing Video result layout. A failed initial
  saved-job read now exposes the same Reload status action used for loaded jobs.
  Opening a saved-job link without an active workspace key now asks for an active
  key instead of showing Loading saved video indefinitely. No new visual pattern
  or unsupported submission-retry capability was introduced.
- All 34 Video tests across five files and dashboard TypeScript passed. The new
  regressions cover a failed status read followed by recovery to Queued without
  a generation POST, and an all-revoked key list that makes no Video API request.
- Actual desktop and 390×844 browser checks used a nonexistent saved-job reference
  with the real demo key. Its resource-unavailable response remained actionable
  through Reload status, with no generation submission. A workspace with only
  inactive keys rendered the active-key guidance at both widths. Temporary
  viewport overrides and invalid-job navigation were cleared afterward.
- The current demo key's real catalog still reports no supported Video route.
  Live creation, original-account recovery, preview/download and charge diagnosis
  remain unqualified locally. The existing backend/SDK text-video idempotency
  contract is not yet integrated into the dashboard; durable submission intent
  and same-identity recovery remain part of the complete journey, not an implied
  permission to retry uncertain unkeyed generation.

### Generation key and history scope isolation (2026-10-10)

- Video API paths now require the selected key to belong to a successfully loaded
  key list for the current member session and workspace. A workspace switch no
  longer briefly queries the new workspace with the previous workspace's key.
  History pagination aborts on scope/list changes and rejects responses from an
  earlier visit, including leaving and returning to the same workspace.
- All 41 Video/Generations tests across seven files and dashboard TypeScript
  passed. New deferred-response regressions verify no old-key Video request while
  the new workspace key list is pending, and no stale page insertion after an
  A → B → A transition. Existing submission and history isolation tests passed.
- Real desktop and 390×844 key-menu checks switched between Demo API key and a
  separate 90-day key in another workspace, then back. Selected names and URL
  scopes updated without an error; the opened narrow menu fit within the viewport.
  Existing saved conversations remained accessible across authorized workspaces.
  No inference, generation or payment was submitted. The temporary key was
  revoked, its separate session signed out and private credential file deleted.
- These checks qualify the exercised key-switch and response-isolation subset.
  Ordinary-role scope denial, live video creation/result recovery and paid
  accounting remain separate open gates. The actual demo Video catalog remains
  empty; no entitlement or model availability was fabricated for this review.

### Saved payment response integrity (2026-10-10)

- Top-up creation, history pagination and status reads validate saved amounts,
  currencies, statuses, dates and response shape before rendering. Invalid amounts
  cannot crash money formatting. Status reads must match the selected order's
  immutable identity, currency and amount before replacing its checkout or
  triggering a balance refresh. Failed reads retain previously loaded records.
- All 58 Billing and Settings navigation tests across four files and dashboard
  TypeScript passed. Regressions cover malformed/overflowing saved amounts with
  successful read retry and rejection of another order's payment status.
- The running dashboard was inspected at desktop and 390×844. Global Settings
  Payments loaded the actual unavailable integration and empty history; refresh
  worked and closing returned to the original Supplier page with its filter.
  No checkout was created or payment submitted. Malformed-response recovery is
  test-qualified only; live funded checkout, settlement and reconciliation remain
  open gates because this account has no available online funding integration.

### Video submission recovery contract audit (2026-10-10)

Superseded backend finding: commit `fcd43780` implements the actor-owned intent
operations requested below. The frontend gaps described here remain open; the
missing backend contract is no longer a blocker. See the runtime follow-up below.

- The current dashboard submits without `Idempotency-Key`; its uncertainty lock
  exists only while the component remains mounted. Leaving the page does not
  retain the exact request or recovery identity. Saved jobs remain backend-owned,
  but their history contract deliberately excludes the original prompt/document.
- Root OpenAPI and the current Chat draft schema were inspected. Neither exposes
  durable Video composer/submission-intent restoration. The implemented text-only
  idempotent create binding stores digests and an attempt, not a browser-restorable
  request. An in-memory identity or browser storage would not complete this gate.
- The [backend integration dependency](backend-integration-contract.md#open-frontend-dependency-durable-video-submission-intent)
  now specifies persistence, read-only resolution, authorization, retention,
  rotation and concurrency acceptance requirements. It is explicitly a requested
  capability, not an implemented interface. Full Video submission recovery stays
  incomplete; do not add a fresh-identity retry or claim at-most-once browser
  recovery from the existing component lock.


### Live API key rotation qualification (2026-10-10)

- Created a disposable 90-day, GPT-4.1 Mini-only key in the isolated verification
  workspace and saved a rolling limit of seven requests. Rotated it through the
  actual dashboard action and confirmation dialog. The replacement secret appeared
  once; full reload retained the original Revoked row and replacement Active row.
- Independent API reads confirmed exact expiry and model grants were preserved,
  together with the saved request-rate policy and revision. The original secret
  returned HTTP 401; the replacement returned HTTP 200 and exactly the one granted
  model from the public catalog. No inference or payment was submitted.
- Desktop action/confirmation and the 390×844 action menu and confirmation were
  inspected. Cancelling a second rotation returned focus to the action trigger.
  Both disposable keys were revoked, the separate verification session signed out
  and private credential material deleted. The viewport override was reset.
- This qualifies the exercised owner rotation and preserved rate-policy subset.
  Ordinary-role denial, in-flight rotation and financial commitment preservation
  still require their own evidence; the complete key workflow remains partial.

### Returning-tab session and cross-tab sign-out (2026-10-10)

- The shared application layout now revalidates sessions on focus/visibility
  restoration, coalescing simultaneous events. A confirmed session 401 clears
  identity and preserves the protected destination through Login; transient
  network failure does not discard a verified identity. Customer-facing expiry
  copy no longer asks ordinary users for administrator access.
- Successful browser-session logout sends a same-origin storage notification
  containing only a random event marker. Other browser-session tabs immediately
  abort their pending connection and clear identity. No credential or product
  data is persisted by this notification. Independent bearer sessions do not
  subscribe. Failed logout does not announce a confirmed sign-out.
- All 50 application layout integration tests and dashboard TypeScript passed,
  including revoked-session focus, transient network failure and cross-tab
  sign-out regressions. In the real browser, logout in a second tab immediately
  removed protected navigation in the original tab; password sign-in returned to
  its original API keys page. Demo login was restored and the extra tab closed.
- The actual measured viewport was 605×724 despite requested overrides. This
  check qualifies the exercised interaction at that width only; it does not add
  desktop/390px layout evidence. Server-triggered revocation on real focus,
  session expiry and remaining ordinary-role workflows remain open.

### Session desktop follow-up (2026-10-10)

- A fresh browser tab measured 1280×720. Confirmed logout removed protected
  navigation in that tab and a second open tab without requiring reload. The
  password Login surface fit without horizontal overflow. Signing in returned
  to the original verification-workspace API keys route; full reload restored
  authenticated navigation. Demo login remains available in the retained tab.
- A fresh tab initially measured 390×844 on the protected key list, but subsequent
  browser viewport settings affected the effective tab dimensions inconsistently;
  the Login captures measured 1280×720. They qualify desktop only. Narrow session
  transition evidence remains open; a requested viewport is not rendered proof.
  Temporary tabs were closed and the viewport override reset. No product data,
  credentials, permissions or payment configuration were changed.


### Live Logs CSV export (2026-10-10)

- Exported the actual GPT-4.1 Mini All-time selection from the Logs action menu.
  The downloaded CSV contained 13 matching model records, consistent with the
  displayed request count. Three records retained unknown usage as empty fields;
  all records were owner-funded and had no customer charge amount. Column and row
  inspection found no procurement/margin fields or internal UUID labels.
- Selected Today in the real date panel and exported again. The saved file had
  exactly three matching records, all dated 2026-10-10 UTC, matching the updated
  Logs count. The URL retained the model and start-date filters. Downloaded
  customer diagnostic files remain outside the public repository.
- The actual viewport measured 1280×720. This qualifies desktop menu/download and
  the exercised model/date filter subset only. Large-range rejection, failed
  export, ordinary-role isolation, other date boundaries and narrow export
  interactions remain separate gates. Existing integration tests cover full-range
  filter parameters, HTTP 413 guidance and cancellation when filters change;
  fixture behavior is not live browser evidence.

### Durable Video intent runtime follow-up (2026-10-10)

- Pulled and inspected the implemented save, read, index, explicit-submit and
  deletion handlers, generated schemas and retention/rotation contract. A fresh
  authenticated demo session called the actual local actor-owned intent index:
  HTTP 200 with `data`, `has_more` and `next_before`. The verification session was
  signed out. No intent, generation, key or payment was created by this probe.
- Root OpenAPI consistency passes with 87 registered paths and 72 generated
  methods. The contract now supports saving the immutable text request before
  dispatch, server-owned identity, read-only resolution, 30-day content retention
  and current-key rotation-lineage authorization. Image/reference intents remain
  unsupported. This resolves the missing-interface dependency, not browser
  acceptance or commercial Video billing.
- Next frontend integration must replace unkeyed text-video creation with save
  followed by explicit intent submission, restore the exact saved document and
  original job after response loss/reload, and expose owned retained intents
  without using IDs as labels. Never automatically submit a read `saved` or
  `not_dispatched` preparation. Integrate retention/deletion with revision
  conflicts and explain that deletion does not cancel or refund a generation.
  Reference-input behavior must remain separately bounded. The existing Video
  page still lacks these interactions and remains unqualified as a full workflow.

### Durable Video intent lifecycle groundwork

- Pulled the backend SDK intent methods and consistent dispatch/job snapshot
  changes. The documentation site's OpenAPI download matches the generated
  source exactly; its reference and download endpoints return HTTP 200.
- Added frontend submission state management using the SDK contract rather
  than duplicating its transport. Saving and restoring never dispatch. A lost
  submission response invalidates local authorization to submit until a server
  read; recovery returns the original job. Deleted/expired content and unresolved
  preparations do not acquire new dispatch rights. Concurrent operations are
  rejected, and deletion retains job identity without implying cancellation.
- Eight focused lifecycle tests pass, alongside the existing 612 dashboard
  tests and dashboard type checking. These are isolated state-management tests,
  not real supplier dispatch or rendered workflow qualification.
- This lifecycle is not yet connected to VideoView. The page still uses its
  prior creation flow. Reference-browser access timed out; retained-intent UI,
  route restoration, desktop/narrow interaction and real integration remain open.

### Text Video intent integration follow-up

- VideoView now saves an immutable text intent before explicit submission. It
  puts the intent identity in the route before writing, restores retained input
  and the original job through reads, and keeps restored input controls read-only.
  Lost responses never trigger automatic submission. Late responses cannot
  navigate from a departed workspace or replace another intent in that workspace.
  Image-reference generation retains its separately bounded existing transport;
  the backend intent contract does not support those inputs.
- Fixed two issues found during actual HMR/browser checks: catalog loading no
  longer clears intent restoration errors, and replayed read effects use separate
  lifecycle instances rather than rejecting an aborted read as a concurrent write.
- All 46 Video tests in six files and dashboard type checking pass. Integration
  tests cover save-before-submit, revision-only submission, read-only route
  recovery, immutable controls, Strict Mode recovery errors and stale responses.
- On the actual hot-reloading service, the Video category, API-key menu open and
  dismissal, missing-model state, missing-intent recovery error and Reload were
  inspected at measured 1280×720 without horizontal document overflow. No intent
  or job was created during these browser probes. The demo key currently has no
  Video route, so real save/submit/result recovery remains unqualified. The
  requested narrow viewport did not take effect, including in a fresh test tab;
  both measured 1280×720. Narrow acceptance is still open, not inferred from tests.
- The existing layout was preserved for these functional repairs. OpenRouter's
  reference tab still timed out. Owned-intent history discovery, deletion and
  retained/expired-input presentation still need reference/Stitch design and
  rendered verification; the full Video workflow remains partial.

### Owned Video input history and deletion follow-up

- Inspected OpenRouter's actual saved-room actions and deletion confirmation;
  cancelled without changing reference data. Iterated the history/deletion
  pattern in the existing Niu Stitch design system at desktop and mobile sizes.
  Generated example identifiers, models and unsupported capabilities were not
  adopted. The implementation uses installed Sidebar, DropdownMenu and Dialog
  primitives with the shared dialog radius.
- Actor-owned intent indexes now participate in the shared history, including
  pagination. Read-only content hydration is bounded to four reads per workspace,
  preserves index order and uses meaningful titles. Restricted full-content reads
  retain discoverable metadata. Known original jobs and retained inputs share one
  row; deleting input keeps the original job in history.
- Current-workspace writers can explicitly delete saved input with its revision.
  Confirmation explains that deletion does not cancel generation, remove results
  or refund charges. Failed deletion remains visible and can be cancelled; it is
  never automatically retried. Restored deleted/expired documents clear stale
  composer input rather than leaving the previous prompt on screen.
- The bounded-concurrency full dashboard run passed 630 tests in 84 files before
  the final scope/action guards. After those changes and the latest backend pull,
  all 57 relevant tests in eight files, dashboard type checking and diff checking
  passed. These tests cover lifecycle recovery, index hydration, cancellation,
  restricted content, deletion success/failure and original-job preservation.
- The actual HMR service rendered five existing saved chats without a history
  error. Search open, autofocus, Escape dismissal and returned focus were checked
  at desktop and actual 390×844 mobile dimensions. Mobile history opens as a
  drawer; the search panel fits the viewport without horizontal document overflow.
  Browser viewport control now works after reconnecting; earlier narrow checks
  remain unqualified, rather than being retroactively inferred from this check.
- The local demo still has an empty intent index and no Video route on its key.
  No mock records were seeded. The new Video action menu/deletion dialog, actual
  deletion and saved-input/result restoration therefore remain pending real-data
  browser qualification. The full Video workflow remains partial.

### Global Billing and Payments responsive follow-up

- Opened Settings from the authenticated account menu over Generations. Actual
  Billing reads showed a zero USD balance, disabled warning and empty transaction
  history. Payments showed unavailable online top-ups and no saved top-ups. These
  are current backend states, not seeded examples or proof of checkout recovery.
- Inspected both sections at 1280×720 and 390×844. Mobile section links remain
  accessible above the content; the balance and nested warning dialog fit the
  narrow viewport. Enabling the warning exposes its input; cancelling preserves
  the saved disabled state without a write. No payment or policy was submitted.
- Fixed a rendered keyboard-focus defect in the existing layout: cancelling or
  dismissing the warning dialog now returns focus to its Configure button instead
  of the document root. Browser checks passed for mobile Cancel and desktop
  Escape after HMR; 31 Billing tests and dashboard type checking pass, including
  a regression for cancellation returning focus without a write.
- Closing Settings preserves the originating Generations workspace route and
  returns focus to the account menu. Merchant activation, actual paid checkout,
  saved-order recovery and nonempty transaction reconciliation remain unqualified
  by this read-only browser pass.

### Supplier model filtering and directory-check follow-up

- Inspected the actual OpenRouter directory and API-key route management at
  1280×720 and 390×844. The saved Supplier still has one key and 25 mappings.
  Filtering to GPT-4.1 Mini and its non-inference directory check returned
  “Reachable · model listed”; this does not establish generation access or quota.
- Corrected the unmatched-model action to “Clear filter”, consistent with the
  visible Filter field. At both widths, unmatched filtering showed zero rows;
  clearing restored all 25 mappings, reset pagination and focused the filter.
  Mobile page two showed rows 21–25 with Next disabled. No page overflow was
  observed, and no credential, mapping or rate was changed.
- The mobile check-result text is cramped in the action column. A reference-led
  responsive treatment remains open; this pass preserves the established layout
  and does not qualify all Supplier configuration or multiple-key lifecycle work.

### Supplier check configuration identity

- Model directory checks now bind their pending/result/error state to the saved
  credential and mapping revisions. Changing configuration hides the previous
  result, and an older response cannot replace or clear a newer pending check.
- Nineteen Supplier tests and dashboard type checking pass. The regression
  exercises an overlapping same-alias check after a mapping revision change and
  invalidation after a credential revision change. These races were verified in
  tests, not by altering the saved live Supplier configuration.
- On the current desktop development page, the actual GPT-4.1 Mini check showed
  Checking followed by Reachable/model listed. This directory operation neither
  generated content nor established inference access. No mapping or key changed.
- Responsive polish is deferred at the user's request while desktop workflows
  are prioritized. The previously recorded cramped mobile result remains open.

### Current desktop Models–Chat–Logs chain

- Started from the scoped global Models catalog with 25 real entries. GPT-4.1
  Mini's Try in Chat preserved the selected model and prepared Demo API key.
- A small owner-funded request returned WORKFLOW_OK, Complete, 18 tokens and
  Own API key attribution. Full reload restored the same title, prompt, response,
  measured duration and request link. No configuration or credentials changed.
- Inspect request opened its corresponding Logs detail. Saved messages matched
  the prompt/reply, with HTTP 200, Completed, 14 input and 4 output tokens. Timing
  displayed 61 ms preparation, 1.40 s first-output wait and 210 ms output stream,
  totaling 1,667 ms. Chat's 1,673 ms client duration is a distinct measurement.
- This verifies the exercised desktop happy path against the current backend,
  not paid customer billing, video generation or failure/revocation states.
  Responsive polish remains deferred.

### Video entry and cross-type history checkpoint

- On the current desktop runtime, choosing Video from New generation opened the
  Video input surface with Demo API key. Its actual model read yielded no
  supported route. The UI showed No video model available, retained the key menu
  and offered the authorized administrator a Manage Suppliers link. No estimate,
  intent save or submission was attempted, and no mock route was introduced.
- The key menu contained only Demo API key. Its Escape dismissal returned to the
  input surface. Unified history contained six real Chat sessions; opening the
  latest restored WORKFLOW_OK, its title, Complete state, 18 tokens, owner-funded
  attribution and original Logs link on the Chat surface.
- Actual Video save/submit/recovery/preview qualification requires an accessible
  configured video route and its appropriate billing authorization. Backend test
  evidence is not substituted for rendered local qualification. Other frontend
  workflows can continue while this dependency is unresolved.

### Payment configuration read recovery

- Fixed the admin payment read lifecycle: failed reads now end loading rather
  than retaining a perpetual loading message. Retry rereads both configuration
  endpoints; beginning a new read clears previous configuration and key input.
- Regression verification covers failure, loading termination and recovery using
  four GET calls with no configuration writes. Dashboard type checking passes.
- The actual desktop runtime reports disabled EPay and empty configuration.
  Opening Configure after HMR displayed the existing fields; Cancel returned to
  the unchanged Disabled row. This proves the reachable read/cancel path, not
  the error path in a live browser or merchant activation/paid checkout.

### Current populated key-limit history

- Desktop Demo API key displayed real request-rate, concurrency and token-rate
  policies as Unlimited. Each history dialog contained the preceding configured
  value and latest Unlimited revision with Demo and human-readable dates. Escape
  returned focus to the originating history action. No internal revision ID was
  displayed in these histories.
- Entered an unsaved request-rate limit of 1, observed Save become enabled, then
  cancelled. Full reload retained Unlimited; reopening showed a blank value and
  disabled unchanged Save. No key policy was written or credential changed.
- The current key retained three unresolved requests and two requests with
  unbounded token usage. A separate 60-second window had zero dispatched requests.
  The UI preserves these different meanings rather than presenting unresolved
  commitments as measured zero. Ordinary-role authorization and live enforcement
  remain separate open qualification gates.

### Chat terminal streaming correctness

- Fixed a protocol correctness defect: HTTP 200 SSE error envelopes and named
  error events now fail the Chat result; EOF without [DONE] also fails rather
  than being labelled Complete. A finish reason alone does not override a later
  terminal validation error. Original attempt identity remains available for
  inspection; these failures do not trigger an automatic inference retry.
- All 44 Chat integration tests and dashboard type checking pass. Added cases
  cover an error followed by [DONE], a named error event, and an early stream end
  despite a finish reason, including persistence of the failed result. These are
  automated protocol tests, not live upstream error injection.
- Current desktop owner-funded GPT-4.1 Mini streaming still completed with
  STREAM_OK, 16 reported tokens and 2,197 ms client elapsed time. The retained
  older HTTP 502 Logs record separately shows uncertain upstream state, unknown
  usage and expired bodies; its measured delivery interval does not prove
  successful execution. No credentials or policy settings were changed.

### Actual two-tab Chat draft conflict

- Two desktop tabs read the same saved Demo workspace composer and its existing
  STREAM_OK conversation. The composer was empty before verification. Tab A
  saved an unsent test prompt, and full reload restored it. Tab B then edited its
  stale version; the real backend rejected that write and the UI displayed the
  changed-in-another-tab message, retained B's local text and disabled Send.
- Explicit Load saved draft replaced B's text with A's saved prompt and removed
  the conflict. No automatic overwrite or inference submission occurred. Cleared
  the test prompt through the recovered tab to restore the original empty
  composer. Existing conversation response, model and settings were preserved.
- This qualifies desktop optimistic-conflict recovery against the running API;
  it does not establish disconnected-network or uncertain-save recovery. No new
  UI code or synthetic backend data was needed for this verification.

## Operation-scoped Logs

- Logs now consumes the backend's operation filter from deep links and preserves it in list queries, pagination, CSV export and Activity drilldowns. The existing removable filter uses “Related requests”; internal operation identifiers are never rendered.
- All 52 GatewayActivity integration tests and dashboard TypeScript checking passed. Coverage verifies scoped pagination/export, removal without losing the model filter, and identifier concealment.
- On the real desktop service, protected navigation retained the operation query through password sign-in. An unknown operation produced “No matching requests”; removing its chip restored populated workspace Logs and removed the query. No inference, key or saved configuration was changed. Populated multi-attempt operation qualification remains open; responsive refinement is deferred under the current workflow priority.

## Chat response-stream cleanup

- The Chat reader now cancels an unfinished response body and releases its lock when parsing or transport fails. Cleanup does not wait for the stream producer to acknowledge cancellation, so failure persistence remains responsive; it does not trigger another model dispatch. Completed streams also release their reader lock.
- All 45 PlaygroundView integration tests and dashboard TypeScript checking passed. A still-open error stream verifies cancellation, lock release and exactly one dispatch rather than relying on a preclosed error fixture.
- Desktop HMR and full reload restored the real STREAM_OK conversation, original response, selected Demo API key, empty draft and Logs link. No new inference was sent. Live upstream error-stream cleanup is not claimed from this restoration check.

## Non-streaming Chat outcome validation

- HTTP 200 JSON error envelopes, malformed JSON and missing completion messages now save a failed result with an actionable message and the original request link, instead of an empty “Complete” result. Valid non-streaming completion messages retain response text and reported usage.
- All 50 PlaygroundView integration tests and TypeScript checking passed. Checks cover four invalid response shapes, durable failed-state persistence, request links, and a valid JSON completion with reported tokens.
- Actual desktop history navigation and full reload retained the saved connection-stage cancellation, unknown usage/charge, original preceding completion and Demo API key. No new dispatch was sent. These browser checks do not claim a live HTTP 200 JSON error was injected or observed.


## Supplier business-profile lifecycle

- The real OpenRouter business profile saved the accurate description “OpenRouter demo Supplier for owner-funded API testing.” Full reload retained it; a subsequent unsaved description was cancelled, restoring the saved value and focus to Name. Save was disabled again after restoration. No logo or external image URL was submitted.
- Returning through the existing API keys & routes tab retained the named OpenRouter credential, enabled state, OpenRouter endpoint and all 25 model routes. API secrets, pricing, qualification and routing were not edited. This qualifies the business-profile save/reload/cancel subset, not credential replacement, route writes, commercial publication or settlements.
- Desktop rendered hierarchy and action states were inspected. Responsive refinement remains deferred by the current workflow priority.


## Supplier rate precision and restoration

- The real paused GPT-4.1 Mini offer rejected an input rate with ten decimal places and retained the editor with actionable precision guidance. A supported nine-decimal input rate saved exactly and survived full reload and editor reopening.
- Restored the original input rate of USD 0.4 per million tokens, then reloaded: cache read remained USD 0.1 and output USD 1.6. The offer stayed paused and review-required throughout. This created normal rate revisions; it did not activate supply, settle funds or submit inference.
- The customer model detail still displayed “Not published” for input/output prices, without substituting these purchase rates. This rendered check supplements existing backend/serialization boundary tests; it is not customer-funded billing acceptance.
- Desktop action menu, validation, saved table and reopened editor were inspected. Multi-key routes, offer qualification and activation, customer tariffs and settlements remain separate acceptance work.

## Supplier credential-preserving metadata writes

- Edited only the existing OpenRouter API key's display name, leaving its optional replacement-secret field blank. The saved name survived full reload; restored OpenRouter and reloaded again. The Supplier identity, endpoint, enabled state and all 25 mappings remained intact.
- A fresh GPT-4.1 Mini catalog check through that stored credential completed with “Reachable · model listed. Try Chat to verify access.” This proves the exercised metadata write did not clear the credential; it does not prove new inference, credential rotation or multi-key route isolation. No credential was exposed or replaced.
- Follow-up frontend defect: the Supplier detail's Model catalog link uses bare `/models`, whereas the current authenticated rail preserves its workspace query to enter the dashboard catalog. Align this navigation with the existing authenticated entry without moving model ownership into workspaces or changing public route ownership.

## Supplier-to-catalog navigation repair

- Supplier API keys & routes now derives the existing authenticated global Models URL from the current workspace context, using the shared workspace path resolver. The component fallback also uses global `/models` rather than the retired nested workspace model route. This preserves context for dashboard entry; it does not change model ownership or public catalog route ownership.
- Dashboard TypeScript checking passed. On desktop HMR, clicking the actual Model catalog link entered `/models` with the same workspace query as the rail and rendered 25 real models, model details links and Try in Chat actions. No saved configuration or inference was changed. Responsive refinement remains deferred.

## Integrated frontend and populated operation qualification

- On main at `89b04772`, all 85 dashboard test files and 643 tests passed; dashboard TypeScript checking passed. This integrated checkpoint covers the accumulated component changes, not full release or merchant/video acceptance.
- Read-only API inspection identified the original STREAM_OK request's operation and confirmed exactly one matching attempt and summary count. The actual desktop Logs URL returned that one completed GPT-4.1 Mini request with 13 input and 3 output tokens, Demo API key and owner-funded attribution. The operation identifier appeared only in routing/API data, not rendered content.
- Exported CSV through the real menu and inspected the downloaded file: exactly one data row for that model, with customer-charge fields and no procurement columns or internal identifiers. The request drawer retained the original prompt and STREAM_OK response, HTTP 200, and measured preparation 181 ms, first-output wait 1.91 s, stream 75 ms, total 2.17 s. Previous/next navigation was disabled for the single-result scope.
- This closes the populated single-attempt operation list/export/detail subset. Multi-attempt operation qualification, classified live failures and export error browser states remain open. No inference, funding or configuration mutation occurred in this checkpoint.

## Supplier-member cache-read increment — rendered qualification pending

- Confirmed the current Supplier dashboard API already serializes cache rates on offers and cache rates/quantities on text consumption. The member frontend omitted them; no backend schema change is needed for this display increment.
- Inspected the actual OpenRouter GPT-4.1 Mini provider table's separate input/output/cache-read prices and reused the existing NIU.IO Stitch project. Candidate `e15d20e006ea44bcaa5e2096a14c6837` supplied the compact offer rates and secondary cache labels in existing table cells. Generated fixtures, hit percentages, extra navigation and decorative color treatment were excluded.
- Implemented separate agreed cache-read prices on text offers and cache subset/rate labels within consumption cells. Null rates use the ordinary input rate; explicit zero remains zero; missing quantities stay Unknown. Existing totals and media-specific treatment are preserved. Eleven Supplier portal tests and TypeScript checking passed, including zero/null semantics, viewer controls and identifier concealment.
- Current Demo has no Supplier membership: the real member URL shows Supplier access required. Populated rendering, normal navigation and browser reload qualification remain pending approval for a local read-only Demo membership. Do not count this increment as complete or silently grant permissions to obtain evidence. The broader frontend goal remains active, with other independent workflows available.

## Request-specific generation charge lookup

- Chat now reads each completed attempt through the scoped request metadata endpoint instead of searching the latest 100 ledger rows. A missing or failed metadata read does not discard other models' valid charges; unmatched attempt identifiers are rejected.
- Fifty Playground integration tests and dashboard TypeScript checking passed, including one missing charge among three results and cancellation of pending metadata reads.
- Desktop verification used one real owner-funded GPT-4.1 Mini request: CHARGE_OK completed with 18 tokens, 2,519 ms and Own API key attribution. Full reload preserved the response, metrics, attribution and Inspect request link. This verifies the exercised owner-funded flow, not commercial charging or settlement.
- Desktop business workflow qualification remains the priority; responsive refinement is deferred except for controls that block completing a workflow.

## Generation-to-Logs handoff and deep-link restoration

- Followed the saved CHARGE_OK session's actual Inspect request action on desktop. It opened the matching request drawer with the original prompt and response, HTTP 200, Completed and Stopped finish reason. Logs reported 14 input plus 4 output tokens, consistent with Chat's 18 total, and the same owner-funded attribution.
- The measured server waterfall showed preparation 138 ms, first-output wait 1.99 s, output stream 378 ms and total 2,508 ms. Chat's client interval was 2,519 ms; these are different measurement boundaries, not contradictory timings. The dominant measured interval was waiting for first output.
- The actual Raw data tab retained the request parameters and streamed response, usage categories and final DONE marker. Full reload of the model-filtered request deep link reopened the same drawer and message content. This qualifies successful Chat-to-Logs diagnosis and deep-link restoration; classified failure and multi-attempt operation qualification remain open. No further inference or configuration mutation occurred.

## Account profile save, restoration and cancellation

- Opened global Account settings from the populated model-filtered Logs page. Changed only Demo's display name to a temporary workflow-verification name; the real save succeeded and a full reload retained it. Restored Demo, saved and reloaded again. Email, password, avatar, roles and credentials were unchanged.
- An unsaved display-name draft was cancelled: Demo returned, Save changes became disabled and focus returned to the name field. Closing Settings returned to the original Logs route with its model filter preserved. This qualifies the desktop display-name lifecycle and cancel-to-origin behavior, not photo upload, concurrent profile conflicts, password changes or ordinary-role authorization. No frontend layout or source changes were required.

## Video submission HTTP diagnostic contract integration

- Pulled backend checkpoint `cb3dbbcf`: video submission can retain an upstream HTTP error while returning the original accepted unknown-submission reference. This does not prove nonexecution or permit resubmission, liability release or refund.
- Added a Logs contract regression for an unknown video attempt with saved upstream HTTP 401 and delivery HTTP 202. It verifies that both HTTP boundaries remain visible, execution remains Uncertain, customer charge is not invented as Not charged, and the text-only finish reason is absent. All 53 GatewayActivity integration tests passed. No product UI change was necessary.
- Reopened the actual desktop Video category using Demo API key: it still has no supported video route. Backend isolated-run evidence does not supply this local configuration; populated video diagnostics and the real rendered submission/result lifecycle remain unqualified.

## Authorized Supplier Viewer and portal navigation repair

- With explicit user approval, added Demo as an active OpenRouter Viewer through the actual Portal access dialog. Full reload retained Viewer; existing platform administrator access and credentials were unchanged.
- Populated portal verification exposed a route-parameter mismatch: SupplierNav read the retired provider parameter while the actual route declares supplier. Corrected that binding and made the existing navigation test use the production route parameter. This restores the established Supplier sidebar rather than inventing a new layout.
- Desktop reload now shows OpenRouter with Overview, Models & pricing, Usage and Settlements navigation. The real 25-offer page displays GPT-4.1 Mini input/cache/output rates of USD 0.4/0.1/1.6; nullable cache rates explicitly fall back to Input rate. Viewer has no offer mutation controls. The actual switch menu opened with aligned built-in gutters; Usage navigation reached its truthful empty state. Populated consumption/cache quantities and narrow-width qualification remain open.

## Seconds-estimate compatibility repair — browser qualification pending

- Found that the frontend schema editor still required FPS for OutputSecondsV1 despite the current backend contract allowing it to be absent. Seconds estimation now omits that requirement when no FPS control exists; a declared FPS control still needs valid positive bounds and a default or required value. Pixel estimation remains strict.
- Estimate and billing output labels omit FPS when the saved frame rate is null. No layout or new capability was introduced. Thirty-four targeted VideoSchemaEditor, VideoBilling and VideoView tests plus dashboard TypeScript checking passed; the regression distinguishes seconds without FPS from pixel estimation without FPS.
- The changed editor and populated nullable-FPS estimate/billing states still require actual browser qualification against a configured route. Do not mark this increment or the video lifecycle complete on these automated results.

## Video editor desktop interaction checkpoint

- Opened the real OpenRouter model-route manager and an unsaved mapping draft. The discovery control loaded 458 upstream models. Entered the documented personal video model binding, opened Video configuration → Output, enabled estimates and inspected the actual meter menu. Selected Seconds; the helper now accurately distinguishes optional FPS for seconds from required FPS for pixels and keeps channel validation separate.
- Cancelled Video configuration: the enclosing mapping still said no video schema configured. Closed that mapping without saving; the real directory retained 25 routes. No model route, price, credential or generation was changed. This qualifies the exercised desktop editor menu and cancellation, not a complete saved seconds schema, populated estimate/billing, video submission or narrow layout.

## Saved personal video route and real seconds estimate

- Verified the actual OpenRouter model page for Grok Imagine Video 1.5 Lite and the backend's exercised personal-channel configuration. Through Admin's real mapping editor, added the private model binding to the existing owner-funded OpenRouter credential. Configured text-only limits (one item, 4,096 bytes; 8,192-byte request), 1–15 seconds with a one-second default, and the exercised 480p/16:9 output mapping (848×480). These input caps are conservative local limits, not claimed universal upstream limits. No reference inputs, customer tariffs, commercial activation or additional credentials were enabled.
- Applied OutputSecondsV1 without FPS through the actual editor and saved the mapping. The directory increased from 25 to 26 routes. Demo API key's real video discovery then returned the new model; full page reload retained its availability.
- The actual estimate API returned 480p · 16:9 · 1s and owner-funded attribution, with no fabricated price or FPS label. This closes saved seconds-schema and populated nullable-FPS estimate qualification on desktop. The unsent prompt did not survive reload; durable prepared-intent and submitted-job workflows remain to be verified separately. No video generation was dispatched in this checkpoint.

## Video parameter boundaries and estimate recovery

- On the actual configured personal model, expanded Additional settings. Duration defaults to one second with the saved 1–15 range; aspect ratio and resolution menus contain only the configured supported pair. Entering 16 seconds displayed the explicit integer-range error and disabled both Estimate and Generate video.
- Reset settings restored one second and removed the error. The actual aspect-ratio choice menu retained 16:9, and another estimate succeeded with 480p/16:9/1s and owner-funded attribution. No generation was submitted. The single real-generation verification now awaits explicit user approval for one owner-funded request capped at USD 0.05; no automatic submission retry is authorized.
- Pulled the latest backend fixed-fee admission checkpoint. It does not remove normal administrator billing-write restrictions: the current billing helper still permits writes only for installation authorization. Customer tariff/payment qualification remains separate.

## Single authorized personal video generation

- With explicit approval for one request capped at USD 0.05, submitted the configured Grok Imagine Video 1.5 Lite route once: a small orange ball on a white table, one second, 480p, 16:9. No submission retry or second generation was performed. Status checks queried the original job only.
- Supplier status progressed from unavailable to Queued and then Succeeded. Full browser reload while queued retained the original task, prompt and selected model; the history entry resolved to its durable prepared intent. Observed completion was 112.8 seconds, including polling delay; submission transport was 4,014 ms. These are observed Niu timings, not exact Supplier generation duration.
- Loaded the real preview and completed its Download action to an MP4 file. Billing displayed Own Supplier account and 480p · 1s without inventing FPS or a customer charge. Actual upstream debit was not returned on this surface, so the published approximate USD 0.02 estimate is not asserted as settled cost. Desktop submission, queued reload recovery, success, preview and download are now qualified for this one configured personal route; commercial video billing, failure/reconciliation and narrow layouts remain open.

## Customer fixed request fees — populated browser qualification pending

- Applied the existing NIU.IO Stitch billing increment within the established shadcn tables. Customer Rates now separates fixed fee and minimum charge per request from token rates per million; statement details use the fees pinned in each historical line. Missing fields remain Unknown rather than silently becoming zero. Existing exact nanounit formatting preserves amounts above the JavaScript safe-integer range.
- Desktop localhost billing reload retained the Rates tab and truthful No rates published state. No customer tariffs or statements were fabricated to obtain populated screenshots. Populated fee/minimum statement and rate rows, including narrow-width layout, remain unqualified until actual customer billing data is available.

## Video history recovery defect — successful job remains accessible

- Reopened the successful video after full reload: its original job retained Succeeded, timing and saved-result controls. Clicking the corresponding unified-history intent entry subsequently restored the prompt/model but removed the job result and showed New generation / Submit a video or select a saved job, with Generate disabled. This contradicts full history restoration acceptance.
- Navigating directly to the original job again restored Succeeded and result controls; that job-only route does not restore the prompt. No additional submission was made. This separates job durability from the currently broken intent-to-job handoff rather than claiming the complete workflow passes.
- The frontend restore path expects the intent API's job field; the server derives it through media_submission_attempt and media_job_snapshot_for_key. Qualify the live response and repair that association with the backend workstream before applying any client workaround. Do not invent an association from model name or newest job, and do not use browser storage as the source of truth.
