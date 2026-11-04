# Staging UX review — 2026-11-02

Review tracking: `niu-287`. This is a partial, read-only review, not release
acceptance. The user requested an adversarial whole-product review across task
completion, usability and visual quality. Observations below are from the
signed-in staging administrator session; the deployed artifact revision was
not independently established. The local source revision at review start was
`e12bdc28b` and must not be assumed to be the deployed revision. No settings,
credentials, payments, members or inference requests were intentionally created
or changed. A Chat example selection may have automatically saved a draft; the
prior state and whether a write completed are unknown, as described below.
Earlier local UI follow-ups exist in the working tree and are recorded as local
changes; they are not evidence that staging has been updated.
The goal-based [user stories and boundary comparisons](staging-user-stories-2026-11-02.md)
now guide subsequent inspection; they were written after the initial staging pass.
On 2026-11-03 the user directed the review to first follow functionality and UX
at one consistent desktop viewport (1440 × 900), then address responsiveness in
a coordinated later pass. Earlier responsive observations remain evidence, not
a claim that the deferred pass has been completed.

## Intended task boundaries

The product principles describe people setting goals and authority while agents
discover and operate authorized model management; trustworthy discovery,
configuration, observation and recovery are required. For people, connecting a
supported Provider and trying a model must be comprehensible without knowing
internal routing or accounting schemas. Organization, workspace and platform
administration are separate scopes; workspace access does not grant financial or
platform authority. These are requirements, not proof of staging behavior.

