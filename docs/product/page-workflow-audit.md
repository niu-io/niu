# Product page and workflow audit

Baseline: current `main` at `534c07ee`, 2026-10-13. This audit covers rendered product workflows and usability; it is not a claim of release readiness. Marketing belongs to the separate website repository. External Agent Observability, container acceptance and new paid video generation are outside this increment.

## Progress and verification rules

- Source/navigation inventory: complete for the 34 page families below. Dynamic sections, dialogs and interaction states are included within their family.
- Browser qualification: in progress. A loaded page or passing static build does not complete a workflow.
- Fixes: prioritize blocked business flows and persistence/authorization defects, then usability and visual consistency.
- A verified scope requires actual current-input browser/API behavior and independent saved artifacts where applicable. Fixture outcomes have zero acceptance signal.
- States: **Not checked**, **In review**, **Fix needed**, **Blocked**, **Verified scope**. Every verified row must state its actual scope and remaining limitations.

## Page checklist

| ID | Page family | Routes | Required workflow scope | State |
| --- | --- | --- | --- | --- |
| P01 | Login and member session | `/login` | Destination, restore, expiry, sign-out, errors | Not checked |
| P02 | Installation administration | `/installation` | Platform sign-in and role boundaries | Not checked |
| P03 | Workspace directory | `/workspaces` | Create, switch, rename, delete, empty/error states | Not checked |
| P04 | Workspace overview | `/workspaces/:workspace` | Real summary and action destinations | Not checked |
| P05 | API key list | `/workspaces/:workspace/keys` | Filter, grants, expiry, status, navigation | Not checked |
| P06 | API key creation | `/workspaces/:workspace/keys/new` | Validation, permissions, one-time secret, persistence | Not checked |
| P07 | API key detail | `/workspaces/:workspace/keys/:key` | Limits, rotation, revocation, history, conflict recovery | Not checked |
| P08 | Workspace members | `/workspaces/:workspace/users` | Invite/manage roles and scope enforcement | Not checked |
| P09 | Organization management | `/workspaces/:workspace/organization` | Company/workspace ownership and supported actions | Not checked |
| P10 | Workspace settings | `/workspaces/:workspace/settings` | Saved scope settings and limits | Not checked |
| P11 | Guardrails | `/workspaces/:workspace/guardrails/:section?` | Every supported section, preview, activation, conflicts, roles | Not checked |
| P12 | Workspace Logs | `/workspaces/:workspace/executions` | Filters, details, exports, timing, unknown usage, customer charges | Not checked |
| P13 | Global Gateway Activity | `/activity/:section?` and `/workspaces/:workspace/usage` | Global/workspace scope, coverage, drilldowns; excludes external Agent Observability | Not checked |
| P14 | Model list | `/models` | Global catalog, selected workspace context, filters, prices, eligibility | Not checked |
| P15 | Model detail | `/models/*` | Capabilities, qualified access, setup and request examples | Not checked |
| P16 | Generations Chat | `/generations` | Model/key selection, messages, branches, cancellation, attachments, persistence | Not checked |
| P17 | Generations Video | `/generations?new=video` | Drafts, references, async tasks, original recovery, preview/download | Not checked |
| P18 | Writing entry points | `/generations` | Existing writing templates and supported Chat flow; no new editor | Not checked |
| P19 | Generation session history | `/generations` | Restoration, archived/deleted input, revoked keys, actor isolation | Not checked |
| P20 | Native video materials | `/workspaces/:workspace/video/volcengine/:section?` | Exact account context, groups/materials, validation, uncertainty, observations | Not checked |
| P21 | Native verification tools | `/workspaces/:workspace/video/volcengine/:section?` | Capability-gated explicit workflow; no fabricated H5 completion | Not checked |
| P22 | Shared task/output integration | `/generations` | Existing task/artifact inventory and durable save; UI integration gap candidate | Not checked |
| P23 | Admin Supplier list | `/admin/suppliers` | Onboarding, multiple credentials, adapter choice, discoverability | Not checked |
| P24 | Admin Supplier details | `/admin/suppliers/:supplier/:section` | Overview, API keys & routes, Models & pricing, Usage, Settlements, Portal access, Settings | Not checked |
| P25 | Admin customer pricing | `/admin/pricing` | Published customer categories, history, edit/conflict validation | Not checked |
| P26 | Admin payments | `/admin/payments` | Complete supported inventory, configuration and unavailable states | Not checked |
| P27 | Admin audit logs | `/admin/audit-logs` | Filters, pagination, readable actors/actions, platform authorization | Not checked |
| P28 | Admin branding | `/admin/branding` | Preview, validation, save, conflict recovery and shared shell consistency | Not checked |
| P29 | Supplier member portal | `/suppliers/:supplier/:section?` | Own offers/models/consumption/settlements and permissions | Not checked |
| P30 | Global Settings | `/settings/:section?` | Account, Appearance, Billing, Payments, About; underlying-page return | Not checked |
| P31 | Help and documentation | `/help/* and /docs/*` | Actual destinations, navigation, truthful API/SDK capabilities | Not checked |
| P32 | Public model catalog | `Public catalog model routes` | Anonymous routes and dashboard handoff; separate marketing ownership | Not checked |
| P33 | Compatibility and not-found routes | `Legacy redirects and unknown URLs` | Destination/query preservation and useful recovery | Not checked |
| P34 | Deferred legacy surfaces | `/benchmarks` and legacy redirects | Check product boundary and entry points; do not revive excluded orchestration | Not checked |

