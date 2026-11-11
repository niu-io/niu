# Stable release UX review

This is a source review of the current local candidate and a coverage map for rendered verification. Related work is tracked by niu-uys9 and GitHub #122. Workspace Routing is deferred under GitHub #123.

| Journey | Source finding or review question | Release evidence required |
| --- | --- | --- |
| Sign in, installation, invitation | Separate routes exist. The return to a scoped resource still needs verification. | New account, expired invite, denied access and return to the original destination after authentication. |
| Workspace and account switch | One shared sidebar is planned. Verify scope changes from a nested resource and a drawer. | Compare destination and selected workspace after switching, reload and browser back. Verify theme and identity in expanded, collapsed and narrow modes. |
| Agent setup | The dialog copies instructions. Copy success alone does not verify agent authorization. | Label the handoff accurately and verify one connection from the intended deployment with bounded permissions. |
| Overview and Models | Review empty and populated outcomes, filters, capability evidence and trial entry. | Confirm unsupported or unverified capabilities remain distinguishable. Open and dismiss right filters without shifting the primary navigation. |
| API keys and Logs | Review status selection, partial counts, grant detail and failed or uncertain request outcomes. | Test keyboard and narrow layouts. Verify users cannot infer settlement from HTTP status. |
| Generations and Assets | Assets remains a primary item in source although the reviewed design places it inside Generations. | Reconcile placement before adopting the mock. Verify chat and video history, durable output, expired preview and missing-key recovery. |
| Usage and Billing | Source still exposes Workspace Billing and hides Usage. The design assigns usage and attributable charges to workspace and funding and statements to organization. | Verify actual data ownership and permission boundaries before changing labels or links. Walk from usage to an authorized statement without losing scope. |
| Workspace Settings and Guardrails | Guardrails still appears as a workspace peer in the navigation. The approved direction places it in workspace settings. | Verify discoverability and inherited policy in a key detail. Establish actual enforcement coverage before describing default outbound secret protection as active. |
| Routing and Evaluations | Default workspace navigation hides them. The workspace warmup still preloads both page chunks and fetches Routing data. Authorized legacy routes remain. | Confirm the stable first visit does not depend on deferred features. Verify direct links still work. Treat future Labs access as a separate release decision. |
| Account, organization, Members and Credits | Settings tabs and account menu expose entry points with different permissions. | Verify each role and billing mode, funding recovery and membership changes with safe fixtures. |
| Provider and platform administration | Provider detail and administration are separate scopes. Platform Routing is distinct from the deferred workspace entry. | Verify administrator-only access, readiness versus verification, commercial confidentiality, pricing recovery and invalid mode-change previews. |
| Docs, website and fallbacks | Public docs still describe Routing and the website preview needs reconciliation with the release shell. | Preserve technical API documentation, distinguish deferred UI, verify links, and review missing or unauthorized destinations. |

Priority for review is workspace entry and authorization, the model-to-first-use journey, then usage and financial scope. Render actual candidate pages at desktop, split widths and mobile. Include open menus and drawers, keyboard focus, loading, empty, denied, and failure states. The source inventory and earlier mockups do not establish release acceptance.

## Local candidate verification

The revised scope is published on GitHub #122. Dashboard integration and Generations layout tests passed all 67 cases. Type checking and translation audit passed. The bilingual website check and production build passed.

At 1600px in the local packaged dashboard, the workspace header showed the Niu mark and workspace switcher on one row. Usage exposed the scoped statements link, Settings exposed Guardrails, and Generations exposed Assets. Opening history preserved one primary navigation and placed the history panel at x=1344–1600. At 390px the history opened as its own drawer, and the document and toolbar widths were both 390px. This browser pass used the existing local fixture account and did not submit a paid model call. Staging, full role coverage, and the rest of the release journeys remain separate acceptance steps.

The subsequent Generations review superseded the right-side session history placement. Session history is local navigation and now opens on the left of the conversation beside the workspace sidebar, with its own trigger and mobile drawer. Browser inspection confirmed the left-side configuration and keyboard expansion. The final desktop bounds and post-change mobile appearance still need inspection. All 1,296 Dashboard tests passed in the full run, and the three history tests passed in a focused run after the placement change. Dashboard lint passed.

Final local Generations recheck: the collapsed primary sidebar spans x=0–56, history x=56–312, and chat starts at x=312. Expanded bounds are x=0–256, x=256–512 and x=512. At 390px, selecting a saved session changed the heading, dismissed the drawer and left document width at 390px. All 67 affected tests passed after the alignment correction.

## Hosted candidate verification

Staging composition 520d71e2a3b54aa2e64f8601dad972947467c403 deployed successfully with core f945f2eeb09675374f02e9faa32d60ac547f75c2 and website 953847d5a28e4025d54856608955fc0f1e121183. The final core suite passed 1,296 tests at two workers. The first deployment exceeded the two-revision compatibility limit. The corrected staging composition retained the previous live Dashboard and the existing transition revision.

- The existing staging session switched workspace and back. The sidebar and model catalog links reflected the selected scope.
- The model catalog, separate filter panel and API key status choices rendered. Mobile navigation reached API keys and dismissed the drawer. Usage opened workspace Billing, while the account settings Credits tab showed organization funding.
- Generations reached Assets in the current workspace. Settings reached the workspace Guardrails policy, blocked requests and history tabs.
- A short request to the explicitly free Conatus model completed. The result linked to request detail showing a completed response and a zero customer charge.
- The assigned account in User mode saw the platform administrator denial. Its already assigned Admin mode reached platform sections. Pricing, reports, customers, payments, branding and audit opened at 1100px without page overflow. Incidents and platform settings opened, and Incidents fit at 390px. The account was restored to User mode.
- The staging Landing exposed Logs and Generations previews and the Dashboard entry. English and Chinese views fit at 390px. The account connection dialog reported that the instructions were copied and prompted the user to paste them into an agent.

