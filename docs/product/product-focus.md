# Product focus: a Token Platform for developers and teams

Status: agreed product direction, updated 2026-10-30. Implementation and release qualification remain separate. This document and the [current release matrix](../releases/first-release.md) supersede earlier task-economics product targets.

## Audience and promise

Niu is a Token Platform for developers and teams using model APIs. The primary audience consumes tokens to build applications, use coding tools, and work with Chat and Video. This direction replaces the operator-first marketing positioning recorded on October 15; existing administration, Provider and commercial data contracts remain separate responsibilities.

The product promise is “Make every token count.” Its three supporting values are performance, reliability and economy. Performance means efficient model access supported by measured workload evidence. Reliability means documented routing and bounded recovery, with request state and missing evidence made explicit. Economy means visible model prices, token usage, customer charges and scoped budgets; it does not establish a universal lowest price or guaranteed savings.

Marketing should present a coherent model-use workflow: choose an available model, create a workspace key with appropriate access and budget, connect an application, and inspect requests, usage and charges. Saved Chat and supported Video workflows are complementary ways to use models. Operators and Providers enable that experience, but token resale, pricing margins and running an API business are not the landing page's primary promise.

Keep customer charges, procurement costs, Provider earnings and unresolved obligations distinct. Customer-facing transparency must not reveal procurement prices or platform margins. High performance and reliability require actual workload measurements and recovery evidence; a language choice or architecture document is not proof. Integration code does not prove merchant activation, receipt of funds or settlement readiness.

Normal API calls remain the baseline. Multiple Providers for the same model are useful but not required. A focused catalog with verified offers is preferable to unsupported coverage claims. Public core deployments remain independently usable without private source or a license service; hosted and enterprise composition follows the documented repository and plugin boundaries.

Niu should help users identify the requests, models, workspace API keys and periods responsible for consumption and customer charges. Ranked breakdowns should lead to matching request evidence, while unknown usage stays unknown. High volume alone does not prove waste, and a gateway trace alone cannot establish whether application context or agent work was unnecessary.

Navigation labels use **Docs**. Marketing's top navigation has one Docs entry; API and SDK references are discoverable within Docs. The brand wordmark remains **Niu**, with approved Maple Mono SemiBold 600 lettering.

## Product navigation and access

Use one administrator-managed **Suppliers** section at `/admin/suppliers`, including OpenRouter setup. Preserve separate Supplier-member business routes and redirect legacy management URLs. Do not introduce separate Providers, Connections or Upstream Provider destinations. Technical provider and vendor contracts can remain internal compatibility names. **Models** is a global catalog at `/models`; workspaces own application API keys and their associated access and reporting, rather than the model catalog.

A Supplier can supply models through one API key or multiple API keys. Each key has its own endpoint, adapter, enabled state and model mappings; a key can serve one or several models. Supplier identity, offers and settlements remain attached to the business rather than being duplicated for each credential. OpenRouter is one demo Supplier, not a required backend or a special Supplier type. Adding or rotating a key must preserve the other keys and their model mappings.

Authentication is shared infrastructure. Protected routes restore and validate a session before rendering customer or Supplier content, redirect signed-out users to Login, preserve the requested destination and handle revocation and sign-out. Backend authorization enforces workspace and Supplier isolation independently of navigation. Ordinary user workflows must not depend on understanding installation-token or operator implementation terms.

Workspace Guardrails are part of the current release scope, with the full staged requirements in F09 of the release matrix. They govern model/Provider eligibility and explicitly supported input/output inspection at Niu's API boundary. Mandatory child settings cannot weaken parent restrictions; required checks fail closed. Publish coverage, output buffering/window guarantees and detector data recipients. Preview, safe audit, revisioned activation/rollback and measured performance are acceptance requirements. External processing is opt-in: deployment authorizes the workspace, and an administrator reviews the recipient, region, retention, content scope and current configuration before consenting. Required matches or indeterminate checks stop before inference; unknown-cost services cannot silently become live checks. This does not authorize or govern tools executed outside Niu. Hard budget enforcement depends on the existing ledger, concurrent reservations and bounded liabilities; unsupported caps remain explicitly deferred.