## Prioritized source candidates

These are source findings awaiting current-input reproduction, not integrated acceptance conclusions.

| Candidate | Priority | Page families | Concrete suspected gap | State |
| --- | --- | --- | --- | --- |
| C01 | P1 | P17, P19 | Saved Video history requires active keys instead of historical workspace/session access | In review |
| C02 | P1 | P17, P20, P21 | Unsupported models expose native materials and verification tools before failing | Reproduced; fix in progress |
| C03 | P1 | P20 | Material validation errors remain behind dialogs; unknown operations lack explicit recovery | In review |
| C04 | P1 | P17, P22 | Existing task/artifact/durable capture SDK is not consumed by product pages | In review |
| C05 | P1 | P17 | Image/reference submission bypasses retained intent association | In review |
| C06 | P1 | P23, P24 | Supplier adapter controls omit backend-supported Anthropic/Gemini/Ark | Fixed; verified scope below |
| C07 | P2 | P26 | Supported unconfigured payment integrations are hidden | In review |
| C08 | P2 | P30 | Profile save does not update shared account-menu session state | In review |
| C09 | P2 | P11 | A stale revision conflict does not lock repeated saves until reload | In review |
| C10 | P2 | P13 | Known token totals omit reported-usage coverage | In review |
| C11 | P2 | P25 | Backend-supported reasoning customer prices lack an editor | In review |
| C12 | P2 | P17 | Unsubmitted Video drafts exist only in component memory | In review |

## Delivery order

1. Reproduce the candidates in the current product, using actual member and installation roles. Record screenshots privately and keep customer data/secrets out of this document.
2. Fix Generations/history/native-context and Supplier setup blockers by consuming the existing backend and SDK. Do not add another task or asset store.
3. Complete supported management actions and failure recovery, including payment discoverability, account synchronization and optimistic conflicts.
4. Use the existing NIU.IO Stitch project/design system and actual mature references for visual changes. Keep shared theme tokens, installed shadcn controls and full-width management pages.
5. Verify desktop/narrow interaction states, persistence/reload, role boundaries and navigation; push completed increments to main.
6. Audit every remaining checklist row and report supported versus unverified capabilities without broadening narrow evidence into release acceptance.

## Verified increments

### Supplier adapter controls

The actual administration page mislabeled an existing Ark credential as OpenAI-compatible and offered only OpenRouter/OpenAI for new credentials. The form now exposes all five backend-supported adapters and renders their actual API labels. Browser checks covered the open menu at desktop and 390px width, Anthropic/Gemini default endpoints, the explicit required endpoint for Ark, preservation of a custom endpoint when changing adapters, and immutable existing-adapter editing with the saved endpoint retained and the secret field empty. No new Supplier credential or upstream request was created for this control check. TypeScript and the production build completed as static checks; these do not establish provider integration success.

### Video native tools

In the actual Video composer, selecting a model without native asset management still exposed Supplier tools, Materials and Human verification. Opening them produced an unsupported-management error. Capability gating and exact selected-key/model propagation are being implemented against the existing SDK. This workflow remains unverified until the patch is browser-qualified.