| Goal and boundary | Observed staging | Assessment |
| --- | --- | --- |
| Connect a Provider and find usable models | Qiniu saved with one key, zero model routes; Add models opens a manual mapping form; chooser reports catalog unavailable | Failed in the observed journey; `niu-cvz`, `niu-gh3` |
| Revisit the Qiniu preset | In the Chinese desktop administrator view, the connection dialog asks for the Provider API key, with connection name and base URL behind optional settings. It cautions that importing a list does not verify inference, but Save connection does not explain whether or when discovery runs; the existing Qiniu row still has one key and zero routes. | Updated `niu-cvz`. No credential was entered or saved, so the current submission and import result remain unverified. The session was returned to User mode. |
| Discover and evaluate a model | Model list shows four routes with capabilities unpublished; an inspected detail asks for key creation, curl and administrator confirmation | Partial; no live trial or role-scoped model access verified; `niu-zgk` |
| Search and inspect a workspace model | In a later Chinese desktop session, an unmatched search showed zero models, suggested changing the query and offered Clear filters; clearing restored five listed models. A second model's detail stated that the owning account pays the Provider, but showed no price or explicit cost-availability state and asked an administrator to confirm unpublished capability. | The observed search recovery worked; the cost and capability decision gap extends `niu-zgk`. No inference was sent, and a route name is not evidence of actual price or support. Confidential Provider procurement rates must remain protected. |
| Try a model in Generations | Key dialog offers another key and requests a secret, with a Manage keys link | First-use recovery unclear; no key entered or inference run; `niu-62u` |
| Inspect charges and fund an organization | Activity View billing opens Account settings; Credits says online top-ups unavailable without a next action | Handoff failed and funding recovery unclear; `niu-1ml`, `niu-fq0` |
| Configure a low-balance reminder | In the signed-in Chinese desktop session, organization Credits named the current shared-funds scope. Its reminder dialog explained that alerts appear in the app when balance falls below the threshold and exclude credit. Enabling the checkbox exposed an amount field; cancelling returned to the still-disabled reminder. | The observed explanation and cancellation are clear, but recipients, validation, saving, actual notification delivery and other roles remain unverified. No settings were saved. |
| Reach shared funds from workspace settings | In the signed-in Chinese desktop session, General settings' Manage shared top-up link opened the organization Credits panel, which named the current organization and described the balance as shared across workspaces. | This specific handoff works; the unavailable top-up remedy remains `niu-fq0`. Multi-organization switching, funding changes and ordinary-member authorization were not tested. |
| Add an organization member | Add user requests name, role, scope and token expiry and says no invitation is sent | Credential handoff is left to user; no user created; `niu-098` |
| Review an organization member's authority and sessions | In the Chinese owner detail, the role name, scope qualifier and authority explanation remain English, as do password-login events among Chinese activity labels. Many expired or revoked sessions appear before multiple active sessions, which share a generic label and lack a visible current-session or device marker. | Language mismatch `niu-287.60`; updated session-discovery evidence in `niu-287.33`. One owner and the current populated dataset only; other roles and events were not checked, and no access was changed. |
| Configure a model pool | Admin form surfaces alias, shared scope, retail price mode, priority, weight and conditional rules at once | High conceptual load before outcome; `niu-4ew` |
| Diagnose failure | An existing upstream 429 detail reports rejection and uncertain provider status, with no visible next action | Evidence is limited to one saved failure; `niu-09c` |
| Navigate filtered failures | On a later Chinese desktop inspection, two saved 429 details both reported upstream rejection and uncertain Provider outcome without a specific remedy; one said request/response bodies were not retained or had expired. Next traversed the three HTTP 429-filtered rows and was disabled at the end. | Navigation worked for this filter; the diagnosis gap is additional evidence for `niu-09c`. The underlying upstream cause and other failure classes remain unknown; no request was sent. |
| Find evaluations and subscriptions | Both appear as tabs underneath workspace Routing | Discoverability and ownership mismatch; `niu-287.1`; reconcile `niu-2n1` |
| Find a key | Directory contains many revoked, identically named records without visible distinguishing metadata or status filter | Populated staging data, not an empty-state or active-key acceptance; `niu-9ml` |
| Set a key spending limit for an upstream-funded model | The Chinese create-key form calls the optional dollar amount the key's cumulative spending limit, without identifying which charges it covers. The workspace catalog describes the observed models as paid directly to the upstream Provider. Local documentation describes key limits in terms of customer-liability reservations. | A user cannot tell whether the control limits upstream expense (`niu-287.56`). The deployed enforcement and local-to-staging revision match were not tested. The form was cancelled without creating a key. |
| Revisit an inactive key and its spending limit | One revoked key detail explicitly says personal API-key routes do not consume the customer spending allowance, but that explanation was absent at creation. Several restriction and usage labels, including rate limits, IP access, allowance and no recorded requests, remain English in the Chinese view. | Added the detail-page clarification to `niu-287.56` and recorded the language mismatch as `niu-287.57`. Only one inactive key was inspected; actual enforcement and active-key behavior remain unverified. |
| Recover from an unavailable key URL | An intentionally nonexistent key slug in Default produced a message asserting that the key does not belong to the selected workspace. Its Return to API keys link successfully returned to that workspace's list. | The recovery link works, but the asserted cause is unsupported for a nonexistent slug (`niu-287.59`). Deleted, unauthorized and service-failure states were not tested. |
| Recover from an unavailable workspace URL | An intentionally nonexistent workspace slug displayed a workspace-unavailable explanation and an Open available workspace link. The link returned to Default and its populated overview loaded. | This specific recovery path worked in the signed-in desktop session. An actual deleted or unauthorized workspace, no available workspace, retry, and service failures remain unverified. |
| Open a legacy Chat bookmark | Signed-in `/chat?workspace=default#review-anchor` redirected to `/generations?workspace=default#review-anchor` and loaded the composer. | This specific synthetic query and fragment survived; actual historical session links, signed-out behavior and other legacy paths remain unverified. The existing draft was not changed or sent. |
| Open a legacy workspace pool bookmark | Signed-in `/workspaces/default/pools?review=1#review-anchor` reached the Default workspace routing list with the synthetic query and fragment preserved. | This list-level redirect worked in the inspected session; old individual pool links, signed-out behavior and meaningful historical query parameters remain unverified. |
| Open a legacy Provider bookmark | In User mode, `/suppliers?review=1#review-anchor` redirected to `/admin/providers` preserving the synthetic query and fragment, then displayed the existing administrator-access denial. | The observed redirect retained parameters and did not display platform configuration. This UI observation does not verify backend authorization, individual Provider links or signed-out behavior; the available-admin-mode recovery is tracked by `niu-287.19`. |
| Filter an empty media library in Chinese | At desktop width the Assets page explains workspace access and offers Add image. The type filter opens with English choices; selecting Images updates its closed label to Chinese and finishes at the empty-library state. | Mixed-language choice menu (`niu-287.58`). The filter was restored; no file was uploaded. Populated results and upload behavior remain unverified. |
| Administer customers | The visible Admin Customers entry opens an installation-credential requirement in the inspected session | Role and recovery boundary is unclear; `niu-287.2` |
| Reach platform payments and configure a gateway | In User mode, a direct `/admin/payments` visit said the account lacked permission. The same account offered Platform administrator; switching succeeded but sent the user to Providers instead of the requested Payments page. In administrator mode the gateway list distinguished unconfigured services and warned that mock funds cannot pay real upstream costs. EPay's setup requested merchant, endpoint, notification and return URLs without visible guidance. | Deep-link recovery evidence extends `niu-287.19`; EPay setup guidance is `niu-287.64`. No credentials or settings were entered, and checkout/validation remain untested. User mode was restored. |
| Publish prices | Currency mode is active, but inactive Credits tariff controls and atom terminology precede the current-price empty state | Visual hierarchy and language judgment; `niu-287.3` |
| Find a model as a public visitor | The public catalog loaded zero models and offers API keys or route documentation | Valid empty inventory, but first useful next step unclear; `niu-287.4` |
| Obtain or recover account access | Signed-out login offers email/password or access token; the token mode says the workspace owner shares a temporary token. The default form has no visible password recovery or first-access guidance | Token-mode guidance was inspected in a separate signed-out browser; no authentication attempt; `niu-287.5` |
| Correct an empty sign-in form in Chinese | On `/login` in the in-app browser, submitting either the empty email/password form or the empty access-token form focuses the required field but shows the English browser-native message “Please fill out this field.” | Error language can differ from the chosen interface language; `niu-287.35`. Native validation depends on browser language, and other invalid inputs and browsers were not tested. No credentials were entered. |
| Dismiss the login language menu | In the desktop in-app browser, the Chinese login page's language menu exposed English and Simplified Chinese with the latter selected. Enter opened it, Up moved focus to English without selecting it, and Escape closed the menu and returned focus to its trigger. | These specific keyboard movements and focus restoration passed; committing a selection, screen-reader announcements, other browsers and mobile widths were not tested in this pass. |
| Open a workspace deep link while signed out | A direct request for workspace Logs with a synthetic query and fragment reached `/login` in the independent in-app browser. The login page did not display the original destination. | The transition alone cannot prove whether the destination survives authentication; no sign-in was attempted. Current local source stores pathname, query and fragment in router state and reads a safe return destination on login, but the deployed revision and actual post-login result are unverified. |
| Find public resources from sign-in | Models and Docs links disappear at 390 × 844, while visible on desktop. A later Chinese-locale staging recheck showed the same difference. | Responsive navigation gap; `niu-287.6`. A local fix is not reflected in the observed staging page. |
| Select a documentation language | With Chinese active, page content and the language radio choice are Chinese, while the trigger's accessible help says “Language: English” | Conflicting state in a signed-out session; `niu-287.7` |
| Connect an agent to the selected deployment | Staging's homepage and guide give a generic prompt pointing to canonical installation documentation; the installation contract defaults to hosted Niu and says an explicit origin must match the user's chosen deployment | The prompt omits staging context and may lead to a different environment; this is an inference, not an observed authorization; `niu-287.8` |
| Understand Agent installation prerequisites | `/docs/agents/install/` says to verify the v0.3.0 release assets and deployment authorization capability at execution time. The public GitHub release-tag page returned 404 in the review browser, while the staging homepage foregrounds the setup prompt without that availability state. | The specific release page was unavailable during inspection, not proof about private drafts or other distribution; no installation or authorization was attempted. Make the prerequisite visible before handoff and recheck live capability; `niu-287.30`. |
| Browse public models in Chinese | After loading, primary catalog content is Chinese but search, refresh and some region names in the accessibility tree remain English | Mixed accessible language; `niu-287.9`. Initial English-to-Chinese rendering is also observed. |
| Navigate from the public catalog | Staging catalog Blog and Why Niu links target the production origin while other public links retain staging | Visible link targets conflict with the repository's relative cross-product navigation rule; destinations were not opened; `niu-287.10` |
| Read onboarding guidance in Chinese | Direct `/docs/guides/personal-assistant/`, its embedded `/help/` equivalent and `/docs/getting-started/` show Chinese navigation and title but English instructions and headings | A reader encounters a language switch precisely during setup and review; `niu-287.23`. Other guides were not evaluated in this pass. |
| Use the API tutorial in Chinese | `/docs/guides/api-quickstart/` shows Chinese tutorial text and an online test that explains possible charges and offers key management when no active key exists. Its workspace and key controls nevertheless expose English accessible names, as does the page-copy action. | Accessible language mismatch at the test controls; `niu-287.54`. The selected workspace had no active key; no live test, screen-reader speech, or other locale was exercised. |
| Open the interactive reference from Chinese guidance | `/help/api/` displays a Chinese connection bar and an empty-key remedy, but the API reference search, resource navigation, introduction and authentication guidance are English. Its connection controls also expose the English accessible names observed in the tutorial. | The tutorial-to-reference handoff changes language at the point of further exploration (`niu-287.55`); the shared accessible-name evidence extends `niu-287.54`. Desktop only; operation content, actual screen-reader speech and a live request were not tested. |
| Follow the manual first-request guide on staging | The copyable first block sets `NIU_ORIGIN` to a localhost container address, while surrounding prose asks readers to select their deployment origin and mentions the hosted address | Copying the sequence unchanged points at the reader's computer rather than staging; `niu-287.24`. No request was made; the localhost example may be appropriate for container users. |
| Follow the SDK tutorial on staging | The Chinese SDK tutorial explains that `NIU_BASE_URL` must identify the user's instance, but its copyable configuration sets `http://localhost:2555/v1`. | The same deployment-context mismatch applies to this separate tutorial; added evidence to `niu-287.24`. The example was not executed and is suitable for some local installations. |
| Recover from a broken documentation link | An intentionally nonexistent `/docs/` path and its `/help/` equivalent display a 404 and a Chinese return-to-docs link, but the explanation is English under the Chinese locale | Recovery action exists, but the explanation is not localized; `niu-287.25`. The outer help shell's HTTP status was not checked. |
| Search documentation on a narrow screen | At 390 × 844 on `/docs/getting-started/`, choosing search from the mobile navigation closes the menu without showing a search interface. The accessibility tree becomes empty apart from the web area; the open search dialog has a zero-sized rectangle. Escape restores the page. The same visible failure and Escape recovery occur inside `/help/` (outer navigation remains available) and when opening docs search from `/models/`. | Search is unavailable and touch users have no visible dismissal; `niu-287.26`. Observed in the in-app browser; actual touch hardware, other browsers and widths remain unverified. |
| Search for Provider guidance in Chinese | Desktop `/docs/` search for `模型供应商` reports no results, although the displayed Chinese heading of `/docs/admin/suppliers/` is `模型供应商管理`. Searching `供应商` returns a pricing page but not that guide; `Provider` returns results. | Chinese search fails a concrete discovery task; `niu-287.27`. This does not establish the coverage of every indexed page or query. |
| Open document search from the public catalog | The catalog header opens a search dialog on `/docs/`, but focus remains on its container; typing a character does not enter it into the field. | The search intent needs an extra, undisclosed focus step; `niu-287.28`. The desktop docs search button was separately observed to focus the field. |
| Open the password-session explanation from quickstart | In Chinese, the quickstart's link opens `/docs/reference/api/#operator-roles-and-sessions` at the top of a long page. The matching English heading is hidden and the visible Chinese heading uses a different ID. | The reader is not taken to the promised section; added this reproduction to existing localized deep-link issue `niu-lb0`. Other fragments remain unverified. |
| Compare products in Chinese | `/compare/` switches page headings and column headers to Chinese but retains English capability row names and explanatory cells, as well as English benchmark workload labels. At 390 × 844 the comparison is stacked by product; removing OpenRouter updates the visible comparison, and the category menu offers a permissions-and-billing filter. | The main comparison content remains difficult for Chinese readers; `niu-287.29`. The complete filter matrix, keyboard, real touch hardware and detailed comparisons were not inspected. The public comparison's implementation belongs to the separate website repository. |
| Load the public website with Chinese selected | The homepage and comparison page initially show English main content, then switch to Chinese while parts of the surrounding shell are already Chinese. | Related locale-flash evidence was added to `niu-7z0`, but website and docs are separately owned and a common root cause is not established. |

