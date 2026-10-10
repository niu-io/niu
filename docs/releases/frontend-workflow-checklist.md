# Frontend workflow qualification

Status: in progress. Updated 2026-10-10. This checklist supplements, rather than replaces, F01–F10 in [first-release.md](first-release.md).

## Design and delivery

- Use the existing **NIU.IO — Current UX & Design Refinements** Stitch project for visual design and iteration. Inspect the relevant mature-product reference and current rendered page before requesting changes. Preserve Niu brand tokens, installed shadcn primitives and supported behavior.
- Frontend implementation and browser verification run locally on main at port 2566 with HMR. The remote backend workstream owns API implementation, migrations and performance. Coordinate contract changes and blockers through shared commits and documentation while direct agent communication is unavailable.
- A row is complete only after its actual interactions are verified at desktop and narrow widths. Record loading, empty and error states where applicable. Automated tests alone do not qualify a workflow.
- External Agent Observability is separately owned and excluded from edits here. Container qualification remains deferred.

## Workflow checklist

| Flow | Required frontend evidence | Status |
| --- | --- | --- |
| Sign-in and session | Protected destination → login → original destination; reload/restoration, expiry and sign-out; installation setup clearly distinct | Partial; sign-out, protected-route redirect, password login, query-preserving return and reload verified; expiry/revocation and installation distinction open |
| Models → generation | Global catalog, first-row filter, sort/menu alignment, model details and supported capabilities, selected model preserved when starting a generation | Partial; filter, sort menu and selected-model handoff verified; reference comparison and remaining interaction states open |
| Workspace API keys | Create with essential values, copy/setup example, grants and limits, rotation/revocation, authorized details and useful failure recovery | Partial; real key list/details, creation dialog/expiration menu/cancel and Generations link verified; name write/reload and narrow model-access menu verified; creation and single-model save/reload/discovery plus revoked-credential 401 verified; rotation and ordinary-role grants open |
| Chat | Key-based scope, saved-session title/history, streaming/cancellation, actionable upstream failure, backend restoration and matching Logs | Partial; existing successful history, title, reload restoration and mobile session navigation verified; fresh successful request and restoration verified; connection-stage and live mid-stream cancellation/restoration verified; live partial output and matching interrupted Logs verified; actionable upstream failures and remaining draft conflict states open |
| Video | Task category → supported inputs → submission → durable status → preview/download; unavailable, failed, unknown and expired states; matching Logs and customer charges | Open; depends on qualified backend capabilities |
| Logs | Request filters → payload and response → measured timing waterfall → failure diagnosis; exports, unknown values and customer-only costs | Partial; key drilldown, real retained request/error and timing verified; date restoration and mobile detail verified; exports, classified failures and remaining mobile states open |
| Activity | Authorized scope, full-range aggregates → matching Logs; consistent token categories, customer charges and unknown values | Partial; real all-workspace/workspace totals and one model-to-Logs count/filter match verified; Today drilldown and narrow totals verified; other date boundaries and ordinary-role authorization open |
| Guardrails | Supported input/output controls, preview, safe decision diagnosis and clear coverage; ordinary-role access and denied requests | Partial; input redaction/block previews and narrow action menu verified; saved input policy, live input block, versioned history and narrow denial records verified; HTTP failure classification, live output enforcement and ordinary-role access open |
| Settings and billing | Global dialog preserving origin; balance, warning/credit-limit state, history and payment/top-up status; close/reopen/direct URLs | Partial; account-menu opening, Billing/Payments navigation, zero balance, unavailable top-ups, empty history and close-to-origin verified; warning save/reload/restoration verified; payment, credit-limit and remaining narrow states open |
| Admin Suppliers | Directory → add/edit/delete → named detail; credentials/model subsets/rates; sidebar sections and detail tabs; customer/admin navigation both available | Partial; directory/detail, saved OpenRouter route, add-key cancellation, adapter menu and rate editor verified; writes, model subsets and remaining tabs open |
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
- Configure a supported local video route before real submission qualification.
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