Fresh credential entry and post-login return, a separate restricted member account, an actual external agent authorization, and end-to-end mock funding remain unverified. Staging disables passwordless demo login. The browser session does not establish fresh login. The local environment has no dedicated staging fixture credential, and Render SSH could not open a session from this runner. Issue #122 remains open.

### Follow-up sign-in and role verification

Using the Render-configured staging demo account, signed out, opened
`/workspaces/default/keys`, signed in with the password form, and returned to
that exact page. The Simplified Chinese sign-in screen advertised model routing
after it was deferred. The bilingual correction is in PR #124. All 1,296
dashboard tests and the full translation audit passed on its source.

The demo account exposes an assigned Platform Administrator role even in User
mode. It is unsuitable as evidence for an independently restricted account.
The agent connection dialog shows the workspace-specific handoff and links to
the supported documentation. Actual external authorization and mock funding
still require hosted verification.

### Staging recheck after PR #124

Staging composition `815e852` with core `f4ed4d0` passed deployment run
42834803098. In a fresh unauthenticated browser flow, the Simplified Chinese
sign-in page showed the updated agent and workspace copy. Signing in with the
Render-configured demo account returned to `/workspaces/default/keys` and
rendered the API Keys heading. No credential values were recorded.

The hosted mock funding success path passed on composition `815e852`.
From organization Credits, created a $1.00 test order, ran Successful payment
in the sandbox, and observed one accepted delivery with HTTP 200. Niu showed
the order as paid and the shared balance increased from $2.00 to $3.00.
Back to Niu resolved to organization Credits. The checkout was in English
while the dashboard was in Simplified Chinese. Failure and retry scenarios
were not exercised in this run.

A separate $1.00 order ran the Payment declined scenario. The sandbox
notification was accepted with HTTP 200, Niu marked the order closed, and
the balance remained $3.00. A fresh order is available from Credits.
At 390px the recharge dialog measured 358px with no document overflow.
The amount field received focus and Escape restored focus to the trigger.
The sandbox page itself was exercised at desktop width in this run.

After the declined order closed, a new $1.00 order settled successfully in
the Duplicate confirmation scenario. Both signed notifications returned
HTTP 200, the order showed paid, and the shared balance increased exactly
once from $3.00 to $4.00. The scenario control opened and could be operated
at 390px, with document width equal to viewport width. The immediate
screenshot showed background text through the opening menu. Its
fully open appearance remains to be checked.

On the hosted candidate, a signed-in owner opened a fresh Codex consent
request and declined it. The page displayed the denial confirmation, and
the same request's agent-side exchange returned HTTP 401, matching the
documented terminal refusal. No credential was issued.

Reopened an existing pending order from Credits using Continue payment and
Open payment page. The sandbox loaded the original order. At 390px the
scenario menu was opaque after its opening transition, with every option
visible. Enter opened the menu and Escape returned focus to its trigger.

At 390px, an expired Agent consent link displayed a clear instruction to
ask the Agent for a fresh request, plus a verification-code input. Document
width matched the viewport and all controls were visible.

Composition `8c46ae7` with core `abf9c4a9b` passed staging deployment
42846174080. Unsupported agent client names and duplicate capabilities
both returned HTTP 400 with the revised message naming supported clients
and disallowing duplicate capabilities.

On composition `8c46ae7` at 390px, opened the workspace drawer from
API Keys and selected Usage. The Usage heading rendered, the drawer
dismissed automatically, and the document remained 390px wide.

On composition `8c46ae7` at 1100px, the API Keys main pane measured
844px with the workspace sidebar expanded and 1044px collapsed. The
right list gutter measured 25px and 31px respectively. The collapsed
sidebar retained navigation icons, with theme above the account avatar.

On composition `8c46ae7`, approved a Codex request scoped to the Demo
Cookie Check staging workspace with model invocation disabled. Token
exchange and key readback returned HTTP 200. Readback confirmed
`invocation_allowed: false`. The key appeared in the selected workspace,
was revoked through its dashboard action, and subsequently returned
HTTP 401 on the same readback endpoint.

An independent, short-lived Viewer fixture on composition `8c46ae7`
listed only its assigned staging workspace. Session readback showed write
and platform administration permissions disabled. The platform Provider
endpoint refused the same credential. Fixture cleanup returned HTTP 204.
This was a hosted API check rather than a Viewer browser walkthrough.

A second short-lived Viewer fixture signed in through the browser token form
and returned to the assigned workspace API Keys deep link. The account name
matched the fixture, the page displayed its read-only notice, and Create API
Key and Admin Settings controls were absent. A subsequent other-workspace
navigation rendered a read-only keys shell, but the final URL and returned
data scope were not captured. The Viewer signed out and fixture revocation
returned HTTP 204.

A follow-up Viewer started from the unassigned Default workspace keys link.
After token login, the browser resolved to the assigned Demo Cookie Check
keys URL, with the matching workspace header, read-only notice, and no
create action. The workspace switcher listed only the assigned workspace.
The fixture was signed out and revoked (HTTP 204).