## Commercial model and Supplier qualification

Owner-funded personal upstream-key use is separate from commercial model supply. The OpenRouter demo is intended for personal testing with the owner's saved API key, not resale, discounted supply or platform profit. Do not require invented resale evidence for this scenario, represent an upstream credential as an accepted supply agreement, or charge the user through a commercial Supplier offer merely to exercise the test connection. Personal-key routes need explicit ownership and access isolation and must remain separate from customer prepaid funds and commercial qualification. This does not waive qualification for actual hosted commercial supply.

Hosted inference earns a margin between agreed Supplier rates and customer prices.

Qualify each Supplier's right and ability to supply the advertised service, actual model and protocol behavior, data-handling terms, availability and agreed rates before publishing an offer. Keep commercial arrangements confidential; detailed procurement history is not a customer requirement. An enterprise subscription alone is not evidence of permission to resell access. Unverified access cannot be sold as qualified supply.

Keep Supplier purchase prices, upstream expenses and platform margins within platform administration. Suppliers see their own agreed rates and settlements. Customer APIs, reports and exports expose customer charges only; missing customer prices must never fall back to procurement cost.

Published comparisons identify the model, input/output/cache categories, currency, applicable conditions, baseline source and effective date. Claims against another service require current verified prices for the compared workload. Maintain a record of the offer and price revision used for billing. A discount is not evidence of equivalent service quality.

## Customer payment model

Niu uses prepaid account balance as the default customer payment model. Initial payment qualification targets Chinese company customers; this does not restrict the broader operator audience. Billing and Payments are separate sections in the global Settings dialog, alongside Account, Appearance and About. Workspace configuration belongs in each workspace’s Settings page; do not duplicate it in global Settings. Billing covers shared balances, transactions and low-balance warnings. Payments covers configured payment methods, top-ups and saved checkout recovery. About shows the published version and release date, license and useful product links; unversioned development builds must not invent release metadata. Use the Manus sidebar/content pattern and shared dialog radius; the avatar account menu opens this dialog. Keep the rail for product areas, including permission-gated Admin, rather than a separate personal Settings area. Keep direct Settings URLs and return to the originating product page on close. Company funds are shared across workspaces; workspaces retain usage attribution and spending/key limits, without separate billing configuration. Customers top up their billing account; verified funds increase its balance, and customer request charges deduct from it. Billing centers on balance, top-ups, consumption and low-balance warnings. Invoices or statements may document transactions but are not the mechanism that grants spending capacity. Credit cards are not a prerequisite. Initially support an EPay-compatible domestic gateway for Alipay/WeChat Pay and RMB top-ups (preferred candidate: 支付FM, using signed merchant channels), plus Stripe for eligible international merchants and payments. Show customer payment methods rather than gateway protocol names. Expose only configured, qualified merchant methods; country eligibility and settlement support depend on the actual merchant and gateway. Existing Zhifux support is a separate adapter until EPay compatibility is verified.

The credit limit defaults to zero. An explicitly approved credit limit permits a negative balance down to that limit, supporting traditional credit terms through the same account ledger. Available spending capacity is balance plus approved credit limit, less outstanding reservations. Warn below a configurable balance threshold; stop new paid requests when available capacity is exhausted. Suspension affects paid inference, not sign-in, billing access or top-ups. Verified top-ups or an approved limit change restore access when capacity is positive. Existing request liabilities must still settle accurately; a settlement overrun is recorded rather than hidden or forgiven.

## Product boundary

| Responsibility | Niu | External applications and agent orchestration products |
| --- | --- | --- |
| Access | Model catalog, compatible inference APIs, credentials, eligibility and documented routing | Configure a client and choose permitted access |
| Consumption | Request/attempt usage, customer charges, timing, failures, available quota observations and their confidence | Decide what work is worth performing |
| Execution | Model request transport, bounded request retries and explicit limits | Task planning, subagents, tools, environments and schedules |
| Evaluation | Request/protocol conformance and evidence-backed consumption diagnostics | Task acceptance, tests, UX/visual reviews and productivity evaluation |
| Correlation | Optional opaque task/session references in API records | Own task meaning, lifecycle and outcomes |