## Visual observations

At 1440 × 900 in Chinese, the video creation entry opened a blank new session
with a No active API key control and a separate Manage API keys link. Opening
the key control produced an empty sliver with no choices or explanation,
reproducing `niu-287.11` on desktop. No prompt, key or video job was submitted;
video-capable model availability and the successful creation flow remain
unverified.

On a later 2026-11-03 desktop recheck in Chrome, the Default workspace catalog
showed five models, including a DeepSeek route. Its detail still described
upstream-funded use, unpublished capabilities, and a Create an API key link to
the Default workspace. Following that link reached a page titled New API key,
but the browser automation could not retrieve the resulting page state. Thus
the form, whether it retains the selected model, and recovery after creation
remain unverified; the automation timeout is not evidence of a product defect.
No key was created or request sent. Catalog counts are point-in-time observations
and differ from the earlier four-route dataset.

On the Chinese mobile workspace catalog, a populated DeepSeek model detail
disclosed owner-funded charges and unknown capability, but emphasized API
reference and key creation before any trial (`niu-zgk`). Its request link
opened Logs with the matching model filter and completed rows. Existing calls
do not establish all model capabilities or future availability; no new call was
made during this inspection.

The user supplied a narrow-screen screenshot of a prominent “Navigation”
control at the bottom of the floating sidebar and requested a recognizable
account identity there, with the product rail on the floating sidebar's left
(`niu-287.39`). Local source combines mobile product navigation and account
actions under that trigger; the deployed source revision is unconfirmed. A
later 390 × 844 in-app-browser inspection reproduced the sidebar and confirmed
the trigger combines product destinations, identity, role and organization
actions. The Chinese sidebar's accessibility tree also used the English title
“Sidebar” and description “Displays the mobile sidebar” (`niu-287.40`). Actual
touch hardware, screen-reader announcements and other roles remain unverified.

