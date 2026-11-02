# Product focus: The Model Platform for Agents

Status: agreed product direction, updated 2026-10-31. The [agent-oriented principles](agent-oriented-principles.md) are the normative basis for subsequent product, integration, documentation and marketing refactoring. They supersede the October 30 Token Platform positioning and human-first onboarding assumptions. Implementation and release qualification remain separate; the [release matrix](../releases/first-release.md) still governs readiness.

## Audience and promise

**The Model Platform for Agents**

Discover and evaluate models, build model pools, and manage performance and cost—all through your agent.

Coding agents already aim to complete user tasks while improving value within the user's constraints. Niu provides the information and authorized management capabilities needed to pursue that objective. The agent owns task completion, model choices and quality/cost tradeoffs. Niu owns trustworthy resource information, configured policy execution, scoped controls and verifiable results; it does not guarantee optimal price/performance or task success.

Model invocation is one part of model resource management. The target workflow includes discovering capabilities and customer prices, comparing task samples, configuring model pools and routing, managing access and budgets, retrieving request evidence and subscribing to relevant events. Each capability must have explicit authority, observable results and recovery behavior. This is a product direction, not a claim that all operations are exposed by the current MCP server.

MCP provides shared tools and resources. Native plugins or supported extensions for different coding agents should package connection setup, capability discovery, host-specific integration and review handoffs around the same contracts. They must not embed a universal optimization policy or silently reroute the coding agent's own inference. Native plugin availability and event delivery require their own verification.

People set goals and boundaries, grant authority and review consequential changes. They should need only a short orientation and an agent-led onboarding guide. Remaining documentation primarily serves coding agents, while model trials, saved results, request Logs and performance/cost tracking let people explore directly. See the [documentation contract](../development/agent-documentation.md).

Niu remains independently self-hostable. Preserve customer/Provider/platform authorization and commercial data boundaries. Customer prices and charges never expose procurement costs or platform margins. Missing measurements remain unknown, and published price comparisons require workload-specific evidence. General task orchestration, external tool execution and unrelated agent telemetry remain outside Niu.

The detailed sections below retain existing ownership and implementation constraints; they are not a new task priority order or a declaration of end-to-end agent capability. Refactoring must apply the principles above while preserving data and contracts. Navigation uses **Docs**; the product wordmark remains **Niu**, with approved Maple Mono SemiBold 600 lettering.

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
| Model resources | Discoverable model information, compatible inference APIs, authorized configuration, pools, routing and access controls | Choose models and policies for task requirements within granted authority |
| Consumption | Request/attempt usage, customer charges, timing, failures, available quota observations and their confidence | Decide what work is worth performing |
| Execution | Model request transport, bounded request retries and explicit limits | Task planning, subagents, tools, environments and schedules |
| Evaluation | Model comparison facilities, protocol/usage/performance evidence and explicit measurement limits | Judge task results and quality, latency, reliability and cost tradeoffs |
| Events and correlation | Scoped resource events and delivery contracts as implemented; request references for reconciliation | Own response policies, host lifecycle, task meaning and outcomes |

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

White labeling and platform theme defaults are deployment settings, distinct from a user’s light/dark preference. Preserve Niu branding and shared tokens as the default. Persist supported branding/theme settings in the backend, validate assets and theme values, and enforce administrator permissions and audit changes server-side. OAuth/payment secrets are server-only. Expose sections and controls only when their configuration lifecycle works; do not create placeholder administration pages.

Within Branding & theme, use Branding and Theme tabs. Branding controls the deployment display name, logo and favicon. Theme controls validated shared color tokens and the default appearance, with preview and reset to Niu defaults. Apply saved settings consistently to login and dashboard surfaces at desktop and mobile widths; keep a user’s explicit appearance preference. Do not accept arbitrary CSS or executable branding assets.

### Generations

Generations is the shared customer area for Chat and Video sessions, with a sparkles navigation icon. Use one sidebar for saved Chat and Video sessions across accessible workspaces, with a single New generation action. Choose Video as a task category alongside Reasoning, Build and Writing in the new-generation content, without Chat / Video navigation tabs; keep the selected session title in the page header. Video inputs, results and diagnostics belong to the selected video session, not a separate product area. Do not require workspace selection to start: the selected API key supplies the permission, billing and limit scope. Preserve durable backend histories and workspace/key authorization for both types. `/generations` is canonical; existing `/chat` links redirect while preserving their query and fragment.