External clients use the same public interfaces. Community builds require no private product. Preserve existing API and storage contracts unless a separate migration is approved; internal correlation identifiers are not customer-facing labels. Request retries must remain distinguishable from agent task retries.

## Activity, Logs, and request observability

Activity summarizes model requests handled by Niu, including tokens and customer charges. Logs provide individual request diagnostics. Optional task/session metadata can correlate requests across a task within an authorized workspace; this is a view of requests recorded by Niu, not a complete agent execution.

Do not collect external LLM calls, agent tool logs, execution traces, or subscription usage imports. Full agent orchestration and observability belong to Supen. Existing stored observations are not automatically deleted when collection is removed.

## Explicit exclusions

Niu does not own GitHub Issues, task execution, subagent creation, spare-time presets, acceptance reviews, task benchmarks or accepted-task efficiency. Existing historical code for these concepts is not a requirement to expand their product surface.

Subscription optimization, personal quota trading and pooling are outside this release. Prompt rewriting, context trimming and summarization are deferred. Coding-agent interception/rerouting requires separate compatibility and billing qualification . Do not silently substitute models, reasoning settings or paid billing sources under a cost-saving claim.

## Evidence of product value

Measure operator activation through a real customer request and independently verified delivery and accounting artifacts. Evaluate continued customer use, qualified supply, measured capacity and latency, request reliability, billing and reconciliation accuracy, and the customer access and payment journey. Verify price differences only for specific offers and workloads; do not treat them as a substitute for the full operating experience. Consumption diagnostics should lead to a change the developer can inspect and test. Report usage and customer charges from requests handled by Niu.

## Workflow delivery requirements

The [workflow delivery plan](workflow-delivery-plan.md) specifies the current implementation and UX acceptance checklist. Prioritize a coherent Supplier and customer-price journey, then useful consumption analysis and durable Chat. Workspace inference content defaults to bounded 24-hour retention with explicit opt-out. External agent telemetry is outside Niu’s product scope.

## Platform administration

Group installation-wide configuration under an administrator-only Admin rail area. Use sidebar sections for Suppliers, Authentication (OAuth providers), Payments (merchant/gateway configuration), and Branding & theme; use tabs for subordinate settings. Supplier management belongs here. Administration access is additive: administrators retain customer navigation and workflows alongside Admin; entering Admin does not switch them into an admin-only product shell. Commercial offer comparison and settlement management target platform administrators. Existing Supplier-member APIs and authorized routes remain compatibility surfaces; do not add new product entrances for them. Company Billing and Payments, account settings, personal appearance and About belong in a global Settings dialog, using the Manus sidebar/content pattern and shared dialog radius. Preserve direct Settings URLs and return to the originating product page on close.

White labeling and platform theme defaults are deployment settings, distinct from a user’s light/dark preference. Preserve Niu 牛元 branding and shared tokens as the default. Persist supported branding/theme settings in the backend, validate assets and theme values, and enforce administrator permissions and audit changes server-side. OAuth/payment secrets are server-only. Expose sections and controls only when their configuration lifecycle works; do not create placeholder administration pages.

Within Branding & theme, use Branding and Theme tabs. Branding controls the deployment display name, logo and favicon. Theme controls validated shared color tokens and the default appearance, with preview and reset to Niu defaults. Apply saved settings consistently to login and dashboard surfaces at desktop and mobile widths; keep a user’s explicit appearance preference. Do not accept arbitrary CSS or executable branding assets.

### Generations

Generations is the shared customer area for Chat and Video sessions, with a sparkles navigation icon. Use one sidebar for saved Chat and Video sessions across accessible workspaces, with a single New generation action. Choose Video as a task category alongside Reasoning, Build and Writing in the new-generation content, without Chat / Video navigation tabs; keep the selected session title in the page header. Video inputs, results and diagnostics belong to the selected video session, not a separate product area. Do not require workspace selection to start: the selected API key supplies the permission, billing and limit scope. Preserve durable backend histories and workspace/key authorization for both types. `/generations` is canonical; existing `/chat` links redirect while preserving their query and fragment.