The Provider directory screenshot supplied by the user and live staging show
two large tables, with a prominent endpoint column despite the primary decision
being which Provider to connect. The manual model dialog adds nested bordered
groups, optional capability controls and video settings before a model has been
chosen. The pool form similarly exposes dense numeric and billing controls in
one dialog. These are hierarchy and grouping judgments, distinct from the actual
catalog failure. The model detail devotes primary action emphasis to API
reference and key creation, followed by a terminal command, while the decision
about supported capability remains unresolved. Relevant source-backed criteria:
[NN/g recognition, error recovery and matching the real world](https://www.nngroup.com/articles/ten-usability-heuristics/)
and [visual hierarchy and grouping](https://www.nngroup.com/articles/principles-visual-design/).
The Niu-specific rule that management pages use full available width is a
separate project requirement, not an NN/g requirement.

In the Chinese mobile Provider list, Qiniu's saved-connection status and missing
model-route explanation remained English (`niu-287.45`), while its next action
was Chinese. The DeepSeek preset dialog showed an API-key field, optional
connection settings and a warning that importing a list does not verify
inference. It was cancelled without entering a key; automatic import and
commercial readiness were not tested (`niu-cvz`). The review session was
returned to its prior User role after this inspection.

### Platform audit log, 2026-11-03

In platform administrator mode, Audit logs explicitly states that rejected
logins and reads are excluded and historical actor details may be missing. The
Configuration category showed a loading state followed by matching rows. Two
rows were labeled only “Other action,” with an actor and target but no visible
detail control to explain the operation (`niu-kmv`). Their underlying types and
whether they can be safely rendered were not established. Pagination, failure
recovery, narrower layouts and other categories remain unverified.

### Platform financial report, 2026-11-03

The desktop Financial reports page loaded a month-to-date USD statement with
an explicit UTC interval, comparison period and owner-funded-call exclusion.
Changing the period to a single calendar month updated the URL, visible month
and comparison period. Both inspected periods showed no settled commercial
requests; upstream API cost was explicitly unavailable. Point-in-time wallet
figures were labeled as current, including on the historical month view. This
checks presentation and one period transition only: accounting accuracy, PDF
export, nonzero commercial data, permissions and responsive layouts were not
verified. No financial operation was performed.

## Coverage limits

This is not a whole-product audit: ordinary member and new-account journeys,
real connected-model completion, ordinary-member role denial, payment success/failure, Provider
recovery, most administration, full keyboard/screen-reader and intermediate or
narrow viewport checks remain unverified. The evaluation page's Connect your
agent link encountered a browser client block; that observation alone does not
establish a product defect. The actual staging deployment may change during
review. Continue from `niu-287`; reconcile existing findings before creating
duplicates. The earlier user screenshot and Qiniu report are direct user
evidence, distinct from the read-only inspection above.

## Dated story coverage, 2026-11-03

This is an evidence index, not a second work tracker or a claim of acceptance.
“Observed” refers only to the named state and role; all other branches remain
unverified. The 23 numbered stories also include lettered sub-stories.

| Stories | Evidence available | Important limits |
| --- | --- | --- |
| S01–S02a | Signed-out catalog, docs and login; a separate existing authenticated session was used for administrator inspection; local responsive login fix; signed-out `/connect` redirect; `/installation` presents a separate instance-administrator token entry (`niu-0sd`); `/help/` and the personal-assistant deep link load embedded docs, although that guide's Chinese view is largely English (`niu-287.23`) | Registration, password recovery, the act of signing in and installation bootstrap were not exercised. The authenticated session does not verify sign-in or redirect preservation. The separate installation entry is not itself evidence of an error. Other help paths remain unverified. |
| S03–S04, S20 | Existing Qiniu connection, manual route dialog and catalog failure; source inspection of import and supply gates | No new Provider connection, key rotation, successful discovery, commercial publication or live upstream verification. |
| S05–S06a | Workspace catalog and model detail, agent entry and invalid-code recovery | No agent authorization/decline, complete deployment setup, model evaluation or callable-access verification. |
| S07–S08c | Empty Chat and Video, model picker, empty Assets and video key menu | No inference, video job, populated assets, biometric flow, session lifecycle or cross-device persistence test. A Chat draft may have been saved during sample selection, as noted below. |
| S09–S10a | Empty Evaluations; populated routing configuration, history and selections; one historical revision inspected | No evaluation comparison, agent proposal, restore, concurrent edit or complete role-specific review. |
| S11–S13 | Organization menu and settings; create forms cancelled; member form and scope options inspected | No organization/workspace/member creation, switching, invitation, revocation, or cross-tenant isolation test. |
| S14–S15a | Populated key list and unsaved create dialog; empty workspace billing states and shared credits panel | No key issuance/revocation, paid request, settlement, real statement, limit enforcement or payment recovery. |
| S16–S17 | Workspace overview, existing request detail and billing handoff | Broader datasets, ordinary-member permissions, export and cross-workspace isolation not verified. |
| S18–S19 | Unsaved synthetic input and output tests, access-mode choices, external-check and denial empty states, event-subscription empty state | No policy publication/enforcement/rollback, external detector consent, subscription creation or delivery recovery. |
| S21–S21a | Selected admin pages, User-mode denial and switch to an assigned administrator mode, EPay unsaved setup, public locale controls | Installation-credential-only operations, actual payment setup, branding save, full localization and backend role isolation not verified. |
| S22–S23 | Provider self-service marked future based on current project evidence; selected dialogs and empty states; synthetic legacy Chat, workspace pool list and Provider list redirects; nonexistent workspace and key recovery | Provider representative access, destructive actions, historical persistence, individual legacy resource links and recovery across devices not exercised. |

## Local follow-up, 2026-11-03

The login navigation fix for `niu-287.6` was inspected in the local frontend at
1440 × 900, 390 × 844 and 320 × 700. Models and Docs remain visible and the
document width matches the viewport at all three sizes. At 320 pixels the
language menu opens without clipping, Escape closes it and restores focus, and
Tab moves from Models to Docs. The local gateway was unavailable, so this does
not verify sign-in, authentication recovery, or the deployed staging build.

For `niu-cvz`, source inspection found that resale connections stop after saving
the key and the existing catalog import accepts only owner-funded connections.
The shared-route availability helper also returns true when no Provider offer
exists; this is not evidence of an authorized or priced commercial offer. The
automatic-import design must therefore verify admission and readiness boundaries
before creating enabled shared mappings. No change to resale import has been
made on this evidence alone. A separate shared text-inference admission check
rejects missing procurement pricing; the route availability flag alone is
therefore neither proof of dispatch nor proof of a valid offer. Qiniu's
official-price adapter handles a subset of advertised CNY token rules and
retains unsupported dimensions, while the current catalog read does not supply
that adapter with the official pricing document. Discovery is consequently not
evidence of agreed upstream rates or a customer tariff.

### Organization and billing inspection

On staging, the account menu now lists the current organization and offers
Create organization and Organization settings. The creation dialog describes
an independent zero-balance billing account and automatically suggested a slug
when a sample name was typed. It still foregrounds the technical term “Slug”
and query syntax (`niu-f0z`). The dialog was cancelled without creating data.
At 390 × 844, a synthetic Chinese name suggested lowercase pinyin, and a
manually edited slug survived a later name edit. An invalid slug left Create
enabled with only general character guidance; submission-time validation was
not exercised. The form was cancelled without creating an organization.
Organization settings includes name, shared-funds explanation, workspaces,
members and a token-based join form; this establishes entry-point availability,
not successful creation, switching, joining or tenant isolation.
At 390 × 844 in Chinese, the organization name is labeled “company name”
while the edit field says “change organization name” (`niu-287.43`). In the
Members section the wide primary action renders as a plus icon with no visible
label, though its accessible name is Add user (`niu-287.44`). The visible
workspace row's settings and users actions are also icon-only. These observations
do not establish actual touch or screen-reader behavior.

In the organization Members settings, the only visible active member was the
signed-in owner. Revoke access opened a confirmation explaining that access to
every workspace would be removed, but did not identify self-revocation or
explain protection for a final owner (`niu-287.37`). The operation was cancelled;
neither complete membership nor server-side enforcement was tested. After
cancelling, accessibility focus returned to the web area rather than the
member's Actions trigger, extending the focus-recovery evidence in `niu-287.18`.
The organization page's Users link opened the selected workspace's Users page.
In its Add user dialog, visible defaults were Default workspace, Viewer and
30 days, but Chrome's accessibility tree exposed only the three field labels
on the closed menu triggers; opening Scope exposed its checked choice
(`niu-287.38`). Escape returned focus to Scope and closing the unsaved dialog
returned focus to Add user. No screen reader or other browser was tested.
The workspace Users search focused its input, showed an actionable empty state
for a synthetic unmatched query, and retained the query after Escape; Reset
search restored the list. With a matching query, the closed search trigger had
a tinted background. On the same Users page the breadcrumb page-switcher did
not include Users and instead marked Settings selected (`niu-2gc`). Other
search datasets, keyboard paths and screen-reader announcements remain untested.

The workspace billing page's empty Spending, Statements and Rates states were
inspected. Spending says limits include charges and reservations; opening Add
limit explains that the limit never resets and zero blocks new paid requests.
Manage credits opens the account credits panel. No limits or payments were saved;
non-empty statements, prices, other roles and error recovery remain unverified.
At 390 × 844, the default workspace deletion action remained disabled but
visually saturated red (`niu-287.31`). In the spending-limit editor a synthetic
negative amount left Save enabled without inline feedback (`niu-287.53`); it
was cancelled, so submission-time validation and persistence were not tested.
At 390 × 844, all-workspace Activity said there were no settled customer charges;
the sole listed workspace's detail classified its requests as own-key usage.
The aggregate does not explain possible upstream costs (`niu-287.51`); actual
upstream charges and mixed funding states were not checked. In that workspace's
Activity, a key's View requests link opened a matching filtered log with three
rows (`niu-9ml`). No request or payment was made.
The workspace page describes funds as shared “across the account,” whereas the
credits panel names the current organization and says its funds are shared
across workspaces. In a multi-organization login the account wording obscures
the payer boundary (`niu-287.32`); no cross-organization balance behavior was
tested.
In the current organization's Credits panel, the low-balance warning dialog
states that the warning is in-app and excludes credit allowances. Enabling its
unsaved checkbox made the threshold field editable; cancelling left the visible
warning disabled and returned focus to Configure. No threshold was saved, and
at 390 × 844 the Chinese view also returned focus to the warning control after
cancel and to Manage credits after closing settings. The page displayed online
top-up unavailability (`niu-fq0`); real funding was not attempted. The enabled
warning's empty amount left Save available, but it was not submitted, so its
validation behavior remains unknown. Warning delivery, permissions and other
organization states remain unverified.

The organization-wide Admin option in Add user is described only as changing
workspace data. Current gateway source describes organization-wide admin access
to shared funds, but the staging deployment revision and a separate admin
session were not verified. This consequential role-description gap was added to
`niu-098`; no member or token was created.

An existing owner's Access sessions view lists many expired or revoked rows
before its one visible active row. Rows have generic names, expiration and
status but no current-session indicator (`niu-287.33`). This is one populated
account, not proof of behavior for every member; no session was revoked or
created. Its Owner role description names workspace changes and member
management without mentioning organization-level shared-fund authority; this
is another surface for the role-scope explanation gap recorded in `niu-098`.
The token expiry menu displays a 30-day selection and other durations, but no
token was issued and the downstream sharing journey remains unverified.

Workspace Settings nests Spending, Statements and Rates tabs inside its
Spending & billing tab, while a separate workspace billing route exposes the
same view (`niu-0pt`). Create workspace suggests a slug automatically, but its
blank spending limit shows a `0.00` placeholder even though blank means no
limit; explicit zero has a different effect (`niu-287.17`). Cancelling this
unsaved draft returned accessibility focus to the navigation-collapse button
rather than the originating workspace switcher (`niu-287.18`); keyboard-only
and mobile behavior remain to be verified. No workspace was created.

In the Default workspace's General settings, deletion is disabled and the text
explains why, but the action still appears as a prominent red filled button
(`niu-287.31`). This is a visual affordance judgment; the control was correctly
exposed as disabled and no deletion was attempted. The same presentation was
observed at 390 × 844; non-default workspaces remain unverified. At that width,
the Spending & billing tab loaded, Add limit explained zero and no periodic
reset, and cancelling the blank inline form restored focus to Add limit. No
value was saved; this does not verify enforcement or other billing states.

With User mode selected, a direct visit to staging `/admin/providers` said the
account cannot manage platform configuration. The account menu in the same
session listed Platform administrator as another role (`niu-287.19`). Current
source describes this selector as limited to assigned roles, but neither a
switch nor a revoked-grant case was exercised. The page gives no in-place
explanation of the mode distinction. Current project evidence also says a
Provider representative is not a supported login role; the corresponding
user story is a future target rather than proof of a usable portal.

### Video entry and assets

The empty workspace Assets page offers media filtering, image attachment and a
Create video link. After a transient gateway-unavailable message cleared, the
link opened a video composer without an active key. Opening its key picker
rendered an empty menu with no explanation or action (`niu-287.11`); the
composer separately offered Manage API keys. The local fix adds key-state
feedback and a workspace-scoped management link to the menu; its browser and
responsive verification remain outstanding. No file or paid job was submitted,
and model-specific video controls and asset selection could not be evaluated
without an eligible key.

At 390 × 844 in Chinese, the empty Generations screen and history sidebar did
not show a video creation entry, while Assets > Create video reached the video
composer (`niu-287.49`). The empty video key picker again opened as a blank,
nearly zero-height panel (`niu-287.11`); Escape returned focus to its trigger.
No key, prompt or job was submitted. An account with eligible video inventory
and real touch hardware were not tested.

### Generations first use

In the staging session, the empty Chat composer had no selected key or model.
The model chooser listed four routes with unverified Chat support; selecting one
asked the user to confirm support with a platform administrator (`niu-zgk`).
At 1440 × 676 and 390 × 844, the fixed composer partially covered example
cards in the initial view. Scrolling exposed them (`niu-287.20`). Selecting an
example populated the composer; no inference was sent. Source inspection after
the interaction shows that Chat drafts can automatically persist model and
prompt changes to the backend, so this interaction may have changed the staging
draft. Its prior content and whether a write completed were not established;
the draft was not cleared or overwritten again.

### API key creation

The staging creation dialog defaults to all configured models and a 30-day
expiration, with limits disclosed separately. Expanding limits at 1440 × 732
or 390 × 844 moves both actions below the visible scroll region. Scrolling
reveals them, but moves the dialog title and initial context out of view; the
initial view offers little indication that the actions are below (`niu-287.12`).
No key was created and enforcement was not exercised. This is a visual and
discoverability judgment, not a claim that the controls cannot be reached.
An existing revoked key with no recorded requests still shows the generic
“Calls sent through Chat or your application appear here” empty state, without
an inactive-key explanation or recovery action (`niu-287.34`). Its policy
assignment section does explicitly say an inactive key cannot be changed. No
key was modified; expired keys and other permissions remain unverified.
At 390 × 844 in Chinese, the key list showed 71 entries with repeated names
and revoked statuses but no distinguishing dates in the visible mobile rows
(`niu-9ml`). The Create API key expiry choices remained English (`niu-287.50`),
and the closed model-access and expiry controls exposed labels without selected
values in the accessibility tree (`niu-287.38`). No key was created.
Following that key's View all requests link opened workspace Logs with the key
filter visibly applied and a No matching requests state with Clear filters.
This checks only the inspected empty-history key; matching populated records,
other roles and cross-workspace access remain unverified.
In Logs, the API key filter submenu also lists many identically named keys with
no visible date or status, making the intended historical key difficult to
select (`niu-9ml`). One completed request's detail likewise shows the repeated
key name as plain text without a direct key link. Whether the historical key
is still present or resolvable was not established. No key filter was selected
in that inspection.

### Agent connection entry

Opening staging `/connect` without an agent request shows a verification code
field and instructs the user to open the link supplied by their agent. This
establishes that the entry page renders, but not that an agent can create a
request, the user can approve or decline it, or an expired or invalid code has
an actionable recovery. On a later visit, entering the page's example code
produced “This request is unavailable or expired” and removed the code input;
Reload request returned to the same state, with no on-page way to correct a
mistyped code (`niu-287.13`). This exercised only a nonexistent code, not an
expired real request. Source inspection separately indicates that non-401 HTTP
errors, including service failures, receive the same expiry message; an actual
service-failure response was not reproduced. A local change retains the code
form after request-load errors and distinguishes a 404 from other failures;
focused tests pass for code correction without an authorization write and for a
503 response. Browser rendering and keyboard verification remain outstanding.
The same invalid example-code path was reproduced at 390 × 844 in the signed-in
Chinese interface: the error removed the input and retained only Reload request
(`niu-287.13`). No real authorization was initiated or approved.
In a separate signed-out browser, `/connect` redirected to sign-in with an
explanation that login is needed to review and authorize the coding agent. No
credentials were entered; destination preservation after sign-in remains
unverified.

### Workspace governance and event discovery

In a Chinese desktop inspection, an empty Guardrails history linked to the
workspace policy. Output rules explained that full-response inspection affects
streaming, tools, structured outputs and embeddings. Selecting observe-only
without a pattern produced an unsaved-change warning and blocked Save, but the
required correction and section links remained English; this extends
`niu-287.48`. Discard restored the prior state. No policy was published, and
enforcement, observe-only behavior and other protocols were not tested.
In a separate unsaved output-rule test, an email-redaction pattern and a
synthetic address returned only “Allowed after redaction,” without identifying
the match or showing the transformed sample. This extends `niu-287.14` from
input to output for the observed Chat test. Discard restored the unchecked
pattern; production enforcement was not exercised.
In model access, the Chinese page opened an English mode menu with “No
additional restriction” and “Allow all” but no explanation of their
distinction or relationship to key grants. “Allow selected” did clearly warn
that an empty selection blocks all model requests, and a selected model appeared
after closing its picker. The unsaved changes were discarded (`niu-287.61`).
Actual enforcement, future model additions and Provider-mode semantics remain
unverified.
On the Provider side, “Allow selected” warned that selecting none blocks all
inference, but its picker said no Provider was configured and offered no
selection or remedy (`niu-287.62`). The same workspace catalog listed
upstream-funded routes, but their eligibility for this picker is not known.
The unsaved restriction was discarded; enforcement and actual Provider
availability were not tested.

The staging Guardrails overview exposes the workspace default policy and says
it applies to every workspace API key. Input rules clearly warn that their
patterns are incomplete and unsupported content is blocked. Selecting an
unsaved email-redaction rule and testing synthetic text returned only “Allowed
after redaction,” with no match identity or transformed sample (`niu-287.14`).
The unsaved rule was discarded; no policy was published. The external-checks
empty state directs users to a deployment administrator, and the blocked
requests page states that some admission denials are not recorded. Populated
denials, external-detector consent, actual enforcement and rollback remain
unverified.
In a later Chinese desktop check, the empty denial page explained the recent
pre-dispatch record limit, that some admission denials are not recorded, and
that post-dispatch output blocks appear in Logs. Its Open logs link reached
the workspace request list, whose Blocked requests link returned to denials.
This verifies navigation and the stated coverage boundary only; no populated
denial or cross-link from a specific event was available for inspection.
At 390 × 844 in Chinese, selecting an email pattern exposed English Block and
Redact choices and an English section name in the unsaved-change banner
(`niu-287.48`). The checkbox was restored to its original state, removing the
unsaved-change banner; no policy was published.

Event subscriptions are reached as a tab inside Routing (`niu-287.1`). Its
empty state offers a copied agent prompt and an installation guide. The prompt
copy action gave a Copied indication; the clipboard contents were not observed.
The local source uses an absolute production documentation URL for that prompt
(`niu-287.8`), but the deployed revision is not established. Opening the guide
encountered a Chrome client block; this does not establish a product defect.
Delivery creation, failure and recovery remain unverified.

### Evaluation and routing evidence

In a later Chinese desktop inspection, an existing disabled routing policy's
configuration showed its revision, candidate, priority and weight, and warned
that saved configuration does not prove availability or task quality. Its edit
dialog offered a five-name candidate picker without the unpublished capability
or upstream-funding context visible in the workspace catalog (`niu-287.63`).
No candidate or policy was changed; actual eligibility and other datasets
remain unverified.

The staging Evaluations tab was empty and offered an agent prompt and setup
guide; no comparison, evaluation execution or budget behavior was exercised.
A populated custom-model history displayed ten revisions. Reviewing one older
revision identified the changed enabled state and showed a Restore button, but
the same dialog and history list said restoration requires an authorized agent
(`niu-epp`). Local source indicates the button performs a browser-client write;
it was not pressed. In Executions, five recorded selections included model,
revision and HTTP status, but the only Logs link led to the unfiltered
workspace list, preventing direct investigation of a particular selection
(`niu-287.15`). An HTTP status alone was correctly qualified as insufficient
evidence of terminal generation or task acceptance.
At 390 × 844, the same executions table measured 683 pixels wide inside a
358-pixel horizontal scroll region. The initial view clipped model names and
placed HTTP status offscreen without a visible scroll cue (`niu-287.16`); the
document itself did not overflow. Keyboard scrolling and other widths were not
checked.
At 390 × 844 in Chinese, the Routing list showed two policies with the same
name and status while their model and revision columns lay beyond the initial
visible area without an obvious scroll cue (`niu-287.52`). The Evaluation tab
was reachable and showed an empty state with agent setup actions; actual
evaluation execution and populated comparisons remain unverified.

### Request filtering

On the populated staging Logs list, “Recorded failure” selected three rows
whose visible status was “Failed · HTTP 429”; the filter also offered other
failure/lifecycle categories without explaining their relationship to row
labels (`niu-287.21`). During the filter transition the new filter chip was
visible while six previous rows, including completed requests, remained until
the response finished (`niu-287.22`). The final result was correct for this
observed filter; the transition was brief and not a persistent-result claim.
No request data was changed or generated.

### Mobile model selection

At 390 × 844, the Generations composer showed a model count but no model name
beside the send action; the current name appeared only in a support-warning
banner. Opening the comparison picker revealed the checked model (`niu-287.47`).
In that picker a long model name wrapped and crowded adjacent option text, and
the category label remained English in the Chinese view (`niu-287.46`). The
existing draft and selection were not changed and no inference was sent. Other
selection counts and models with verified support remain untested.

In the signed-in Chinese in-app browser, selecting Today from the request
time picker updated the visible range, URL query and final result count. The
observed rows were all dated that day. Browser Back then left the list for the
new tab's blank predecessor rather than returning to All time; the observed
query change did not create a separate history entry. The brief loading
transition was not used to judge final results; timezone boundaries, custom
ranges and Forward were not verified in this pass. No request was generated.

After session recovery, changing the Logs sort from newest to oldest similarly
showed the new sort label while the old order briefly remained; the six rows
then reordered correctly. This extends the transition evidence for
`niu-287.22`, not a claim that the final sort was wrong.

At 390 × 844 in Chinese, the request filter categories and the Status submenu
heading remained English (`niu-287.41`). Selecting recorded failures briefly
showed the new filter with the prior rows before settling on three failures,
extending `niu-287.22` to mobile. One failure detail was reachable and showed
the recorded 429, but its timing phase labels remained English (`niu-287.42`).
No request was submitted; touch hardware and other request types remain untested.
